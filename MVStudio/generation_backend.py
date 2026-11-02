"""Job-bound MV local / shared LightCC routing. Songs retain the local engine."""
import contextvars,functools,json,threading,urllib.request,urllib.error,time
LOCAL='http://127.0.0.1:8188';CLOUD='http://127.0.0.1:18191'
CURRENT=contextvars.ContextVar('mv_generation_backend',default={})
PREPARE={'status':'idle'};LOCK=threading.Lock()
def bridge(route,data=None,timeout=20):
 req=urllib.request.Request('http://127.0.0.1:4173/api/lightcc'+route,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'})
 try:return json.load(urllib.request.urlopen(req,timeout=timeout))
 except urllib.error.HTTPError as e:
  try:message=json.loads(e.read()).get('error',str(e))
  except Exception:message=str(e)
  raise ValueError(message)
 except OSError as e:raise ConnectionError('无法连接短剧的 LightCC 管理服务（4173）：'+str(e))
def base():
 state=CURRENT.get()
 if state.get('execution_backend')=='lightcc':verify(state)
 return state.get('backend_url',LOCAL)
def websocket(j):return j.get('backend_url',LOCAL).replace('http://','ws://')
def metadata():return dict(CURRENT.get())
def verify(j):
 if j.get('execution_backend')!='lightcc' or j.get('status') in ['completed','failed','cancelled']:return
 gateway=bridge('/gateway-state')
 if not gateway.get('connected') or str(gateway.get('applicationId'))!=str(j.get('cloud_instance_id')):raise ValueError('本任务所属LightCC实例未连接或已切换；请连接原实例后再查询或停止，未向其他实例提交请求')
def start_on(kind):
 def decorate(fn):
  @functools.wraps(fn)
  def wrapped(p,*args,**kwargs):
   device=p.get('generation_device') or p.get('generation_devices',{}).get('video') or p.get('generation_devices',{}).get('frame','local');meta={'execution_backend':'local','backend_url':LOCAL,'device':'本机 ComfyUI 8188'}
   if device=='lightcc':
    gateway=bridge('/gateway-state');selection=bridge('/selection').get('selection')
    if not selection:raise ValueError('请先在LightCC管理页选择镜像和GPU')
    if not gateway.get('connected'):raise ValueError('LightCC尚未连接，请点击“连接/启动所选GPU”')
    if gateway.get('selectionId')!=selection['id'] or str(gateway.get('selectedApplicationId'))!=str(gateway['applicationId']):raise ValueError('当前连接与所选GPU不同，请先点击“连接/启动所选GPU”')
    meta={'execution_backend':'lightcc','backend_url':CLOUD,'device':'LightCC · '+selection['gpu'],'cloud_instance_id':str(gateway['applicationId']),'cloud_selection_id':selection['id']}
   token=CURRENT.set(meta)
   try:return fn(p,*args,**kwargs)
   finally:CURRENT.reset(token)
  return wrapped
 return decorate
def job_bound(fn):
 @functools.wraps(fn)
 def wrapped(folder,j,*args,**kwargs):
  verify(j);token=CURRENT.set({k:j[k] for k in ['execution_backend','backend_url','device','cloud_instance_id','cloud_selection_id'] if k in j})
  previous=j.get('status')
  try:
   result=fn(folder,j,*args,**kwargs)
   if result.get('execution_backend')=='lightcc' and result.get('status')=='completed' and previous!='completed':
    try:bridge('/mv-completed',{'project_id':result['project_id'],'job_id':result['id'],'kind':'frame' if 'slot' in result else 'video'})
    except (ValueError,ConnectionError):pass
   return result
  finally:CURRENT.reset(token)
 return wrapped
def cancel_bound(read):
 def decorate(fn):
  @functools.wraps(fn)
  def wrapped(folder,jid,*args,**kwargs):
   j=read(folder,jid);verify(j);token=CURRENT.set({k:j[k] for k in ['execution_backend','backend_url','device','cloud_instance_id','cloud_selection_id'] if k in j})
   try:return fn(folder,jid,*args,**kwargs)
   finally:CURRENT.reset(token)
  return wrapped
 return decorate
def status():
 state=bridge('/status');state['selection']=bridge('/selection').get('selection');state['prepare']=dict(PREPARE);return state

def prepare(data):
 global PREPARE
 if data.get('confirm') is not True:raise ValueError('请确认所选GPU及费率后启动')
 selection=bridge('/selection').get('selection')
 if not selection or selection['id']!=data.get('cloud_selection_id'):raise ValueError('GPU选择已改变，请刷新后重新确认')
 with LOCK:
  if PREPARE.get('status')=='running':return dict(PREPARE)
  PREPARE={'status':'running','message':'正在连接/启动所选GPU，请等待云端服务就绪'}
 def work():
  global PREPARE
  try:
   result=bridge('/manual-start',{'confirm':True,'cloudSelectionId':selection['id']},timeout=960)
   PREPARE={'status':'completed','message':'LightCC已连接，可提交MV生图和视频'}
  except Exception as e:PREPARE={'status':'failed','message':str(e)}
 threading.Thread(target=work,daemon=True).start();return dict(PREPARE)


def capabilities():
 try:info=json.load(urllib.request.urlopen(CLOUD+'/object_info',timeout=30))
 except OSError as e:raise ConnectionError('请先连接LightCC，再检查MV模型：'+str(e))
 specs={
 'frame':({'TextEncodeQwenImage21','QwenImage21Cache','KSampler','VAEDecode','SaveImage','EmptyLatentImage','LoadImage'}, [('UNETLoader','unet_name','qwen_image_2.1_int8_convrot.safetensors'),('CLIPLoader','clip_name','qwen3vl_8b_int8_convrot.safetensors'),('VAELoader','vae_name','qwen_image_2.1_vae_bf16.safetensors')]),
 'video':({'MiniMaxH3ImageToVideo','MiniMaxH3ReferenceToVideo','CreateVideo','SaveVideo','LoadImage','BasicGuider','RandomNoise','KSamplerSelect','ManualSigmas','SamplerCustomAdvanced','VAEDecode'}, [('UNETLoader','unet_name','minimax_h3_fl2va_pruned_int8_convrot.safetensors'),('UNETLoader','unet_name','minimax_h3_ref2va_pruned_int8_convrot.safetensors'),('LoraLoaderModelOnly','lora_name','pika_h3_flex_fl2va_comfy_bf16.safetensors'),('LoraLoaderModelOnly','lora_name','pika_h3_flex_ref2va_comfy_bf16.safetensors'),('CLIPLoader','clip_name','qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'),('VAELoader','vae_name','minimax_h3_video_vae_int8_convrot.safetensors'),('VAELoader','vae_name','minimax_h3_audio_vae_fp32.safetensors')])}
 result={}
 for kind,(nodes,models) in specs.items():
  missing=['缺少节点 '+n for n in sorted(nodes-set(info))]
  for cls,key,name in models:
   spec=info.get(cls,{}).get('input',{}).get('required',{}).get(key,[]);opts=spec[0] if spec and isinstance(spec[0],list) else spec[1].get('options',[]) if len(spec)>1 and isinstance(spec[1],dict) else []
   if not any(str(x).replace('\\','/').split('/')[-1].lower()==name.lower() for x in opts):missing.append('缺少模型 '+name)
  result[kind]={'ready':not missing,'missing':missing}
 return result


def runtime(root):
 from datetime import datetime,timezone
 from pathlib import Path
 state=bridge('/runtime');jobs=[]
 for kind,sub in [('frame','frame-jobs'),('video','video-jobs')]:
  for file in Path(root).glob('*/'+sub+'/*.json'):
   if file.name.endswith(('-workflow.json','-progress.json')):continue
   try:
    j=json.loads(file.read_text('utf-8'))
    if j.get('execution_backend')!='lightcc':continue
    progress_file=file.with_name(j['id']+'-progress.json')
    try:j['progress']=json.loads(progress_file.read_text('utf-8'))
    except (OSError,ValueError):pass
    j['kind']=kind;jobs.append(j)
   except (ValueError,OSError,KeyError):continue
 active=[j for j in jobs if j.get('status') not in ['completed','failed','cancelled']]
 latest=max(active or jobs,key=lambda j:j.get('created_at',0),default=None)
 shared=state.get('job');shared_active=shared and shared.get('status') not in ['completed','failed','cancelled','draft']
 if latest and (active or not shared_active):
  j=latest;progress=j.get('progress',{});created=j.get('created_at',time.time());end=j.get('finished_at',time.time())
  state['job']={'id':j['id'],'status':j['status'],'label':progress.get('label') or j.get('message'),'progress':progress,'timing':{'elapsed_seconds':max(0,end-created)},'error':j.get('message') if j['status']=='failed' else None,'createdAt':datetime.fromtimestamp(created,timezone.utc).isoformat(),'target':j.get('shot_id'),'kind':j['kind'],'steps':j.get('steps',6 if j['kind']=='video' else 40),'mv_project_id':j['project_id'],'videoUrl':'/media/'+j['project_id']+'/'+j['file'] if j.get('status')=='completed' and j.get('file') else None}
 return state
