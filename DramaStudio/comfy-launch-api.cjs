const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const app='T:/AI/ComfyUI_1.3.5';
const root=process.env.DRAMA_OUTPUT_ROOT||'D:/AIPlatform/Output/DramaStudio';
const launches=new Map();
function portOf(value){const requested=Number(value||8188),port=[8189,8190].includes(requested)?8188:requested;if(!Number.isInteger(port)||port<1||port>65535)throw Error('端口无效');return port;}
async function status(value){const port=portOf(value);try{const r=await fetch('http://127.0.0.1:'+port+'/system_stats',{signal:AbortSignal.timeout(1500)});if(r.ok){const info=await r.json();if(info.system&&Array.isArray(info.devices))return{status:'running',port,url:'http://127.0.0.1:'+port};}}catch{}const launch=launches.get(port);if(launch?.error)return{status:'failed',port,error:launch.error};if(launch&&Date.now()-launch.started<180000)return{status:'starting',port};return{status:'offline',port};}
const requests=new Map();
async function start(value){const port=portOf(value);if(requests.has(port))return requests.get(port);const task=startOnce(port).finally(()=>requests.delete(port));requests.set(port,task);return task;}
async function startOnce(port){const current=await status(port);if(port===18191){if(current.status==='running')return current;throw Error('云端未连接，请打开云端连接窗口完成SSH登录；不会启动本机显卡');}if(['running','starting'].includes(current.status))return current;
 const python=path.join(app,'.ext/python.exe'),runtime=path.join(app,'tools/ComfyUI-Runtime.py');if(!fs.existsSync(python)||!fs.existsSync(runtime))throw Error('本机ComfyUI启动文件不存在');
 const logs=path.join(root,'ServiceLogs');fs.mkdirSync(logs,{recursive:true});const out=fs.openSync(path.join(logs,'comfy-'+port+'.out.log'),'a'),err=fs.openSync(path.join(logs,'comfy-'+port+'.err.log'),'a');
 const entry={started:Date.now()};launches.set(port,entry);
 try{const env={...process.env,PATH:path.join(app,'tools/sox')+';'+path.join(app,'.ext/Library/bin')+';'+process.env.PATH,TORCHDYNAMO_DISABLE:'1',CUDA_MODULE_LOADING:'LAZY',PYTHONUNBUFFERED:'1',PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1',NO_ALBUMENTATIONS_UPDATE:'1',COMFYUI_MANAGER_SKIP_STARTUP_REFRESH:'1'};
 const child=spawn(python,['-s',runtime,'--listen','127.0.0.1','--port',String(port),'--disable-pinned-memory'],{cwd:app,env,windowsHide:true,detached:true,stdio:['ignore',out,err]});
 child.on('error',e=>{entry.error='启动失败：'+e.message});child.on('exit',(code)=>{entry.error='ComfyUI已退出'+(code!=null?'，退出代码 '+code:'')+'。启动日志位于 '+logs});
 await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});entry.pid=child.pid;child.unref();return{status:'starting',port};
 }catch(e){entry.error=e.message;throw e}finally{fs.closeSync(out);fs.closeSync(err)}
}
module.exports={start,status,portOf,clearLaunch:port=>launches.delete(port)};

