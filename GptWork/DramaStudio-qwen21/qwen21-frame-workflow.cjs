const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const PORT=8188,MODEL='qwen-image-2.1',runtime='T:/AI/ComfyUI_1.3.5';
function matches(input){return input.image_model===MODEL;}
function baseSize(width,height){const factor=Math.min(1,1536/Math.max(width,height),Math.sqrt((768*768)/(width*height)));return{width:Math.max(32,Math.round(width*factor/32)*32),height:Math.max(32,Math.round(height*factor/32)*32)};}
function promptFor(input){
 const labels=input.reference_labels||[],map=new Map(labels.map((r,i)=>[r.picture,'<image'+(i+1)+'>']));
 let text=String(input.prompt).replace(/<Picture\s+\d+>/gi,tag=>map.get(tag)||(!labels.length?tag.replace(/<Picture\s+(\d+)>/i,'<image$1>'):tag)).replace(/输入图\s*(\d+)/g,(_,n)=>'<image'+n+'>');
 if((input.reference_source||input.frame_binding?.reference_source)==='generated_first_frame'||(labels.length>=1&&/构图底图|完整客厅画面/.test(String(input.prompt)))){text='以<image1>这张完整的室内摄影画面为编辑基础。完整保留原图中的房间背景、墙面、地板、门窗、家具、庭院、光照和全部人物，只执行以下局部动作或表情修改。保持相同机位、镜头和构图。\n'+text+'\n输出仍然是有完整房间环境的真人室内摄影画面，人物自然坐在这个房间中。';}else if(labels.length>1)text+='\n参考图输入顺序：'+labels.map((r,i)=>'<image'+(i+1)+'>：'+r.name).join('；')+'。';
 if(input.background_lock?.enabled)text='以<image1>为固定场景底图，保持图1的机位、构图及家具物体原位置；仅增加或调整指定人物，忽略其余文本中改变机位的要求。\n'+text;
 // Negative instructions stay in the negative conditioning; never append them to the positive prompt.
 return text;
}
function buildGraph(input,id,uploaded){
 const refs=Array.isArray(uploaded)?uploaded:uploaded?[uploaded]:[];
 if(input.kind==='image-image'&&(!refs.length||refs.length>16))throw Error('Qwen-Image-2.1 需要1–16张参考图');
 const size=input.size_mode?{width:input.native_width,height:input.native_height}:baseSize(input.width,input.height),encode={clip:['2',0],vae:['3',0],prompt:promptFor(input),negative_prompt:input.negative_prompt||'',resolution:768};
 const graph={
  '1':{class_type:'UNETLoader',inputs:{unet_name:"Qwen\\qwen_image_2.1_int8_convrot.safetensors",weight_dtype:'default'}},
  '2':{class_type:'CLIPLoader',inputs:{clip_name:"Qwen\\qwen3vl_8b_int8_convrot.safetensors",type:'qwen_image',device:'default'}},
  '3':{class_type:'VAELoader',inputs:{vae_name:"Qwen\\qwen_image_2.1_vae_bf16.safetensors"}},
  '4':{class_type:'TextEncodeQwenImage21',inputs:encode},
  '5':{class_type:'QwenImage21Cache',inputs:{model:['1',0],device:'cpu',dtype:'int8'}},
  '6':{class_type:'KSampler',inputs:{model:['5',0],positive:['4',0],negative:['4',1],latent_image:['21latent',0],seed:crypto.randomInt(1,2**48-1),steps:40,cfg:1,sampler_name:'euler',scheduler:'simple',denoise:1}},
  '7':{class_type:'VAEDecode',inputs:{samples:['6',0],vae:['3',0]}},
  '8':{class_type:'SaveImage',inputs:{images:['7',0],filename_prefix:'DramaStudio/ShotFrames/'+id}},
  '21latent':{class_type:'EmptyLatentImage',inputs:{...size,batch_size:1}}
 };
 refs.forEach((image,i)=>{const node=String(100+i);graph[node]={class_type:'LoadImage',inputs:{image}};encode['images.image_'+(i+1)]=[node,0];});
 if(refs.length){graph['6'].inputs.latent_image=['4',2];delete graph['21latent'];}
 if(input.camera_lora?.enabled){const name=input.camera_lora.name,strength=Number(input.camera_lora.strength??0.9);if(name!=='qwen21_multiple_angles_v2_step1500.safetensors'||!Number.isFinite(strength)||strength<0||strength>1.5)throw Error('无效的Qwen2.1机位LoRA配置');graph['camera_lora']={class_type:'LoraLoaderModelOnly',inputs:{model:['1',0],lora_name:name,strength_model:strength}};graph['5'].inputs.model=['camera_lora',0];}
 return graph;
}
let launching;
async function ready(){try{const r=await fetch('http://127.0.0.1:'+PORT+'/system_stats',{signal:AbortSignal.timeout(1500)});return r.ok&&!!(await r.json()).system;}catch{return false;}}
async function ensureRunning(){if(await ready())return;if(launching)return launching;launching=(async()=>{
 const python=path.join(runtime,'.ext/python.exe'),entry=path.join(runtime,'tools/ComfyUI-Runtime.py');if(!fs.existsSync(python)||!fs.existsSync(entry))throw Error('ComfyUI 启动文件不存在');
 const out=fs.openSync('D:/AIPlatform/GptWork/ComfyUI-Unify-20261030/qwen-autostart.log','a'),err=fs.openSync('D:/AIPlatform/GptWork/ComfyUI-Unify-20261030/qwen-autostart-error.log','a');
 try{const child=spawn(python,['-s','-u',entry,'--listen','127.0.0.1','--port',String(PORT),'--disable-pinned-memory'],{cwd:runtime,windowsHide:true,detached:true,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},stdio:['ignore',out,err]});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});child.unref();}finally{fs.closeSync(out);fs.closeSync(err);}
 for(let i=0;i<45;i++){if(await ready())return;await new Promise(r=>setTimeout(r,1000));}throw Error('Qwen-Image-2.1 启动超时，请打开 D:\\AIPlatform\\GptWork\\启动_Qwen-Image-2.1.lnk 后重试');
 })().finally(()=>launching=null);return launching;}
module.exports={PORT,MODEL,matches,baseSize,promptFor,buildGraph,ensureRunning};

