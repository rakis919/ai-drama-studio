const {negative}=require('./dist/image-negative-spec.js');
function sceneContext(value){return String(value||'').replace(/动画角色造型美感/g,'精致建筑与环境造型').replace(/精致三维人物建模/g,'精致三维环境建模').split(/[。；;\n]/).filter(s=>!/(弟子|沈砚|陆承锋|角色|人物|剑气|剑光|反击|闪避|震退|\d+(?:\.\d+)?秒|断梁|碎裂)/.test(s)).join('。');}
function apply(graph,input,prompt){
 const negative_prompt=negative(input),qwen=Object.values(graph).some(n=>n.class_type==='TextEncodeQwenImageEditPlus');
 if(qwen&&input.resource_type!=='scene'){
   graph['2']={class_type:'LoraLoaderModelOnly',inputs:{model:['1',0],lora_name:"Qwen\\Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors",strength_model:1},_meta:{title:'人物角度 · Lightning 4步加速 LoRA'}};
   graph['3'].inputs.model=['2',0];
   const positive=Object.values(graph).find(n=>n.class_type==='TextEncodeQwenImageEditPlus');positive.inputs.prompt=prompt;
   graph['90']={class_type:'TextEncodeQwenImageEditPlus',inputs:{...positive.inputs,prompt:negative_prompt},_meta:{title:'负面提示词（保留；4步 CFG 1 不启用引导）'}};
   if(graph['8']?.class_type==='ConditioningZeroOut')delete graph['8'];
   for(const n of Object.values(graph))if(n.class_type==='KSampler'){Object.assign(n.inputs,{negative:['90',0],cfg:1,steps:4,sampler_name:'euler',scheduler:'simple'});n._meta={...(n._meta||{}),title:'人物角度 · Lightning 4步 · CFG 1'};}
   return {prompt,negative_prompt,negative_applied:false,negative_mode:'stored_only_accelerated',exclusion_applied:false,steps:4,cfg:1};
 }
 if(qwen){
   const steps=input.resource_type==='scene'?12:40;
   // Standard Qwen guidance: do not combine a four-step Lightning adapter with CFG sampling.
   if(graph['2']?.class_type==='LoraLoaderModelOnly'){delete graph['2'];graph['3'].inputs.model=['1',0];}
   const positive=Object.values(graph).find(n=>n.class_type==='TextEncodeQwenImageEditPlus');
   positive.inputs.prompt=prompt;
   positive._meta={...(positive._meta||{}),title:'正向提示词'};
   graph['90']={class_type:'TextEncodeQwenImageEditPlus',inputs:{...positive.inputs,prompt:negative_prompt},_meta:{title:'负面提示词 · 已连接采样器'}};
   if(graph['8']?.class_type==='ConditioningZeroOut')delete graph['8'];
   for(const n of Object.values(graph))if(n.class_type==='KSampler'){Object.assign(n.inputs,{negative:['90',0],cfg:4,steps,sampler_name:'euler',scheduler:'simple'});n._meta={...(n._meta||{}),title:'Qwen 正负面采样 · '+steps+'步 · CFG 4'};}
   return {prompt,negative_prompt,negative_applied:true,negative_mode:'cfg',exclusion_applied:false,steps,cfg:4};
 }
 const positive=Object.values(graph).find(n=>n.class_type==='CLIPTextEncode');
 positive.inputs.text=prompt;
 positive._meta={...(positive._meta||{}),title:'正向提示词'};
 graph['33']={class_type:'CLIPTextEncode',inputs:{clip:positive.inputs.clip,text:negative_prompt},_meta:{title:'负面提示词 · 已连接采样器'}};
 for(const n of Object.values(graph))if(n.class_type==='KSampler'){Object.assign(n.inputs,{negative:['33',0],cfg:1.5,steps:12});n._meta={...(n._meta||{}),title:'Turbo 正负面采样 · 12步 · CFG 1.5'};}
 return {prompt,negative_prompt,negative_applied:true,negative_mode:'cfg_low_guidance',exclusion_applied:false,steps:Object.values(graph).find(n=>n.class_type==='KSampler')?.inputs.steps,cfg:1.5};
}
module.exports={negative,sceneContext,apply};
