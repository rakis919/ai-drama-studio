(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ImageNegativeSpec=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const common='文字，水印，标志，模糊，低清晰度，过曝，过度锐化';
 const character='额外人物，背景人物，重复人物，分身，拼图，畸形五官，额外肢体，塑料皮肤';
 const scene='人物，人群，背景小人，人影，剪影，人体，脸，手持武器，打斗，剑光，飞散碎石，动态特效';
 function negative(input){return [...new Set((common+'，'+(input.resource_type==='scene'?scene:character)+'，'+(input.negative_prompt||'')).split(/[，,；;\n]+/).map(s=>s.trim()).filter(Boolean))].join('，');}
 return {negative};
});
