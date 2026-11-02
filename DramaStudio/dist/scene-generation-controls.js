// Keep scene generation controls beside the preview action; follow the displayed asset.
(()=>{
 const priorSize=sceneSize, measured=new Map(), boundImages=new WeakSet();
 function sizeSource(scene){return selectedSceneVersion(scene,'master')||selectedSceneVersion(scene,scene.activeView||'master');}
 function sourceKey(scene){const view=scene.activeView||'master',v=sizeSource(scene);return 'main-size-v1|'+view+'|'+(v?.id||v?.image_url||'new');}
 function validSize(s){return Number(s?.width)>0&&Number(s?.height)>0;}
 function sourceSize(scene){
  const v=sizeSource(scene);
  const img=currentScene()===scene?document.querySelector('#sceneImageBox img'):null;
  if(v?.image_url&&img?.complete&&img.naturalWidth>0&&img.naturalHeight>0&&new URL(img.currentSrc||img.src,location.href).href===new URL(v.image_url,location.href).href){
   const actual={width:img.naturalWidth,height:img.naturalHeight};measured.set(v.image_url,actual);return actual;
  }
  const cached=v?.image_url&&measured.get(v.image_url);
  if(validSize(cached))return cached;
  if(validSize(v))return {width:Number(v.width),height:Number(v.height)};
  const ref=sceneReference(scene,scene.activeView||'master')?.version;
  if(validSize(ref))return {width:Number(ref.width),height:Number(ref.height)};
  return null;
 }
 function supportedSize(s){return {width:Number(s.width),height:Number(s.height)};} 
 sceneSize=function(scene){
  const custom=scene.generationSizeOverride;
  if(custom?.sourceKey===sourceKey(scene))return {width:custom.width,height:custom.height};
  const current=sourceSize(scene);
  return current?supportedSize(current):{...priorSize(scene)};
 };
 function sizeNote(scene){
  const note=document.querySelector('#sceneGenerationSizeNote');if(!note)return;
  const source=sourceSize(scene),size=sceneSize(scene),custom=scene.generationSizeOverride?.sourceKey===sourceKey(scene);
  const main=(scene.activeView||'master')!=='master'&&selectedSceneVersion(scene,'master');
  note.textContent=custom?'已使用本机位手动尺寸。':source?(main?'默认使用主视角原图尺寸 ':'默认使用当前原图尺寸 ')+source.width+' × '+source.height+' px。':'暂无原图尺寸，使用场景默认尺寸。';
 }
 function syncSize(scene,force=false){
  if(currentScene()!==scene)return;
  const size=sceneSize(scene);
  for(const [id,key] of [['sceneWidth','width'],['sceneHeight','height']]){
   const el=document.querySelector('#'+id);if(el&&(force||document.activeElement!==el))el.value=size[key];
  }
  sizeNote(scene);
 }
 function draw(){
  const scene=currentScene(),button=document.querySelector('#sceneGenerate');if(!scene||!button)return;
  const actions=button.closest('#scenePreviewGenerateActions');if(!actions)return;
  if(!document.querySelector('#sceneGenerationControlsStyle')){
   const style=document.createElement('style');style.id='sceneGenerationControlsStyle';style.textContent='#sceneGenerationControls{border:1px solid #344254;border-radius:10px;padding:16px;margin:16px 0;min-width:0}#sceneGenerationControls>.scene-generation-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 20px}#sceneGenerationControls label{margin:0;min-width:0}#sceneGenerationControls p{margin:6px 0 12px}#sceneGenerationControls .field-row{margin:0}#scenePreviewGenerateActions{align-items:flex-start!important}#scenePreviewGenerateActions>div{max-width:100%}@media(max-width:700px){#sceneGenerationControls>.scene-generation-fields{grid-template-columns:1fr}}';document.head.append(style);
  }
  const box=document.createElement('section');box.id='sceneGenerationControls';box.setAttribute('aria-label','场景生成设置');
  const title=document.createElement('b');title.textContent='生成设置';box.append(title);
  const fields=document.createElement('div');fields.className='scene-generation-fields';fields.style.marginTop='12px';box.append(fields);
  const reference=document.querySelector('#sceneReference')?.closest('label');
  if(reference){const hint=reference.nextElementSibling;const cell=document.createElement('div');cell.append(reference);if(hint?.matches('p.subtle'))cell.append(hint);fields.append(cell);}
  const sizeRow=document.querySelector('#sceneWidth')?.closest('.field-row');
  if(sizeRow){const cell=document.createElement('div');cell.append(sizeRow);const note=document.createElement('p');note.id='sceneGenerationSizeNote';note.className='subtle';note.setAttribute('aria-live','polite');cell.append(note);fields.append(cell);}
  for(const label of [...document.querySelectorAll('label')]){
   if(!label.querySelector('select[aria-label="场景图生图模型"],input[aria-label="重绘强度（denoise）"]'))continue;
   const hint=label.nextElementSibling,cell=document.createElement('div');cell.append(label);if(hint?.matches('p.subtle'))cell.append(hint);fields.append(cell);
  }
  actions.before(box);box.append(actions);
  for(const [id,key] of [['sceneWidth','width'],['sceneHeight','height']]){
   const input=document.querySelector('#'+id);if(!input)continue;
   input.max='4096';input.step='1';input.oninput=()=>{const size=sceneSize(scene);scene.generationSizeOverride={sourceKey:sourceKey(scene),...size,[key]:Number(input.value)};save();sizeNote(scene);};
  }
  const img=document.querySelector('#sceneImageBox img'),v=selectedSceneVersion(scene,scene.activeView||'master');
  if(img&&!boundImages.has(img)){
   boundImages.add(img);const read=()=>{if(!img.naturalWidth||!img.naturalHeight)return;if(v?.image_url)measured.set(v.image_url,{width:img.naturalWidth,height:img.naturalHeight});syncSize(scene);};
   img.addEventListener('load',read,{once:true});if(img.complete)read();
  }
  syncSize(scene);
 }
 const previous=renderScenes;renderScenes=function(){previous();draw();};render();
})();
