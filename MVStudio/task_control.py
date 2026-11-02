"""Cancel only a persisted MV-owned prompt through ComfyUI's atomic per-job endpoint."""
import time,urllib.parse

def settle(folder,j,write):
 import song_engine
 pid=j.get('prompt_id')
 if pid:
  q=song_engine.request('/queue');active=any(x[1]==pid for x in q.get('queue_running',[])+q.get('queue_pending',[]))
  if active:
   song_engine.request('/api/jobs/'+urllib.parse.quote(pid,safe='')+'/cancel',{})
   j.update(status='stopping',message='正在停止当前任务，等待 ComfyUI 退出本次计算')
  else:j.update(status='cancelled',message='任务已停止',finished_at=time.time())
 else:j.update(status='cancelled',message='任务已停止，未发现已提交的活动任务',finished_at=time.time())
 write(folder,j);return j

def cancel(engine,folder,jid,project_id):
 import song_engine
 with song_engine.GUARD:
  j=engine.read(folder,jid)
  if j.get('project_id') and j['project_id']!=project_id:raise ValueError('该任务不属于当前 MV 项目')
  if j['status'] in ['completed','failed','cancelled']:return j
  if not j.get('prompt_id'):
   q=song_engine.request('/queue');h=song_engine.request('/history?max_items=100')
   items=q.get('queue_running',[])+q.get('queue_pending',[])+[v.get('prompt',[]) for v in h.values()]
   client_ids={'mv-video-'+jid,'mvstudio-song-'+jid}
   for item in items:
    if len(item)>3 and isinstance(item[3],dict) and item[3].get('client_id') in client_ids:j['prompt_id']=item[1];break
  # If it already finished, preserve the successful result instead of relabelling it.
  if j.get('prompt_id'):
   h=song_engine.request('/history/'+j['prompt_id']).get(j['prompt_id'],{})
   if h.get('status',{}).get('completed') and h.get('status',{}).get('status_str')=='success':return engine.refresh(folder,j)
  j.update(cancel_requested=True,status='stopping',message='请求停止当前任务');engine.write(folder,j)
  return settle(folder,j,engine.write)
