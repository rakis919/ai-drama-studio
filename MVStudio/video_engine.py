import workflow_open
import generation_backend
import microphone_alignment
"""Independent MV H3/Pika Flex video jobs using the installed local nodes."""
import json,uuid,time,copy,io,re,urllib.request,urllib.parse,subprocess,os
from pathlib import Path
from PIL import Image
import song_engine,connections,hashlib
BASE='http://127.0.0.1:8188'
ACTIVE={'preparing','submitting','queued','running','unknown','stopping'}
MONITOR_STARTED=set()
def request(route,data=None):return song_engine.request(route,data)
def directory(folder):
 d=Path(folder)/'video-jobs';d.mkdir(exist_ok=True);return d
def write(folder,j):
 from atomic_io import write_json
 write_json(directory(folder)/(j['id']+'.json'),j)

def read(folder,jid):
 if not re.fullmatch('[a-f0-9]{32}',str(jid)):raise ValueError('无效视频任务编号')
 return json.loads((directory(folder)/(jid+'.json')).read_text('utf-8'))
def get_shot(p,sid):
 shot=next((s for s in p.get('suite',{}).get('shots',{}).get('shots',[]) if s['shot_id']==sid),None)
 if not shot:raise ValueError('当前项目不存在该分镜')
 return shot
def local_image(p,folder,url):
 prefix='/media/'+p['id']+'/'
 if not isinstance(url,str) or not url.startswith(prefix):raise ValueError('参考图需要先导入当前 MV 项目')
 filename=url[len(prefix):]
 if Path(filename).name!=filename or not any(x.get('file')==filename for x in p.get('assets',[])):raise ValueError('参考图不属于当前项目')
 file=Path(folder)/filename
 with Image.open(file) as im:im.verify()
 return file
def inputs(p,folder,sid,method):
 shot=get_shot(p,sid)
 if method=='reference_images':
  refs=shot.get('picture_inputs',[])
  if not 1<=len(refs)<=9:raise ValueError('参考图视频需要 1–9 张真实图片')
  return [local_image(p,folder,r.get('path')) for r in refs]
 if method not in ['first_frame','first_last_frames']:raise ValueError('请选择有效视频生成方式')
 targets=[connections.source(p,sid)]
 if method=='first_last_frames':
  shots=p['suite']['shots']['shots'];index=next(i for i,x in enumerate(shots) if x['shot_id']==sid)
  if index+1<len(shots):targets.append(connections.source(p,shots[index+1]['shot_id']))
 names=[]
 for target in targets:
  revision=get_shot(p,target).get('storyboard_revision')
  if revision and p.get('shot_frame_revisions',{}).get(target,{}).get('first')!=revision:raise ValueError(target+' 首帧来自旧方案，请先复核并重新采用，或生成新首帧')
  name=p.get('shot_frames',{}).get(target,{}).get('first')
  if not name:raise ValueError('请先准备 '+target+' 首帧')
  names.append(name)
 return [local_image(p,folder,'/media/'+p['id']+'/'+name) for name in names]

def build(p,sid,method,names,jid,size):
 shot=get_shot(p,sid);duration=float(shot['duration_seconds'])
 if not 5<=duration<=12:raise ValueError('当前分镜生成支持5–12秒')
 # Orientation is exclusively controlled by the saved project, never by a shot request.
 quality={'landscape-small':'preview','portrait':'preview','landscape':'standard'}.get(size,size)
 ratio=p.get('ratio','16:9')
 landscape={'compact':(384,216),'preview':(512,288),'smooth':(640,360),'balanced':(768,432),'standard':(1024,576),'hd':(1280,720)}
 dimensions={'16:9':landscape,'9:16':{k:(h,w) for k,(w,h) in landscape.items()},'1:1':{k:(v,v) for k,v in zip(landscape,[384,512,640,768,896,1024])}}
 if ratio not in dimensions or quality not in dimensions[ratio]:raise ValueError('请在项目中选择有效画幅与生成清晰度')
 width,height=dimensions[ratio][quality]
 generation_width=(width+31)//32*32;generation_height=(height+31)//32*32
 prompt=shot.get('generation',{}).get('video_methods',{}).get(method,{}).get('video_prompt','')
 if not prompt:raise ValueError('该分镜缺少所选视频方案提示词')
 action=p.get('connection_settings',{}).get(sid,{}).get('action','').strip()
 if action:prompt+='\n镜头动作补充：'+action
 if microphone_alignment.enabled(p,shot):prompt+='\n'+microphone_alignment.EN
 if len(prompt)>30000:raise ValueError('视频提示词过长')
 frames=max(124,int(duration*24+.999))
 while frames%17!=5:frames+=1
 is_frame=method in ['first_frame','first_last_frames'];seed=int(uuid.uuid4().hex[:12],16)
 def n(t,**i):return {'class_type':t,'inputs':i}
 graph={'1':n('UNETLoader',unet_name='MiniMax\\minimax_h3_'+('fl2va' if is_frame else 'ref2va')+'_pruned_int8_convrot.safetensors',weight_dtype='default'),'2':n('LoraLoaderModelOnly',model=['1',0],lora_name='MiniMax\\pika_h3_flex_'+('fl2va' if is_frame else 'ref2va')+'_comfy_bf16.safetensors',strength_model=1.0),'3':n('CLIPLoader',clip_name='MiniMax\\qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',type='minimax',device='cpu'),'4':n('VAELoader',vae_name='MiniMax\\minimax_h3_video_vae_int8_convrot.safetensors'),'5':n('VAELoader',vae_name='MiniMax\\minimax_h3_audio_vae_fp32.safetensors'),'7':n('BasicGuider',model=['2',0],conditioning=['6',0]),'8':n('RandomNoise',noise_seed=seed),'9':n('KSamplerSelect',sampler_name='lcm'),'10':n('ManualSigmas',sigmas='1.0, 0.972973, 0.923077, 0.8, 0.571429, 0.333333, 0.0'),'11':n('SamplerCustomAdvanced',noise=['8',0],guider=['7',0],sampler=['9',0],sigmas=['10',0],latent_image=['6',1]),'12':n('VAEDecode',samples=['11',0],vae=['4',0]),'14':n('CreateVideo',images=['12',0],fps=24,bit_depth=8),'15':n('SaveVideo',video=['14',0],filename_prefix='MVStudio-videos/'+p['id']+'/'+sid+'/'+jid,format='mp4',codec='h264')}
 graph['6']=n('MiniMaxH3ImageToVideo' if is_frame else 'MiniMaxH3ReferenceToVideo',clip=['3',0],vae=['4',0],prompt=prompt,width=generation_width,height=generation_height,length=frames)
 if not is_frame:graph['6']['inputs'].update(audio_vae=['5',0],ref_image_size='match')
 for i,name in enumerate(names):
  key=str(100+i);graph[key]=n('LoadImage',image=name)
  field=('first_frame' if i==0 else 'last_frame') if is_frame else 'ref_images.ref_image_'+str(i)
  graph['6']['inputs'][field]=[key,0]
 return graph,{'duration_seconds':duration,'generated_frames':frames,'generated_duration_seconds':frames/24,'width':width,'height':height,'generation_width':generation_width,'generation_height':generation_height,'project_aspect_ratio':ratio,'quality':quality,'seed':seed,'steps':6,'prompt':prompt,'storyboard_revision':shot.get('storyboard_revision'),'connection_settings':copy.deepcopy(p.get('connection_settings',{}))}
def input_signature(p,sid,files,graph):
 normalized=copy.deepcopy(graph)
 for node in normalized.values():
  values=node.get('inputs',{})
  if 'noise_seed' in values:values['noise_seed']=0
  if node.get('class_type')=='LoadImage':values['image']='reference'
  if 'filename_prefix' in values:values['filename_prefix']='output'
 images=[]
 for file in files:
  with Image.open(file) as source:
   rgb=source.convert('RGB');images.append({'size':rgb.size,'pixels':hashlib.sha256(rgb.tobytes()).hexdigest()})
 shot=get_shot(p,sid);alignment=p.get('alignment',{})
 payload={'graph':normalized,'images':images,'revision':shot.get('storyboard_revision'),'start':shot.get('start_time_seconds'),'end':shot.get('end_time_seconds'),'audio_sha256':alignment.get('audio_sha256'),'alignment_revision':alignment.get('revision')}
 return hashlib.sha256(json.dumps(payload,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()

def reusable_adopted(p,folder,sid,method,size):
 # Deletion leaves the shot unassigned: never search historical versions to fill it.
 shot=next((s for s in p.get('shots',[]) if s.get('source_shot_id')==sid),None)
 if not shot or not shot.get('asset') or not shot.get('adopted_video_job_id'):return None
 try:j=read(folder,shot['adopted_video_job_id'])
 except (OSError,ValueError):return None
 if j.get('deleted') or j.get('status')!='completed' or j.get('file')!=shot['asset'] or not (Path(folder)/j['file']).is_file() or not j.get('input_signature'):return None
 if method=='first_last_frames' and sid==p['suite']['shots']['shots'][-1]['shot_id']:method='first_frame'
 if j.get('video_method')!=method:return None
 files=inputs(p,folder,sid,method);graph,_=build(p,sid,method,['reference']*len(files),'comparison',size)
 return j if j['input_signature']==input_signature(p,sid,files,graph) else None

def check_models(graph,info):
 for node in graph.values():
  cls=node['class_type']
  if cls not in info:raise ValueError('ComfyUI 缺少节点：'+cls)
  for key in ['unet_name','clip_name','vae_name','lora_name']:
   if key in node['inputs']:
    spec=info[cls].get('input',{}).get('required',{}).get(key,[]);opts=spec[0] if spec and isinstance(spec[0],list) else spec[1].get('options',[]) if len(spec)>1 and isinstance(spec[1],dict) else []
    if opts and node['inputs'][key] not in opts:
     wanted=node['inputs'][key].replace('\\','/').split('/')[-1].lower();matches=[x for x in opts if str(x).replace('\\','/').split('/')[-1].lower()==wanted]
     if len(matches)!=1:raise ValueError('所选设备缺少模型：'+node['inputs'][key])
     node['inputs'][key]=matches[0]
def upload(file,jid,i):
 with Image.open(file) as im:
  stream=io.BytesIO();im.convert('RGB').save(stream,format='PNG');data=stream.getvalue()
 boundary='mv'+uuid.uuid4().hex;name='mv-'+jid+'-'+str(i)+'.png'
 parts=[f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{name}"\r\nContent-Type: image/png\r\n\r\n'.encode(),data,f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\ninput\r\n--{boundary}--\r\n'.encode()]
 req=urllib.request.Request(generation_backend.base()+'/upload/image',data=b''.join(parts),headers={'Content-Type':'multipart/form-data; boundary='+boundary})
 value=json.load(urllib.request.urlopen(req,timeout=60));return (value.get('subfolder','')+'/' if value.get('subfolder') else '')+value['name']
def monitor(folder,j):
 if j['id'] in MONITOR_STARTED:return
 MONITOR_STARTED.add(j['id'])
 node='C:/Users/rakis/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
 helper=Path(__file__).resolve().parent/'video-monitor.cjs'
 try:
  subprocess.Popen([node,str(helper),str(directory(folder)),j['id'],generation_backend.websocket(j)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=0x08000000)
  progress=directory(folder)/(j['id']+'-progress.json')
  for _ in range(20):
   if progress.exists():break
   time.sleep(.1)
 except OSError:pass

def add_progress(folder,j):
 try:j['progress']=json.loads((directory(folder)/(j['id']+'-progress.json')).read_text('utf-8'))
 except (OSError,ValueError):j['progress']={'label':'连接实时进度中' if j['status'] in ACTIVE else j.get('message',''),'connected':False}
 if j['status'] in ACTIVE and not j['progress'].get('connected') and j['id'] not in MONITOR_STARTED:monitor(folder,j)
 j['elapsed_seconds']=round(max(0,(j.get('finished_at') or time.time())-j['created_at']),1)
 return j

@generation_backend.start_on('video')
def start(p,folder,sid,method,size):
 if p.get('endpoint_strategy','next_shot_first')=='next_shot_first' and method=='first_last_frames':
  import frame_engine
  p=frame_engine.link_frames(p)
  shots=p['suite']['shots']['shots']
  if sid==shots[-1]['shot_id']:method='first_frame'
 with song_engine.GUARD:
  for file in directory(folder).glob('*.json'):
   if file.name.endswith(('-workflow.json','-progress.json')):continue
   j=json.loads(file.read_text('utf-8'))
   if j.get('shot_id')==sid and j.get('status') in ACTIVE:return j
  files=inputs(p,folder,sid,method);jid=uuid.uuid4().hex
  graph,meta=build(p,sid,method,['pending-'+str(i)+'.png' for i in range(len(files))],jid,size)
  info=request('/object_info');check_models(graph,info)
  q=request('/queue')
  if q.get('queue_running') or q.get('queue_pending'):raise ValueError('ComfyUI 正忙，请空闲后再生成分镜；未打断其他任务')
  names=[upload(file,jid,i) for i,file in enumerate(files)];graph,meta=build(p,sid,method,names,jid,size)
  meta['input_signature']=input_signature(p,sid,files,graph)
  check_models(graph,info)
  (directory(folder)/(jid+'-workflow.json')).write_text(json.dumps(graph,ensure_ascii=False,indent=2),'utf-8')
  j={'id':jid,'project_id':p['id'],'shot_id':sid,'title':get_shot(p,sid).get('title',sid),'video_method':method,'status':'submitting','message':'正在提交本地 Pika H3 Flex','created_at':time.time(),'model':'Pika H3 Flex','device':'本机 ComfyUI 8188',**meta,**generation_backend.metadata()};write(folder,j)
  try:
   stats=request('/system_stats');j['gpu']=next((d.get('name') for d in stats.get('devices',[]) if d.get('type')=='cuda'),None);write(folder,j)
  except Exception:pass
  monitor(folder,j)
  try:
   result=request('/prompt',{'prompt':graph,'client_id':'mv-video-'+jid});j.update(prompt_id=result['prompt_id'],status='queued',message='视频已提交，等待所选设备生成')
  except ValueError as e:j.update(status='failed',message=str(e))
  except Exception as e:j.update(status='unknown',message='提交结果待确认，不会自动重复提交：'+str(e))
  write(folder,j);return j

@generation_backend.job_bound
def refresh(folder,j):
 if j.get('cancel_requested'):
  import task_control
  return task_control.settle(folder,j,write)
 if j['status'] not in ACTIVE:return j
 if not j.get('prompt_id'):
  q=request('/queue');items=q.get('queue_running',[])+q.get('queue_pending',[]);h=request('/history?max_items=100');items += [x.get('prompt',[]) for x in h.values()]
  for item in items:
   if len(item)>3 and isinstance(item[3],dict) and item[3].get('client_id')=='mv-video-'+j['id']:j['prompt_id']=item[1];break
  if not j.get('prompt_id'):return j
 h=request('/history/'+j['prompt_id']).get(j['prompt_id'])
 if h:
  state=h.get('status',{})
  if state.get('status_str')=='error':
   errors=[m[1].get('exception_message','') for m in state.get('messages',[]) if m[0]=='execution_error'];j.update(status='failed',message='生成失败：'+('；'.join(errors) or '请查看 ComfyUI 错误'))
  elif state.get('completed'):
   output=h.get('outputs',{}).get('15',{});candidates=[]
   for value in output.values():
    if isinstance(value,list):candidates += [x for x in value if isinstance(x,dict) and str(x.get('filename','')).lower().endswith('.mp4')]
   if not candidates:raise ValueError('任务结束但没有 MP4 输出')
   a=candidates[0];query={k:a[k] for k in ['filename','subfolder','type'] if k in a};name='video-'+j['id']+'.mp4';dest=Path(folder)/name
   with urllib.request.urlopen(generation_backend.base()+'/view?'+urllib.parse.urlencode(query),timeout=120) as response,dest.with_suffix('.tmp').open('wb') as out:
    while True:
     chunk=response.read(1024*1024)
     if not chunk:break
     out.write(chunk)
   if dest.with_suffix('.tmp').stat().st_size==0:raise ValueError('视频输出为空')
   if j.get('generation_width',j['width'])!=j['width'] or j.get('generation_height',j['height'])!=j['height']:
    ff='T:/AI/ComfyUI_1.3.5/.ext/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe';normalized=dest.with_suffix('.normalized.mp4')
    args=[ff,'-hide_banner','-y','-i',str(dest.with_suffix('.tmp')),'-vf',f"crop={j['width']}:{j['height']},setsar=1",'-an','-c:v','libx264','-preset','veryfast','-crf','18','-movflags','+faststart',str(normalized)]
    result=subprocess.run(args,capture_output=True,creationflags=0x08000000)
    if result.returncode:raise ValueError('分辨率处理失败：'+result.stderr.decode('utf-8','replace')[-1200:])
    normalized.replace(dest);dest.with_suffix('.tmp').unlink()
   else:dest.with_suffix('.tmp').replace(dest)
   j.update(status='completed',message='视频已完成，请预览后采用；精确口型需后续处理',file=name,finished_at=time.time(),bytes=dest.stat().st_size)
  else:j.update(status='running',message='Pika H3 Flex 正在生成视频')
 else:
  q=request('/queue')
  if any(x[1]==j['prompt_id'] for x in q.get('queue_running',[])):j.update(status='running',message='Pika H3 Flex 正在生成视频（6步采样）')
  elif any(x[1]==j['prompt_id'] for x in q.get('queue_pending',[])):j.update(status='queued',message='视频在本地队列中等待')
  else:j.update(status='unknown',message='任务暂未出现在队列或历史中，未自动重提')
 write(folder,j);return j

def listing(folder,include_deleted=False):
 with song_engine.GUARD:
  jobs=[]
  for file in directory(folder).glob('*.json'):
   if file.name.endswith(('-workflow.json','-progress.json')):continue
   try:
    j=json.loads(file.read_text('utf-8'))
    if j.get('deleted') and not include_deleted:continue
    try:j=refresh(folder,j)
    except Exception as e:j['message']='查询暂未完成：'+str(e)
    j['workflow_links']=workflow_open.links(folder,'video',j);jobs.append(add_progress(folder,j))
   except (OSError,ValueError):continue
  return sorted(jobs,key=lambda j:j['created_at'],reverse=True)

@generation_backend.cancel_bound(read)
def cancel(folder,jid,project_id):
 import task_control,sys
 return task_control.cancel(sys.modules[__name__],folder,jid,project_id)
