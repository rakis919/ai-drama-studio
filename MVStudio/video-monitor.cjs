// Progress events for one MV job, using Node's built-in WebSocket.
const fs=require('node:fs'),path=require('node:path');
const dir=process.argv[2],id=process.argv[3];if(!/^[a-f0-9]{32}$/.test(id||''))process.exit(1);
const file=path.join(dir,id+'-progress.json'),jobFile=path.join(dir,id+'.json');
const frameMode=process.argv[5]==='frame',samplingNode=frameMode?'6':'11';
let state={connected:false,label:'连接实时进度',phase:'connecting',updated_at:Date.now()/1000},socket;
const stages=frameMode?{'1':['models','加载图像模型'],'2':['text','加载图像提示词编码器'],'3':['vae','加载图像解码器'],'4':['references','分析首尾帧提示词与参考图'],'5':['models','准备图像模型缓存'],'6':['sampling','首尾帧图像采样'],'7':['decode','解码帧图片'],'8':['encode','保存帧图片']}:{'1':['models','加载视频模型'],'2':['models','加载加速权重'],'3':['text','加载提示词编码器'],'4':['vae','加载画面解码器'],'5':['vae','加载音频解码器'],'6':['references','分析人物、场景与提示词'],'7':['sampling','准备采样'],'11':['sampling','视频采样'],'12':['decode','解码视频画面'],'14':['encode','合成视频帧'],'15':['encode','编码并保存视频']};
function write(){try{const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state));fs.renameSync(tmp,file)}catch{}}
function reduce(event){const d=event.data||{};let job;try{job=JSON.parse(fs.readFileSync(jobFile,'utf8'))}catch{return}if(d.prompt_id&&job.prompt_id&&d.prompt_id!==job.prompt_id)return;
 const now=Date.now()/1000;
 if(event.type==='execution_start'){state.started_at??=now;state.phase='models';state.label='开始加载模型与参考图'}
 else if(event.type==='executing'&&d.node!=null){const stage=stages[String(d.node)]||(Number(d.node)>=100?['references','读取参考图片']:null);if(!stage)return;state.node_id=String(d.node);[state.phase,state.label]=stage;state.phase_started_at=now;if(String(d.node)===samplingNode){state.sampling_started_at??=now;state.step=0;state.total_steps=job.steps||6;}}
 else if(event.type==='progress'&&(String(d.node)===samplingNode||state.node_id===samplingNode)){if(!Number.isFinite(Number(d.value))||!(Number(d.max)>0))return;state.phase='sampling';state.label=frameMode?'首尾帧图像采样':'视频采样';state.node_id=samplingNode;state.step=Number(d.value);state.total_steps=Number(d.max);state.samples=(state.samples||[]).filter(x=>x.step!==state.step);state.samples.push({step:state.step,at:now});state.samples=state.samples.slice(-12);if(state.samples.length>=2){const first=state.samples[0],last=state.samples.at(-1);if(last.step>first.step){state.seconds_per_step=(last.at-first.at)/(last.step-first.step);state.sampling_remaining_seconds=Math.max(0,(state.total_steps-state.step)*state.seconds_per_step)}}}
 else if(event.type==='execution_cached'){state.cached_nodes=d.nodes||[];state.label='已复用缓存，继续执行'}
 else if(event.type==='execution_success'){state.phase='download';state.label='模型已完成，正在读取并保存 MP4';state.comfy_finished_at=now;state.sampling_remaining_seconds=0;}
 else if(event.type==='execution_error'){state.phase='failed';state.label='生成失败';state.error=d.exception_message||'未知执行错误';state.error_node=d.node_id;}
 else return;state.updated_at=now;write();
}
try{socket=new WebSocket((process.argv[4]||'ws://127.0.0.1:8188')+'/ws?clientId=mv-video-'+id);socket.addEventListener('open',()=>{state.connected=true;state.label='实时进度已连接，等待任务开始';write()});socket.addEventListener('message',e=>{if(typeof e.data==='string'){try{reduce(JSON.parse(e.data))}catch{}}});socket.addEventListener('error',()=>{state.connected=false;state.label='实时连接暂不可用，仍会查询任务状态';write()});socket.addEventListener('close',()=>{state.connected=false;write()})}catch{write()}
const timer=setInterval(()=>{try{const job=JSON.parse(fs.readFileSync(jobFile,'utf8'));if(['completed','failed','cancelled'].includes(job.status)){socket?.close();clearInterval(timer);process.exit(0)}}catch{}},2000);setTimeout(()=>{socket?.close();process.exit(0)},3600000).unref();
