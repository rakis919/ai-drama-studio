const referenceOptionsNames={scene:'场景',character:'人物'};
const resolveBeforeReferenceOptions=shotResolvedReferences;
function allShotReferences(target){const original=resolveBeforeReferenceOptions(target);return original.map((r,index)=>{
 const override=target.pictureBindingOverrides?.[r.picture];
 if(!override)return {...r,enabled:true,slot:index};
 const binding={...r,type:override.type||r.type,ref_id:override.ref_id||r.ref_id};
 const choices=shotReferenceChoices(binding),pinned=target.pictureSelections?.[r.picture];
 const item=pinned?choices.items.find(i=>i.id===pinned):choices.items.find(i=>i.id===choices.active)||choices.items.at(-1);
 return {...binding,choices,item,name:choices.name,enabled:override.enabled!==false,slot:index};
});}
shotResolvedReferences=function(target){return allShotReferences(target).filter(r=>r.enabled);};
function selectedReferenceInputs(target){return shotResolvedReferences(target).map((r,i)=>({picture:'<Picture '+(i+1)+'>',original_picture:r.picture,type:r.type,ref_id:r.ref_id,image_url:r.item?.url,version_id:r.item?.id,name:r.name,usage:referencePurpose(target,r)}));}
function referencePurpose(target,r){const entity=r.type==='character'?data.characters.find(c=>(c.id||c.character_id)===r.ref_id):null;const custom=entity?.videoIdentityPrompt||({animal:'Use the identity of the same single animal: species, coat pattern, anatomy, ears, eyes and tail. Multi-view panels depict one animal, not multiple animals. Do not inherit background, layout or text.',prop:'Use the same single object or prop: shape, proportions, material, color and distinctive details. Multi-view panels depict the same object, not duplicates. Do not inherit background, layout or text.'})[entity?.referenceCategory]||'';return target.pictureBindingOverrides?.[r.picture]?.usage||custom||(r.type==='scene'?'Use the environment layout, architecture, materials and lighting; do not add characters from this image.':'Use this character’s identity, face, hairstyle, body proportions and clothing. Ignore the reference background and multi-view panel layout; all panels depict the same character.');}
function englishReferenceUsage(target,r){const override=target.pictureBindingOverrides?.[r.picture]?.usage,entity=r.type==='character'?data.characters.find(c=>(c.id||c.character_id)===r.ref_id):null,custom=override||entity?.videoIdentityPrompt||'';if(custom&&!/[\u3400-\u9fff]/.test(custom))return custom;if(r.type==='scene')return 'Preserve the room layout, architecture, materials and lighting. Do not copy people from the scene reference.';const category=entity?.referenceCategory;let text=category==='prop'?'Use the same single object, preserving shape, material and color.':category==='animal'?'Use the same single animal, preserving species, anatomy and markings.':'Preserve the identity, face, hairstyle, body proportions and clothes of the same single person.';if(/第二个?区域|第二个区域|从左到右第二/.test(custom))text+=' For a multi-view reference sheet, use only the second region from the left: the front standing view. Ignore the other regions.';return text+' Ignore reference backgrounds and multi-view layouts; do not reproduce panels, floating faces, overlays or duplicate subjects.';}
function englishReferenceName(r,i){return ({TIEZHU:'Tiezhu',CUIHUA:'Cuihua',WANGSHEN:'Aunt Wang'})[r.ref_id]||(/^[a-z0-9 _-]+$/i.test(r.name||'')?r.name:(r.type==='scene'?'Scene ':'Character ')+(i+1));}
function composeReferencePrompt(target,base){
 const verified=target.verifiedReferencePrompt;
 if(verified&&base===verified.prompt){const selected=selectedReferenceInputs(target).map(r=>({type:r.type,ref_id:r.ref_id,version_id:r.version_id,image_url:r.image_url}));if(JSON.stringify(selected)===JSON.stringify(verified.references))return base;}

 const all=allShotReferences(target),selected=all.filter(r=>r.enabled),sections={};
 const names=['subject_definitions','summary','retention_analysis','detailed_description','overall_soundscape','non_diegetic_music'];
 const regex=/(subject_definitions|summary|retention_analysis|detailed_description|overall_soundscape|non_diegetic_music)\s*:\s*([\s\S]*?)(?=\n\s*(?:subject_definitions|summary|retention_analysis|detailed_description|overall_soundscape|non_diegetic_music)\s*:|$)/gi;
 for(const match of String(base||'').matchAll(regex))sections[match[1].toLowerCase()]=match[2].trim();
 const oldDefs=sections.subject_definitions||'',aliases=new Map();
 for(const line of oldDefs.split('\n')){const subject=line.match(/<Subject \d+>/)?.[0],source=line.match(/<Picture \d+>/)?.[0];if(subject&&source){const index=selected.findIndex(r=>r.picture===source);aliases.set(subject,index>=0?'<Subject '+(index+1)+'>':(all.find(r=>r.picture===source)?.name||'文字描述的主体'));}}
 const mapText=text=>String(text||'').replace(/<Subject \d+>/g,t=>aliases.get(t)||t);
 const defs=[],retained=[];
 selected.forEach((r,i)=>{
  const subject='<Subject '+(i+1)+'>',picture='<Picture '+(i+1)+'>',tail=target.pictureBindingOverrides?.[r.picture]?.source==='previous_tail';
  const old=oldDefs.split('\n').find(line=>line.includes(r.picture)&&/<Subject \d+>/.test(line));
  const binding=target.pictureBindingOverrides?.[r.picture],entity=r.type==='character'?data.characters.find(c=>(c.id||c.character_id)===r.ref_id):null,custom=englishReferenceUsage(target,r),englishName=englishReferenceName(r,i);
  if(tail){defs.push(picture+' is the preceding shot final frame, used as the opening composition, character-position and lighting guide for [Shot 1].');retained.push(picture+' ([Shot 1] first frame): fully_preserved - Start from this reference state and develop the action naturally.');}
  else{defs.push(subject+' is '+englishName+' in '+picture+'. '+custom);retained.push(subject+' (appears in [Shot 1]): partially_preserved - Preserve the defined identity or scene layout; use the actions and framing described below.');}
 });
 sections.subject_definitions=defs.join('\n');sections.retention_analysis=retained.join('\n');
 sections.summary=sections.summary&&!/[\u3400-\u9fff]/.test(sections.summary)?sections.summary:'[reference generation] A live-action interaction using the supplied references.';
 sections.detailed_description=mapText(sections.detailed_description||String(base||'').replace(/(?:参考输入映射：)?<Picture 1>[^\n]*?每人参考均只表示一个人。/g,''));
 sections.overall_soundscape=sections.overall_soundscape||'Quiet scene ambience and appropriate contact sounds. Only marked dialogue is spoken; no narrator.';
 sections.non_diegetic_music=sections.non_diegetic_music||'N/A';
 sections.overall_soundscape='Speak only the explicitly marked character dialogue. All other sections are silent production instructions; no narration.\n'+sections.overall_soundscape.split('\n').filter(line=>!line.includes('Only text inside <d>')).join('\n');
 return names.map(name=>name+':\n'+sections[name]).join('\n\n');
}

const referenceCardsBeforeOptions=referenceCards;
referenceCards=function(target){return '<div class="shot-reference-grid">'+allShotReferences(target).map(r=>{
 const list=r.type==='scene'?(data.scenes||[]):data.characters;
 return '<div class="shot-reference-card" data-reference-slot="'+r.slot+'"><b>'+esc(r.picture+' · '+r.name)+'</b><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-ref-enabled="'+r.slot+'" style="width:auto" '+(r.enabled?'checked':'')+'>用于本次生成</label><label>参考图类型<select data-ref-type="'+r.slot+'" aria-label="'+esc(r.picture+' 参考图类型')+'"><option value="scene" '+(r.type==='scene'?'selected':'')+'>场景</option><option value="character" '+(r.type==='character'?'selected':'')+'>人物</option></select></label><label>选择'+referenceOptionsNames[r.type]+'<select data-ref-resource="'+r.slot+'" aria-label="'+esc(r.picture+' 选择素材')+'">'+list.map(item=>{const id=item.id||item.scene_id||item.character_id;return '<option value="'+esc(id)+'" '+(id===r.ref_id?'selected':'')+'>'+esc(item.name||id)+'</option>';}).join('')+'</select></label>'+(r.item?'<a href="'+esc(r.item.url)+'" target="_blank" rel="noopener"><img src="'+esc(r.item.url)+'" alt="'+esc(r.picture+' '+r.name)+'"></a>':'<p class="subtle">缺少可用参考图；可以不勾选此项，用文字描述代替。</p>')+'<select data-shot-ref="'+r.slot+'" aria-label="'+esc(r.picture+' 参考版本')+'"><option value="">跟随当前版本'+(r.item?' · '+esc(r.item.label):'')+'</option>'+r.choices.items.map(v=>'<option value="'+esc(v.id)+'" '+(target.pictureSelections?.[r.picture]===v.id?'selected':'')+'>固定 '+esc(v.label)+'</option>').join('')+'</select><label>本图参考用途<textarea data-ref-usage="'+r.slot+'" rows="3">'+esc(referencePurpose(target,r))+'</textarea></label><small>'+(r.enabled?'已选 · 提交时按勾选项重新编号':'不提交此图；画面由提示词描述')+'</small></div>';
 }).join('')+'</div>';};
function bindReferenceOptions(target){
 const all=allShotReferences(target);
 const change=(slot,key,value)=>{const r=all[slot];target.pictureBindingOverrides??={};const o=target.pictureBindingOverrides[r.picture]??={type:r.type,ref_id:r.ref_id,enabled:r.enabled};o[key]=value;if(key==='type'){const list=value==='scene'?(data.scenes||[]):data.characters,item=list[0];o.ref_id=item?.id||item?.scene_id||item?.character_id||'';delete o.usage;}if(key==='type'||key==='ref_id'){delete target.pictureSelections?.[r.picture];if(slot===0)delete target.continuityReference;}save();render();};
 document.querySelectorAll('[data-ref-enabled]').forEach(e=>e.onchange=()=>change(Number(e.dataset.refEnabled),'enabled',e.checked));
 document.querySelectorAll('[data-ref-type]').forEach(e=>e.onchange=()=>change(Number(e.dataset.refType),'type',e.value));
 document.querySelectorAll('[data-ref-resource]').forEach(e=>e.onchange=()=>change(Number(e.dataset.refResource),'ref_id',e.value));
 document.querySelectorAll('[data-ref-usage]').forEach(e=>e.onchange=()=>change(Number(e.dataset.refUsage),'usage',e.value));
 const selected=selectedReferenceInputs(target),hint=document.createElement('p');hint.className='subtle';hint.id='selectedReferenceHint';hint.textContent=selected.length?'实际提交：'+selected.map(r=>r.picture+' '+referenceOptionsNames[r.type]+'「'+r.name+'」').join('；'):'未选择参考图；多图参考模式至少需要一张。';
 document.querySelector('.shot-reference-grid')?.before(hint);
 const first=all[0];if(first&&(!first.enabled||first.type!=='scene')){const select=document.querySelector('[data-shot-ref="0"]');select?.querySelector('[value="__previous_tail__"]')?.remove();const card=select?.closest('.shot-reference-card');card?.querySelectorAll('p,button').forEach(e=>{if(/上一.*(?:末尾帧|场景参考)|小七坐姿开场图/.test(e.textContent))e.remove();});}
 const prompt=document.querySelector('#shotMethodVideoPrompt');if(prompt&&ShotMethods.method(target)==='reference_images'){const label=document.createElement('label');label.textContent='实际发送的视频提示词（已按所选参考图同步）';const text=document.createElement('textarea');text.id='actualReferenceVideoPrompt';text.readOnly=true;text.rows=10;text.value=composeReferencePrompt(target,shotGenerationVideoPrompt(target));label.append(text);prompt.closest('label').after(label);prompt.addEventListener('input',()=>{text.value=composeReferencePrompt(target,shotGenerationVideoPrompt(target));});}
}
const generationInputsBeforeReferenceOptions=shotGenerationInputs;
shotGenerationInputs=function(target){const out=generationInputsBeforeReferenceOptions(target);if(out.video_method==='reference_images'){out.picture_inputs=selectedReferenceInputs(target);out.prompt=composeReferencePrompt(target,out.prompt);}return out;};
function referenceBatchPrompt(target){try{return shotGenerationInputs(target).prompt;}catch{return '';}}
const shotsBeforeReferenceOptions=shots;shots=function(){shotsBeforeReferenceOptions();const target=shotVideoTarget();if(!target)return;bindReferenceOptions(target);document.querySelectorAll('.shot-script-editor b').forEach(e=>{if(e.textContent==='本主分镜固定 Picture 顺序')e.textContent='本主分镜参考图 · 可自由选择场景或人物';});};
render();
