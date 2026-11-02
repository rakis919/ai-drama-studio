(function(root){
 const busy=j=>['preparing','queued','running','waiting','saving','disconnected'].includes(j?.status);
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const time=value=>{if(!Number.isFinite(value))return '—';const n=Math.max(0,Math.round(value));return n>=60?Math.floor(n/60)+'分'+n%60+'秒':n+'秒';};
 function snapshot(job,now=Date.now()){
  if(!job)return null;const p=job.progress||{},t=job.timing||{},active=busy(job),delta=active&&job.timing_received_at?Math.max(0,(now-job.timing_received_at)/1000):0;
  const elapsed=Number.isFinite(t.elapsed_seconds)?t.elapsed_seconds+delta:Math.max(0,((job.finished_at?Date.parse(job.finished_at):now)-Date.parse(job.created_at))/1000);
  const labels={preparing:'准备中',queued:'排队中',running:'生成中',waiting:'等待结果',saving:'保存中',disconnected:'连接中断',completed:'生成完成',failed:'生成失败',cancelled:'已停止'};
  const step=Number(p.step),total=Number(p.total_steps),sampling=p.phase==='sampling'&&Number.isFinite(step)&&total>0;
  let remaining='';if(active){if(job.status==='queued')remaining='等待前面的任务完成';else if(job.status==='disconnected')remaining='连接中断，正在等待服务恢复';else if(Number.isFinite(t.remaining_seconds))remaining='预计剩余 '+time(Math.max(0,t.remaining_seconds-delta));else if(Number.isFinite(t.sampling_remaining_seconds))remaining='采样预计剩余 '+time(Math.max(0,t.sampling_remaining_seconds-delta))+'，之后解码保存';else if(t.remaining_range_seconds)remaining='预计剩余 '+time(Math.max(0,t.remaining_range_seconds[0]-delta))+'–'+time(Math.max(0,t.remaining_range_seconds[1]-delta));else remaining='预计剩余：等待采样数据';}
  return {active,label:job.status==='failed'?'生成失败':job.status==='disconnected'?'连接中断':p.label||labels[job.status]||job.status,elapsed,time:time(elapsed),remaining,sampling,step,total,error:job.error||job.connection_error||''};
 }
 function markup(job){const s=snapshot(job);if(!s)return '';return '<div role="status" aria-live="polite" style="padding:14px;border:1px solid #354556;border-radius:10px;margin:12px 0;background:#101923"><b>'+escape(s.label)+'</b><p style="margin:8px 0">'+(s.active?'已用 ':'耗时 ')+escape(s.time)+(s.sampling?' · 采样 '+s.step+' / '+s.total+' 步':'')+'</p>'+(s.active?(s.sampling?'<progress aria-label="图片生成进度" style="width:100%" max="'+s.total+'" value="'+s.step+'"></progress>':'<div class="shot-frame-wait-track" role="progressbar" aria-label="图片准备中"><span></span></div>')+'<p class="subtle" style="margin:8px 0">'+escape(s.remaining)+'</p>':'')+(s.error?'<p style="color:#f0bfb3;white-space:pre-wrap">'+escape(s.error)+'</p>':'')+'</div>';}
 function preview(image,job,pos){if(busy(job))return '<div style="display:grid;place-items:center;min-height:250px;background:#0b1119;border-radius:10px;margin:10px 0"><div style="text-align:center"><span class="shot-frame-spinner" aria-hidden="true"></span><p>正在生成'+(pos==='first'?'首帧':'尾帧')+'…</p><p class="subtle">生成完成后将在这里更新图片</p></div></div>';if(!image?.image_url)return '<p class="subtle">尚未生成新版图片</p>';return '<img data-ready-preview tabindex="0" role="button" aria-label="放大'+(pos==='first'?'首帧':'尾帧')+'原图" src="'+escape(image.image_url)+'" alt="已采用'+(pos==='first'?'首帧':'尾帧')+'" style="display:block;width:100%;max-height:250px;object-fit:contain;margin:10px 0;cursor:zoom-in">';}
 root.ShotFrameProgress={busy,snapshot,markup,preview};
})(globalThis);
// Current frame picker UI
(function(){
 function previous(target){const i=data.shots.indexOf(target);return i>0?data.shots[i-1]:null;}
 const waitStyle=document.createElement('style');waitStyle.textContent='.shot-frame-wait-track{height:8px;width:100%;overflow:hidden;background:#363c42;border:1px solid #737a80;border-radius:8px}.shot-frame-wait-track>span{display:block;width:20%;height:100%;border-radius:8px;background:#a3c9f3;animation:shotFrameWait 6s ease-in-out infinite alternate}@keyframes shotFrameWait{from{transform:translateX(0)}to{transform:translateX(400%)}}@media(prefers-reduced-motion:reduce){.shot-frame-wait-track>span{animation:none}}';document.head.append(waitStyle);const spinnerStyle=document.createElement('style');spinnerStyle.textContent='@keyframes shotFrameSpin{to{transform:rotate(360deg)}}.shot-frame-spinner{display:inline-block;width:36px;height:36px;border:3px solid #354556;border-top-color:#afd9cc;border-radius:50%;animation:shotFrameSpin 1s linear infinite}';document.head.append(spinnerStyle);
 globalThis.updateShotFrameProgress=function(target){if(!target)return;for(const pos of ['first','last']){const box=document.querySelector('[data-ready-card="'+pos+'"] [data-frame-progress="'+pos+'"]');if(!box)continue;const owner=pos==='last'?nextFirstOwner(target):null;const html=ShotFrameProgress.markup((owner||target).frameImages?.[owner?'first':pos]?.job);if(box.innerHTML!==html){const previous=box.querySelector('.shot-frame-wait-track'),template=document.createElement('template');template.innerHTML=html;const next=template.content.querySelector('.shot-frame-wait-track');if(previous&&next)next.replaceWith(previous);box.replaceChildren(template.content);}}};
 setInterval(()=>{if([2,3].includes(tab))updateShotFrameProgress(data.shots?.[si]);},1000);
 const originalSelected=ShotMethods.selected;
 ShotMethods.selected=function(target,pos){if(pos==='last'&&typeof nextFirstOwner==='function'){const next=nextFirstOwner(target);if(next)return originalSelected(next,'first');}const state=target?.frameImages?.[pos];if(pos!=='first'||!state?.sourceChoice)return originalSelected(target,pos);const versions=(state.versions||[]).filter(v=>!v.deleted_at&&!target.deletedShotFrameIds?.includes(v.id)).filter(v=>state.sourceChoice==='previous'?!!v.source_target_id:!v.source_target_id);return versions.find(v=>v.id===state.activeId)||versions.at(-1);};
 const originalMarkup=shotMethodsMarkup;
 shotMethodsMarkup=function(target,framesOnly=false){
  const box=document.createElement('div');box.innerHTML=originalMarkup(target,framesOnly);
  const panel=box.firstElementChild,grid=panel.querySelector('[data-frame-card]')?.parentElement,size=panel.querySelector('#shotFrameSize')?.closest('label');
  if(!grid)return box.innerHTML;
  const dialog=document.createElement('dialog');dialog.id='shotFrameGeneratorDialog';dialog.style.cssText='width:min(1100px,94vw);max-height:90vh;overflow:auto;background:var(--panel,#192330);color:inherit;border:1px solid #405064;border-radius:14px;padding:24px';
  dialog.innerHTML='<div class="preview-head"><h3>生成首帧 / 尾帧</h3><button type="button" data-frame-dialog-close>关闭</button></div><p class="subtle">提交成功后此窗口自动关闭，生成状态和结果在主界面显示。尺寸跟随项目画幅。</p>';
  if(size)dialog.append(size);dialog.append(grid);panel.append(dialog);
  const ready=document.createElement('div');ready.id='shotFramePicker';
  const prev=previous(target),last=prev&&ShotMethods.selected(prev,'last'),video=prev&&selectedShotVideo(prev);
  const ownReady=(target.frameImages?.first?.versions||[]).some(v=>!v.source_target_id&&v.status==='completed'),previousReady=!!(last?.image_url||video?.video_url);
  const sourceChoice=target.frameImages?.first?.sourceChoice||(ShotMethods.selected(target,'first')?.source_target_id?'previous':'own');
  for(const pos of ['first','last']){
   if(pos==='last'&&ShotMethods.method(target)!=='first_last_frames')continue;
   const sharedOwner=pos==='last'?nextFirstOwner(target):null,selected=ShotMethods.selected(sharedOwner||target,sharedOwner?'first':pos),state=sharedOwner?sharedOwner.frameImages?.first:target.frameImages?.[pos];
   const usePrevious=pos==='first'&&sourceChoice==='previous',versions=(state?.versions||[]).filter(v=>pos==='last'||(usePrevious?!!v.source_target_id:!v.source_target_id));
   ready.innerHTML+='<section class="card" style="margin-top:12px" data-ready-card="'+pos+'"><b>'+(pos==='first'?'当前首帧':sharedOwner?'当前尾帧 · '+esc(sharedOwner.shot_id)+' 首图':'当前尾帧')+'</b>'+(pos==='first'?'<label>首帧来源<select id="shotFirstFrameSource"><option value="own" '+(!usePrevious?'selected':'')+'>本镜首帧'+(!ownReady?'（未生成）':'')+'</option><option value="previous" '+(usePrevious?'selected':'')+'>上一镜尾帧'+(!previousReady?'（未生成）':'')+'</option></select></label>':'')+ShotFrameProgress.preview(selected,state?.job,pos)+'<div data-frame-progress="'+pos+'">'+ShotFrameProgress.markup(state?.job)+'</div>'+(ShotFrameProgress.busy(state?.job)&&state?.job?.id?'<button type="button" data-ready-frame-stop="'+pos+'">停止生成</button>':'')+'<label>选择采用的图片<select data-ready-frame="'+pos+'"><option value="">'+(versions.length||(usePrevious&&previousReady)?'请选择已生成图片':'未生成')+'</option>'+versions.map((v,i)=>'<option value="'+esc(v.id)+'" '+(selected?.id===v.id?'selected':'')+'>V'+(i+1)+' · '+v.width+' × '+v.height+(v.source_target_id?' · 来自 '+esc(v.source_target_id):'')+'</option>').join('')+(usePrevious&&last?.status==='completed'?'<option value="previous_image">采用上一镜 '+esc(prev.shot_id||prev.id)+' 已生成的尾帧</option>':'')+(usePrevious&&video?.video_url?'<option value="previous_video">采用上一镜 '+esc(prev.shot_id||prev.id)+' 视频最后一帧</option>':'')+'</select></label><div style="display:flex;gap:12px;margin:8px 0;flex-wrap:wrap">'+shotFrameWorkflowLinks(selected,state?.job)+'</div>'+(!usePrevious?'<button type="button" data-open-frame-generator="'+pos+'" '+(shotFrameBusy(state?.job)?'disabled':'')+'>生成'+(pos==='first'?'首帧':'尾帧')+'…</button>':(!last?.image_url&&!video?.video_url?'<p class="subtle">上一镜尚无可用尾帧，请先完成上一镜视频或尾帧图片。</p>':''))+'</section>';
  }
  if(!framesOnly&&ShotMethods.method(target)==='reference_images')ready.style.display='none';
  dialog.before(ready);return box.innerHTML;
 };
 const originalBind=bindShotMethods;
 bindShotMethods=function(target){
  originalBind(target);const dialog=document.getElementById('shotFrameGeneratorDialog');
  document.querySelectorAll('[data-open-frame-generator]').forEach(button=>button.onclick=()=>{const pos=button.dataset.openFrameGenerator;if(pos==='last'&&nextFirstOwner(target)){generateShotFrame(nextFirstOwner(target),'first');return;}dialog.querySelector('h3').textContent='生成'+(pos==='first'?'首帧':'尾帧');dialog.querySelectorAll('[data-frame-card]').forEach(card=>card.style.display=card.dataset.frameCard===pos?'':'none');dialog.showModal();});
  document.getElementById('shotFirstFrameSource')?.addEventListener('change',e=>{const state=shotFrameState(target,'first');if(shotFrameBusy(state.job)){toast('请等待当前首帧任务完成');render();return;}state.sourceChoice=e.target.value;save();render();});
  dialog?.querySelector('[data-frame-dialog-close]')?.addEventListener('click',()=>dialog.close());
  document.querySelectorAll('[data-ready-preview]').forEach(image=>{const open=()=>{if(typeof openCharacterImage==='function')openCharacterImage(image);else window.open(image.currentSrc||image.src,'_blank','noopener');};image.onclick=open;image.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};});
  document.querySelectorAll('[data-ready-frame-stop]').forEach(button=>button.onclick=()=>stopShotFrameGeneration(target,button.dataset.readyFrameStop,button));
  document.querySelectorAll('[data-ready-frame]').forEach(select=>{select.disabled=select.dataset.readyFrame==='last'&&!!nextFirstOwner(target)||shotFrameBusy(target.frameImages?.[select.dataset.readyFrame]?.job);});
  document.querySelectorAll('[data-ready-frame]').forEach(select=>select.onchange=async()=>{
   const pos=select.dataset.readyFrame,state=shotFrameState(target,pos),value=select.value;
   if(!value)return;if(shotFrameBusy(state.job)){toast('请等待当前图片任务完成');render();return;}
   if(!value.startsWith('previous_')){state.activeId=value;state.needsReview=false;save();render();return;}
   const prev=previous(target),source=value==='previous_image'?ShotMethods.selected(prev,'last'):selectedShotVideo(prev),projectId=data.project_id;
   select.disabled=true;
   try{
    if(typeof flushDisk==='function')await flushDisk();
    const image=await frontFetch('/api/shot-frame/adopt-previous',{project_id:projectId,target_id:target.shot_id||target.id,source_kind:value,source_id:source.id});
    if(data.project_id!==projectId)return;
    state.versions??=[];state.versions.push(image);state.activeId=image.id;state.sourceChoice='previous';state.needsReview=false;
    save();render();toast('已采用上一镜尾帧作为本镜首帧');
   }catch(e){toast(e.message);if(data.project_id===projectId)render();}
  });
 };
 // Keep the active generator open when task polling or form edits redraw the page.
 const previousRender=render;
 render=function(){
  const dialog=document.getElementById('shotFrameGeneratorDialog');
  const open=dialog?.open,position=dialog?.querySelector('[data-frame-card]:not([style*="display: none"])')?.dataset.frameCard||'first';
  const projectId=data.project_id,shotId=data.shots?.[si]?.shot_id||data.shots?.[si]?.id,currentTab=tab,scrollTop=dialog?.scrollTop||0;
  const result=previousRender.apply(this,arguments);
  const next=document.getElementById('shotFrameGeneratorDialog');
  if(open&&next&&!next.open&&data.project_id===projectId&&tab===currentTab&&(data.shots?.[si]?.shot_id||data.shots?.[si]?.id)===shotId){
   next.querySelector('h3').textContent='生成'+(position==='first'?'首帧':'尾帧');
   next.querySelectorAll('[data-frame-card]').forEach(card=>card.style.display=card.dataset.frameCard===position?'':'none');
   next.showModal();next.scrollTop=scrollTop;
  }
  return result;
 };
 render();
})();
