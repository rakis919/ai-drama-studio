function negativeStatusCard(resource,type){
 const card=document.createElement('section');card.id='imageNegativeStatus';card.setAttribute('aria-label','负面词设置');card.style.cssText='border:1px solid var(--green);border-radius:10px;padding:16px;margin:16px 0;background:rgba(110,200,170,.06)';
 const heading=document.createElement('h3');heading.textContent=type==='scene'?'负面词设置 · 已接入生成':'采样与负面词设置';heading.style.cssText='margin:0 0 10px;color:var(--green);font-size:15px';
 const mode=document.createElement('p');mode.id='negativeModeDescription';mode.className='subtle';mode.style.margin='0 0 12px';
 if(type==='scene'){const reference=sceneReference(resource,resource.activeView||'master');mode.textContent=reference.version&&resource.imageModel!=='zimage'?'本次方式：Qwen 独立负面条件 · 12步 · CFG 4':'本次方式：Z-Image Turbo · 独立负面条件 · 12步 · 低强度 CFG 1.5（试用配置）';}
 else mode.textContent='头像：独立负面条件 · 12步 · 低强度 CFG 1.5（试用）；全身正面／侧面／背面：Lightning LoRA 4步 · CFG 1（负面词保留，不参与独立引导）';
 const label=document.createElement('label');label.textContent='下次生成使用的完整负面词（默认词＋自定义词）';const text=document.createElement('textarea');text.id='effectiveImageNegative';text.readOnly=true;text.rows=5;text.setAttribute('aria-label','下次生成使用的完整负面词');label.append(text);
 const update=()=>{const custom=type==='scene'?(resource.negativePrompt||resource.generation?.negative_prompt||''):[resource.negativePrompt||resource.generation?.negative_prompt||'',...(Array.isArray(resource.negative_constraints)?resource.negative_constraints:[])].filter(Boolean).join('，');text.value=ImageNegativeSpec.negative({resource_type:type,negative_prompt:custom});};update();
 const hint=document.createElement('p');hint.className='subtle';hint.textContent=type==='scene'?'已排除人物、人群、背景小人及打斗特效。共享世界中的人物动作不再拼入场景底图提示。修改后重新生成生效。':'修改下方自定义负面词后，完整负面词会同步更新。旧图片不会自动改变。';hint.style.marginBottom='0';card.append(heading,mode,label,hint);
 let input;if(type==='scene')input=document.querySelector('#sceneNegative');else input=[...document.querySelectorAll('#panel label')].find(l=>l.firstChild?.textContent?.startsWith('负面提示词'))?.querySelector('textarea');
 if(input){const label=input.closest('label');if(label.firstChild?.nodeType===3)label.firstChild.textContent='自定义负面词（可编辑，与默认词合并）';input.addEventListener('input',update);label.before(card);}
 else document.querySelector(type==='scene'?'#sceneGenerate':'#generate')?.before(card);
}
const charactersBeforeNegativeStatus=characters;
characters=function(){charactersBeforeNegativeStatus();const c=data.characters[ci];if(c)negativeStatusCard(c,'character');};
const scenesBeforeNegativeStatus=renderScenes;
renderScenes=function(){scenesBeforeNegativeStatus();const scene=currentScene();if(scene)negativeStatusCard(scene,'scene');};render();
