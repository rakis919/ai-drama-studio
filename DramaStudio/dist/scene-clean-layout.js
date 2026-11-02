// Scene page: preview first, one action area, secondary tools disclosed on demand.
(()=>{
 function disclosure(title,id){const el=document.createElement('details');el.id=id;el.className='scene-fold';const summary=document.createElement('summary');summary.textContent=title;el.append(summary);return el;}
 function moveWithHint(node,target){if(!node)return;const hint=node.nextElementSibling;target.append(node);if(hint?.matches('p.subtle'))target.append(hint);}
 function tidy(){
  const editor=document.querySelector('.scene-editor'),scene=currentScene();if(!editor||!scene)return;
  const cards=[...editor.children],left=cards[0],preview=cards[1],right=cards[2];if(!right)return;
  editor.classList.add('scene-clean-layout');preview.classList.add('scene-clean-preview');right.classList.add('scene-clean-settings');
  const head=document.querySelector('#panel .section-head');
  if(head){head.querySelector('h3').textContent='场景设计';head.querySelector('p').textContent='选择场景与机位，预览图片，再调整生成。';}
  const batch=document.querySelector('#sceneUpscaleBatch');if(batch){const fold=disclosure('批量放大场景图片','sceneBatchFold');batch.before(fold);fold.append(batch);}
  const relations=document.querySelector('.scene-relations');if(relations){const fold=disclosure('场景联系与参考关系','sceneRelationsFold');left.append(fold);fold.append(relations);}
  const image=document.querySelector('#sceneImageBox'),controls=document.querySelector('#sceneGenerationControls'),versions=document.querySelector('#sceneVersions'),status=document.querySelector('#sceneJobStatus');
  if(!controls||!image)return;
  const toolbar=document.createElement('div');toolbar.className='scene-clean-toolbar';
  const versionLabel=document.createElement('span');versionLabel.className='subtle';versionLabel.textContent='历史版本';toolbar.append(versionLabel);
  if(versions)toolbar.append(versions);
  const download=document.querySelector('#sceneImageDownload');if(download)toolbar.append(download);
  image.after(toolbar);toolbar.after(controls);
  if(status){status.classList.add('scene-clean-status');toolbar.before(status);}
  for(const node of [...preview.children]){
   if(node.matches('.divider,.mini-label')&&node.textContent.trim()==='当前机位历史版本')node.remove();
  }
  const actions=document.querySelector('#scenePreviewGenerateActions'),operation=actions?.querySelector('select[aria-label="本次操作"]');
  if(operation){const wrap=operation.closest('label')?.parentElement;if(wrap){wrap.classList.add('scene-clean-operation');wrap.style.cssText='margin:0;padding:0;border:0;flex:1;min-width:190px';}}
  const technical=disclosure('工作流与生成记录','sceneTechnicalFold');preview.append(technical);
  for(const button of [...(actions?.querySelectorAll('button')||[])])if(button.id!=='sceneGenerate')technical.append(button);
  const links=document.querySelector('#sceneWorkflowLinks');if(links)technical.append(links);
  for(const node of [...preview.children])if(node.matches('p.subtle')&&node!==status&&node.textContent.includes('历史记录'))technical.append(node);
  const info=document.querySelector('#sceneReferenceStatus');if(info)technical.append(info);
  const upload=preview.querySelector('[data-external-upload]');if(upload){const fold=disclosure('导入外部场景图片','sceneUploadFold');technical.before(fold);fold.append(upload);}
  const fieldGrid=controls.querySelector('.scene-generation-fields');
  const more=disclosure('参考图与高级生成设置','sceneAdvancedGeneration');
  for(const note of [...(actions?.querySelectorAll('p.subtle')||[])])more.append(note);
  for(const cell of [...(fieldGrid?.children||[])]){
   if(cell.querySelector('#sceneReference'))more.append(cell);
   else for(const note of [...cell.querySelectorAll('p.subtle')])if(note.id!=='sceneGenerationSizeNote')more.append(note);
  }
  const referencePreview=document.querySelector('#sceneReferencePreview');if(referencePreview)more.append(referencePreview);
  const angles=[...preview.children].find(el=>el.textContent.includes('机位视角控制')&&el.querySelector('[data-angle]'));if(angles)more.append(angles);
  if(more.children.length>1)controls.append(more);
  const metadata=disclosure('名称、用途与空间设定','sceneMetadataFold');
  const nameRow=document.querySelector('#sceneName')?.closest('.field-row');if(nameRow)metadata.append(nameRow);
  moveWithHint(document.querySelector('#scenePurpose')?.closest('label'),metadata);
  const details=document.querySelector('#sceneDetails');if(details)metadata.append(details);
  const title=right.querySelector('.right-title');if(title){title.firstChild.textContent='场景提示词';title.after(metadata);}
  const prompt=document.querySelector('#scenePrompt');if(prompt){prompt.rows=9;const label=prompt.closest('label');if(label?.firstChild?.nodeType===3)label.firstChild.textContent='画面描述';}
  const negative=disclosure('负面词与排除项','sceneNegativeFold');right.append(negative);
  const effective=document.querySelector('#imageNegativeStatus');if(effective)negative.append(effective);
  moveWithHint(document.querySelector('#sceneNegative')?.closest('label'),negative);
  for(const node of [...right.children]){
   if(node.matches('.divider'))node.remove();
   if(node.matches('p.subtle'))technical.append(node);
  }
  // Keep only purposeful dividers; the preview already has distinct sections.
  for(const node of [...preview.children])if(node.matches('.divider'))node.remove();
 }
 const style=document.createElement('style');style.textContent=`
 .scene-clean-layout{grid-template-columns:160px minmax(380px,1fr) 330px;align-items:start}
 .scene-clean-layout>.card{min-width:0;padding:16px}
 .scene-clean-preview .scene-image-box{margin:12px 0 8px;min-height:180px}
 .scene-clean-preview .scene-image-box img{max-height:430px}
 .scene-clean-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:8px 0 14px}
 .scene-clean-toolbar .history{margin:0;flex:1;gap:6px}
 .scene-clean-toolbar .history button{padding:6px 9px}
 .scene-clean-toolbar>a{font-size:11px}
 .scene-clean-status{margin:5px 0;font-size:11px}
 .scene-fold{border-top:1px solid var(--line);margin:12px 0 0;padding:12px 0 0;min-width:0}
 .scene-fold>summary{cursor:pointer;color:var(--green);font-size:11px;line-height:1.8;list-style-position:inside}
 .scene-fold[open]>summary{margin-bottom:12px}
 .scene-fold>.card{border:0;padding:0;margin:0!important;background:transparent}
 #sceneBatchFold{margin:0 0 16px;border:1px solid var(--line);border-radius:8px;padding:10px 14px}
 #sceneGenerationControls{padding:14px!important;margin:0!important;background:#141d29;border-color:#3e514e!important}
 #sceneGenerationControls>.scene-generation-fields{gap:10px 16px!important}
 #sceneGenerationControls label{font-size:11px}
 #sceneGenerationControls .field-row{margin-top:0!important;gap:10px!important}
 #sceneGenerationControls .field-row label{margin-bottom:0!important}
 #sceneGenerationControls select{margin-bottom:0!important}
 #sceneGenerationSizeNote{font-size:10px;line-height:1.6}
 #sceneGenerationControls .scene-generation-fields>div:has(#sceneWidth){grid-column:1/-1}
 #sceneGenerationControls .scene-generation-fields>div:has(select[aria-label="场景图生图模型"]){grid-column:1/-1}
 #scenePreviewGenerateActions{margin:14px 0 0!important;align-items:end!important;gap:12px!important}
 #scenePreviewGenerateActions #sceneGenerate{min-height:42px;flex:1!important;white-space:nowrap}
 #sceneTechnicalFold a{font-size:11px}
 #sceneTechnicalFold>button{width:100%;margin:8px 0!important}
 #sceneUploadFold input[type=file][hidden]{display:none!important}
 #sceneUploadFold .external-image-upload{margin:0;padding:12px;font-size:11px}
 #sceneMetadataFold{margin-bottom:16px}
 #sceneNegativeFold #imageNegativeStatus{margin-top:0;padding:12px}
 #sceneNegativeFold textarea{font-size:11px}
 #sceneAdvancedGeneration #sceneReferencePreview{margin:10px 0!important}
 #sceneRelationsFold .scene-relation-list{display:block}
 #sceneRelationsFold .scene-relation-node{min-width:0;width:100%;padding:9px;margin-top:8px}
 @media(max-width:1400px) and (min-width:1101px){.scene-clean-layout{grid-template-columns:130px minmax(320px,1fr) 290px;gap:12px}}
 @media(max-width:1100px){.scene-clean-layout{grid-template-columns:140px minmax(0,1fr)}.scene-clean-settings{grid-column:1/-1}}
 @media(max-width:720px){.scene-clean-layout{grid-template-columns:minmax(0,1fr)}.scene-clean-settings{grid-column:auto}}
 `;document.head.append(style);
 function collectLateTools(){
  const preview=document.querySelector('.scene-clean-preview');if(!preview)return;
  const upload=preview.querySelector(':scope > [data-external-upload]');
  if(upload){let fold=preview.querySelector('#sceneUploadFold');if(!fold){fold=disclosure('导入外部场景图片','sceneUploadFold');preview.append(fold);}fold.append(upload);}
  const batch=document.querySelector('#sceneUpscaleBatch'),fold=document.querySelector('#sceneBatchFold');
  if(batch&&fold&&batch.parentElement!==fold)fold.append(batch);
 }
 const previous=renderScenes;renderScenes=function(){previous();tidy();};
 const previousRender=render;render=function(){previousRender();collectLateTools();};
 new MutationObserver(collectLateTools).observe(document.querySelector('#panel'),{childList:true,subtree:true});
 render();
})();
