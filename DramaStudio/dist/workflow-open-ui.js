function attachWorkflowOpenLinks(){document.querySelectorAll('a[href]').forEach(a=>{
 const match=/^\/api\/front-image\/([a-f0-9-]{36})\/workflow$/.exec(a.getAttribute('href'));if(!match||a.dataset.directOpenAdded)return;a.dataset.directOpenAdded='1';
 const original=a.textContent,angle=original.match(/大头像|单侧面|侧面|背面|全身正面/),prefix=angle?angle[0]+' · ':original.includes('历史')?'历史版本 · ':'';
 const open=document.createElement('a');open.textContent=prefix+'打开 ComfyUI 工作流 ↗';open.title='在 ComfyUI 中载入这张图片实际使用的节点与参数';open.href='/api/open-workflow/'+match[1]+'?port='+Number(localStorage.getItem('frame-comfy-port')||8188);open.target='_blank';open.rel='noopener';open.style.cssText='color:var(--green);font-weight:600';
 a.textContent=prefix+'查看工作流 JSON';a.title='查看工作流数据，不会打开 ComfyUI';a.before(open);
});}
const workflowLinkRender=render;render=function(){workflowLinkRender();attachWorkflowOpenLinks();};attachWorkflowOpenLinks();
