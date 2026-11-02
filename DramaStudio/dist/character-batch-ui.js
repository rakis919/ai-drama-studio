function characterReusableViews(c){
 const entry=activeMulti(c),head=currentIdentityPortrait(c),v=selectedFront(c);
 const complete=j=>j?.status==='completed'&&j.image_url;
 const front=[c.frontJob,c.oneClick?.tasks?.front,entry?.jobs?.front].find(j=>j?.id===v?.job_id&&complete(j))||(v?.job_id&&v.image_url?{...v,id:v.job_id,status:'completed'}:null);
 const result={};if(complete(head))result.portrait={...head};
 if(result.portrait&&front&&(!front.reference_job_id||front.reference_job_id===head.id)){result.front={...front};for(const angle of ['left','back']){const job=entry?.jobs?.[angle];if(complete(job)&&(job.reference_job_id||entry.reference_job_id)===front.id)result[angle]={...job};}}
 return result;
}
const characterViewsComplete=c=>c.specialReference?true:Object.keys(characterReusableViews(c)).length===4;
let characterBatchBusy=false,characterStopBusy=false;
const characterQueueKey=c=>c.characterQueueKey??=(c.id||c.character_id||crypto.randomUUID());
const characterBatchActive=b=>['running','stopping'].includes(b?.status);
const characterBusyNow=c=>multiBusyStates.includes(c.portraitJob?.status)||multiBusyStates.includes(c.frontJob?.status)||(c.multi||[]).some(e=>Object.values(e.jobs||{}).some(j=>multiBusyStates.includes(j.status)));
let lastBatchVisualState='';
function batchSave(){save();const next=JSON.stringify([data.characterBatch,data.characters.map(c=>[c.id||c.character_id,c.oneClick?.id,c.oneClick?.status,c.oneClick?.stop_error])]);if(next===lastBatchVisualState)return;lastBatchVisualState=next;if(tab===0)render()}
async function stopCharacterRun(c){const run=c.oneClick;if(!run||!['running','stopping'].includes(run.status))return;run.stop_requested=true;run.status='stopping';delete run.stop_error;batchSave();await finishCharacterStop(c);}
async function finishCharacterStop(c){const run=c.oneClick;if(run?.status!=='stopping')return;try{
  const ids=Object.values(run.tasks||{}).filter(j=>j.id&&j.status!=='completed').map(j=>j.id);
  if(ids.length){const result=await frontFetch('/api/character-cancel',{project_id:run.project_id,character_id:run.character_id,job_ids:ids});for(const record of result.jobs){const task=Object.values(run.tasks).find(j=>j.id===record.id);if(task)task.status=record.status;const entry=c.multi?.find(e=>e.auto_run_id===run.id);for(const j of Object.values(entry?.jobs||{}))if(j.id===record.id)j.status=record.status;if(c.frontJob?.id===record.id)c.frontJob.status=record.status;}}
  run.status='stopped';run.stopped_at=new Date().toISOString();delete run.stop_error;
 }catch(e){run.stop_error=e.message;}batchSave();}
async function finishAllCharacterStops(){if(characterStopBusy)return;characterStopBusy=true;try{for(const c of data.characters)if(c.oneClick?.status==='stopping')await finishCharacterStop(c)}finally{characterStopBusy=false}}
async function startAllCharacters(resume=false){
  if(typeof diskConflict!=='undefined'&&diskConflict){toast('请先处理项目保存冲突');return;}
  if(data.characters.some(c=>['running','stopping'].includes(c.oneClick?.status))){toast('请先等待或停止正在生成的人物');return;}
  if(resume&&['failed','stopped'].includes(data.characterBatch?.status)){const b=data.characterBatch;b.status='running';delete b.stop_requested;delete b.error;for(const item of b.items)if(['failed','stopped'].includes(item.status)){const c=data.characters.find(c=>characterQueueKey(c)===item.key);item.status=c&&characterViewsComplete(c)?'completed':'pending'};batchSave();await characterBatchTick();return;}
  if(!data.characters.length){toast('请先添加人物');return;}
  const missing=data.characters.filter(c=>!characterViewsComplete(c)&&!c.prompt?.trim());if(missing.length){toast('请先补齐人物提示词：'+missing.map(c=>c.name).join('、'));return;}
  if(data.characters.some(characterBusyNow)){toast('请先等待已有的角色生成任务完成');return;}
  data.characterBatch={id:crypto.randomUUID(),project_id:data.project_id||data.title,status:'running',created_at:new Date().toISOString(),items:data.characters.map(c=>({key:characterQueueKey(c),name:c.name,status:characterViewsComplete(c)?'completed':'pending'}))};batchSave();await characterBatchTick();
}
async function stopAllCharacters(){const b=data.characterBatch;if(b&&characterBatchActive(b)){b.stop_requested=true;b.status='stopping';for(const item of b.items)if(item.status==='pending')item.status='stopped';}for(const c of data.characters)if(c.oneClick?.status==='running'){c.oneClick.stop_requested=true;c.oneClick.status='stopping';}batchSave();await finishAllCharacterStops();await characterBatchTick();}
async function characterBatchTick(){
 if(characterBatchBusy||typeof diskReady!=='undefined'&&!diskReady||typeof diskConflict!=='undefined'&&diskConflict)return;
 const batch=data.characterBatch;if(!characterBatchActive(batch))return;if(batch.project_id!==(data.project_id||data.title))return;characterBatchBusy=true;
 try{
  const active=batch.items.find(i=>['running','starting'].includes(i.status));
  if(active){const c=data.characters.find(c=>characterQueueKey(c)===active.key);if(!c)throw Error('人物已移除：'+active.name);
   if(c.oneClick?.batch_id===batch.id){active.run_id=c.oneClick.id;if(['running','stopping'].includes(c.oneClick.status))return;if(c.oneClick.status==='completed'){active.status='completed';active.sheet_id=c.oneClick.sheet_id;}else if(c.oneClick.status==='stopped'){active.status='stopped';}else{active.status='failed';active.error=c.oneClick.error||'生成失败';throw Error(active.name+'：'+active.error);}}
   else if(active.run_id)throw Error(active.name+'的任务已变化，请重新开始批量生成');else active.status='pending';
  }
  if(batch.stop_requested){if(!data.characters.some(c=>c.oneClick?.batch_id===batch.id&&['running','stopping'].includes(c.oneClick.status))){batch.status='stopped';batch.stopped_at=new Date().toISOString();}return;}
  if(data.characters.some(c=>['running','stopping'].includes(c.oneClick?.status)))return;
  const next=batch.items.find(i=>i.status==='pending');if(!next){batch.status='completed';batch.finished_at=new Date().toISOString();toast('所有人物生成队列已完成');return;}
  const c=data.characters.find(c=>characterQueueKey(c)===next.key);if(!c)throw Error('人物已移除：'+next.name);if(characterBusyNow(c))return;
  const previous=c.oneClick?.id;next.status='starting';batchSave();const resume=c.oneClick?.batch_id===batch.id&&['failed','stopped'].includes(c.oneClick.status);await startCharacterAuto(c,resume,{batch_id:batch.id,fill_missing:true});
  if(c.oneClick?.batch_id!==batch.id||(!resume&&c.oneClick.id===previous)){next.status='failed';next.error=document.querySelector('#toast')?.textContent||'无法启动';throw Error(next.name+'：'+next.error)}next.run_id=c.oneClick.id;next.status='running';
 }catch(e){if(!batch.stop_requested){batch.status='failed';batch.error=e.message;}}finally{characterBatchBusy=false;batchSave();}
}
const startCurrentBeforeBatch=startCharacterAuto;
startCharacterAuto=async function(c,resume=false,options={}){if(characterBatchActive(data.characterBatch)&&options.batch_id!==data.characterBatch.id){toast('批量生成中，请先停止全部生成');return;}return startCurrentBeforeBatch(c,resume,options)};
const roleBusyBeforeBatch=roleIsBusy;
roleIsBusy=function(c){return roleBusyBeforeBatch(c)||c.oneClick?.status==='stopping'||(characterBatchActive(data.characterBatch)&&data.characterBatch.items.some(i=>i.key===characterQueueKey(c)&&['pending','starting','running'].includes(i.status)))};
const charactersBeforeBatch=characters;
characters=function(){charactersBeforeBatch();const c=data.characters[ci],head=document.querySelector('#panel .section-head'),actions=document.querySelector('#panel .preview-actions');if(!head)return;
 const batch=data.characterBatch,active=characterBatchActive(batch),anyRunning=data.characters.some(c=>['running','stopping'].includes(c.oneClick?.status));
 const current=document.querySelector('#oneClickCharacter');if(current&&c){const run=c.oneClick;current.textContent=run?.status==='running'?'当前人物生成中…':['failed','stopped'].includes(run?.status)?'继续生成当前人物':'生成当前人物';current.disabled=active||anyRunning||multiBusyStates.includes(c.portraitJob?.status);current.onclick=()=>startCharacterAuto(c,['failed','stopped'].includes(c.oneClick?.status));}
 const all=document.createElement('button');all.id='oneClickAllCharacters';all.textContent=active?'所有人物生成中…':['failed','stopped'].includes(batch?.status)?'继续生成所有人物':'生成全部角色';all.title='依次生成每个角色：单张大头像、全身正面、侧面、背面，无需四选一；已有完整视图会复用';all.className='primary';all.disabled=active||anyRunning||!data.characters.length;all.onclick=()=>startAllCharacters(['failed','stopped'].includes(batch?.status));
 const stopAll=document.createElement('button');stopAll.id='stopAllCharacters';stopAll.textContent=batch?.status==='stopping'?'正在停止…':'停止全部生成';stopAll.disabled=!active&&!anyRunning;stopAll.onclick=stopAllCharacters;
 const row=document.createElement('div');row.style.cssText='display:flex;gap:8px;flex-wrap:wrap';row.append(all,stopAll);head.after(row);
 if(actions&&c){const stop=document.createElement('button');stop.id='stopCurrentCharacter';stop.textContent=c.oneClick?.status==='stopping'?'正在停止当前人物…':'停止当前人物';stop.disabled=!['running','stopping'].includes(c.oneClick?.status);stop.onclick=()=>stopCharacterRun(c);actions.append(stop);if(c.oneClick?.status==='stopped'){const p=document.createElement('p');p.className='subtle';p.textContent='当前人物已停止，已完成图片和历史版本保留。';actions.after(p)}if(c.oneClick?.stop_error){const p=document.createElement('p');p.className='subtle';p.textContent='后续步骤已停止，正在重试取消生成服务任务：'+c.oneClick.stop_error;actions.after(p);}}
 if(batch){const p=document.createElement('p');p.id='characterBatchStatus';p.className='subtle';p.setAttribute('role','status');const completed=batch.items.filter(i=>i.status==='completed').length,working=batch.items.find(i=>['running','starting'].includes(i.status));p.textContent='所有人物：'+completed+'/'+batch.items.length+' 已完成'+(working?' · 当前：'+working.name:'')+' · '+({running:'按列表依次生成',stopping:'停止中',stopped:'已停止',failed:'已暂停：'+batch.error,completed:'队列结束'})[batch.status];head.after(p);}
 if(active){for(const button of document.querySelectorAll('#generate,#makeMulti,#regenerateFullFront,#panel .angle button'))button.disabled=true;}
};
setInterval(()=>{finishAllCharacterStops();if(navigator.locks)navigator.locks.request('character-batch',{ifAvailable:true},lock=>lock?characterBatchTick():undefined);else characterBatchTick()},2000);render();
