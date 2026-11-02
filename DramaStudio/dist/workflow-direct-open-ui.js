function attachWorkflowOpenLinks(){
 if(typeof tab!=='undefined'&&tab===0&&typeof selectedFront==='function'){
   const c=data.characters[ci],id=c&&selectedFront(c)?.job_id;
   if(id&&!document.querySelector('#panel a[href="/api/front-image/'+id+'/workflow"]')){
     const link=document.createElement('a');link.textContent='全身正面实际工作流';link.href='/api/front-image/'+id+'/workflow';
     let group=document.querySelector('#characterWorkflowActions');if(!group){group=document.createElement('div');group.id='characterWorkflowActions';group.style.cssText='display:flex;gap:12px;flex-wrap:wrap;margin:16px 0;width:100%;clear:both';document.querySelector('#generate')?.after(group);}
     if(group)group.append(link);else{const links=document.createElement('div');links.style.cssText='display:flex;gap:12px;flex-wrap:wrap;margin:12px 0';links.append(link);document.querySelector('#generate')?.after(links);}
   }
 }
 const misplaced=[...document.querySelectorAll('#portraitCandidates a[href]')].filter(a=>/\/workflow(?:\?|$)|\/api\/open-workflow\//.test(a.getAttribute('href')));if(misplaced.length){let group=document.querySelector('#characterWorkflowActions');if(!group){group=document.createElement('div');group.id='characterWorkflowActions';group.style.cssText='display:flex;gap:12px;flex-wrap:wrap;margin:16px 0;clear:both';document.querySelector('#generate')?.after(group);}misplaced.forEach(a=>group.append(a));}
 document.querySelectorAll('a[href]').forEach(a=>{
   const href=a.getAttribute('href');if(/^\/api\/front-image-template(?:\?|$)/.test(href)){a.hidden=true;return;}
   const match=/^\/api\/front-image\/([a-f0-9-]{36})\/workflow(?:\?.*)?$/.exec(href);if(!match)return;a.hidden=true;if(a.dataset.directOpenAdded||href.includes('download='))return;a.dataset.directOpenAdded='1';
   const original=a.textContent,angle=original.match(/大头像|单侧面|侧面|背面|全身正面/),prefix=angle?angle[0]+' · ':original.includes('历史')?'历史版本 · ':'';
   const open=document.createElement('a');open.dataset.characterAngle=angle?.[0]||'';open.textContent=prefix+'打开 ComfyUI 工作流 ↗';open.title='基于本图工作流加载当前负面配置，历史生成记录保持不变';open.href='/api/open-workflow/'+match[1]+'?negative_config=current&port='+Number(localStorage.getItem('frame-comfy-port')||8188);open.target='_blank';open.rel='noopener';open.style.cssText='color:var(--green);font-weight:600';a.before(open);
 });
 const order=['大头像','全身正面','单侧面','侧面','背面'],groups=new Map();for(const a of document.querySelectorAll('#panel a[data-character-angle]')){if(!order.includes(a.dataset.characterAngle))continue;const group=a.parentElement;if(!groups.has(group))groups.set(group,[]);groups.get(group).push(a);}for(const [group,links]of groups)links.sort((a,b)=>order.indexOf(a.dataset.characterAngle)-order.indexOf(b.dataset.characterAngle)).forEach(a=>group.append(a));
}
const workflowLinkRender=render;render=function(){workflowLinkRender();attachWorkflowOpenLinks();};attachWorkflowOpenLinks();
