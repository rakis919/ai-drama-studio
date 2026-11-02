const path=require('node:path');
function videoName(j){if(!/^[a-f0-9]{8}-[a-f0-9-]{27}$/.test(j.id))throw Error('任务编号无效');const kind=j.kind==='upscale-video'?'视频放大':j.kind==='text-video'?'文生视频':'图生视频';const w=Number(j.width),h=Number(j.height),size=[w,h].every(n=>Number.isInteger(n)&&n>0)?w+'x'+h:'尺寸未知';const label=({1920:'1080P',2560:'2K',3840:'4K'})[Math.max(w,h)];return kind+'_'+(label?label+'_':'')+size+'_'+j.id+'.mp4';}
module.exports={videoName};
