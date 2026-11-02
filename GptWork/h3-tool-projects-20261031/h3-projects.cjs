const fs=require('fs'),path=require('path'),crypto=require('crypto');const root=process.env.DRAMA_H3_ROOT||'D:/AIPlatform/Output/DramaStudio/H3Tools',file=path.join(root,'projects.json'),legacy='legacy-h3';
function records(){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
function list(jobs=[]){const saved=records(),all=[...(!saved.some(p=>p.id===legacy)?[{id:legacy,name:'原有记录',created_at:'1970-01-01T00:00:00.000Z'}]:[]),...saved];return all.map(p=>({...p,history_count:jobs.filter(j=>(j.tool_project_id||legacy)===p.id).length}));}
function name(value){const n=String(value||'').trim();if(!n||n.length>80)throw Error('项目名称请填写1–80个字');return n;}
function save(items){fs.mkdirSync(root,{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(items,null,2));fs.renameSync(file+'.tmp',file);}
function create(x){const p={id:crypto.randomUUID(),name:name(x.name),created_at:new Date().toISOString()};save([...records(),p]);return p;}
function rename(id,x){const p=list().find(p=>p.id===id);if(!p)throw Error('项目不存在');const next={...p,name:name(x.name)};delete next.history_count;save([...records().filter(p=>p.id!==id),next]);return next;}
function resolve(id){id=id||legacy;if(!list().some(p=>p.id===id))throw Error('H3项目不存在');return id;}
module.exports={list,create,rename,resolve};