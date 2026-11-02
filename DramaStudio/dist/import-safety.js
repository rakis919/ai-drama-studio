/* Main import always creates a project; module updates keep an independent backup. */
(function(){
  const copy=x=>JSON.parse(JSON.stringify(x));
  const blank=()=>({title:'未命名短剧',synopsis:'',genre:'',style:'',ratio:'',episodes:1,duration:0,characters:[],shots:[],scenes:[],stages:{}});
  function build(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('项目 JSON 顶层必须是对象');
    const base=blank();base.project_id=raw.project_id||raw.project?.project_id||'';
    let next;
    if(ShotSchema.isHierarchical(raw)||raw.schema_type==='shot_script'){
      next=ShotSchema.merge(base,raw).project;next.title=raw.title||'新分镜项目';
    }else if(raw.schema_type==='scene_library'||raw.type==='scenes'){
      next=SceneSchema.merge(base,raw).project;next.title=raw.title||'新场景项目';
    }else next=FrameJSON.apply(base,raw,blank()).data;
    const source=raw.project_id||raw.project?.project_id||'';
    next.source_project_id=source;next.project_id='IMPORT_'+crypto.randomUUID();
    delete next.local_id;delete next.deleted;
    // Keep external module IDs in metadata compatible with the new project identity.
    for(const field of ['shotScript','sceneLibrary'])if(next[field]?.project_id)next[field].project_id=next.project_id;
    return next;
  }
  let busy=false;
  async function create(raw){
    if(busy)return;
    busy=true;
    try{
      const next=build(raw);
      if(!diskReady)throw Error('请等待当前项目读取完成，再导入');
      await ensureProjectSaved();
      if(diskBusy||diskConflict)throw Error('当前项目尚未安全保存');
      const result=await projectRequest('/api/project',{revision:0,project:next});
      // Revision zero enforces create-only even if an ID collision occurs.
      data=next;diskIdentity=next.project_id;diskRevision=result.revision;
      lastDiskData=JSON.stringify(next);diskConflict=false;ci=si=tab=0;
      browserSave();render();document.querySelector('#importDialog').close();
      await refreshProjectLibrary();toast('已新建独立项目，原项目保留');
    }catch(e){document.querySelector('#importError').textContent='导入未完成：'+e.message;toast(e.message);}
    finally{busy=false;}
  }
  importProject=create;
  // Companion modules retain their source ID after a project is duplicated.
  const aliasRaw=(raw,project)=>raw&&project.source_project_id&&raw.project_id===project.source_project_id?{...raw,project_id:project.project_id}:raw;
  const shotMerge=ShotSchema.merge;ShotSchema.merge=(project,raw)=>shotMerge(project,aliasRaw(raw,project));
  const sceneMerge=SceneSchema.merge;SceneSchema.merge=(project,raw)=>sceneMerge(project,aliasRaw(raw,project));
  const sceneParse=SceneSchema.parse;SceneSchema.parse=(raw,id)=>sceneParse(id===data.project_id?aliasRaw(raw,data):raw,id);
  const characterParse=typeof parseCharacterImport==='function'?parseCharacterImport:null;
  if(characterParse)parseCharacterImport=function(){
    const input=document.querySelector('#characterJson'),text=input.value;
    try{const raw=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));const mapped=aliasRaw(raw,data);if(mapped!==raw)input.value=JSON.stringify(mapped);return characterParse();}
    finally{input.value=text;}
  };
  document.querySelector('#parse').onclick=()=>{try{void create(JSON.parse(document.querySelector('#jsonInput').value));}catch(e){document.querySelector('#importError').textContent=e.message;}};
  document.querySelector('#sample').onclick=()=>void create(copy(sample));
  const help=document.createElement('p');help.className='notice';help.textContent='此入口始终新建独立项目，即使文件中的项目编号相同，也不会覆盖已有项目。更新当前项目请使用角色、场景或分镜页的专用导入按钮。';
  document.querySelector('#jsonInput').before(help);
  document.querySelector('#parse').textContent='新建独立项目';

  function backup(project){
    // Separate store: subsequent automatic saves cannot rotate this snapshot away.
    return new Promise((resolve,reject)=>{
      const open=indexedDB.open('frame-studio-import-backups',1);
      open.onupgradeneeded=()=>open.result.createObjectStore('snapshots',{keyPath:'id'});
      open.onerror=()=>reject(Error('无法创建导入前备份，已取消更新'));
      open.onsuccess=()=>{
        const db=open.result;
        let tx;
        try{tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').add({id:crypto.randomUUID(),saved_at:new Date().toISOString(),project:copy(project)});}
        catch(e){db.close();reject(e);return;}
        tx.oncomplete=()=>{db.close();resolve();};
        tx.onabort=tx.onerror=()=>{db.close();reject(Error('导入前备份未完成，已取消更新'));};
      };
    });
  }
  // Capture module import buttons before their legacy synchronous handlers run.
  for(const [id,label] of [['shotImportApply','分镜'],['applySceneImport','场景'],['applyCharacters','角色']]){
    const button=document.getElementById(id);if(!button)continue;
    const original=button.onclick;
    button.onclick=async function(event){
      if(busy)return;
      const statusId={shotImportApply:'shotImportStatus',applySceneImport:'sceneImportStatus',applyCharacters:'characterImportStatus'}[id];const status=document.getElementById(statusId);const report=message=>{if(status)status.textContent=message;};
      busy=true;button.disabled=true;
      try{
        report('正在保存当前项目…');
        await ensureProjectSaved();
        const snapshot=JSON.stringify(data);
        report('正在备份导入前内容…');
        let timeout;try{await Promise.race([backup(data),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('备份等待超时，请关闭其他旧页面后重试')),12000);})]);}finally{clearTimeout(timeout);}
        if(JSON.stringify(data)!==snapshot)throw Error('备份期间项目发生变化，请重试');
        report('正在导入'+label+'…');
        if(typeof original!=='function')throw Error('导入入口未加载，请刷新后重试');
        await original.call(button,event);
      }catch(e){report('导入未完成：'+e.message);toast(e.message);}
      finally{busy=false;button.disabled=false;}
    };
  }
  const backupButton=document.createElement('button');backupButton.className='text';backupButton.textContent='导出导入前备份';
  backupButton.onclick=()=>{
    const open=indexedDB.open('frame-studio-import-backups',1);
    open.onupgradeneeded=()=>open.result.createObjectStore('snapshots',{keyPath:'id'});
    open.onerror=()=>toast('无法读取备份');
    open.onsuccess=()=>{const db=open.result,request=db.transaction('snapshots').objectStore('snapshots').getAll();request.onsuccess=()=>{
      const entries=request.result;db.close();if(!entries.length){toast('暂无导入前备份');return;}
      const url=URL.createObjectURL(new Blob([JSON.stringify(entries,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='导入前完整备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };request.onerror=()=>{db.close();toast('读取备份失败');};};
  };
  document.querySelector('.header-actions').append(backupButton);
  if(typeof module!=='undefined')module.exports={build};
})();
