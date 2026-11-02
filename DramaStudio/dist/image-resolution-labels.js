(()=>{
 const records=new WeakMap();let pending=false;
 function excluded(img){return img.closest('.brand,header,aside,#portraitCandidates')||/favicon|apple-touch-icon|data:image\/svg\+xml/.test(img.getAttribute('src')||'');}
 function scan(){pending=false;for(const img of document.querySelectorAll('img')){
  if(excluded(img))continue;
  let r=records.get(img);
  if(!r||!r.label.isConnected){const label=document.createElement('small');label.className='image-resolution-label';label.style.cssText='display:block;text-align:center;color:#b4d7cb;font-size:12px;line-height:1.5;margin:5px 0 8px;overflow-wrap:anywhere;flex:none;max-width:100%';const existing=img.closest('figure')?.querySelector('.upload-image-dimensions');if(existing){records.set(img,{label:existing,existing:true});continue;}const anchor=img.closest('a,button,picture')||img;anchor.after(label);r={label};records.set(img,r);}
  if(r.existing)continue;
  const value=img.complete&&img.naturalWidth>0?img.naturalWidth+' × '+img.naturalHeight+' px':img.complete?'图片未加载，暂无法读取分辨率':'分辨率读取中…';
  if(r.label.textContent!==value)r.label.textContent=value;
 }}
 function schedule(){if(!pending){pending=true;requestAnimationFrame(scan);}}
 new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['src','srcset']});
 document.addEventListener('load',schedule,true);document.addEventListener('error',schedule,true);schedule();
})();
