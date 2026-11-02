const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const root=process.env.DRAMA_OUTPUT_ROOT||'D:/AIPlatform/Output/DramaStudio';
function previous(project,targetId){const i=project.shots?.findIndex(s=>(s.shot_id||s.id)===targetId);if(!(i>0))throw Error('当前分镜没有上一分镜');return {shot:project.shots[i],previous:project.shots[i-1]};}
async function adopt(input,verifiedSource){
 const project=require('./project-store.cjs').readProject(input.project_id).project;
 const {shot,previous:prev}=previous(project,input.target_id),previousId=prev.shot_id||prev.id;
 let source,file;
 if(input.source_kind==='previous_image'){
  source=prev.frameImages?.last?.versions?.find(v=>v.id===input.source_id);
  if(!source||source.status!=='completed')throw Error('上一镜尾帧尚未完成或不属于上一分镜');
  file=require('./shot-frame-api.cjs').frameFile(source,input.project_id,previousId,'last').file;
 }else if(input.source_kind==='previous_video'){
  const versions=[...(prev.videoVersions||[]),prev.videoJob].filter(Boolean);
  if(!versions.some(v=>v.id===input.source_id)&&verifiedSource?.id!==input.source_id)throw Error('所选视频不属于上一分镜');
  const api=require('./video-api.cjs');source=api.readJob(input.source_id);
  if(source.project_id!==input.project_id||source.target_id!==previousId||source.status!=='completed'||!api.hasOutput(source.id))throw Error('上一镜视频尚未完成');
 }else throw Error('请选择上一镜尾帧来源');
 if(require('./dist/shot-aspect-policy.js').mismatch(source,project))throw Error('上一镜尾帧画幅与当前项目不符，请先生成正确画幅的上一镜');
 const id=randomUUID(),folder=path.join(root,'FrontImages',id),out=path.join(folder,'front.png');fs.mkdirSync(folder,{recursive:true});
 try{
  if(file)fs.copyFileSync(file,out);
  else await promisify(execFile)('T:/AI/ComfyUI_1.3.5/.ext/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe',['-hide_banner','-loglevel','error','-y','-sseof','-0.2','-i',path.join(root,'Videos',source.id,'video.mp4'),'-vf','reverse','-frames:v','1',out],{windowsHide:true,timeout:30000});
  const time=new Date().toISOString(),job={id,status:'completed',project_id:input.project_id,character_id:shot.scene_id,resource_type:'scene',mode:'shot_frame',width:source.width,height:source.height,created_at:time,finished_at:time,image_url:'/api/front-image/'+id+'/image',source_target_id:previousId,source_id:source.id,source_kind:input.source_kind,frame_context:{project_id:input.project_id,target_id:input.target_id,position:'first'}};
  fs.writeFileSync(path.join(folder,'job.json'),JSON.stringify(job,null,2));return job;
 }catch(e){throw e;}
}
module.exports={adopt,previous};
