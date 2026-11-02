"""Persistent serial MV batches. Pause/stop never interrupts somebody else's job."""
import json,time,uuid,threading
from pathlib import Path
import frame_engine,video_engine,connections
LOCK=threading.RLock();THREADS={};READ=SAVE=FOLDER=None
ACTIVE={'running','pausing'}
def configure(read,save,folder):
 global READ,SAVE,FOLDER
 READ,SAVE,FOLDER=read,save,folder
def file(pid,bid):
 if not isinstance(bid,str) or len(bid)!=32 or any(c not in '0123456789abcdef' for c in bid):raise ValueError('批量编号无效')
 d=FOLDER(pid)/'batches';d.mkdir(exist_ok=True);return d/(bid+'.json')
def get(pid,bid):return json.loads(file(pid,bid).read_text('utf-8'))
def write(b):
 from atomic_io import write_json
 write_json(file(b['project_id'],b['id']),b)

def listing(pid):
 d=FOLDER(pid)/'batches'
 if not d.exists():return []
 return sorted([json.loads(f.read_text('utf-8')) for f in d.glob('*.json')],key=lambda x:x['created_at'],reverse=True)
def adopt_video(p,j):
 if j.get('deleted'):raise ValueError('视频已删除')
 shot=next(s for s in p['shots'] if s.get('source_shot_id')==j['shot_id']);shot['asset']=j['file'];shot['adopted_video_job_id']=j['id']
 if not any(x.get('file')==j['file'] for x in p['assets']):p['assets'].append({'name':j['shot_id']+'_video.mp4','file':j['file']})
 return p
def plan(p,ids,mode,method,strategy='next_shot_first'):
 if mode not in ['first','last','frames','videos','pipeline']:raise ValueError('批量类型无效')
 if method not in ['reference_images','first_frame','first_last_frames']:raise ValueError('视频方式无效')
 known=[s['shot_id'] for s in p.get('suite',{}).get('shots',{}).get('shots',[])];selected=set(ids or known)
 if not selected or not selected<=set(known):raise ValueError('请选择有效分镜')
 entries=[];added=set()
 def add(sid,stage):
  if (sid,stage) not in added:entries.append({'shot_id':sid,'stage':stage,'status':'pending','method':connections.method(p,sid,method)});added.add((sid,stage))
 for i,sid in enumerate(known):
  if sid not in selected:continue
  effective=connections.method(p,sid,method);src=connections.source(p,sid)
  if strategy=='next_shot_first':
   if mode in ['first','frames']:add(src,'first');continue
   if mode=='last':add(connections.source(p,known[i+1]) if i+1<len(known) else src,'first');continue
   needs_frames=effective!='reference_images'
   if needs_frames:
    add(src,'first')
    if effective=='first_last_frames' and i+1<len(known):add(connections.source(p,known[i+1]),'first')
   add(sid,'video')
  else:
   stages=['first'] if mode=='first' else ['first','last'] if mode in ['last','frames'] else ['first','last','video'] if mode=='pipeline' else ['first','video'] if method=='first_frame' else ['first','last','video'] if method=='first_last_frames' else ['video']
   for stage in stages:add(sid,stage)
 return entries

def start(p,options):
 with LOCK:
  old=next((b for b in listing(p['id']) if b['status'] in ['running','pausing','paused']),None)
  if old:return old
  mode=options.get('mode','pipeline');method='first_last_frames' if mode=='pipeline' else options.get('method','reference_images');strategy='next_shot_first';entries=plan(p,options.get('shot_ids'),mode,method,strategy)
  b={'id':uuid.uuid4().hex,'project_id':p['id'],'status':'running','mode':mode,'method':method,'size':options.get('size','preview'),'strategy':strategy,'generation_device':p.get('generation_device') or p.get('generation_devices',{}).get('video') or p.get('generation_devices',{}).get('frame','local'),'generation_devices':dict(p.get('generation_devices',{})),'reuse_videos':options.get('reuse_videos',True),'skip_existing':options.get('skip_existing',True),'created_at':time.time(),'entries':entries,'message':'批量已建立，串行生成并采用结果'};write(b);launch(b);return b
def launch(b):
 with LOCK:
  if b['id'] in THREADS and THREADS[b['id']].is_alive():return
  t=threading.Thread(target=work,args=(b['project_id'],b['id']),daemon=True);THREADS[b['id']]=t;t.start()
def control(pid,bid,action):
 if action=='stop_current':return stop_current(pid,bid)
 with LOCK:
  b=get(pid,bid)
  if action=='pause' and b['status']=='running':b.update(status='pausing',message='当前任务完成后暂停，不再提交下一项')
  elif action=='stop':b.update(status='stopped',message='已停止后续任务，已提交的当前任务仍继续，可从版本列表采用')
  elif action=='resume' and b['status']=='paused':
   for entry in b['entries']:
    if entry['status']=='failed':entry.update(status='pending');entry.pop('job_id',None);entry.pop('error',None)
   b.update(status='running',message='继续执行未完成项')
  write(b)
  if b['status']=='running':
   launch(b);threading.Timer(.3,lambda:launch(b)).start()
  return b
def stop_current(pid,bid):
 with LOCK:
  b=get(pid,bid);b.update(status='stopped',message='正在停止当前任务和后续批量任务');write(b)
 errors=[]
 for entry in b['entries']:
  if entry.get('job_id') and entry['status'] not in ['completed','skipped','failed','cancelled']:
   engine=video_engine if entry['stage']=='video' else frame_engine
   try:
    j=engine.cancel(FOLDER(pid),entry['job_id'],pid);entry['status']='completed' if j['status']=='completed' else j['status']
   except Exception as e:errors.append(str(e))
  elif entry['status']=='pending':entry['status']='cancelled'
 with LOCK:
  current=get(pid,bid)
  for old,new in zip(current['entries'],b['entries']):
   if old.get('job_id')==new.get('job_id') or not old.get('job_id'):old.update(new)
  current['message']='已停止批量后续任务，并已向当前任务发送停止请求' if not errors else '后续任务已停止，当前任务停止暂未确认：'+'；'.join(errors);write(current)
 return current

def update(pid,bid,index,**fields):
 with LOCK:
  b=get(pid,bid);b['entries'][index].update(fields);write(b)
def message(pid,bid,text):
 with LOCK:
  b=get(pid,bid);b['message']=text;write(b)
def work(pid,bid):
 while True:
  with LOCK:
   b=get(pid,bid)
   if b['status'] not in ACTIVE:return
   index=next((i for i,e in enumerate(b['entries']) if e['status'] not in ['completed','skipped','cancelled']),None)
   if index is None:b.update(status='completed',message='批量生成完成，成功结果已采用',finished_at=time.time());write(b);return
   e=b['entries'][index]
   if b['status']=='pausing' and not e.get('job_id'):b.update(status='paused',message='批量已暂停');write(b);return
  try:
   p=frame_engine.link_frames(READ(pid));p['generation_devices']=b.get('generation_devices',p.get('generation_devices',{}));p['generation_device']=b.get('generation_device') or p['generation_devices'].get('video') or p['generation_devices'].get('frame','local');folder=FOLDER(pid);engine=video_engine if e['stage']=='video' else frame_engine
   if e.get('job_id'):
    with video_engine.song_engine.GUARD:j=engine.refresh(folder,engine.read(folder,e['job_id']))
    if j['status']=='completed':
     if get(pid,bid)['status']=='stopped':return
     current=READ(pid);SAVE(adopt_video(current,j) if e['stage']=='video' else frame_engine.adopt(current,j));update(pid,bid,index,status='completed');continue
    if j['status'] in ['failed','cancelled']:raise ValueError(j['message'])
    message(pid,bid,e['shot_id']+' · '+('视频' if e['stage']=='video' else '首帧' if e['stage']=='first' else '尾帧')+'：'+j.get('message','执行中'));time.sleep(3);continue
   if b['skip_existing']:
    if e['stage']!='video':
     existing=p.get('shot_frames',{}).get(e['shot_id'],{}).get(e['stage'])
     revision=video_engine.get_shot(p,e['shot_id']).get('storyboard_revision')
     matching=not revision or p.get('shot_frame_revisions',{}).get(e['shot_id'],{}).get(e['stage'])==revision
     if existing and (folder/existing).is_file() and matching:update(pid,bid,index,status='skipped');continue
     if existing and (folder/existing).is_file() and not matching:message(pid,bid,e['shot_id']+' 首帧版本已更新，保留旧图并按当前设定重新生成')
    else:
     existing=video_engine.reusable_adopted(p,folder,e['shot_id'],e.get('method',b['method']),b['size']) if b.get('reuse_videos',True) else None
     if existing:update(pid,bid,index,status='skipped',job_id=existing['id'],reuse_reason='当前采用版本的提示、图片、时间轴和规格一致');continue
   if e['stage']=='video':
    import timeline
    timeline.assert_ready(p,folder)
    j=engine.start(p,folder,e['shot_id'],e.get('method',b['method']),b['size'])
   else:j=engine.start(p,folder,e['shot_id'],e['stage'],'image_to_image')
   update(pid,bid,index,status='running',job_id=j['id'])
   if get(pid,bid)['status']=='stopped':
    engine.cancel(folder,j['id'],pid);update(pid,bid,index,status='stopping');return
  except Exception as error:
   text=str(error)
   if '正忙' in text or isinstance(error,ConnectionError):message(pid,bid,'等待本地服务空闲或恢复：'+text);time.sleep(5);continue
   with LOCK:
    b=get(pid,bid)
    if b['status']=='stopped':return
    b['entries'][index].update(status='failed',error=text);b.update(status='paused',message=e['shot_id']+' 生成失败，已暂停：'+text);write(b)
   return
  time.sleep(2)
def resume(root):
 for path in Path(root).glob('*/batches/*.json'):
  try:
   b=json.loads(path.read_text('utf-8'))
   if b['status'] in ACTIVE:launch(b)
  except (ValueError,OSError):pass
