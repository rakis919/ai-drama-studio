const {spawn}=require('child_process');let last=0;
async function handle(req,res){const json=(code,v)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(v));};
if(req.method!=='POST')return json(405,{error:'仅支持连接操作'});
const allowed=['http://127.0.0.1:4173','http://localhost:4173','http://127.0.0.1:4173'];if(req.headers.origin&&!allowed.includes(req.headers.origin))return json(403,{error:'仅接受工作台请求'});
try{const s=await require('./comfy-launch-api.cjs').status(18190);if(s.status==='running')return json(200,{status:'running',message:'云端已连接，可以选择远程GPU生成视频'});
if(Date.now()-last<30000)return json(200,{status:'connecting',message:'连接窗口已打开，请完成SSH登录'});
const child=spawn('powershell.exe',['-NoProfile','-NoExit','-ExecutionPolicy','Bypass','-File','D:/AIPlatform/GptWork/platform-cloud-20261031/连接云端.ps1'],{detached:true,windowsHide:false,stdio:'ignore'});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});child.unref();last=Date.now();json(200,{status:'connecting',message:'已在电脑打开云端连接窗口，请输入SSH密码；手机操作时需在电脑完成登录'});
}catch(e){json(400,{error:e.message});}}
module.exports={handle};
