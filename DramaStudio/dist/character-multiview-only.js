// Keep portrait identity generation inside the single multiview workspace.
const charactersBeforeMultiviewOnly=characters;
characters=function(){for(const c of data.characters)c.view='multi';charactersBeforeMultiviewOnly();
 document.querySelector('#panel .view-toggle')?.remove();
 document.querySelector('#confirm')?.remove();
 document.querySelector('#makeMulti')?.remove();
 const title=document.querySelector('#panel .preview-head');if(title){const label=title.querySelector('span');if(label?.firstChild)label.firstChild.textContent='人物多视图 ';}
 const c=data.characters[ci],run=c?.oneClick,entry=c&&activeMulti(c);
 if(run&&['running','stopping','failed','stopped'].includes(run.status)&&entry?.auto_run_id===run.id){
   const boxes=document.querySelectorAll('#panel .angle-grid .angle');
   for(const [i,angle]of ['portrait','front','left','back'].entries()){
     const box=boxes[i];if(!box)continue;const task=run.tasks?.[angle];
     box.querySelector('img')?.remove();const old=box.querySelector(':scope > p');old?.remove();
     if(task?.status==='completed'&&task.image_url){const img=document.createElement('img');img.src=task.image_url;img.alt=c.name+' · 本轮'+angle;img.style.cssText='width:100%;height:260px;object-fit:contain;flex:none';box.prepend(img);}
     else{const p=document.createElement('p');p.className='subtle';p.style.cssText='height:260px;display:grid;place-items:center;margin:0;padding:15px';p.textContent=task?({new:'待提交',submitting:'提交中',queued:'排队中',running:'生成中',waiting:'等待结果',failed:'生成失败：'+(task.error||''),cancelled:'已停止'})[task.status]||'待生成':run.status==='stopped'?'未生成 · 已停止':'等待前序视图完成';box.prepend(p);}
   }
   const state=document.querySelector('#panel .preview-head .status');if(state)state.textContent=' / '+({running:'本轮生成中',stopping:'正在停止',failed:'本轮已暂停',stopped:'本轮已停止'})[run.status];
 }
};render();
