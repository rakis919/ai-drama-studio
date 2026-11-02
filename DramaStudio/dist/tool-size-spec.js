(function(root){
const ratios=[{id:'1:1',w:1,h:1,image:[1024,1024],video:[640,640]},{id:'16:9',w:16,h:9,image:[1280,720],video:[1024,576]},{id:'9:16',w:9,h:16,image:[720,1280],video:[576,1024]},{id:'4:3',w:4,h:3,image:[1152,864],video:[768,576]},{id:'3:4',w:3,h:4,image:[864,1152],video:[576,768]},{id:'21:9',w:21,h:9,image:[1344,576],video:[1120,480]}];
const sizes={
 '1:1':{image:[[512,512],[1024,1024],[1216,1216]],video:[[512,512],[640,640],[896,896]]},
 '16:9':{image:[[768,432],[1280,720],[1536,864]],video:[[512,288],[1024,576],[1536,864]]},
 '9:16':{image:[[432,768],[720,1280],[864,1536]],video:[[288,512],[576,1024],[864,1536]]},
 '4:3':{image:[[768,576],[1152,864],[1408,1056]],video:[[512,384],[768,576],[1024,768]]},
 '3:4':{image:[[576,768],[864,1152],[1056,1408]],video:[[384,512],[576,768],[768,1024]]},
 '21:9':{image:[[896,384],[1344,576],[1456,624]],video:[[672,288],[1120,480],[1568,672]]}
};
function options(video,level='medium'){const index={low:0,medium:1,high:2}[level]??1;return ratios.map(r=>({...r,size:sizes[r.id][video?'video':'image'][index].join('x')}))}
function videoSizes(){return ['low','medium','high'].flatMap(level=>options(true,level).map(r=>r.size.split('x').map(Number)))}
function resolve(video,width,height){const size=Number(width)+'x'+Number(height);for(const level of ['low','medium','high']){const found=options(video,level).find(r=>r.size===size);if(found)return{size,ratio:found.id,quality:level};}const ratio=ratios.reduce((best,r)=>Math.abs(Math.log(width/height/(r.w/r.h)))<Math.abs(Math.log(width/height/(best.w/best.h)))?r:best,ratios[0]);return{size,ratio:ratio.id,quality:'history'};}
const api={ratios,options,videoSizes,resolve};if(typeof module==='object'&&module.exports)module.exports=api;else root.ToolSizes=api;
})(globalThis);
