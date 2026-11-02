// Compatibility flags track the selected completed image; there is no approval step.
function useCompletedCharacterImages(c){
 const head=currentIdentityPortrait(c);c.portraitConfirmed=!!(head?.status==='completed'&&head.image_url);c.portraitConfirmedId=c.portraitConfirmed?head.id:null;
 const front=selectedFront(c);c.confirmed=!!(front?.job_id&&front.image_url);c.confirmedVersion=c.confirmed?c.active:null;
}
const applyFrontBeforeAutoUse=applyFrontResult;
applyFrontResult=function(c,job){applyFrontBeforeAutoUse(c,job);useCompletedCharacterImages(c);save()};
const applyPortraitBeforeAutoUse=applyIdentityPortrait;
applyIdentityPortrait=function(c,job){applyPortraitBeforeAutoUse(c,job);useCompletedCharacterImages(c);save()};
const generateBeforeAutoUse=generateCharacter;
generateCharacter=async function(multi){const c=data.characters[ci];if(c)useCompletedCharacterImages(c);return generateBeforeAutoUse(multi)};
const angleBeforeAutoUse=regenerateAngle;
regenerateAngle=async function(c,angle){useCompletedCharacterImages(c);return angleBeforeAutoUse(c,angle)};
const charactersBeforeAutoUse=characters;
characters=function(){for(const c of data.characters)useCompletedCharacterImages(c);charactersBeforeAutoUse();const c=data.characters[ci];if(!c)return;
 document.querySelector('#confirm')?.remove();
 const status=document.querySelector('#panel .preview-head .status');if(status)status.textContent=(c.view==='multi'?selectedFront(c)?.image_url:currentIdentityPortrait(c)?.image_url)?' / 已生成':' / 待生成';
 const steps=document.querySelector('#panel .character-list')?.parentElement.querySelector('p.subtle');if(steps)steps.innerHTML='01 生成大头像<br>02 引用头像生成全身正面<br>03 引用正面生成侧面、背面';
 for(const el of document.querySelectorAll('#panel .character-item small'))el.textContent=el.textContent.replace(/已确认/g,'已生成').replace(/待确认/g,'待生成');
 const caption=document.querySelectorAll('#panel .angle-grid .angle')[1]?.querySelector('span');if(caption)caption.textContent='当前全身正面';
 for(const el of document.querySelectorAll('#panel p.subtle,#panel button,#panel a')){for(const node of el.childNodes)if(node.nodeType===3)node.textContent=node.textContent.replace(/生成并确认大头像/g,'生成大头像').replace(/已确认/g,'已生成').replace(/确认后再引用/g,'生成后再引用').replace(/请先回到「正面图」，点击「确认正面形象」。/g,'请先生成全身正面图。').replace(/请确认当前正面图后/g,'请使用当前正面图').replace(/确认全身后/g,'全身生成后');}
 const next=document.querySelector('#makeMulti');if(next&&c.view!=='multi')next.title='引用已生成大头像生成全身正面，无需确认';
};render();
