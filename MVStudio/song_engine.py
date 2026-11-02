"""Local ACE-Step jobs. Never cancels other tasks or automatically resubmits."""
import json,uuid,time,threading,urllib.request,urllib.parse,urllib.error,copy,math
from pathlib import Path
BASE='http://127.0.0.1:8188';GUARD=threading.Lock()
ACTIVE={'submitting','queued','running','unknown','stopping'}
def request(path,data=None,timeout=12):
 req=urllib.request.Request(__import__("generation_backend").base()+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'})
 try:return json.load(urllib.request.urlopen(req,timeout=timeout))
 except urllib.error.HTTPError as e:raise ValueError('ComfyUI 拒绝请求：'+e.read().decode('utf-8','replace')[-1600:])
 except (OSError,urllib.error.URLError) as e:raise ConnectionError('无法连接所选生成设备：'+str(e))
def jobs_dir(folder):
 d=Path(folder)/'song-jobs';d.mkdir(exist_ok=True);return d
def write(folder,j):
 from atomic_io import write_json
 write_json(jobs_dir(folder)/(j['id']+'.json'),j)

def read(folder,jid):
 if not isinstance(jid,str) or len(jid)!=32 or any(c not in '0123456789abcdef' for c in jid):raise ValueError('无效歌曲任务')
 return json.loads((jobs_dir(folder)/(jid+'.json')).read_text('utf-8'))
def build(p,jid):
 if not p.get('suite'):raise ValueError('请先导入包含 song.json 的 MV 制作方案')
 song=p['suite']['song'];s=song.get('style',{});duration=float(song.get('duration_seconds',60));bpm=int(s.get('bpm',76))
 if not math.isfinite(duration) or not 10<=duration<=360:raise ValueError('当前入口支持 10–360 秒歌曲')
 if not 10<=bpm<=300:raise ValueError('BPM 须为10–300')
 language=song.get('language',{}).get('code','zh-CN');language={'zh-CN':'zh','zh-TW':'zh'}.get(language,language)
 key=s.get('key','C major').replace('Major','major').replace('Minor','minor')
 if key not in [r+' '+q for r in ['C','C#','Db','D','D#','Eb','E','F','F#','Gb','G','G#','Ab','A','A#','Bb','B'] for q in ['major','minor']]:raise ValueError('调性请使用 C major 或 A minor 等节点支持格式')
 prompt=s.get('style_prompt_en') or s.get('style_prompt_zh')
 if not prompt:raise ValueError('请先填写歌曲风格')
 prompt+=' Instrumentation: '+', '.join(s.get('instruments',[]))+'. Vocal direction: '+str(s.get('vocal',''))
 lyrics='' if song.get('instrumental') else song.get('lyrics_text','')
 if not song.get('instrumental') and not lyrics.strip():raise ValueError('请先填写歌词')
 seed=int(uuid.uuid4().hex[:12],16)
 def n(t,**inputs):return {'class_type':t,'inputs':inputs}
 graph={'1':n('UNETLoader',unet_name='ACE-Step\\acestep_v1.5_turbo.safetensors',weight_dtype='default'),'2':n('DualCLIPLoader',clip_name1='Qwen\\qwen_0.6b_ace15.safetensors',clip_name2='Qwen\\qwen_1.7b_ace15.safetensors',type='ace',device='default'),'3':n('VAELoader',vae_name='ACE-Step\\ace_1.5_vae.safetensors'),'4':n('TextEncodeAceStepAudio1.5',clip=['2',0],tags=prompt,lyrics=lyrics,seed=seed,bpm=bpm,duration=duration,timesignature=str(s.get('time_signature','4/4')).split('/')[0],language=language,keyscale=key,generate_audio_codes=True,cfg_scale=2.0,temperature=.85,top_p=.9,top_k=0,min_p=0.0),'5':n('ConditioningZeroOut',conditioning=['4',0]),'6':n('EmptyAceStep1.5LatentAudio',seconds=duration,batch_size=1),'7':n('ModelSamplingAuraFlow',model=['1',0],shift=3.0),'8':n('KSampler',model=['7',0],seed=seed,steps=8,cfg=1.0,sampler_name='euler',scheduler='simple',positive=['4',0],negative=['5',0],latent_image=['6',0],denoise=1.0),'9':n('VAEDecodeAudio',samples=['8',0],vae=['3',0]),'10':n('SaveAudioMP3',audio=['9',0],filename_prefix='MVStudio-songs/'+p['id']+'/'+jid,quality='320k')}
 return graph,seed

def start(p,folder):
 with GUARD:
  for file in jobs_dir(folder).glob('*.json'):
   if file.name.endswith('-workflow.json'):continue
   old=json.loads(file.read_text('utf-8'))
   if old['status'] in ACTIVE:return old
  queue=request('/queue')
  if queue.get('queue_running') or queue.get('queue_pending'):raise ValueError('ComfyUI 正在处理其他任务，请空闲后再生成歌曲；未打断现有任务')
  jid=uuid.uuid4().hex;graph,seed=build(p,jid)
  info=request('/object_info/TextEncodeAceStepAudio1.5');meta=info.get('TextEncodeAceStepAudio1.5',{});options=meta.get('input',{}).get('required',{}).get('language',[None,{}])[1].get('options',[])
  if options and graph['4']['inputs']['language'] not in options:raise ValueError('当前节点不支持该演唱语言')
  j={'id':jid,'project_id':p['id'],'title':p['suite']['song'].get('title',p['title']),'status':'submitting','message':'正在提交本地歌曲任务','created_at':time.time(),'seed':seed,'duration_seconds':graph['6']['inputs']['seconds'],'song_snapshot':copy.deepcopy(p['suite']['song'])}
  (jobs_dir(folder)/(jid+'-workflow.json')).write_text(json.dumps(graph,ensure_ascii=False,indent=2),'utf-8')
  write(folder,j)
  try:
   result=request('/prompt',{'prompt':graph,'client_id':'mvstudio-song-'+jid},30)
   if not result.get('prompt_id'):raise ValueError('ComfyUI 未返回任务编号')
   j.update(prompt_id=result['prompt_id'],status='queued',message='已提交本地 ACE-Step，等待生成')
  except ValueError as e:j.update(status='failed',message=str(e))
  except Exception as e:j.update(status='unknown',message='提交结果暂未确认，为避免重复生成不会自动重试：'+str(e))
  write(folder,j);return j

def refresh(folder,j):
 if j.get('cancel_requested'):
  import task_control
  return task_control.settle(folder,j,write)
 if j['status'] not in ACTIVE:return j
 if not j.get('prompt_id'):
  # Recover uncertain submissions by their unique client ID in queue/history.
  q=request('/queue');items=q.get('queue_running',[])+q.get('queue_pending',[])
  history=request('/history?max_items=100')
  items += [x.get('prompt',[]) for x in history.values()]
  for item in items:
   if len(item)>3 and item[3].get('client_id')=='mvstudio-song-'+j['id']:j['prompt_id']=item[1];break
  if not j.get('prompt_id'):return j
 result=request('/history/'+j['prompt_id']).get(j['prompt_id'])
 if result:
  state=result.get('status',{});messages=state.get('messages',[])
  if state.get('status_str')=='error':
   errors=[m[1].get('exception_message','') for m in messages if m[0]=='execution_error'];j.update(status='failed',message='生成失败：'+('；'.join(errors) or '查看 ComfyUI 错误信息'))
  elif state.get('completed'):
   audios=result.get('outputs',{}).get('10',{}).get('audio',[])
   if not audios:raise ValueError('任务结束但没有歌曲音频')
   a=audios[0];blob=urllib.request.urlopen(BASE+'/view?'+urllib.parse.urlencode(a),timeout=60).read()
   if not blob:raise ValueError('生成的歌曲为空')
   filename='song-'+j['id']+'.mp3';dest=Path(folder)/filename;dest.with_suffix('.tmp').write_bytes(blob);dest.with_suffix('.tmp').replace(dest)
   j.update(status='completed',message='歌曲已生成，请试听后采用',file=filename,finished_at=time.time(),bytes=len(blob))
  else:j.update(status='running',message='ACE-Step 正在生成歌曲')
 else:
  q=request('/queue');running=[x[1] for x in q.get('queue_running',[])];pending=[x[1] for x in q.get('queue_pending',[])]
  if j['prompt_id'] in running:j.update(status='running',message='ACE-Step 正在生成歌曲')
  elif j['prompt_id'] in pending:j.update(status='queued',message='歌曲在 ComfyUI 队列中等待')
  else:j.update(status='unknown',message='任务暂未出现在队列或历史中，未自动重提')
 write(folder,j);return j

def listing(folder):
 with GUARD:
  result=[]
  for file in jobs_dir(folder).glob('*.json'):
   if file.name.endswith('-workflow.json'):continue
   try:
    j=json.loads(file.read_text('utf-8'))
    try:j=refresh(folder,j)
    except Exception as e:j['message']='状态查询暂时失败：'+str(e)
    result.append(j)
   except (ValueError,OSError):continue
  return sorted(result,key=lambda x:x['created_at'],reverse=True)

def cancel(folder,jid,project_id):
 import task_control,sys
 return task_control.cancel(sys.modules[__name__],folder,jid,project_id)
