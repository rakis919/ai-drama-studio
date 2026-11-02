const fs=require('fs'),path=require('path');
const timing=require('./video-progress.cjs').timing;
const sockets=new Map();
function reduce(progress,event,graph,now=Date.now()){const p={...progress},d=event.data||{},at=new Date(now).toISOString();
 if(event.type==='execution_start'){p.execution_started_at??=at;p.phase='models';p.label='加载模型';}
 else if(event.type==='executing'&&d.node!=null){const node=String(d.node),type=graph[node]?.class_type||'';p.node_id=node;
  if(/SamplerCustomAdvanced|KSampler$/.test(type)){p.phase='sampling';p.label='采样生成';p.sampling_started_at??=at;}
  else if(/TextEncode|ReferenceToVideo|ImageToVideo/.test(type)){p.phase='references';p.label='分析提示词与图片';}
  else if(/ImageUpscaleWithModel/.test(type)){p.phase='upscale';p.label='模型放大图片';}
  else if(/ImageScaleBy/.test(type)){p.phase='resize';p.label='调整输出尺寸';}
  else if(/VAEDecode/.test(type)){p.phase='decode';p.label=type.includes('Audio')?'解码声音':'解码画面';}
  else if(/Save|CreateVideo/.test(type)){p.phase='save';p.label='编码与保存';}
  else if(type==='LoadImage'){p.phase='references';p.label='读取图片';}
  else{p.phase='models';p.label='加载模型与准备数据';}
  p.phase_started_at=at;
 }else if(event.type==='progress'){
  const node=String(d.node??p.node_id??''),type=graph[node]?.class_type||'';if(type==='ImageUpscaleWithModel'){p.phase='upscale';p.label='模型放大图片 '+d.value+'/'+d.max+' 块';p.updated_at=at;return p;}if(!/SamplerCustomAdvanced|KSampler$/.test(type))return progress;
  const step=Number(d.value),max=Number(d.max);if(!Number.isFinite(step)||!Number.isFinite(max)||max<=0)return progress;
  p.phase='sampling';p.label='采样生成';p.step=Math.max(0,Math.min(step,max));p.total_steps=max;p.sampling_started_at??=at;
  p.step_times=[...(p.step_times||[]).filter(x=>x.step!==p.step),{step:p.step,at:now}].slice(-40);
 }else if(event.type==='execution_success'){p.phase='save';p.label='读取结果并保存到本机';}
 else return progress;
 if(p.phase!==progress?.phase){p.phase_marks={...(p.phase_marks||{}),[p.phase]:at};if(progress?.phase==='sampling')p.sampling_finished_at=at;}p.updated_at=at;return p;
}
async function monitor(job,graph,patch){if(sockets.has(job.id))return;const ws=new WebSocket('ws://127.0.0.1:'+job.port+'/ws?clientId=drama-tools-'+job.id);sockets.set(job.id,ws);ws.addEventListener('message',event=>{if(typeof event.data!=='string')return;try{patch(JSON.parse(event.data),graph)}catch{}});ws.addEventListener('close',()=>{if(sockets.get(job.id)===ws)sockets.delete(job.id)});ws.addEventListener('error',()=>{});await new Promise(resolve=>{const t=setTimeout(resolve,2000);ws.addEventListener('open',()=>{clearTimeout(t);resolve()},{once:true});ws.addEventListener('error',()=>{clearTimeout(t);resolve()},{once:true});});}
function close(id){const ws=sockets.get(id);sockets.delete(id);ws?.close()}
module.exports={reduce,monitor,close,timing};
