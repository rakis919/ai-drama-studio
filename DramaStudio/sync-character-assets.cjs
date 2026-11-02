const fs=require('node:fs'),path=require('node:path');
function synchronize(project,outputRoot=process.env.DRAMA_OUTPUT_ROOT||'D:/AIPlatform/Output/DramaStudio'){
 const updated=[];
 for(const c of project.characters||[]){
  if(['running','stopping'].includes(c.oneClick?.status))continue;
  const entry=c.multi?.[c.multiActive??(c.multi.length-1)];
  for(const view of ['front','portrait']){
   const current=view==='front'?c.versions?.[c.active]:c.identityPortrait,id=current?.job_id||current?.id;
   if(!id||!/^[a-f0-9-]{36}$/.test(id))continue;
   let asset;try{asset=JSON.parse(fs.readFileSync(path.join(outputRoot,'FrontImages',id,'job.json'),'utf8'));}catch{continue;}
   if(!asset.upscaled_from||asset.project_id!==project.project_id||asset.character_id!==(c.id||c.character_id)||asset.status!=='completed')continue;
   let changed=false;const source=asset.upscaled_from;
   if(entry&&(entry.jobs?.[view]?.id===source||(view==='front'&&!entry.jobs?.front&&entry.reference_job_id===id))){entry.jobs??={};entry.jobs[view]={...entry.jobs[view],...asset};changed=true;}
   if(c.oneClick?.tasks?.[view]?.id===source){c.oneClick.tasks[view]={...c.oneClick.tasks[view],...asset};changed=true;}
   if(view==='front'&&entry?.reference_job_id===source){entry.reference_job_id=id;changed=true;}
   if(view==='portrait'&&!c.portraitVersions?.some(v=>v.id===id)){c.portraitVersions??=[];c.portraitVersions.push({...asset});changed=true;}
   if(changed)updated.push({character_id:c.id||c.character_id,view,id});
  }
 }
 return updated;
}
module.exports={synchronize};
