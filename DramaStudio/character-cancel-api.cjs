const fs=require('node:fs'),path=require('node:path');
const root=process.env.DRAMA_OUTPUT_ROOT||'D:/AIPlatform/Output/DramaStudio',valid=id=>/^[a-f0-9-]{36}$/.test(id);
function folder(id){if(!valid(id))throw Error('任务编号无效');return path.join(root,'FrontImages',id)}
function requested(job){try{const c=JSON.parse(fs.readFileSync(path.join(folder(job.id),'cancel.json'),'utf8'));return c.project_id===job.project_id&&c.character_id===job.character_id}catch{return false}}
async function cancelPrompt(job){if(!job.prompt_id)return;const port=Number(job.port);if(!Number.isInteger(port)||port<1||port>65535)throw Error('任务端口无效');const r=await fetch('http://127.0.0.1:'+port+'/api/jobs/'+encodeURIComponent(job.prompt_id)+'/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('生成服务取消失败：'+r.status);}
async function cancelIfRequested(job){if(!requested(job)||job.status==='completed')return false;await cancelPrompt(job);job.status='cancelled';job.cancelled_at=new Date().toISOString();const f=path.join(folder(job.id),'job.json');fs.writeFileSync(f,JSON.stringify(job,null,2));return true;}
async function handle(req,res){const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value))};try{
 if(req.method!=='POST')return reply(405,{error:'仅支持停止请求'});const origin=req.headers.origin;if(origin&&!['http://127.0.0.1:4173','http://localhost:4173','http://127.0.0.1:4173'].includes(origin))return reply(403,{error:'请求来源无效'});
 let raw='';for await(const part of req){raw+=part;if(raw.length>15000)throw Error('请求过大')}const input=JSON.parse(raw);if(!input.project_id||!input.character_id||!Array.isArray(input.job_ids)||input.job_ids.length>8)throw Error('停止参数无效');
 const jobs=input.job_ids.map(id=>{const dir=folder(id),f=path.join(dir,'job.json');const job=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):{id,project_id:input.project_id,character_id:input.character_id,status:'cancelled'};if(job.project_id!==input.project_id||job.character_id!==input.character_id)throw Error('任务不属于当前人物');return{dir,job}});
 for(const {dir,job}of jobs){if(job.status==='completed')continue;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'cancel.json'),JSON.stringify({project_id:input.project_id,character_id:input.character_id,created_at:new Date().toISOString()}));await cancelIfRequested(job);}
 return reply(200,{jobs:jobs.map(({job})=>({id:job.id,status:job.status}))});
 }catch(e){reply(400,{error:e.message})}}
module.exports={handle,requested,cancelIfRequested};
