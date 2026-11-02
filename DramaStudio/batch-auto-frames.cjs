const frames=()=>require('./shot-frame-api.cjs');
const tools=()=>require('./quick-tools-api.cjs');
const store=()=>require('./project-store.cjs');
function selected(s,pos){const f=s.frameImages?.[pos],versions=(f?.versions||[]).filter(x=>!x.deleted_at&&!s.deletedShotFrameIds?.includes(x.id));return versions.find(x=>x.id===f?.activeId)||versions.at(-1);}
function validate(payload){for(const task of payload.auto_generate_frames||[]){if(!['first','last'].includes(task.position)||!['text_to_image','image_to_image'].includes(task.method)||!task.prompt?.trim())throw Error(payload.target_id+' 缺少有效的首尾帧生图方案');if(task.method==='image_to_image'&&task.reference_source!=='generated_first_frame'&&(!task.picture_inputs?.length||task.picture_inputs.some(x=>!x.image_url)))throw Error(payload.target_id+' 生图引用的人物或场景素材尚未完成');}}
function adopt(entry,pos,image,ownerId,ownerPosition){if(ownerId&&ownerId!==entry.target_id)image={...image,shared_frame_target_id:ownerId,shared_frame_position:ownerPosition};entry.frame_images??={};entry.frame_images[pos]=image;entry.input[pos+'_frame']={image_url:image.image_url,version_id:image.id};}
async function advance(batch,entry,write,read){const save=write;write=b=>{const latest=read(b.id);if(latest.status==='stopped')return;b.status=latest.status;save(b);};
 const pending=entry.input.auto_generate_frames||[];entry.frame_jobs??={};
 for(const task of pending){const pos=task.position;
  if(entry.input[pos+'_frame']?.image_url&&!entry.input[pos+'_frame'].image_url.startsWith('/deferred'))continue;
  const project=store().readProject(batch.project_id).project,ownerId=task.source_target_id||entry.target_id,ownerPosition=task.source_position||pos,index=project.shots.findIndex(s=>(s.shot_id||s.id)===entry.target_id);if(ownerId!==entry.target_id&&!(project.shotScript?.endpoint_generation_policy?.strategy==='next_shot_first'&&pos==='last'&&ownerPosition==='first'&&(project.shots[index+1]?.shot_id||project.shots[index+1]?.id)===ownerId))throw Error('相邻首图依赖与项目分镜不匹配');const shot=project.shots.find(s=>(s.shot_id||s.id)===ownerId);if(!shot)throw Error('首图所属分镜不存在');const cached=batch.entries?.flatMap(e=>Object.values(e.frame_images||{})).find(v=>!v.deleted_at&&!shot.deletedShotFrameIds?.includes(v.id)&&v.status==='completed'&&(v.frame_binding?.target_id||v.frame_context?.target_id)===ownerId&&(v.frame_binding?.position||v.frame_context?.position)===ownerPosition),current=cached||(!task.regenerate?selected(shot,ownerPosition):null);
  if(!entry.frame_jobs[pos]&&current?.status==='completed'&&current.image_url){try{frames().frameFile(current,batch.project_id,ownerId,ownerPosition);adopt(entry,pos,current,ownerId,ownerPosition);write(batch);continue;}catch{}}
  let job=entry.frame_jobs[pos];
  if(!job){
   const prior=tools().listJobs().find(j=>j.frame_binding?.request_id===task.request_id&&!j.deleted_at);
   job=prior?await frames().get(prior.id):await frames().submit({...task,project_id:batch.project_id,target_id:ownerId,position:ownerPosition,port:entry.input.port,cloudSelectionId:entry.input.cloudSelectionId,first_frame:entry.input.first_frame});entry.frame_jobs[pos]=job;
   if(read(batch.id).status==='stopped'){if(!['completed','failed','cancelled'].includes(job.status))await tools().cancel(job.id);return false;}
  }else job=await frames().get(job.id);
  if(read(batch.id).status==='stopped'){if(!['completed','failed','cancelled'].includes(job.status))await tools().cancel(job.id);return false;}entry.frame_jobs[pos]=job;entry.frame_phase='正在生成 '+ownerId+' 首图'+(ownerId!==entry.target_id?'（作为本段尾帧）':'');
  if(['failed','cancelled'].includes(job.status))throw Error((pos==='first'?'首帧':'尾帧')+'生成失败：'+(job.error||job.status));
  if(job.status!=='completed'){entry.status='preparing_frames';write(batch);return false;}
  if(!job.image_url)throw Error('首尾帧已完成但图片未保存');adopt(entry,pos,job,ownerId,ownerPosition);write(batch);
 }
 entry.frame_phase=null;entry.status='pending';write(batch);return true;
}
module.exports={validate,advance};
