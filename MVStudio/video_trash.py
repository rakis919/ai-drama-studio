"""Project-owned video trash; reference images and exported films are untouched."""
import time,copy
import video_engine

def change(p,folder,jid,restore=False):
 j=video_engine.read(folder,jid)
 if j.get('project_id')!=p['id']:raise ValueError('视频不属于当前项目')
 if j['status'] in video_engine.ACTIVE:raise ValueError('请先停止当前视频生成，再删除')
 p=copy.deepcopy(p)
 if restore:
  j.pop('deleted_at',None);j.pop('deleted',None)
  for asset in j.get('trash_assets',[]):
   if not any(x.get('file')==asset.get('file') for x in p['assets']):p['assets'].append(asset)
 else:
  if j.get('deleted'):return p,j
  j.update(deleted=True,deleted_at=time.time());filename=j.get('file');removed=[]
  for shot in p.get('shots',[]):
   if shot.get('adopted_video_job_id')==jid or filename and shot.get('asset')==filename:
    removed.append(shot.get('source_shot_id'));shot['asset']='';shot.pop('adopted_video_job_id',None)
  j['trash_assets']=[a for a in p['assets'] if filename and a.get('file')==filename];j['trash_shots']=removed
  p['assets']=[a for a in p['assets'] if not filename or a.get('file')!=filename]
 video_engine.write(folder,j);return p,j
