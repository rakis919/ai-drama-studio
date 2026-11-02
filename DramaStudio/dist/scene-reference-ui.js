const sceneReferenceBeforeVersionChoice=sceneReference;
sceneReference=function(scene,key){
 if(key!=='master')return sceneReferenceBeforeVersionChoice(scene,key);
 const sourceId=sceneReferenceId(scene);
 if(!sourceId)return sceneReferenceBeforeVersionChoice(scene,key);
 const source=data.scenes.find(s=>s.id===sourceId);
 const versions=(source?.sceneVersions||[]).filter(v=>(v.view_key||'master')==='master'&&v.image_url);
 const version=scene.referenceMasterJobId?versions.find(v=>v.id===scene.referenceMasterJobId):source?selectedSceneVersion(source,'master'):undefined;
 return {scene:source,version,required:true,reason:scene.referenceMasterJobId?'所选参考版本已不存在，请重新选择参考图版本。':'请先生成参考场景 '+sourceId+' 的主图。'};
};
const renderScenesBeforeReferenceChoice=renderScenes;
renderScenes=function(){
 renderScenesBeforeReferenceChoice();const scene=currentScene();if(!scene)return;
 const view=scene.activeView||'master',ref=sceneReference(scene,view),status=document.querySelector('#sceneReferenceStatus');
 const source=ref.scene,versions=(source?.sceneVersions||[]).filter(v=>(v.view_key||'master')==='master'&&v.image_url);
 if(!source)return;
 const versionNumber=versions.findIndex(v=>v.id===ref.version?.id)+1;
 status.textContent=ref.version?'本次生成参考：'+source.name+' · V'+versionNumber+' · '+(scene.referenceMasterJobId?'固定版本':'跟随参考场景当前主图'):ref.reason;
 const generated=selectedSceneVersion(scene,view);
 if(generated?.reference_job_id&&ref.version&&generated.reference_job_id!==ref.version.id)status.textContent+='。当前显示的成图使用旧参考，重新生成后才会更新。';
 const box=document.createElement('div');box.id='sceneReferencePreview';box.style.cssText='padding:12px;border:1px solid #344254;border-radius:8px;margin:12px 0';
 if(view==='master'){
  const label=document.createElement('label');label.textContent='生成使用的参考图版本';const select=document.createElement('select');select.setAttribute('aria-label','生成使用的参考图版本');
  const current=source?selectedSceneVersion(source,'master'):undefined;
  const follow=document.createElement('option');follow.value='';follow.textContent='跟随 '+source.name+' 当前主图'+(current?'（V'+(versions.findIndex(v=>v.id===current.id)+1)+'）':'');select.append(follow);
  versions.forEach((v,i)=>{const option=document.createElement('option');option.value=v.id;option.textContent='固定 V'+(i+1)+' · '+new Date(v.created_at||v.finished_at).toLocaleString('zh-CN')+(v.id===source.confirmedMasterJobId?' · 已确认':'');select.append(option)});
  select.value=scene.referenceMasterJobId||'';select.onchange=()=>{scene.referenceMasterJobId=select.value||undefined;save();render()};label.append(select);box.append(label);
 }
 if(ref.version?.image_url){const a=document.createElement('a');a.href=ref.version.image_url;a.target='_blank';a.rel='noopener';const img=document.createElement('img');img.src=ref.version.image_url;img.alt='本次生成使用的参考图：'+source.name+' V'+versionNumber;img.style.cssText='width:100%;max-height:180px;object-fit:contain;background:#080d14;border-radius:6px';a.append(img);box.append(a);const caption=document.createElement('p');caption.className='subtle';caption.textContent='参考图编号：'+String(ref.version.id).slice(0,8);caption.title=ref.version.id;box.append(caption);}
 document.querySelector('#sceneGenerate').before(box);
 document.querySelectorAll('[data-relation-scene]').forEach(button=>{const item=data.scenes[Number(button.dataset.relationScene)];const r=sceneReference(item,'master');if(r.scene){const span=button.querySelector('span');if(span)span.textContent='← 参考 '+r.scene.name+(r.version?' · 已就绪':' · 等待主图');}});
};render();
const renderScenesBeforeCurrentWorkflow=renderScenes;
renderScenes=function(){renderScenesBeforeCurrentWorkflow();const scene=currentScene();if(!scene)return;const generate=document.querySelector('#sceneGenerate'),button=document.createElement('button');button.textContent='在 ComfyUI 中打开当前设置工作流';button.className='wide';button.style.marginTop='10px';button.onclick=async()=>{const reference=sceneReference(scene,scene.activeView||'master');if(reference.required&&!reference.version){toast(reference.reason);return}button.disabled=true;button.textContent='正在载入当前参考图…';try{const view=scene.activeView||'master';const job=await frontFetch('/api/front-image',{request_id:crypto.randomUUID(),preview_only:true,port:Number(localStorage.getItem('frame-comfy-port')||8188),resource_type:'scene',edit_intent:scene.editIntent||'build',model:scene.imageModel||'qwen',denoise:Number(scene.denoise??0.45),mode:reference.version?'scene_edit':'front',reference_job_id:reference.version?.id,project_id:data.project_id||data.title,character_id:scene.id,character_name:scene.name,view_key:view,prompt:scene.prompt,negative_prompt:scene.negativePrompt,world_prompt:sceneWorldPrompt(),view_prompt:(view==='master'?'':(data.sceneLibrary?.variant_template?.prompt_template||'')+'。')+sceneCamera(scene,view),...sceneSize(scene)});const link=document.createElement('a');link.href='/api/open-workflow/'+job.id+'?port='+Number(localStorage.getItem('frame-comfy-port')||8188);link.textContent='打开已准备好的当前工作流 ↗';link.target='_blank';link.rel='noopener';link.style.color='var(--green)';button.after(link);link.click();toast('当前设置工作流已准备好，未提交生成任务');}catch(error){toast(error.message)}finally{button.disabled=false;button.textContent='在 ComfyUI 中打开当前设置工作流';}};generate.after(button);const history=document.querySelector('#sceneWorkflowLinks');if(history){const label=document.createElement('p');label.className='subtle';label.textContent='以下为当前显示成图的历史记录（保留生成时的参考图和参数）：';history.before(label);history.querySelectorAll('a').forEach(a=>{if(a.textContent==='查看当前生成工作流')a.textContent='查看历史工作流 JSON';});}};render();
