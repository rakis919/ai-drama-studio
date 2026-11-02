(function(root){
 const profiles={ '9:16':['288x512','432x768','480x864','512x912','576x1024','720x1280'], '16:9':['512x288','768x432','1024x576','1280x720'], '1:1':['512x512','768x768','1024x1024'] };
 function ratio(p){const value=p?.ratio||p?.production_targets?.aspect_ratio;const r=String(value||'').match(/16:9|9:16|1:1/)?.[0];return profiles[r]?r:'16:9';}
 function choices(p){return profiles[ratio(p)];}
 function video(t,p){const a=choices(p);return a.includes(t?.videoResolution)?t.videoResolution:a[1];}
 function frames(p){const [w,h]=ratio(p).split(':').map(Number);return [768,1280,1920,2560,3840].map(e=>Math.round(e*w/Math.max(w,h))+'x'+Math.round(e*h/Math.max(w,h)));}
 function frame(t,p){const a=frames(p);return a.includes(t?.frameResolution)?t.frameResolution:a[1];}
 function mismatch(v,p){if(!v?.width||!v?.height)return false;const [w,h]=ratio(p).split(':').map(Number);return Math.abs(v.width/v.height-w/h)>.025;}
 function options(p){return choices(p).map((s,i)=>'<option value="'+s+'">'+s.replace('x',' × ')+(i===0?' · 小尺寸预览':'')+'</option>').join('');}
 function setRatio(project,next){
  if(!profiles[next])throw Error('请选择16:9横屏、9:16竖屏或1:1方形');
  if(ratio(project)===next)return false;
  const active=['preparing','queued','running','waiting','saving','stopping'];
  if((project.shots||[]).some(t=>active.includes(t.videoJob?.status)||Object.values(t.frameImages||{}).some(f=>active.includes(f.job?.status))))throw Error('请等待本项目当前图片或视频任务完成后切换画幅');
  project.ratio=next;project.production_targets??={};project.production_targets.aspect_ratio=next;
  const dims=next==='9:16'?[720,1280]:next==='1:1'?[1024,1024]:[1280,720];project.production_targets.output_resolution={width:dims[0],height:dims[1]};
  if(project.basic_info?.aspect_ratio!==undefined)project.basic_info.aspect_ratio=next;
  for(const t of project.shots||[]){
   const oldVideo=String(t.videoResolution||'').split('x').map(Number),area=oldVideo[0]*oldVideo[1]||331776;
   t.videoResolution=[...choices(project)].sort((a,b)=>{const [aw,ah]=a.split('x').map(Number),[bw,bh]=b.split('x').map(Number);return Math.abs(aw*ah-area)-Math.abs(bw*bh-area);})[0];
   const longest=Math.max(...String(t.frameResolution||'720x1280').split('x').map(Number));t.frameResolution=[...frames(project)].sort((a,b)=>Math.abs(Math.max(...a.split('x').map(Number))-longest)-Math.abs(Math.max(...b.split('x').map(Number))-longest))[0];
   t.generationReviewRequired=true;t.videoPlanReviews={};
   for(const f of Object.values(t.frameImages||{}))if(f.versions?.some(v=>mismatch(v,project)))f.needsReview=true;
  }
  return true;
 }
 const api={ratio,choices,video,frames,frame,mismatch,options,profiles,setRatio};root.ShotAspect=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

// This control changes only the selected project when the user selects a value.
if(typeof document!=='undefined'&&typeof overview==='function'){
 const beforeProjectAspectOverview=overview;
 overview=function(){beforeProjectAspectOverview();const host=document.querySelector('#tags');if(!host)return;const label=document.createElement('label');label.style.cssText='display:inline-flex;align-items:center;gap:8px;margin-left:10px';label.textContent='项目画幅';const select=document.createElement('select');select.id='projectAspectRatio';select.setAttribute('aria-label','项目画幅');select.style.cssText='width:auto;min-width:140px;margin:0';for(const [value,text] of [['9:16','9:16 · 竖屏'],['16:9','16:9 · 横屏'],['1:1','1:1 · 方形']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}select.value=ShotAspect.ratio(data);select.onchange=()=>{try{if(ShotAspect.setRatio(data,select.value)){save();render();if(typeof toast==='function')toast('画幅已切换，新图片和视频按新尺寸生成；已有素材保持原尺寸。');}}catch(e){select.value=ShotAspect.ratio(data);if(typeof toast==='function')toast(e.message);}};label.append(select);host.append(label);};
}
