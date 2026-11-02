// Both manual and automatic character creation begin with the face identity portrait.
const portraitRequests=new Set();
function currentIdentityPortrait(c){return c.identityPortrait?.status==='completed'?c.identityPortrait:activeMulti(c)?.jobs?.portrait;}
function portraitPromptFor(c){return c.portrait_prompt||c.portraitPrompt||(c.prompt||c.prompt_anchor_zh||c.description||'').replace(/全身完整入镜|全身构图|正面全身|全身正面|全身入镜|完整显示头部至双脚|头顶和双脚不裁切|头顶和双脚均不裁切/g,'正面半身');}
function applyIdentityPortrait(c,job){
  c.portraitJob=job;if(job.status==='completed'){
    c.portraitVersions??=[];if(!c.portraitVersions.some(v=>v.id===job.id)){c.portraitVersions.push({...job});c.identityPortrait={...job};c.portraitConfirmed=false;c.portraitConfirmedId=null;c.confirmed=false;c.stale=!!c.versions?.length;c.reference_images??={};c.reference_images.portrait=job.image_url;const entry=activeMulti(c);if(entry){entry.jobs??={};entry.jobs.portrait={...job,identity_master:true};}}
  }save();
}
async function generateIdentityPortrait(c){
  if(portraitRequests.has(c)||multiBusyStates.includes(c.portraitJob?.status)||c.oneClick?.status==='running'){toast('大头像任务正在进行');return;}
  if(multiBusyStates.includes(c.frontJob?.status)||(c.multi||[]).some(e=>Object.entries(e.jobs||{}).some(([a,j])=>a!=='portrait'&&multiBusyStates.includes(j.status)))){toast('请先等待这个角色已有的生成任务完成');return;}
  const prompt=portraitPromptFor(c);if(!prompt.trim()){toast('请先填写大头像提示词');return;}
  const id=crypto.randomUUID();portraitRequests.add(c);c.portraitJob={id,status:'submitting'};save();render();
  try{const job=await frontFetch('/api/front-image',{request_id:id,port:Number(localStorage.getItem('frame-comfy-port')||8188),mode:'portrait',project_id:data.project_id||data.title,character_id:c.id||c.character_id||c.name,character_name:c.name,prompt,style:data.style||'',background:c.nonWhiteBackground?'gray':'white',...CharacterSheet.spec.view_sizes.portrait});applyIdentityPortrait(c,job);toast('已提交大头像任务，完成后可继续生成全身');}
  catch(e){c.portraitJob={id,status:'failed',error:e.message};save();toast('大头像提交失败：'+e.message)}finally{portraitRequests.delete(c);if(data.characters.includes(c)&&tab===0)render();}
}
const generateBeforePortraitEntry=generateCharacter;
generateCharacter=async function(multi){const c=data.characters[ci];if(!c)return;if(!multi)return generateIdentityPortrait(c);return generateBeforePortraitEntry(true);};
const regenerateAngleBeforePortraitEntry=regenerateAngle;
regenerateAngle=async function(c,angle){if(angle==='portrait')return generateIdentityPortrait(c);return regenerateAngleBeforePortraitEntry(c,angle)};
const roleBusyBeforePortraitEntry=roleIsBusy;
roleIsBusy=function(c){return multiBusyStates.includes(c.portraitJob?.status)||roleBusyBeforePortraitEntry(c)};
const startAutoBeforePortraitEntry=startCharacterAuto;
startCharacterAuto=async function(c,resume=false,options={}){if(portraitRequests.has(c)||multiBusyStates.includes(c.portraitJob?.status)){toast('请先等待大头像任务完成');return;}return startAutoBeforePortraitEntry(c,resume,options)};
let pollingIdentityPortraits=false;
setInterval(async()=>{if(pollingIdentityPortraits)return;pollingIdentityPortraits=true;try{for(const c of data.characters){if(portraitRequests.has(c)||!['queued','running','waiting'].includes(c.portraitJob?.status))continue;try{applyIdentityPortrait(c,await frontFetch('/api/front-image/'+c.portraitJob.id));if(tab===0)render();}catch(e){c.portraitJob.connection_error=e.message;}}}finally{pollingIdentityPortraits=false}},2500);
const charactersBeforePortraitEntry=characters;
characters=function(){
  charactersBeforePortraitEntry();const c=data.characters[ci];if(!c)return;const isMulti=c.view==='multi',head=currentIdentityPortrait(c),busy=multiBusyStates.includes(c.portraitJob?.status),autoBusy=c.oneClick?.status==='running';
  const frontTab=document.querySelector('#front');if(frontTab){frontTab.textContent='大头像';frontTab.onclick=()=>{c.view='portrait';save();render()};}
  const multiTab=document.querySelector('#multi');if(multiTab)multiTab.textContent='全身与多视图';
  if(busy){document.querySelector('#oneClickCharacter')?.setAttribute('disabled','');for(const b of document.querySelectorAll('#panel .angle button'))b.disabled=true;}
  const intro=document.querySelector('#panel .section-head p');if(intro)intro.textContent='先确定大头像中的五官与发型，再扩展全身和其他视角。';
  const librarySteps=document.querySelector('#panel .character-list')?.parentElement.querySelector('p.subtle');if(librarySteps)librarySteps.innerHTML='01 生成并确认大头像<br>02 引用大头像生成全身正面<br>03 确认全身后生成侧面、背面';
  if(isMulti){
    const firstBox=document.querySelector('#panel .angle-grid .angle');if(firstBox&&head?.image_url){let img=firstBox.querySelector('img');if(!img){img=document.createElement('img');firstBox.querySelector('p')?.remove();firstBox.prepend(img)}img.src=head.image_url;img.alt=c.name+' · 大头像身份参考';img.style.cssText='width:100%;height:260px;object-fit:contain';}
    const portraitButton=firstBox?.querySelector('button');if(portraitButton){portraitButton.disabled=busy||autoBusy;portraitButton.onclick=()=>generateIdentityPortrait(c);}
    return;
  }
  const preview=document.querySelector('#panel .artboard'),card=preview?.closest('.card');if(preview){preview.replaceChildren();if(head?.image_url){const img=document.createElement('img');img.src=head.image_url;img.alt=c.name+' · 正面半身大头像';img.style.cssText='width:100%;height:100%;object-fit:contain';preview.append(img)}else{const empty=document.createElement('div');empty.className='empty-stage';empty.textContent=busy?'正在生成大头像…':'先生成正面半身大头像，确定人物身份';preview.append(empty)}}
  const confirmed=head?.id&&c.portraitConfirmed&&c.portraitConfirmedId===head.id;
  const status=card?.querySelector('.preview-head .status');if(status)status.textContent=confirmed?' / 大头像已确认':' / 大头像待确认';
  const confirm=document.querySelector('#confirm');if(confirm){confirm.textContent=confirmed?'✓ 已确认大头像':'✓ 确认大头像';confirm.disabled=!head?.image_url||busy||autoBusy;confirm.onclick=()=>{c.identityPortrait={...head};c.portraitConfirmed=true;c.portraitConfirmedId=head.id;save();render();toast('大头像已确认，可以生成全身正面')};}
  const next=document.querySelector('#makeMulti');if(next){next.textContent='生成全身正面';next.disabled=!confirmed||busy||autoBusy||multiBusyStates.includes(c.frontJob?.status);next.title='引用已确认大头像生成512×1440全身正面';next.onclick=()=>{c.view='multi';save();regenerateFrontFromPortrait(c)};}
  const text=document.querySelector('#charPrompt');if(text){text.value=portraitPromptFor(c);text.oninput=e=>{c.portrait_prompt=e.target.value;save()};}
  const title=document.querySelector('#charPrompt')?.closest('.card')?.querySelector('.right-title.flex');if(title?.firstChild)title.firstChild.textContent='大头像提示词';
  const reset=document.querySelector('#resetPrompt');if(reset)reset.onclick=()=>{delete c.portrait_prompt;delete c.portraitPrompt;save();render()};
  const generate=document.querySelector('#generate');if(generate){generate.textContent=busy?'大头像正在生成…':head?.image_url?'重新生成大头像':'生成大头像';generate.disabled=busy||autoBusy;generate.onclick=()=>generateIdentityPortrait(c);const note=document.createElement('p');note.className='subtle';note.textContent='第一步：1024×1440正面半身大头像，先确定五官与发型。确认后再引用它生成全身。';generate.after(note);}
  for(const input of document.querySelectorAll('[data-image-size]')){input.value=input.closest('label')?.textContent.includes('宽度')?1024:1440;input.disabled=true;}
  const sizeSelect=document.querySelector('select[aria-label="常用角色图尺寸"]');if(sizeSelect){const option=document.createElement('option');option.value='1024x1440-portrait';option.textContent='1024 × 1440 · 大头像';sizeSelect.append(option);sizeSelect.value=option.value;sizeSelect.disabled=true;}
  for(const p of document.querySelectorAll('#panel p.subtle')){if(p.textContent.startsWith('此尺寸')||p.textContent.startsWith('全身正面推荐'))p.textContent='当前大头像固定1024×1440；全身正面、侧面、背面为512×1440。';if(p.textContent.startsWith('正面图使用本机'))p.textContent='大头像使用本机Z-Image-Turbo，12步；全身图随后引用大头像生成。';if(p.textContent.includes('多面图将沿用'))p.textContent='以大头像确定人物身份，随后生成全身正面和侧面、背面。';}
  const links=[...document.querySelectorAll('#panel a')].find(a=>a.textContent==='查看本次工作流'||a.textContent==='查看正面图工作流')?.parentElement;if(links){links.replaceChildren();for(const [label,url]of [['查看大头像工作流',c.portraitJob?.id?'/api/front-image/'+c.portraitJob.id+'/workflow':'/api/front-image-template?mode=portrait'],['打开ComfyUI','http://127.0.0.1:'+Number(localStorage.getItem('frame-comfy-port')||8188)+'/']]){const a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';links.append(a)}}
  if(card){const historyTitle=[...card.querySelectorAll('.mini-label')].at(-1);if(historyTitle)historyTitle.textContent='大头像历史版本 · 点击采用';for(const h of card.querySelectorAll('.history'))h.remove();const history=document.createElement('div');history.className='history';for(const [i,v]of (c.portraitVersions||[]).entries()){const button=document.createElement('button');button.textContent='大头像 V'+(i+1);button.disabled=busy||autoBusy;if(head?.id===v.id)button.className='primary';button.onclick=()=>{c.identityPortrait={...v};c.portraitConfirmed=false;c.confirmed=false;c.stale=true;const e=activeMulti(c);if(e){e.jobs??={};e.jobs.portrait={...v,identity_master:true}}c.reference_images??={};c.reference_images.portrait=v.image_url;save();render()};history.append(button)}card.append(history);}
};render();
