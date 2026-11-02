(function(root){
  const spec={version:3,generation_order:['portrait','front','left','back'],identity_reference:'portrait',view_sizes:{portrait:{width:1024,height:1440},front:{width:512,height:1440},left:{width:512,height:1440},back:{width:512,height:1440}},layout:'portrait_front_side_back',background:'white',width:2560,height:1440,
    panels:[{angle:'portrait',label:'正面半身大头像',x:0,width:0.4},{angle:'front',label:'全身正面',x:0.4,width:0.2},{angle:'left',label:'单个90°侧面',x:0.6,width:0.2},{angle:'back',label:'全身背面',x:0.8,width:0.2}],
    prompt:'以已确认正面图为唯一身份参考，保持同一人物的身份、五官、发型、服装、配色、身材比例与写实风格一致。均匀纯白摄影棚背景（#FFFFFF），不要灰底、灰色渐变、暗角或矩形底块，柔和均匀光照，高清细节。单幅只出现同一个人物的一个视角，不要额外人物、文字、水印、拼图或第二个侧面。',
    sheet_prompt:'横向白底人物设定母图，左侧40%为高清正面半身大头像，右侧依次为全身正面、单个严格90度侧面、全身背面，各占20%。四个区域展示同一个人物，身份、五官、发型、服装、身材比例与写实风格一致。只要一个侧面，不要左右两个侧面，不要额外人物或文字。',
    video_policy:'合照可作为 H3 Ref2VA 人物身份参考；图生视频首帧请使用单张画面，或先裁剪单视图。'};
  function panelRect(angle,width,height){const p=spec.panels.find(p=>p.angle===angle);if(!p)throw Error('无效视角');const x=Math.round(p.x*width);return{x,y:0,width:Math.round((p.x+p.width)*width)-x,height};}
  function cropRect(rect,width,height){const values=['x','y','width','height'].map(k=>Number(rect[k]));if(!values.every(Number.isFinite))throw Error('裁剪坐标无效');const [x,y,w,h]=values.map(Math.round);if(x<0||y<0||w<1||h<1||x+w>width||y+h>height)throw Error('裁剪范围必须位于原图内');return{x,y,width:w,height:h};}
  const api={spec,panelRect,cropRect};if(typeof module==='object'&&module.exports)module.exports=api;else root.CharacterSheet=api;
})(globalThis);
