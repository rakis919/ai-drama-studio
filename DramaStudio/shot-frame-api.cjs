const fs=require('node:fs'),path=require('node:path');
const {promisify}=require('node:util'),{execFile}=require('node:child_process');
const root=process.env.DRAMA_OUTPUT_ROOT||'D:/AIPlatform/Output/DramaStudio';
const frameEngine=require('D:/AIPlatform/GptWork/DramaStudio-qwen21/qwen21-frame-workflow.cjs');
const tools=()=>require('./quick-tools-api.cjs');
const locks=new Map();
function frameFile(ref,projectId,targetId,position){
 const m=/^\/api\/front-image\/([a-f0-9-]{36})\/image$/.exec(ref?.image_url||'');
 if(!m)throw Error('请先生成并选择当前镜头的'+(position==='first'?'首帧':'尾帧'));
 const meta=JSON.parse(fs.readFileSync(path.join(root,'FrontImages',m[1],'job.json'),'utf8'));
 const b=meta.frame_context;
 let shared=false;if(position==='last'&&b?.position==='first'&&b.project_id===projectId){const project=require('./project-store.cjs').readProject(projectId).project,index=project?.shots?.findIndex(s=>(s.shot_id||s.id)===targetId);shared=project?.shotScript?.endpoint_generation_policy?.strategy==='next_shot_first'&&index>=0&&(project.shots[index+1]?.shot_id||project.shots[index+1]?.id)===b.target_id;}if(meta.status!=='completed'||meta.deleted_at||!b||b.project_id!==projectId||!shared&&(b.target_id!==targetId||b.position!==position))throw Error('首尾帧与当前镜头绑定不匹配');
 const project=require('./project-store.cjs').readProject(projectId).project,owner=project.shots.find(s=>(s.shot_id||s.id)===(shared?b.target_id:targetId)),policy=owner?.backgroundStatePolicy;if(policy?.enabled&&policy.strategy==='empty_layout_by_story'){const scene=project.scenes.find(s=>(s.scene_id||s.id)===policy.scene_id),layout=scene?.reference_states?.find(s=>s.state_id===policy.first_state_id);const expectedVersion=policy.manual_image_id||layout?.version_id,approval=owner?.frameImages?.[shared?'first':position]?.videoSourceApproval,explicitReuse=approval?.mode==='explicit_selected_frame'&&approval.image_id===m[1]&&approval.bound_layout_id===b.background_layout_id&&approval.bound_layout_version===b.background_layout_version&&approval.expected_layout_id===policy.first_state_id&&approval.expected_layout_version===expectedVersion;if((b.background_layout_id!==policy.first_state_id||b.background_layout_version!==expectedVersion)&&!explicitReuse)throw Error('所选首帧绑定的背景版本与当前背景参考不同，请重新生成首帧，或明确沿用该首帧版本');}
 if(owner?.backgroundPreservation?.enabled&&(!b.background_lock||b.background_lock.reference_version_id!==owner.backgroundPreservation.reference_version_id))throw Error('此首帧未使用当前背景保护流程，请重新生成');
 const file=path.join(root,'FrontImages',m[1],'front.png');if(!fs.existsSync(file)||!fs.statSync(file).size)throw Error('首尾帧文件不存在，请重新生成');return {id:m[1],file};
}
async function promote(job){
 if(job.status!=='completed')return job;
 const b=job.frame_binding;if(!b)throw Error('不是分镜图片任务');
 const folder=path.join(root,'FrontImages',job.id),file=path.join(folder,'front.png');
 if(!fs.existsSync(file)){
  fs.mkdirSync(folder,{recursive:true});
  await promisify(execFile)('T:/AI/ComfyUI_1.3.5/.ext/python.exe',['-c','from PIL import Image; import sys; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2],format="PNG")',tools().resultPath(job),file+'.tmp'],{windowsHide:true,timeout:30000});
  fs.renameSync(file+'.tmp',file);
 }
 const meta={id:job.id,project_id:b.project_id,character_id:b.scene_id,resource_type:'scene',status:'completed',mode:'shot_frame',frame_context:b,execution_device:job.execution_device,port:job.port,prompt:job.prompt,width:job.width,height:job.height,created_at:job.created_at,finished_at:job.finished_at};
 fs.writeFileSync(path.join(folder,'job.json'),JSON.stringify(meta,null,2));
 return {...job,image_url:'/api/front-image/'+job.id+'/image'};
}
async function get(id){if(!locks.has(id))locks.set(id,(async()=>{const j=tools().readJob(id);if(!j.frame_binding)throw Error('不是分镜图片任务');return promote(await tools().refresh(id));})().finally(()=>locks.delete(id)));return locks.get(id);}
async function submit(input){
 if(!['first','last'].includes(input.position)||!['text_to_image','image_to_image'].includes(input.method))throw Error('请选择有效的首尾帧生成方式');
 const record=require('./project-store.cjs').readProject(input.project_id),project=record.project;
 if(!project||project.deleted)throw Error('请先保存当前项目');
 const shot=project.shots?.find(s=>(s.shot_id||s.id)===input.target_id);
 if(!shot)throw Error('当前主分镜不存在，请保存后重试');
 const files=[],reference_labels=[];
 if(input.method==='image_to_image'){
  if(input.reference_source==='generated_first_frame'){
   if(input.position!=='last')throw Error('首帧不能引用自身');
   files.push(frameFile(input.first_frame,input.project_id,input.target_id,'first'));reference_labels.push({picture:'<Picture 1>',name:'当前已选首帧'});
  }else if(input.reference_source==='picture_inputs'){
   if(!Array.isArray(input.picture_inputs)||!input.picture_inputs.length||input.picture_inputs.length>16)throw Error('首尾帧图生图需要1–16张参考图（场景和人物合计）');
   for(const ref of input.picture_inputs){
    const slot=ref.original_picture||ref.picture,original=shot.picture_inputs?.find(p=>(p.picture||p.tag)===slot),override=shot.pictureBindingOverrides?.[slot],binding=original&&{...original,...override};if(!binding||binding.enabled===false||binding.type!==ref.type||binding.ref_id!==ref.ref_id)throw Error('参考图与当前分镜绑定不一致');
    files.push(require('./video-api.cjs').referenceFile(ref,input.project_id,{usage:'ref2va'}));reference_labels.push({picture:slot,name:binding.name||ref.ref_id});
   }
  }else throw Error('请选择有效参考来源');
 }
 if(shot.backgroundPreservation?.enabled)throw Error('矩形背景拼接已停用，请刷新项目使用官方图1编辑流程');
 const background_lock=null;
 let edit_target;const target=shot.imageEditPolicy?.edit_target_image;
 if(target&&input.position==='first'&&input.reference_source==='picture_inputs'){if(input.picture_inputs?.[0]?.type!=='scene')throw Error('编辑目标必须放在输入图1');const source=frameFile(target,input.project_id,target.owner_id,'first');files[0]=source;reference_labels[0]={picture:input.picture_inputs[0].picture,name:target.owner_id+' 已生成画面（编辑目标）'};edit_target={id:source.id,owner_id:target.owner_id,image_url:target.image_url};}
 if(background_lock){const first=input.picture_inputs?.[0];if(first?.type!=='scene')throw Error('背景保护要求输入图1为场景图');const expected=background_lock.reference_version_id;if(expected&&first.image_url!=='/api/front-image/'+expected+'/image')throw Error('背景版本已变化，请重新配置人物编辑区域后再生成');}
 const base=tools().validate({camera_lora:shot.imageEditPolicy?.camera_lora,edit_target,background_lock,kind:input.method==='image_to_image'?'image-image':'text-image',upload_id:files.length?'00000000-0000-0000-0000-000000000000':undefined,prompt:input.prompt,negative_prompt:input.negative_prompt,width:input.width,height:input.height,port:Number(input.port)===18191?18191:frameEngine.PORT,cloud_frame:Number(input.port)===18191,cloudSelectionId:input.cloudSelectionId,image_model:frameEngine.MODEL,reference_labels,reference_source:input.reference_source,prompt_enhance:input.prompt_enhance!==false});
 if(Number(input.port)!==18191)await frameEngine.ensureRunning();
 const uploads=[];
 for(const f of files){const uploaded=await tools().uploadImage({image:'data:image/png;base64,'+fs.readFileSync(f.file).toString('base64')});uploads.push(uploaded.id);}
 return tools().submit({...base,upload_id:uploads[0],upload_ids:uploads.length?uploads:undefined,frame_binding:{project_id:input.project_id,target_id:input.target_id,scene_id:shot.scene_id,position:input.position,method:input.method,reference_source:input.reference_source,request_id:input.request_id,edit_target,background_lock:background_lock?{mode:background_lock.mode,reference_version_id:background_lock.reference_version_id,camera_policy:background_lock.camera_policy}:undefined,background_layout_id:shot.backgroundStatePolicy?.enabled?shot.backgroundStatePolicy.first_state_id:undefined,background_layout_version:shot.backgroundStatePolicy?.enabled?shot.backgroundStatePolicy.manual_image_id||project.scenes?.find(s=>(s.scene_id||s.id)===shot.backgroundStatePolicy.scene_id)?.reference_states?.find(s=>s.state_id===shot.backgroundStatePolicy.first_state_id)?.version_id:undefined}});
}
async function handle(req,res,url){const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};try{
 const origin=req.headers.origin;if(origin&&!['http://127.0.0.1:4173','http://localhost:4173','http://127.0.0.1:4173'].includes(origin))return json(403,{error:'仅接受本机工作台请求'});
 if(req.method==='POST'&&url.pathname==='/api/shot-frame/delete-first'){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>10000)throw Error('请求过大');}return json(200,require('./delete-first-frame.cjs').remove(JSON.parse(body)));}
 if(req.method==='POST'&&url.pathname==='/api/shot-frame/adopt-previous'){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>10000)throw Error('请求过大');}return json(200,await require('./previous-frame-adoption.cjs').adopt(JSON.parse(body)));}
 if(req.method==='POST'&&url.pathname==='/api/shot-frame'){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>150000)throw Error('请求过大');}return json(200,await submit(JSON.parse(body)));}
 if(req.method==='GET'&&url.pathname==='/api/shot-frame'){const jobs=tools().listJobs().filter(j=>j.frame_binding?.project_id===url.searchParams.get('project_id')&&!j.deleted_at);return json(200,jobs.map(j=>({...j,image_url:j.status==='completed'&&fs.existsSync(path.join(root,'FrontImages',j.id,'front.png'))?'/api/front-image/'+j.id+'/image':null})));}
 const m=/^\/api\/shot-frame\/([a-f0-9-]{36})$/.exec(url.pathname);if(req.method==='GET'&&m)return json(200,await get(m[1]));
 return json(404,{error:'接口不存在'});
 }catch(e){json(400,{error:e.message==='fetch failed'?'无法连接ComfyUI，请检查服务。':e.message});}}
module.exports={handle,frameFile,promote,submit,get};
