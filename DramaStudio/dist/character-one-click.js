// Durable sequential generation: one character, one identity reference, four views, one master.
let characterAutoBusy=false;
const autoActive=s=>s?.status==='running';
const autoVisualStates=new WeakMap();
function characterVisualState(c){const run=c.oneClick;return JSON.stringify([run?.id,run?.status,run?.phase,run?.error,run?.stop_requested,run?.sheet_id,run?.reference_job_id,Object.entries(run?.tasks||{}).map(([angle,j])=>[angle,j.id,j.status,j.image_url,j.error]),c.active,c.multiActive,c.contactSheetActive,c.versions?.length,c.contactSheets?.length]);}
function autoSave(c){if(!data.characters.includes(c))return;save();const next=characterVisualState(c),changed=autoVisualStates.get(c)!==next;autoVisualStates.set(c,next);if(changed&&tab===0)render()}
async function autoRequest(c,run,angle){
  const task=run.tasks[angle]??={id:crypto.randomUUID(),status:'new'};autoSave(c);
  let job;
  if(run.stop_requested)return false;if(task.status==='new'){
    const input={request_id:task.id,port:run.port,project_id:run.project_id,character_id:run.character_id,character_name:run.character_name,background:run.background||'white',...CharacterSheet.spec.view_sizes[angle],prompt:angle==='front'?run.front_prompt:run.multi_prompt,style:run.style};
    if(run.pipeline==='portrait_first'){
      if(angle==='portrait')Object.assign(input,{mode:'portrait',prompt:run.portrait_prompt});
      else Object.assign(input,{mode:'multiview',angle,reference_job_id:angle==='front'?run.tasks.portrait.id:run.reference_job_id,prompt:angle==='front'?run.front_prompt+'。保持参考大头像的五官、脸型、发型和年龄，向下补全身体、服装与鞋子。':run.multi_prompt});
    }else if(angle!=='front')Object.assign(input,{mode:'multiview',angle,reference_job_id:run.reference_job_id});
    job=await frontFetch('/api/front-image',input);
  }else job=await frontFetch('/api/front-image/'+task.id);
  Object.assign(task,job);if(job.status==='cancelled'){run.stop_requested=true;run.status='stopped';return false;}if(run.stop_requested){if(job.status!=='completed')task.status='cancelled';autoSave(c);return false;}if(job.status==='failed')throw Error(job.error||'生成失败');
  if(angle==='front'){
    applyFrontResult(c,job);
    if(job.status==='completed'){
      const index=c.versions.findIndex(v=>v.job_id===job.id);c.active=index;c.confirmed=true;c.confirmedVersion=index;c.nonWhiteBackground=run.background==='gray';run.reference_job_id=job.id;
    }
  }else{
    const entry=c.multi.find(e=>e.auto_run_id===run.id);entry.jobs[angle]=angle==='portrait'&&run.pipeline==='portrait_first'?{...job,identity_master:true}:job;
    if(angle==='portrait'&&run.pipeline==='portrait_first'&&job.status==='completed')c.identityPortrait={...job};
    if(job.status==='completed'){c.reference_images??={};c.reference_images[angle]=job.image_url;}
  }
  autoSave(c);return job.status==='completed';
}
async function autoCompose(c,run){if(run.stop_requested)return;
  const entry=c.multi.find(e=>e.auto_run_id===run.id),front=c.versions.find(v=>v.job_id===run.reference_job_id);
  const sources=CharacterSheet.spec.panels.map(p=>({angle:p.angle,job_id:p.angle==='front'?front.job_id:entry.jobs[p.angle].id}));
  const existing=c.contactSheets?.find(s=>s.auto_run_id===run.id);if(existing){run.sheet_id=existing.id;return;}
  const images=await Promise.all(CharacterSheet.spec.panels.map(p=>loadSheetImage(p.angle==='front'?front.image_url:entry.jobs[p.angle].image_url)));
  const canvas=document.createElement('canvas');canvas.width=2560;canvas.height=1440;const ctx=canvas.getContext('2d');ctx.fillStyle=run.background==='gray'?'#c7c9cc':'#fff';ctx.fillRect(0,0,2560,1440);
  images.forEach((img,i)=>{const r=CharacterSheet.panelRect(sources[i].angle,2560,1440),scale=Math.min((r.width-24)/img.naturalWidth,(r.height-24)/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale;ctx.drawImage(img,r.x+(r.width-w)/2,(r.height-h)/2,w,h)});
  const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(!blob)throw Error('无法合成母图');
  const params=new URLSearchParams({project_id:run.project_id,character_id:run.character_id,layout:CharacterSheet.spec.layout,sources:JSON.stringify(sources)});
  if(run.stop_requested)return;const response=await fetch('/api/contact-sheet?'+params,{method:'POST',headers:{'Content-Type':'image/png'},body:blob});const sheet=await response.json();if(!response.ok)throw Error(sheet.error||'母图保存失败');
  c.contactSheets??=[];c.contactSheets.push({...sheet,auto_run_id:run.id,panels:CharacterSheet.spec.panels,video_policy:CharacterSheet.spec.video_policy});c.contactSheetActive=c.contactSheets.length-1;c.reference_images??={};c.reference_images.four_view=sheet.image_url;run.sheet_id=sheet.id;
}
async function characterAutoTick(){
  if(characterAutoBusy||typeof diskReady!=='undefined'&&!diskReady||typeof diskConflict!=='undefined'&&diskConflict)return;
  const c=data.characters.find(c=>autoActive(c.oneClick));if(!c)return;const run=c.oneClick;characterAutoBusy=true;
  try{
    if((data.project_id||data.title)!==run.project_id)return;
    if(run.pipeline==='portrait_first'){
      await characterPortraitFirst(c,run);return;
    }
    if(!run.reference_job_id){run.phase='front';if(!await autoRequest(c,run,'front'))return;}
    if(!data.characters.includes(c)||run.stop_requested)return;
    const current=selectedFront(c);if(!c.confirmed||current?.job_id!==run.reference_job_id)throw Error('正面参考已变化，请重新一键生成');
    let entry=c.multi.find(e=>e.auto_run_id===run.id);if(!entry){entry={auto_run_id:run.id,time:new Date().toLocaleTimeString('zh-CN'),prompt:run.multi_prompt,reference_job_id:run.reference_job_id,jobs:{}};c.multi??=[];c.multi.push(entry);}c.multiActive=c.multi.indexOf(entry);c.view='multi';
    for(const angle of ['portrait','left','back']){if(run.tasks[angle]?.status==='completed')continue;run.phase=angle;autoSave(c);if(!await autoRequest(c,run,angle))return;if(!data.characters.includes(c)||run.stop_requested)return;}
    run.phase='compose';autoSave(c);await autoCompose(c,run);if(run.stop_requested)return;run.status='completed';run.phase='completed';run.finished_at=new Date().toISOString();toast(c.name+'的一键生成已完成');
  }catch(e){if(run.stop_requested)return;run.status='failed';run.error=e.message;toast('一键生成暂停：'+e.message)}finally{characterAutoBusy=false;autoSave(c)}
}
async function characterPortraitFirst(c,run){
  c.multi??=[];let entry=c.multi.find(e=>e.auto_run_id===run.id);
  if(!entry){entry={auto_run_id:run.id,pipeline:'portrait_first',time:new Date().toLocaleTimeString('zh-CN'),prompt:run.multi_prompt,jobs:Object.fromEntries(Object.entries(run.tasks).filter(([a,j])=>j.status==='completed').map(([a,j])=>[a,{...j}]))};c.multi.push(entry);}
  c.multiActive=c.multi.indexOf(entry);c.view='multi';
  if(run.tasks.portrait?.status!=='completed'){run.phase='portrait';autoSave(c);if(!await autoRequest(c,run,'portrait'))return;}
  if(!data.characters.includes(c)||run.stop_requested)return;
  entry.jobs.portrait={...run.tasks.portrait,identity_master:true};c.identityPortrait={...run.tasks.portrait};
  if(!run.reference_job_id){run.phase='front';autoSave(c);if(!await autoRequest(c,run,'front'))return;}
  if(!data.characters.includes(c)||run.stop_requested)return;
  if(!c.confirmed||selectedFront(c)?.job_id!==run.reference_job_id)throw Error('正面参考已变化，请重新一键生成');
  entry.reference_job_id=run.reference_job_id;
  for(const angle of ['left','back']){if(run.tasks[angle]?.status==='completed')continue;run.phase=angle;autoSave(c);if(!await autoRequest(c,run,angle))return;if(!data.characters.includes(c)||run.stop_requested)return;}
  run.phase='compose';autoSave(c);await autoCompose(c,run);if(run.stop_requested)return;run.status='completed';run.phase='completed';run.finished_at=new Date().toISOString();toast(c.name+'的一键生成已完成');
}
async function startCharacterAuto(c,resume=false,options={}){
  if(typeof diskConflict!=='undefined'&&diskConflict){toast('请先处理项目保存冲突，再开始生成');return;}
  if(data.characters.some(x=>autoActive(x.oneClick))){toast('已有角色正在一键生成');return;}
  if(resume&&['failed','stopped'].includes(c.oneClick?.status)){
    const run=c.oneClick,wasStopped=run.status==='stopped';for(const [angle,task] of Object.entries(run.tasks)){if((wasStopped&&task.status!=='completed')||['failed','cancelled','submitting','new'].includes(task.status))delete run.tasks[angle];}run.status='running';delete run.stop_requested;delete run.stop_error;if(options.batch_id)run.batch_id=options.batch_id;delete run.error;autoSave(c);characterAutoTick();return;
  }
  if(multiBusyStates.includes(c.frontJob?.status)||(c.multi||[]).some(e=>Object.values(e.jobs||{}).some(j=>multiBusyStates.includes(j.status)))){toast('请等待这个角色已有的生成任务完成');return;}
  if(!c.prompt?.trim()){toast('请先填写正面图提示词');return;}
  // Explicit current-character regeneration starts with a new portrait; batch filling may reuse existing views.
  const candidate=(options.fill_missing||options.use_selected_portrait)?(c.identityPortrait||activeMulti(c)?.jobs?.portrait):null;let portrait=null;
  try{if(candidate?.id){const job=await frontFetch('/api/front-image/'+candidate.id);if(job.prompt_policy===CharacterViewPrompts.version&&job.status==='completed'&&job.background===(c.nonWhiteBackground?'gray':'white')&&job.width===1024&&job.height===1440)portrait=job;}}catch(e){toast('无法读取大头像：'+e.message);return;}
  if(options.use_selected_portrait&&!portrait){toast('所选大头像暂不可用，请重新选择');return;}
  const portraitPrompt=c.portrait_prompt||c.portraitPrompt||c.prompt.replace(/全身完整入镜|全身构图|正面全身|全身正面|全身入镜|完整显示头部至双脚|头顶和双脚不裁切|头顶和双脚均不裁切/g,'正面半身');
  if(options.batch_id&&(data.characterBatch?.id!==options.batch_id||data.characterBatch.stop_requested||data.characterBatch.status!=='running'))return;
  c.oneClick={id:crypto.randomUUID(),pipeline:'portrait_first',prompt_policy:CharacterViewPrompts.version,batch_id:options.batch_id,background:c.nonWhiteBackground?'gray':'white',status:'running',phase:portrait?'front':'portrait',tasks:portrait?{portrait}: {},reference_job_id:null,project_id:data.project_id||data.title,character_id:c.id||c.character_id||c.name,character_name:c.name,port:Number(localStorage.getItem('frame-comfy-port')||8188),portrait_prompt:portraitPrompt,front_prompt:c.prompt,multi_prompt:c.multiPrompt||CharacterSheet.spec.prompt,style:data.style||'',created_at:new Date().toISOString()};
  if(options.fill_missing&&!options.use_selected_portrait&&typeof characterReusableViews==='function'){
    const ready=characterReusableViews(c);c.oneClick.tasks=ready;
    if(ready.front){c.oneClick.reference_job_id=ready.front.id;c.confirmed=true;c.confirmedVersion=c.active;}
  }
  autoSave(c);characterAutoTick();
}
const charactersBeforeAuto=characters;
characters=function(){charactersBeforeAuto();const c=data.characters[ci];if(!c)return;const actions=document.querySelector('#panel .preview-actions');if(!actions)return;const run=c.oneClick,busy=data.characters.some(x=>autoActive(x.oneClick));
  const button=document.createElement('button');button.id='oneClickCharacter';button.className='primary';button.textContent=autoActive(run)?'角色一键生成中…':run?.status==='failed'?'继续一键生成':run?.status==='completed'?'一键重新生成角色':'✦ 角色一键生成';button.disabled=busy;button.onclick=()=>startCharacterAuto(c,run?.status==='failed');actions.prepend(button);if(run?.status==='failed'){const restart=document.createElement('button');restart.textContent='重新开始';restart.disabled=busy;restart.onclick=()=>startCharacterAuto(c,false);actions.append(restart);}
  const text=document.createElement('p');text.id='oneClickStatus';text.className='subtle';text.setAttribute('role','status');const labels={portrait:'1/5 大头像定脸',front:'2/5 引用大头像生成全身正面',left:'3/5 单个90°侧面',back:'4/5 全身背面',compose:'5/5 合成人物设定母图',completed:'完成：母图已保存，可裁剪单视图'};text.textContent=run?(labels[run.phase]||run.phase)+(run.status==='failed'?' · 失败：'+run.error+'；点击继续可重试':''):'先用1024×1440大头像定脸，再引用大头像生成512×1440全身正面，最后依全身图生成侧面、背面并保存母图。重新生成当前人物时从新头像开始；批量生成仅补齐缺失视图。请保持页面打开，刷新后可继续。';actions.after(text);
  if(autoActive(run)){for(const el of document.querySelectorAll('#panel #generate,#panel #confirm,#panel #makeMulti,#panel #resetPrompt,#panel [data-version],#panel .angle button,#panel .angle select,#panel input,#panel textarea'))el.disabled=true;}
};
const roleBusyBeforeAuto=roleIsBusy;roleIsBusy=function(c){return autoActive(c.oneClick)||roleBusyBeforeAuto(c)};
setInterval(()=>{if(navigator.locks)navigator.locks.request('character-one-click',{ifAvailable:true},lock=>lock?characterAutoTick():undefined);else characterAutoTick()},3000);render();
