/* Persist scroll and expanded panels per project/sheet/shot. */
(() => {
 history.scrollRestoration='manual';let ready=false,restoring=false,timer=null,currentKey=null;
 function key(){const u=new URL(location.href);const id=p?.id||u.searchParams.get('project');if(!id)return null;const sheet=u.searchParams.get('sheet')||'song',shot=sheet==='shots'?(u.searchParams.get('shot')||localStorage.getItem('mvShot:'+id)||''):'';return 'mvView:'+id+':'+sheet+':'+shot;}
 function details(){return [...document.querySelectorAll('#workspace details')].filter(el=>!el.closest('[hidden]')&&!el.matches('[data-generation-history]'));}
 function store(){if(!ready||restoring||!currentKey)return;try{localStorage.setItem(currentKey,JSON.stringify({scroll:window.scrollY,shotList:document.querySelector('.shot-tabs')?.scrollTop||0,open:details().map((el,i)=>el.open?i:null).filter(i=>i!==null)}))}catch{}}
 function restore(){const next=key();if(!next)return;currentKey=next;let saved;try{saved=JSON.parse(localStorage.getItem(next)||'null')}catch{}if(!saved){ready=true;return;}restoring=true;const all=details();all.forEach((el,i)=>el.open=(saved.open||[]).includes(i));const apply=()=>{window.scrollTo(0,Number(saved.scroll)||0);const list=document.querySelector('.shot-tabs');if(list)list.scrollTop=Number(saved.shotList)||0;};requestAnimationFrame(()=>{apply();setTimeout(()=>{apply();restoring=false;ready=true;},150);});}
 const beforeLoad=load;load=function(next){store();ready=false;beforeLoad(next);requestAnimationFrame(restore);};
 // Save the departing view before the tab handlers change the address and restore after rendering.
 document.addEventListener('click',e=>{if(e.target.closest('[data-sheet],[data-shot-tab],#projects button')){store();ready=false;setTimeout(restore,0);}},true);
 window.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(store,120)},{passive:true});document.addEventListener('toggle',()=>{clearTimeout(timer);timer=setTimeout(store,150)},true);document.querySelector('.shot-tabs')?.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(store,120)},{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')store()});window.addEventListener('pagehide',store);window.addEventListener('beforeunload',store);
 if(p)requestAnimationFrame(restore);
})();
