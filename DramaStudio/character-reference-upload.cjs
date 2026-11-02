const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const root=process.env.DRAMA_OUTPUT_ROOT||'D:/AIPlatform/Output/DramaStudio';
function binding(i,p){
 if(!p||p.deleted)throw Error('项目不存在或已删除');
 const type=i.resource_type||'character';
 if(type==='character'){
  const c=p.characters?.find(c=>String(c.id||c.character_id||c.name)===i.character_id);
  const fresh=i.new_reference===true&&typeof i.name==='string'&&i.name.trim()&&/^SPECIAL_[a-f0-9-]{36}$/.test(i.character_id);
  if(!c&&!fresh)throw Error('角色不属于当前项目');
  const angle=i.angle||'external';if(!['external','portrait','front','left','back'].includes(angle))throw Error('人物视角无效');
  return {resource_type:type,character_id:i.character_id,character_name:c?.name||i.name.slice(0,100),angle,mode:angle==='external'?'uploaded_reference':angle==='portrait'?'portrait':angle==='front'?'front':'multiview'};
 }
 if(type==='scene'){
  const scene=p.scenes?.find(s=>String(s.id||s.scene_id)===i.scene_id);if(!scene)throw Error('场景不属于当前项目');
  const view=i.view_key||'master';if(view!=='master'&&!scene.camera_anchors?.some(a=>a.id===view))throw Error('场景机位不存在');
  return {resource_type:'scene',character_id:i.scene_id,character_name:scene.name,view_key:view,mode:'uploaded_scene'};
 }
 if(type==='frame'){
  const shot=[...(p.shots||[]),...(p.shotScript?.generation_clips||[])].find(s=>String(s.shot_id||s.clip_id||s.id)===i.target_id);
  if(!shot||!['first','last'].includes(i.position))throw Error('首尾帧不属于当前镜头');
  return {resource_type:'scene',character_id:shot.scene_id,mode:'shot_frame',frame_context:{project_id:i.project_id,target_id:i.target_id,scene_id:shot.scene_id,position:i.position,method:'external_upload'}};
 }
 throw Error('不支持的图片类型');
}
async function handle(req,res){const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};let dir;
 try{
  if(req.method!=='POST')throw Error('仅支持上传');
  if(req.headers.origin&&req.headers.origin!==new URL('http://'+req.headers.host).origin)throw Error('请求来源无效');
  let text='';for await(const b of req){text+=b;if(Buffer.byteLength(text)>15*1024*1024)throw Error('图片不能超过10MB');}
  const i=JSON.parse(text),store=require('./project-store.cjs');
  const resource=binding(i,store.readProject(i.project_id).project);
  const upload=await require('./quick-tools-api.cjs').uploadImage({image:i.image});
  const toolRoot=process.env.DRAMA_TOOL_ROOT||path.join(root,'Tools');
  const meta=JSON.parse(fs.readFileSync(path.join(toolRoot,'Uploads',upload.id+'.json'),'utf8'));
  const input=path.join(toolRoot,'Uploads',upload.id+'.'+meta.ext),id=crypto.randomUUID();dir=path.join(root,'FrontImages',id);fs.mkdirSync(dir,{recursive:true});
  const code='from PIL import Image,ImageOps; import sys,json; im=Image.open(sys.argv[1]); assert im.width*im.height<=50000000,"图片像素过大"; im=ImageOps.exif_transpose(im); im.convert("RGB").save(sys.argv[2],format="PNG"); print(json.dumps([im.width,im.height]))';
  const result=await promisify(execFile)('T:/AI/ComfyUI_1.3.5/.ext/python.exe',['-c',code,input,path.join(dir,'front.png')],{windowsHide:true,timeout:20000});
  const [width,height]=JSON.parse(result.stdout.trim());
  // Revalidate after decoding, before publishing an asset for a removed entity.
  binding(i,store.readProject(i.project_id).project);
  const now=new Date().toISOString(),job={id,status:'completed',...resource,project_id:i.project_id,width,height,reference_layout:i.layout==='multi'?'multi':'single',created_at:now,finished_at:now,image_url:'/api/front-image/'+id+'/image',uploaded:true};
  fs.writeFileSync(path.join(dir,'job.json'),JSON.stringify(job,null,2));json(200,job);
 }catch(e){if(dir)fs.rmSync(dir,{recursive:true,force:true});json(400,{error:e.message});}
}
module.exports={handle,binding};
