import workflow_open
import generation_backend
import microphone_alignment
"""MV Qwen-Image 2.1 first/last frame jobs, sharing the local ComfyUI queue."""
import json,time,uuid,io,re,subprocess
from pathlib import Path
from PIL import Image,ImageOps
import song_engine,video_engine
ACTIVE=video_engine.ACTIVE
BASE='http://127.0.0.1:8188'
def directory(folder):
 d=Path(folder)/'frame-jobs';d.mkdir(exist_ok=True);return d
def write(folder,j):
 from atomic_io import write_json
 write_json(directory(folder)/(j['id']+'.json'),j)

def read(folder,jid):
 if not re.fullmatch('[a-f0-9]{32}',str(jid)):raise ValueError('帧任务编号无效')
 return json.loads((directory(folder)/(jid+'.json')).read_text('utf-8'))
def build(p,sid,slot,method,names,jid):
 if slot not in ['first','last'] or method not in ['text_to_image','image_to_image']:raise ValueError('首尾帧生成方式无效')
 shot=video_engine.get_shot(p,sid);key='first_frame' if slot=='first' else 'last_frame';plan=shot['generation']['video_methods']['first_last_frames'][key][method]
 prompt=plan['prompt'];negative=plan.get('negative_prompt','')
 prompt=re.sub(r'<Picture\s+(\d+)>',lambda m:'<image'+m[1]+'>',prompt);prompt=re.sub(r'输入图\s*(\d+)',lambda m:'<image'+m[1]+'>',prompt)
 if names and not shot.get('generation',{}).get('composition_reference'):
  prompt+= '\n人物参考合图的多个角度只表示同一人，不保留白底或合图排版，参考图只用于身份、服装、灯光和场景材质，不继承全身或房间全景构图；输出严格按本镜提示词景别重新构图的单幅画面。' if slot=='first' else '\n输入图是当前镜头已采用的首帧，保留背景、人物、衣着、话筒和机位，只调整到描述的结束状态。'
 if shot.get('generation',{}).get('framing_policy')=='closeup':prompt+='\n最终构图要求：近景半身，胸口以上至头顶，脸和双肩占据画面主体，以轻侧机位看清眼神及嘴部侧缘，不改变话筒的真实拾音位置；下半身与地板均在画外。'
 if microphone_alignment.enabled(p,shot):prompt+='\n'+microphone_alignment.ZH;negative+=','+microphone_alignment.NEGATIVE
 width,height={'16:9':(1024,576),'9:16':(576,1024),'1:1':(768,768)}[p.get('ratio','16:9')];gw=(width+31)//32*32;gh=(height+31)//32*32
 def n(t,**i):return {'class_type':t,'inputs':i}
 enc=dict(clip=['2',0],vae=['3',0],prompt=prompt,negative_prompt=negative,resolution=768)
 seed=int(uuid.uuid4().hex[:12],16)
 graph={'1':n('UNETLoader',unet_name='Qwen\\qwen_image_2.1_int8_convrot.safetensors',weight_dtype='default'),'2':n('CLIPLoader',clip_name='Qwen\\qwen3vl_8b_int8_convrot.safetensors',type='qwen_image',device='default'),'3':n('VAELoader',vae_name='Qwen\\qwen_image_2.1_vae_bf16.safetensors'),'4':n('TextEncodeQwenImage21',**enc),'5':n('QwenImage21Cache',model=['1',0],device='cpu',dtype='int8'),'6':n('KSampler',model=['5',0],positive=['4',0],negative=['4',1],latent_image=['9',0],seed=seed,steps=40,cfg=1.0,sampler_name='euler',scheduler='simple',denoise=1.0),'7':n('VAEDecode',samples=['6',0],vae=['3',0]),'8':n('SaveImage',images=['7',0],filename_prefix='MVStudio-frames/'+p['id']+'/'+sid+'/'+slot+'/'+jid),'9':n('EmptyLatentImage',width=gw,height=gh,batch_size=1)}
 for i,name in enumerate(names):
  key=str(100+i);graph[key]=n('LoadImage',image=name);graph['4']['inputs']['images.image_'+str(i+1)]=[key,0]
 return graph,dict(width=width,height=height,generation_width=gw,generation_height=gh,seed=seed,steps=40,prompt=prompt,negative_prompt=negative,storyboard_revision=shot.get('storyboard_revision'))
def source_files(p,folder,sid,slot,method):
 if method=='text_to_image':return []
 if slot=='last':
  first=p.get('shot_frames',{}).get(sid,{}).get('first')
  if not first:raise ValueError('请先生成或上传并采用当前镜头的首帧')
  return [video_engine.local_image(p,folder,'/media/'+p['id']+'/'+first)]
 composition=video_engine.get_shot(p,sid).get('generation',{}).get('composition_reference')
 if composition:return [video_engine.local_image(p,folder,composition)]
 return video_engine.inputs(p,folder,sid,'reference_images')
@generation_backend.start_on('frame')
def start(p,folder,sid,slot,method='image_to_image'):
 with song_engine.GUARD:
  for f in directory(folder).glob('*.json'):
   if f.name.endswith(('-workflow.json','-progress.json')):continue
   j=json.loads(f.read_text('utf-8'))
   if j.get('shot_id')==sid and j.get('slot')==slot and j.get('status') in ACTIVE:return j
  files=source_files(p,folder,sid,slot,method);jid=uuid.uuid4().hex;g,meta=build(p,sid,slot,method,['pending.png']*len(files),jid)
  video_engine.check_models(g,song_engine.request('/object_info'));q=song_engine.request('/queue')
  if q.get('queue_running') or q.get('queue_pending'):raise ValueError('ComfyUI 正忙，等待当前任务完成后再生成帧')
  names=[video_engine.upload(f,jid,i) for i,f in enumerate(files)];g,meta=build(p,sid,slot,method,names,jid)
  video_engine.check_models(g,song_engine.request('/object_info'))
  j={'id':jid,'project_id':p['id'],'shot_id':sid,'slot':slot,'method':method,'status':'submitting','message':'提交Qwen首尾帧任务','created_at':time.time(),'model':'Qwen-Image 2.1',**meta,**generation_backend.metadata()}
  (directory(folder)/(jid+'-workflow.json')).write_text(json.dumps(g,ensure_ascii=False,indent=2),'utf-8');write(folder,j)
  node='C:/Users/rakis/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe';helper=Path(__file__).resolve().parent/'video-monitor.cjs'
  try:
   subprocess.Popen([node,str(helper),str(directory(folder)),jid,generation_backend.websocket(j),'frame'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=0x08000000)
   for _ in range(20):
    if (directory(folder)/(jid+'-progress.json')).exists():break
    time.sleep(.1)
  except OSError:pass
  try:
   result=song_engine.request('/prompt',{'prompt':g,'client_id':'mv-video-'+jid});j.update(prompt_id=result['prompt_id'],status='queued',message='首尾帧任务已提交')
  except ValueError as e:j.update(status='failed',message=str(e))
  except Exception as e:j.update(status='unknown',message='提交结果待确认，未自动重提：'+str(e))
  write(folder,j);return j
@generation_backend.job_bound
def refresh(folder,j):
 if j.get('cancel_requested'):
  import task_control
  return task_control.settle(folder,j,write)
 if j['status'] not in ACTIVE:return j
 if not j.get('prompt_id'):
  q=song_engine.request('/queue');h=song_engine.request('/history?max_items=100');items=q.get('queue_running',[])+q.get('queue_pending',[])+[x.get('prompt',[]) for x in h.values()]
  for item in items:
   if len(item)>3 and isinstance(item[3],dict) and item[3].get('client_id')=='mv-video-'+j['id']:j['prompt_id']=item[1];break
  if not j.get('prompt_id'):return j
 h=song_engine.request('/history/'+j['prompt_id']).get(j['prompt_id'])
 if h:
  state=h.get('status',{})
  if state.get('status_str')=='error':
   errors=[m[1].get('exception_message','') for m in state.get('messages',[]) if m[0]=='execution_error'];j.update(status='failed',message='首尾帧生成失败：'+('；'.join(errors) or '请查看ComfyUI'))
  elif state.get('completed'):
   images=h.get('outputs',{}).get('8',{}).get('images',[])
   if not images:raise ValueError('任务结束但没有图片')
   a=images[0];query={k:a[k] for k in ['filename','subfolder','type'] if k in a};data=video_engine.urllib.request.urlopen(generation_backend.base()+'/view?'+video_engine.urllib.parse.urlencode(query),timeout=60).read()
   filename='frame-'+j['id']+'.png';f=Path(folder)/filename
   with Image.open(io.BytesIO(data)) as im:ImageOps.fit(im.convert('RGB'),(j['width'],j['height']),method=Image.Resampling.LANCZOS).save(f.with_suffix('.tmp'),format='PNG')
   f.with_suffix('.tmp').replace(f);j.update(status='completed',message='帧图片已生成，可预览和采用',file=filename,finished_at=time.time())
 else:
  q=song_engine.request('/queue');running=any(x[1]==j['prompt_id'] for x in q.get('queue_running',[]));pending=any(x[1]==j['prompt_id'] for x in q.get('queue_pending',[]));j.update(status='running' if running else 'queued' if pending else 'unknown',message='Qwen正在生成帧图片' if running else '等待帧任务执行' if pending else '暂未找到任务，未自动重提')
 write(folder,j);return j
def listing(folder):
 with song_engine.GUARD:
  result=[]
  for f in directory(folder).glob('*.json'):
   if f.name.endswith(('-workflow.json','-progress.json')):continue
   try:
    j=json.loads(f.read_text('utf-8'))
    try:j=refresh(folder,j)
    except Exception as e:j['message']='查询暂未完成：'+str(e)
    try:j['progress']=json.loads((directory(folder)/(j['id']+'-progress.json')).read_text('utf-8'))
    except (OSError,ValueError):pass
    j['elapsed_seconds']=round(max(0,(j.get('finished_at') or time.time())-j['created_at']),1);j['workflow_links']=workflow_open.links(folder,'frame',j);result.append(j)
   except (OSError,ValueError):continue
  return sorted(result,key=lambda x:x['created_at'],reverse=True)
def link_frames(p):
 if p.get('endpoint_strategy','next_shot_first')!='next_shot_first':return p
 p['endpoint_strategy']='next_shot_first';p.get('suite',{}).get('shots',{}).setdefault('endpoint_generation_policy',{}).update(strategy='next_shot_first')
 shots=p.get('suite',{}).get('shots',{}).get('shots',[]);frames=p.setdefault('shot_frames',{})
 for i,shot in enumerate(shots):
  current=frames.setdefault(shot['shot_id'],{})
  if i+1<len(shots):
   next_id=shots[i+1]['shot_id'];current['last_from_shot']=next_id;last=frames.get(next_id,{}).get('first')
   if last:current['last']=last
   else:current.pop('last',None)
  else:current.pop('last',None);current.pop('last_from_shot',None)
 return p

def adopt(p,j):
 if j['status']!='completed':raise ValueError('帧图片尚未完成')
 sid=j['shot_id'];video_engine.get_shot(p,sid);name=j['file']
 if not any(x.get('file')==name for x in p['assets']):p['assets'].append({'name':sid+'_'+j['slot']+'.png','file':name})
 p.setdefault('shot_frames',{}).setdefault(sid,{})[j['slot']]=name
 p.setdefault('shot_frame_revisions',{}).setdefault(sid,{})[j['slot']]=j.get('storyboard_revision')
 history=p.setdefault('shot_frame_history',{}).setdefault(sid,{}).setdefault(j['slot'],[])
 if not any(x.get('job_id')==j['id'] for x in history):history.append({'job_id':j['id'],'file':name})
 return link_frames(p)

@generation_backend.cancel_bound(read)
def cancel(folder,jid,project_id):
 import task_control,sys
 return task_control.cancel(sys.modules[__name__],folder,jid,project_id)
