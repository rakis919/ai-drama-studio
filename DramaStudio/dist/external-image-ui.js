(()=>{
 const pending=new Set(),busy=j=>['preparing','submitting','queued','running','waiting','saving','stopping','disconnected'].includes(j?.status);
 const encode=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('图片读取失败'));r.readAsDataURL(file);});
 function zone(parent,label,context,adopt,isBusy){
  if(!parent||parent.querySelector(':scope > [data-external-upload]'))return;
  const box=document.createElement('div');box.dataset.externalUpload='true';box.className='external-image-upload';
  const button=document.createElement('button');button.type='button';button.textContent='选择外部图片';
  const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.hidden=true;
  const note=document.createElement('span');note.textContent='或拖入'+label+' · PNG / JPEG / WebP，最大10MB';
  const status=document.createElement('p');status.setAttribute('role','status');
  box.append(button,input,note,status);parent.append(box);button.onclick=()=>input.click();
  const key=JSON.stringify(context),project=data.project_id;
  async function upload(file){
   if(!file)return;if(pending.has(key))return;
   try{
    if(data.project_id!==project)throw Error('项目已切换，请重新选择图片');
    if(isBusy())throw Error('当前图片正在生成，请等待完成或先停止');
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('请选择 PNG、JPEG 或 WebP 图片');
    if(file.size>10*1024*1024)throw Error('图片不能超过10MB');
    pending.add(key);button.disabled=true;status.textContent='正在保存外部图片…';
    await ensureProjectSaved();
    const job=await frontFetch('/api/character-reference-upload',{...context,project_id:project,image:await encode(file)});
    if(data.project_id!==project)throw Error('图片已保存到原项目素材目录；请切回原项目后重新选择');
    if(isBusy())throw Error('该位置已开始生成，未替换当前图片，请稍后重新选择');
    adopt(job);save();await ensureProjectSaved();render();toast(label+'已添加为新版本，原图保留');
   }catch(e){status.textContent=e.message;toast(e.message);}finally{pending.delete(key);button.disabled=false;input.value='';}
  }
  input.onchange=()=>upload(input.files[0]);
  for(const target of [parent,box]){
   target.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('Files')){e.preventDefault();e.stopPropagation();box.classList.add('drag-over');}});
   target.addEventListener('dragleave',()=>box.classList.remove('drag-over'));
   target.addEventListener('drop',e=>{if(!e.dataTransfer.files.length)return;e.preventDefault();e.stopPropagation();box.classList.remove('drag-over');if(e.dataTransfer.files.length!==1){toast('每个图片位置一次拖入一张');return;}upload(e.dataTransfer.files[0]);});
  }
 }
 function draw(){
  if(tab===0){const c=data.characters?.[ci];if(!c||c.specialReference)return;
   const boxes=document.querySelectorAll('#panel .angle-grid .angle');
   const add=(parent,angle)=>zone(parent,({portrait:'大头像',front:'全身正面图',left:'侧面图',back:'背面图'})[angle],{resource_type:'character',character_id:String(c.id||c.character_id||c.name),angle},job=>{
    if(angle==='portrait')applyIdentityPortrait(c,job);
    else if(angle==='front')applyFrontResult(c,job);
    else{let entry=activeMulti(c);if(!entry){c.multi??=[];entry={jobs:{},angle_history:{}};c.multi.push(entry);c.multiActive=c.multi.length-1;}entry.jobs??={};entry.angle_history??={};entry.angle_history[angle]??=[];const old=entry.jobs[angle];if(old&&!entry.angle_history[angle].some(v=>v.id===old.id))entry.angle_history[angle].push(old);entry.jobs[angle]=job;c.reference_images??={};c.reference_images[angle]=job.image_url;}
   },()=>busy(c.portraitJob)||busy(c.frontJob)||['running','stopping'].includes(c.oneClick?.status)||Object.values(activeMulti(c)?.jobs||{}).some(busy));
   if(boxes.length)for(const [i,a]of ['portrait','front','left','back'].entries())add(boxes[i],a);
   else{const host=document.querySelector('#panel .artboard')?.parentElement;if(host){const group=document.createElement('div');host.append(group);for(const a of ['portrait','front','left','back']){const slot=document.createElement('div');group.append(slot);add(slot,a);}}}
  }
  if(tab===1){const scene=typeof currentScene==='function'?currentScene():null;if(scene){const view=scene.activeView||'master';zone(document.querySelector('#sceneImageBox')?.parentElement,'当前场景机位图片',{resource_type:'scene',scene_id:String(scene.id||scene.scene_id),view_key:view},job=>{scene.sceneVersions??=[];scene.sceneVersions.push(job);scene.jobs??={};scene.jobs[view]=job;scene.activeVersions??={};scene.activeVersions[view]=job.id;if(view==='master')scene.confirmedMasterJobId=job.id;},()=>busy(scene.jobs?.[view]));}}
  const target=typeof shotVideoTarget==='function'?shotVideoTarget():data.shots?.[si];
  if(target)for(const pos of ['first','last'])zone(document.querySelector('[data-frame-card="'+pos+'"]'),pos==='first'?'首帧图片':'尾帧图片',{resource_type:'frame',target_id:String(target.shot_id||target.clip_id||target.id),position:pos},job=>{const st=shotFrameState(target,pos);st.versions??=[];st.versions.push(job);st.activeId=job.id;st.job=job;st.needsReview=false;},()=>busy(target.frameImages?.[pos]?.job)||busy(target.videoJob));
 }
 const previous=render;render=function(){previous();draw();};
 const style=document.createElement('style');style.textContent='.external-image-upload{margin:10px 4px;padding:12px;border:1px dashed #52677b;border-radius:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px}.external-image-upload span{color:#a8bacb}.external-image-upload p{width:100%;margin:0}.external-image-upload.drag-over{background:#26433d;border-color:#b5e3d2}';document.head.append(style);render();
})();
