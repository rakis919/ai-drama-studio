(()=>{
 function target(e){const host=e.target.closest('dialog,#uploadGroup,label');if(!host)return null;const input=host.querySelector('input[type=file][accept*="image"]');return input&&!input.disabled?{host,input}:null;}
 const group=document.querySelector('#uploadGroup');if(group){const hint=document.createElement('p');hint.className='subtle';hint.textContent='支持选择文件，也可以把外部图片直接拖入这里。';group.append(hint);}
 document.addEventListener('dragover',e=>{const t=target(e);if(t&&[...e.dataTransfer.types].includes('Files')){e.preventDefault();t.host.style.outline='2px dashed #b5e3d2';}});
 document.addEventListener('dragleave',e=>{const t=target(e);if(t)t.host.style.outline='';});
 document.addEventListener('drop',e=>{const t=target(e);if(!t||!e.dataTransfer.files.length)return;e.preventDefault();t.host.style.outline='';const files=[...e.dataTransfer.files];if(files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type))){if(typeof toast==='function')toast('请选择 PNG、JPEG 或 WebP 图片');return;}if(!t.input.multiple&&files.length>1){if(typeof toast==='function')toast('这个位置一次选择一张图片');return;}const transfer=new DataTransfer();files.forEach(f=>transfer.items.add(f));t.input.files=transfer.files;t.input.dispatchEvent(new Event('change',{bubbles:true}));});
})();
