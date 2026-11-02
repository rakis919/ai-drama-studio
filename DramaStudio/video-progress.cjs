const sockets=new Map();
const stages={'1':['models','加载视频模型',1],'2':['models','加载视频模型与加速权重',1],'3':['models','加载文本模型',1],'4':['models','加载视频解码器',1],'5':['models','加载音频解码器',1],'6':['references','分析提示词与参考图片',2],'11':['sampling','视频与声音联合采样',3],'12':['decode','解码视频画面',4],'13':['decode','解码原生声音',4],'14':['save','合成音画',5],'15':['save','编码并保存视频',5]};
function reduce(progress,event,now=Date.now()){
 const p={...progress},d=event.data||{};let changed=true;
 if(event.type==='execution_start'){p.execution_started_at??=new Date(now).toISOString();p.phase='models';p.label='加载模型与参考图';p.phase_number=1;}
 else if(event.type==='executing'&&d.node!=null){const node=String(d.node),stage=stages[node]||(Number(node)>=100?['references','读取参考图片',2]:null);if(!stage)return progress;[p.phase,p.label,p.phase_number]=stage;p.node_id=node;p.phase_started_at=new Date(now).toISOString();if(node==='11')p.sampling_started_at??=new Date(now).toISOString();}
 else if(event.type==='progress'&&String(d.node)==='11'){const value=Number(d.value),max=Number(d.max);if(!Number.isFinite(value)||!Number.isFinite(max)||max<=0)return progress;p.phase='sampling';p.label='视频与声音联合采样';p.phase_number=3;p.step=Math.max(0,Math.min(value,max));p.total_steps=max;p.sampling_started_at??=new Date(now).toISOString();p.step_times??=[];p.step_times=p.step_times.filter(x=>x.step!==p.step);p.step_times.push({step:p.step,at:now});p.step_times=p.step_times.slice(-16);}
 else if(event.type==='execution_success'){p.phase='save';p.label='正在读取、裁切并保存到本机';p.phase_number=5;p.comfy_finished_at=new Date(now).toISOString();}
 else changed=false;
 if(changed&&p.phase!==progress?.phase){p.phase_marks={...(p.phase_marks||{}),[p.phase]:new Date(now).toISOString()};if(progress?.phase==='sampling')p.sampling_finished_at=new Date(now).toISOString();}if(changed)p.updated_at=new Date(now).toISOString();return changed?p:progress;
}
async function monitor(job,patch){if(sockets.has(job.id))return;const ws=new WebSocket('ws://127.0.0.1:'+job.port+'/ws?clientId=drama-video-'+job.id);sockets.set(job.id,ws);ws.addEventListener('message',event=>{if(typeof event.data!=='string')return;try{const message=JSON.parse(event.data);if(message.data?.prompt_id&&job.prompt_id&&message.data.prompt_id!==job.prompt_id)return;patch(message);}catch{}});ws.addEventListener('close',()=>{if(sockets.get(job.id)===ws)sockets.delete(job.id)});ws.addEventListener('error',()=>{});await new Promise(resolve=>{const t=setTimeout(resolve,3000);ws.addEventListener('open',()=>{clearTimeout(t);resolve()},{once:true});ws.addEventListener('error',()=>{clearTimeout(t);resolve()},{once:true});});}
function close(id){const ws=sockets.get(id);sockets.delete(id);if(ws)ws.close();}
const timing=require('./generation-timing.cjs').timing;
module.exports={reduce,monitor,close,timing};
