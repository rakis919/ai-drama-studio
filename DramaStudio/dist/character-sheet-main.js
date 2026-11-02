// Main character asset is one sheet; legacy portrait/view tools remain available in a dialog.
(()=>{
 const busyStates=['submitting','queued','running','waiting','saving','stopping'],submitting=new Set();let checking=false;
 const layoutPrompt='保持人物角色面部特征、发型和服饰的一致性，不要发生任何改变。依次生成面部细节图、正面直立全身图、单个严格90度侧面直立全身图、背面直立全身图，按这个顺序从左至右排版在同一张16:9横版人物设定图上。左侧面部细节区约40%，后三个全身区各约20%。面部区是头脸近景；后三个视图完整显示头顶到双脚，直立自然，服装、配色、身材比例一致。四个区域只表达同一个人。均匀纯白背景，无分栏线、文字、标签或水印，只要一个侧面。';
 const sheetNegative='文字，标签，水印，标志，模糊，低清晰度，灰色背景，彩色背景，缺失视图，错序视图，两个侧面，额外视图，不同人物，五官变化，发型变化，服装变化，畸形手脚，裁切头顶，裁切双脚';
 function sheet(c){return c.contactSheets?.[Number.isInteger(c.contactSheetActive)?c.contactSheetActive:c.contactSheets.length-1];}
 function features(c){return String(c.sheetDescription??(typeof CharacterViewPrompts!=='undefined'?CharacterViewPrompts.features(c):c.prompt_anchor_zh||c.prompt||c.description||'')).replace(/^人物参考生成提示词[:：]/,'').replace(/分别生成[^。；;]*/g,'').replace(/竖版全身[，,]?|灰色纯背景[，,]?|纯白色背景[，,]?/g,'').replace(/[；;]\s*[。]/g,'。').trim();}
 function promptFor(c){return layoutPrompt+'\n人物外观：'+features(c)+'\n视觉风格：'+(data.style||'沿用人物参考原有风格')+'。';}
 function apply(c,job){c.sheetJob=job;if(job.status==='completed'&&job.image_url){c.contactSheets??=[];if(!c.contactSheets.some(s=>s.id===job.id))c.contactSheets.push({...job,source:'direct_generation',layout:CharacterSheet.spec.layout,panels:CharacterSheet.spec.panels,video_policy:CharacterSheet.spec.video_policy});c.contactSheetActive=c.contactSheets.findIndex(s=>s.id===job.id);c.reference_images??={};c.reference_images.four_view=job.image_url;c.useExternalReference=false;}save();}
 async function request(route,body){const r=await fetch(route,{cache:'no-store',method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const result=await r.json();if(!r.ok)throw Error(result.error||'人物设定图服务不可用');return result;}
 async function generate(c){
  if(submitting.has(c)||roleIsBusy(c)){toast('这个角色有任务正在进行，请等待完成。');return;}
  if(!features(c).trim()){toast('请先填写人物描述。');return;}
  const project=data.project_id,id=crypto.randomUUID(),current=sheet(c);
  const reference=current?.source==='direct_generation'?current:c.identityPortrait?.status==='completed'?c.identityPortrait:null;
  submitting.add(c);c.sheetJob={id,status:'submitting'};save();render();
  try{
   const job=await request('/api/front-image',{request_id:id,resource_type:'character_sheet',mode:reference?'multiview':'character_sheet',angle:reference?'front':undefined,reference_job_id:reference?.id,project_id:project,character_id:c.id||c.character_id||c.name,character_name:c.name,prompt:promptFor(c),negative_prompt:sheetNegative,width:1536,height:864,port:Number(localStorage.getItem('frame-comfy-port')||8188)});
   apply(c,job);toast('已提交整张人物设定图，不需要先生成单张视图。');
  }catch(error){apply(c,{id,status:'failed',error:error.message});toast('提交失败：'+error.message);}
  finally{submitting.delete(c);if(data.project_id===project&&tab===0)render();}
 }
 const wasBusy=roleIsBusy;roleIsBusy=function(c){return busyStates.includes(c.sheetJob?.status)||wasBusy(c);};
 const dialog=document.createElement('dialog');dialog.id='characterAuxiliaryDialog';dialog.style.cssText='width:1500px;max-width:96vw';
 dialog.innerHTML='<div class="modal-head"><h2>角色辅助功能</h2><button type="button" data-close>关闭</button></div><p class="subtle">单独生成大头照、全身与其他视角，或使用原有分步流程。整张人物设定图可直接在主页面生成。</p><div data-auxiliary-body></div>';document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 function paint(){
  if(tab!==0)return;const c=data.characters[ci];if(!c||c.specialReference)return;
  const panel=document.querySelector('#panel'),editor=panel.querySelector('.editor');if(!editor||panel.querySelector('#characterSheetMain'))return;
  const cards=[...editor.children],list=cards[0];if(cards.length<3)return;
  const body=dialog.querySelector('[data-auxiliary-body]');body.replaceChildren();
  const originalHead=panel.querySelector('.section-head'),add=panel.querySelector('#add');
  const auxiliary=document.createElement('div');auxiliary.className='character-auxiliary-editor';cards.slice(1).forEach(card=>auxiliary.append(card));
  // Keep every existing tool and handler, moving the whole original workspace.
  for(const node of [...panel.children])if(node!==editor&&node!==originalHead)body.append(node);
  if(originalHead)body.append(originalHead);body.append(auxiliary);
  panel.replaceChildren();
  const head=document.createElement('div');head.className='section-head';const text=document.createElement('div');text.innerHTML='<h3>角色设计</h3><p>一张人物设定图，统一面部、服装与三个全身视角。</p>';
  const tools=document.createElement('div');tools.style.cssText='display:flex;gap:8px;flex-wrap:wrap';const auxButton=document.createElement('button');auxButton.textContent='辅助功能';auxButton.onclick=()=>dialog.showModal();tools.append(auxButton);if(add)tools.append(add);head.append(text,tools);panel.append(head);
  const main=document.createElement('div');main.id='characterSheetMain';main.className='editor character-sheet-main';main.append(list);
  const card=document.createElement('section');card.className='card';
  const title=document.createElement('div');title.className='preview-head';const heading=document.createElement('b');heading.textContent=c.name+' · 人物设定图';title.append(heading);const current=sheet(c);
  const version=document.createElement('select');version.setAttribute('aria-label','人物设定图版本');version.style.cssText='width:auto;max-width:50%;margin:0';
  if(!c.contactSheets?.length){const option=document.createElement('option');option.textContent='尚未生成';version.append(option);version.disabled=true;}
  else{c.contactSheets.forEach((s,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent='V'+(i+1)+(s.source==='direct_generation'?' · 整图生成':' · 已有合图');version.append(option);});version.value=String(c.contactSheets.indexOf(current));version.onchange=()=>{c.contactSheetActive=Number(version.value);c.reference_images??={};c.reference_images.four_view=sheet(c).image_url;save();render();};}
  title.append(version);card.append(title);
  const preview=document.createElement('div');preview.className='character-sheet-main-preview';
  if(current?.image_url){const link=document.createElement('a');link.href=current.image_url;link.target='_blank';link.rel='noopener';const img=document.createElement('img');img.src=current.image_url;img.alt=c.name+' · 面部细节、正面、侧面、背面人物设定图';link.append(img);preview.append(link);}
  else{const empty=document.createElement('div');empty.className='empty-stage';empty.innerHTML='<div class="stage-icon">▧</div><p>生成一张人物设定图</p><small>面部细节 · 正面全身 · 侧面全身 · 背面全身</small>';preview.append(empty);}
  card.append(preview);
  const status=document.createElement('p');status.className='subtle';status.setAttribute('role','status');const job=c.sheetJob;status.textContent=job?({submitting:'正在提交人物设定图…',queued:'人物设定图已排队',running:'人物设定图生成中…',waiting:'等待生成结果',completed:'人物设定图已保存，可在分镜中作为人物参考',failed:'生成失败：'+job.error})[job.status]||job.status:current?'当前采用的人物设定图':'16:9 横版 · 纯白背景 · 同一角色';card.append(status);
  const actions=document.createElement('div');actions.className='character-sheet-main-actions';const gen=document.createElement('button');gen.className='primary';gen.id='generateCharacterSheet';gen.textContent=busyStates.includes(job?.status)?'人物设定图生成中…':current?'重新生成人物设定图':'生成人物设定图';gen.disabled=roleIsBusy(c);gen.onclick=()=>generate(c);actions.append(gen);
  const upload=body.querySelector('#uploadMergedCharacterSheet');if(upload){const input=upload.nextElementSibling;upload.textContent='上传人物设定图';actions.append(upload);if(input?.matches('input[type=file]'))actions.append(input);}
  if(current?.image_url){const download=document.createElement('a');download.href=current.image_url;download.download=c.name+'-人物设定图.png';download.textContent='下载图片';actions.append(download);const crop=document.createElement('button');crop.textContent='裁剪当前设定图的单视图';crop.onclick=()=>{dialog.close();openSheetCrop(c,current);};body.prepend(crop);}
  card.append(actions);
  const views=(c.singleViews||[]).filter(v=>v.image_url);
  if(views.length){const gallery=document.createElement('section');gallery.id='characterCroppedViews';gallery.style.cssText='margin-top:20px;border-top:1px solid #304359;padding-top:16px';gallery.setAttribute('aria-label',c.name+'已裁剪参考图');const heading=document.createElement('b');heading.textContent='已裁剪参考图 · '+views.length+'张';gallery.append(heading);const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;margin-top:12px';
   views.forEach((v,i)=>{const item=document.createElement('div');item.style.cssText='border:1px solid #304359;border-radius:9px;padding:10px;background:#101923';const link=document.createElement('a');link.href=v.image_url;link.target='_blank';link.rel='noopener';const img=document.createElement('img');img.src=v.image_url;img.alt=c.name+' · '+(v.label||'裁剪单视图')+' · 裁剪图'+(i+1);img.style.cssText='display:block;width:100%;height:180px;object-fit:contain;background:#080d14';link.append(img);const label=document.createElement('p');label.style.cssText='margin:8px 0;font-size:13px';label.textContent=(v.label||'裁剪单视图')+(v.width&&v.height?' · '+v.width+' × '+v.height:'');const download=document.createElement('a');download.href=v.image_url+'?download=1';download.download=c.name+'-'+(v.label||'单视图')+'-'+(i+1)+'.png';download.textContent='下载裁剪图';item.append(link,label,download);grid.append(item);});gallery.append(grid);const note=document.createElement('p');note.className='subtle';note.textContent='点击图片放大查看；在分镜人物参考图的版本选项中，可选择这些裁剪图。';gallery.append(note);card.append(gallery);}
  main.append(card);
  const settings=document.createElement('section');settings.className='card';const h=document.createElement('b');h.textContent='人物描述';settings.append(h);
  const desc=document.createElement('textarea');desc.id='characterSheetDescription';desc.setAttribute('aria-label','人物设定图人物描述');desc.rows=12;desc.value=features(c);desc.oninput=()=>{c.sheetDescription=desc.value;save();};settings.append(desc);
  const note=document.createElement('p');note.className='subtle';note.textContent='面部、发型、服装与配色保持一致。画面从左到右：面部细节、正面全身、单个侧面全身、背面全身。';settings.append(note);
  const rules=document.createElement('details');rules.innerHTML='<summary>查看生成规则</summary>';const ruleText=document.createElement('p');ruleText.className='subtle';ruleText.textContent=layoutPrompt;rules.append(ruleText);settings.append(rules);main.append(settings);panel.append(main);
  const help=list.querySelector('p.subtle');if(help)help.textContent='选择角色 → 填写人物描述 → 生成整张设定图。其他生成方式在辅助功能中。';
  // Old single-view buttons live only inside the dialog.
  const generateOld=body.querySelector('#generate');if(generateOld)generateOld.textContent='生成单张大头照（辅助）';
 }
 const before=characters;characters=function(){dialog.querySelector('[data-auxiliary-body]').replaceChildren();before();paint();};
 async function poll(){if(checking)return;checking=true;try{for(const c of data.characters){if(submitting.has(c)||!['queued','running','waiting'].includes(c.sheetJob?.status))continue;const id=c.sheetJob.id;try{const job=await request('/api/front-image/'+id);if(c.sheetJob.id!==id)continue;const changed=job.status!==c.sheetJob.status;apply(c,job);if(tab===0&&changed)render();}catch(error){c.sheetJob.connection_error=error.message;}}}finally{checking=false;}}
 const style=document.createElement('style');style.textContent='.character-sheet-main{grid-template-columns:160px minmax(360px,1fr) 300px;align-items:start}.character-sheet-main-preview{margin:16px 0;background:#080d14;border-radius:8px;min-height:260px;display:grid;place-items:center;overflow:hidden}.character-sheet-main-preview a{display:block;width:100%}.character-sheet-main-preview img{display:block;width:100%;height:auto;max-height:540px;object-fit:contain}.character-sheet-main-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.character-sheet-main-actions input[hidden]{display:none!important}.character-sheet-main-actions a{color:var(--green);font-size:12px}.character-auxiliary-editor{display:grid;grid-template-columns:minmax(300px,1fr) 340px;gap:18px}.character-auxiliary-editor>.card{min-width:0}#characterAuxiliaryDialog .angle-grid{height:auto}#characterSheetDescription{font-size:12px}#characterSheetMain details{margin-top:14px;font-size:11px}@media(max-width:1250px){.character-sheet-main{grid-template-columns:140px minmax(0,1fr)}.character-sheet-main>.card:last-child{grid-column:1/-1}}@media(max-width:720px){.character-sheet-main,.character-auxiliary-editor{grid-template-columns:minmax(0,1fr)}}';document.head.append(style);
 setInterval(poll,2500);render();
})();
