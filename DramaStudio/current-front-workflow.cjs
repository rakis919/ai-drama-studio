const fs=require('node:fs'),path=require('node:path');
module.exports=async function({root,port,job,project,source,negative_prompt}){
 const portrait=source.identityPortrait||source.multi?.[source.multiActive??source.multi.length-1]?.jobs?.portrait;
 if(!portrait?.id||!/^[a-f0-9-]{36}$/.test(portrait.id))throw Error('请先生成大头像，再打开全身正面图生图工作流');
 const folder=path.join(root,'FrontImages',portrait.id),meta=JSON.parse(fs.readFileSync(path.join(folder,'job.json'),'utf8'));
 if(meta.status!=='completed'||meta.project_id!==job.project_id||meta.character_id!==job.character_id)throw Error('当前大头像尚未完成或不属于这个人物');
 const form=new FormData();form.append('image',new Blob([fs.readFileSync(path.join(folder,'front.png'))],{type:'image/png'}),'drama-'+portrait.id+'.png');form.append('type','input');form.append('overwrite','true');
 const response=await fetch('http://127.0.0.1:'+port+'/upload/image',{method:'POST',body:form,signal:AbortSignal.timeout(30000)}),uploaded=await response.json();if(!response.ok)throw Error('无法上传当前大头像参考图');
 const graph=require('./front-image-api.cjs').buildGraph({mode:'multiview',angle:'front',reference_image:(uploaded.subfolder?uploaded.subfolder+'/':'')+uploaded.name,reference_job_id:portrait.id,project_id:job.project_id,character_id:job.character_id,character_name:source.name,prompt:require('./dist/character-view-prompts.js').features(source),negative_prompt,style:project.style,background:source.nonWhiteBackground?'gray':'white',width:512,height:1440},job.id).graph;
 graph['6']._meta={title:'大头像参考图 → 全身正面'};return graph;
};
