// Adapt the local studio to independently importable project modules.
const legacyShots=shots,legacyOverview=overview;
overview=function(){legacyOverview();const durationLabel=document.querySelector('#duration').parentElement;const total=data.shots.reduce((n,s)=>n+(Number(s.duration)||0),0),pending=data.shots.filter(s=>!s.duration).length;durationLabel.innerHTML='◷ 分镜总时长 <b id="duration">'+(total?Number(total.toFixed(2))+' 秒':'待定')+'</b>'+(pending?' · '+pending+' 镜待定':'');};
shots=function(){legacyShots();const s=data.shots[si];if(!s)return;const box=document.createElement('label');box.textContent='镜头时长（秒，可留空，不限 5 秒）';const input=document.createElement('input');input.type='number';input.min='0.1';input.step='any';input.placeholder='待定';input.value=s.duration??'';box.append(input);document.querySelector('#shotTitle').closest('label').after(box);input.oninput=()=>{try{s.duration=FrameJSON.duration(input.value);input.setCustomValidity('');save();overview()}catch(e){input.setCustomValidity(e.message);input.reportValidity()}};document.querySelectorAll('[data-shot]').forEach((b,i)=>b.textContent+=' · '+(data.shots[i].duration?Number(Number(data.shots[i].duration).toFixed(2))+' 秒':'时长待定'));};
normalize=function(raw){return FrameJSON.apply(data,raw,sample).data};
importProject=function(raw){const result=FrameJSON.apply(data,raw,sample);data=result.data;ci=si=0;tab=result.kind==='storyboard'?2:0;save();render();document.querySelector('#importDialog').close();toast(({project:'整包项目',outline:'剧情总纲',characters:'人物信息',storyboard:'分镜脚本'})[result.kind]+'已导入并保存');};
const moduleHelp=document.createElement('p');moduleHelp.className='subtle';moduleHelp.textContent='支持整包项目，或分别导入总纲、人物、分镜。分模块导入仅更新对应内容。镜头时长可自由设置。';document.querySelector('#jsonInput').before(moduleHelp);document.querySelector('#jsonInput').placeholder='{"schema_version":"2.0","type":"outline","project_id":"my-story","outline":{"title":"短剧标题","synopsis":"故事概要"}}';
const exportDialog=document.createElement('dialog');exportDialog.innerHTML='<div class="modal-head"><h2>导出项目 JSON</h2><button id="closeExport">✕</button></div><p>整包用于完整备份；三个模块可以分别修改、导入。</p><div class="stage-grid" id="moduleExports"></div><p class="subtle">请给同一项目的模块使用相同 project_id。未填写时，模块更新当前打开的项目。</p>';document.body.append(exportDialog);document.querySelector('#closeExport').onclick=()=>exportDialog.close();
function downloadModule(kind){save();const body=FrameJSON.pack(data,kind),blob=new Blob([JSON.stringify(body,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=data.title+'-'+kind+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('JSON 已导出');}
for(const [kind,label] of [['project','整包项目 · 完整备份'],['outline','01 总纲 · 故事概要'],['characters','02 人物 · 设定与提示词'],['storyboard','03 分镜 · 镜头与自由时长']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>downloadModule(kind);document.querySelector('#moduleExports').append(b)}
exportProject=function(){exportDialog.showModal()};['#export','#exportSide'].forEach(s=>document.querySelector(s).onclick=exportProject);render();

// Recover the nested outline schema imported before support was added.
if(data.story){
  const recovered=FrameJSON.parse({story:data.story,basic_info:data.basic_info,creative_vision:data.creative_vision,production_targets:data.production_targets,title:data.title});
  if(!data.characters.length&&recovered.characters?.length)data.characters=recovered.characters;
  if(!data.synopsis)data.synopsis=recovered.meta.synopsis;
  for(const name of ['genre','style','ratio','target_duration_seconds','language'])if(recovered.meta[name]!==undefined)data[name]=recovered.meta[name];
  save();
}
const outlineOverview=overview;
overview=function(){outlineOverview();if(data.project_type==='AI_animated_short_film'){const tags=document.querySelector('#tags');tags.innerHTML=[data.genre,data.style,data.ratio,'动画短片',data.target_duration_seconds?'目标 '+data.target_duration_seconds+' 秒':null].filter(Boolean).map(t=>'<span>'+esc(t)+'</span>').join('');}const pending=data.characters.filter(c=>!c.prompt&&!c.appearance).length;let note=document.querySelector('#characterImportNote');if(!note){note=document.createElement('p');note.id='characterImportNote';note.className='subtle';document.querySelector('.overview').append(note)}note.textContent=pending&&data.linked_files?.characters?'已读取 '+data.characters.length+' 位角色的剧情信息；详细外貌和形象提示词请继续导入 '+data.linked_files.characters+'。':'';};
render();
