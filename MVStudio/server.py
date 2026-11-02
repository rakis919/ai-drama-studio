import sys
import urllib.request,urllib.error
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import mv_suite
import song_engine
import video_engine
import frame_engine
import batch_engine
import composition
import timeline
import auto_timeline
import generation_backend
import video_trash
import connections
import workflow_open
import json, os, re, uuid, threading, subprocess, math, shutil
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, unquote
ROOT=Path(__file__).resolve().parent
DATA=ROOT/'data'; DATA.mkdir(exist_ok=True)
FF='T:/AI/ComfyUI_1.3.5/.ext/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
LOCK=threading.Lock(); BUSY=set()
def project(pid):
 if not re.fullmatch(r'[a-f0-9]{32}',pid): raise ValueError('无效项目')
 p=DATA/pid; p.mkdir(exist_ok=True); return p
def read(pid): return json.loads((project(pid)/'project.json').read_text('utf-8'))
def save(p):
 dest=project(p['id'])/'project.json'
 with LOCK:
  from atomic_io import write_json
  write_json(dest,p)
def asset(p,name):
 if not name or Path(name).name!=name: raise ValueError('无效素材')
 f=project(p['id'])/name
 if not f.is_file(): raise ValueError('素材不存在')
 return f
def run(args):
 r=subprocess.run([FF,'-hide_banner','-y',*args],capture_output=True,creationflags=0x08000000)
 if r.returncode: raise ValueError(r.stderr.decode('utf-8','replace')[-1600:])
def render(pid):
 try:composition.work(read(pid),project(pid),save,FF)
 finally:BUSY.discard(pid)

class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def reply(self,value,status=200):
  b=json.dumps(value,ensure_ascii=False).encode(); self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
 def body(self):
  n=int(self.headers.get('Content-Length',0))
  if n>2000000: raise ValueError('请求过大')
  return json.loads(self.rfile.read(n) or b'{}')
 def lightcc_proxy(self):
  origin=self.headers.get('Origin')
  if origin and urlparse(origin).netloc!=self.headers.get('Host'):return self.reply({'error':'仅接受MV工作台同源请求'},403)
  size=int(self.headers.get('Content-Length',0))
  if size<0 or size>20000:return self.reply({'error':'管理请求过大'},400)
  headers={k:self.headers[k] for k in ['Content-Type','Range'] if self.headers.get(k)}
  body=self.rfile.read(size) if self.command=='POST' else None
  request=urllib.request.Request('http://127.0.0.1:4173'+self.path,data=body,method=self.command,headers=headers)
  try:response=urllib.request.urlopen(request,timeout=960)
  except urllib.error.HTTPError as e:response=e
  except OSError:return self.reply({'error':'短剧共享管理服务未连接，请检查4173网页服务'},503)
  with response:
   self.send_response(response.code)
   for key in ['Content-Type','Content-Length','Accept-Ranges','Content-Range']:
    if response.headers.get(key):self.send_header(key,response.headers[key])
   self.send_header('Cache-Control','no-store');self.end_headers()
   while True:
    chunk=response.read(65536)
    if not chunk:break
    self.wfile.write(chunk)
 def do_GET(self):
  try:
   path=unquote(urlparse(self.path).path); parts=path.strip('/').split('/')
   if path.startswith('/api/lightcc/'):return self.lightcc_proxy()

   if len(parts)==6 and parts[:2]==['api','project'] and parts[3]=='workflow':
    pid,kind,jid=parts[2],parts[4],parts[5];folder=project(pid);job=workflow_open.read_job(folder,kind,jid);file=workflow_open.graph_path(folder,kind,jid)
    if not file.is_file():raise ValueError('此记录不是单次模型生成，请使用子段工作流入口')
    query=__import__('urllib.parse',fromlist=['parse_qs']).parse_qs(urlparse(self.path).query)
    if query.get('open')==['1']:
     host=urlparse('http://'+self.headers.get('Host','127.0.0.1')).hostname;target,comfy=workflow_open.prepare(folder,kind,jid,host)
     if target:
      self.send_response(302);self.send_header('Location',target);self.send_header('Cache-Control','no-store');self.end_headers();return
     import html
     text='<meta charset="utf-8"><title>本次生成工作流</title><h2>本次生成工作流</h2><p>此 ComfyUI 未安装自动打开扩展，请下载 JSON 后拖入 ComfyUI。</p><p><a href="'+html.escape(comfy)+'" target="_blank" rel="noopener">打开 ComfyUI</a> · <a href="?download=1">下载本次工作流</a></p>';data=text.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
    data=file.read_bytes();self.send_response(200);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Disposition','attachment; filename=MVStudio-'+kind+'-'+jid+'.json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return

   cloud_assets={'/lightcc.html':(ROOT/'lightcc.html','text/html'),'/cloud-manager/lightcc.js':(ROOT/'lightcc-manager.js','text/javascript'),'/cloud-manager/lightcc-rental.js':(Path('D:/AIPlatform/DramaStudio/dist/lightcc-rental.js'),'text/javascript'),'/cloud-manager/lightcc-demand-ui.js':(ROOT/'lightcc-status.js','text/javascript'),'/cloud-manager/style.css':(Path('D:/AIPlatform/DramaStudio/dist/style.css'),'text/css')}
   if path in cloud_assets:
    file,mime=cloud_assets[path];b=file.read_bytes();self.send_response(200);self.send_header('Content-Type',mime+'; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
   if path in ['/cloud-picker.js','/lightcc-status.js']:
    b=(ROOT/path[1:]).read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
   if path=='/api/cloud/runtime':return self.reply(generation_backend.runtime(DATA))
   if path=='/api/cloud/device-stats':
    device=__import__('urllib.parse',fromlist=['parse_qs']).parse_qs(urlparse(self.path).query).get('device',['local'])[0]
    if device not in ['local','lightcc']:raise ValueError('设备无效')
    return self.reply(json.load(urllib.request.urlopen((generation_backend.CLOUD if device=='lightcc' else generation_backend.LOCAL)+'/system_stats',timeout=15)))
   if path=='/cloud.js':
    b=(ROOT/'cloud.js').read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
   if path=='/api/cloud/capabilities':return self.reply(generation_backend.capabilities())
   if path=='/api/cloud/status':return self.reply(generation_backend.status())
   if path=='/connections.js':
    b=(ROOT/'connections.js').read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
   if path=='/timeline.js':
    b=(ROOT/'timeline.js').read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
   if len(parts)==4 and parts[:2]==['api','project'] and parts[3]=='timeline':
    p=read(parts[2]);w=timeline.waveform(p,project(p['id']),FF);return self.reply({'waveform':w,'alignment':timeline.state(p,w)})
   if path=='/composition.js':
    b=(ROOT/'composition.js').read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
   if path=='/view-state.js':
    b=(ROOT/'view-state.js').read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
   if path=='/shot-tabs.js':
    b=(ROOT/'shot-tabs.js').read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
   if path=='/frame-batch.js':
    b=(ROOT/'frame-batch.js').read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
   if len(parts)==4 and parts[:2]==['api','project'] and parts[3]=='frames':
    p=read(parts[2]);return self.reply(frame_engine.listing(project(p['id'])))
   if len(parts)==4 and parts[:2]==['api','project'] and parts[3]=='batches':
    p=read(parts[2]);return self.reply(batch_engine.listing(p['id']))
   if path=='/shot-video.js':
    b=(ROOT/'shot-video.js').read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
   if path=='/sheets.js':
    b=(ROOT/'sheets.js').read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
   if path=='/planning.js':
    b=(ROOT/'planning.js').read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
   if len(parts)==4 and parts[:2]==['api','project'] and parts[3]=='videos':
    p=read(parts[2]);return self.reply(video_engine.listing(project(p['id']),include_deleted='trash=1' in urlparse(self.path).query))
   if len(parts)==4 and parts[:2]==['api','project'] and parts[3]=='songs':
    p=read(parts[2]);return self.reply(song_engine.listing(project(p['id'])))
   if len(parts)==4 and parts[:2]==['api','project'] and parts[3]=='suite':
    b=mv_suite.archive(read(parts[2]));self.send_response(200);self.send_header('Content-Type','application/zip');self.send_header('Content-Disposition','attachment; filename=mv-project-json.zip');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
   if path=='/favicon.ico':
    b=(ROOT/'assets/favicon-v2.ico').read_bytes();self.send_response(200);self.send_header('Content-Type','image/x-icon');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
   if path.startswith('/assets/'):
    name=path[len('/assets/'):]
    if name not in ['music-icon-v1.png','icon-32.png','icon-180.png','icon-192.png','icon-512.png','manifest.webmanifest']:self.send_error(404);return
    f=ROOT/'assets'/name
    b=f.read_bytes();self.send_response(200);self.send_header('Content-Type','application/manifest+json' if name.endswith('.webmanifest') else 'image/png');self.send_header('Cache-Control','no-cache');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
   if path=='/api/projects': return self.reply([read(f.name) for f in DATA.iterdir() if (f/'project.json').exists()])
   if path=='/api/health': return self.reply({'platform':'MV Studio','port':4175,'ffmpeg':Path(FF).exists()})
   if len(parts)==3 and parts[:2]==['api','project']: return self.reply(read(parts[2]))
   if len(parts)==3 and parts[0]=='media':
    f=asset(read(parts[1]),parts[2]); import mimetypes
    size=f.stat().st_size; start=0;end=size-1;status=200
    rng=self.headers.get('Range')
    if rng:
     m=re.fullmatch(r'bytes=(\d*)-(\d*)',rng)
     if not m: self.send_error(416);return
     if m[1]: start=int(m[1]);end=min(end,int(m[2])) if m[2] else end
     else: start=max(0,size-int(m[2] or size))
     if start>end or start>=size: self.send_error(416);return
     status=206
    self.send_response(status);self.send_header('Content-Type',mimetypes.guess_type(f.name)[0] or 'application/octet-stream');self.send_header('Accept-Ranges','bytes');self.send_header('Content-Length',str(end-start+1))
    if status==206:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
    self.end_headers()
    with f.open('rb') as stream:
     stream.seek(start); left=end-start+1
     while left:
      b=stream.read(min(left,1024*1024))
      if not b:break
      self.wfile.write(b);left-=len(b)
    return
   if path!='/':self.send_error(404);return
   b=(ROOT/'index.html').read_bytes();self.send_response(200);self.send_header('Cache-Control','no-store');self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
  except (BrokenPipeError,ConnectionResetError): pass
  except Exception as e:self.reply({'error':str(e)},400)
 def do_POST(self):
  try:
   if urlparse(self.path).path.startswith('/api/lightcc/'):return self.lightcc_proxy()
   parts=urlparse(self.path).path.strip('/').split('/')
   if parts==['api','cloud','prepare']:return self.reply(generation_backend.prepare(self.body()),202)
   if parts in [['api','import-suite'],['api','import-zip']]:
    if parts[-1]=='import-zip':
     n=int(self.headers.get('Content-Length',0))
     if not 0<n<=8*1024*1024:raise ValueError('ZIP 须小于8MB')
     docs=mv_suite.from_zip(self.rfile.read(n))
    else:docs=mv_suite.validate(self.body().get('files',{}))
    p=mv_suite.runtime(docs);p.update(id=uuid.uuid4().hex,assets=[]);save(p);return self.reply(p,201)
   if parts==['api','projects']:
    data=self.body();p={'id':uuid.uuid4().hex,'title':str(data.get('title') or '未命名 MV')[:100],'ratio':'16:9','lyrics':'','shots':[],'assets':[]};save(p);return self.reply(p)
   if len(parts)!=4 or parts[:2]!=['api','project']:self.send_error(404);return
   pid,action=parts[2:];p=read(pid)
   if pid in BUSY:raise ValueError('正在合成，请完成后再编辑')
   if action=='generation-devices':
    data=self.body()
    device=data.get('device',data.get('video',data.get('frame','local')))
    if device not in ['local','lightcc']:raise ValueError('生成设备无效')
    if any(b['status'] in ['running','pausing','paused'] for b in batch_engine.listing(pid)):raise ValueError('请先完成或停止当前批量，再切换设备')
    p['generation_device']=device;p['generation_devices']={k:device for k in ['frame','video']};save(p);return self.reply(p)
   if action in ['video-stop','frame-stop','song-stop']:
    data=self.body();engine={'video-stop':video_engine,'frame-stop':frame_engine,'song-stop':song_engine}[action];return self.reply(engine.cancel(project(pid),data.get('job_id'),pid))
   if action=='frame-generate':
    data=self.body();sid=data.get('shot_id');slot=data.get('slot')
    if slot=='last' and p.get('endpoint_strategy','next_shot_first')=='next_shot_first':
     shots=p['suite']['shots']['shots'];index=next((i for i,x in enumerate(shots) if x['shot_id']==sid),None)
     if index is None or index+1==len(shots):raise ValueError('最后一镜只需要首帧，不生成尾帧')
     sid=shots[index+1]['shot_id'];slot='first'
    return self.reply(frame_engine.start(p,project(pid),sid,slot,data.get('method','image_to_image')),202)
   if action=='frame-adopt':
    data=self.body();j=frame_engine.read(project(pid),data.get('job_id'));p=frame_engine.adopt(p,j);p.setdefault('shot_frame_revisions',{}).setdefault(j['shot_id'],{})[j['slot']]=video_engine.get_shot(p,j['shot_id']).get('storyboard_revision');save(p);return self.reply(p)
   if action=='timeline-auto':
    self.body();return self.reply(auto_timeline.start(p),202)
   if action=='batch-start':
    data=self.body()
    if data.get('mode','pipeline') in ['videos','pipeline']:
     try:timeline.assert_ready(p,project(pid))
     except ValueError:return self.reply({'alignment_job':auto_timeline.start(p,data)},202)
    return self.reply(batch_engine.start(p,data),202)
   if action=='batch-control':
    data=self.body();return self.reply(batch_engine.control(pid,data.get('batch_id'),data.get('action')))
   if action=='video-prompt':
    data=self.body();shot=video_engine.get_shot(p,data.get('shot_id'));method=data.get('method');prompt=data.get('prompt')
    if method not in ['first_frame','first_last_frames','reference_images'] or not isinstance(prompt,str) or not 0<len(prompt.strip())<=30000:raise ValueError('请选择方案并填写有效视频提示词')
    shot['generation']['video_methods'][method]['video_prompt']=prompt
    if method=='reference_images':shot['generation']['video_prompt']=prompt
    save(p);return self.reply(p)
   if action=='video-generate':
    timeline.assert_ready(p,project(pid))
    data=self.body();sid=data.get('shot_id');method=data.get('method','first_last_frames');size=data.get('size','preview');p=frame_engine.link_frames(p)
    if method in ['first_frame','first_last_frames']:
     shots=p['suite']['shots']['shots'];last=sid==shots[-1]['shot_id'];actual='first_frame' if last else method
     try:video_engine.inputs(p,project(pid),sid,actual)
     except ValueError:
      batch=batch_engine.start(p,{'mode':'videos','method':method,'size':size,'shot_ids':[sid],'skip_existing':True,'reuse_videos':False});return self.reply({'batch':batch,'message':'先准备本镜及下一镜首帧，再生成本镜视频'},202)
    return self.reply(video_engine.start(p,project(pid),sid,method,size),202)
   if action in ['video-delete','video-restore']:
    data=self.body();p,j=video_trash.change(p,project(pid),data.get('job_id'),restore=action=='video-restore');save(p);return self.reply({'project':p,'job':j})
   if action=='connections':
    p=connections.apply(p,self.body().get('items'));save(p);return self.reply(p)
   if action=='video-adopt':
    data=self.body();j=video_engine.read(project(pid),data.get('job_id'))
    if j.get('deleted') or j['status']!='completed' or not (project(pid)/j.get('file','')).is_file():raise ValueError('视频已删除或尚未完成')
    shot=next((s for s in p['shots'] if s.get('source_shot_id')==j['shot_id']),None)
    if shot is None:raise ValueError('分镜已不存在')
    shot['asset']=j['file'];shot['adopted_video_job_id']=j['id']
    if not any(x.get('file')==j['file'] for x in p['assets']):p['assets'].append({'name':j['shot_id']+'_'+j['title']+'.mp4','file':j['file']})
    save(p);return self.reply(p)
   if action=='shot-frame':
    data=self.body();sid=data.get('shot_id');video_engine.get_shot(p,sid);slot=data.get('slot');filename=data.get('file')
    if slot not in ['first','last']:raise ValueError('首尾帧位置无效')
    if not any(x.get('file')==filename for x in p['assets']):raise ValueError('帧图片不属于当前项目')
    url='/media/'+pid+'/'+filename
    if any(c.get('reference_images',{}).get('four_view')==url for c in p['suite']['characters']['characters']):raise ValueError('人物设定合图不能当作分镜首尾帧，请上传单幅分镜画面')
    video_engine.local_image(p,project(pid),url);p.setdefault('shot_frames',{}).setdefault(sid,{})[slot]=filename;p.setdefault('shot_frame_revisions',{}).setdefault(sid,{})[slot]=video_engine.get_shot(p,sid).get('storyboard_revision');p=frame_engine.link_frames(p);save(p);return self.reply(p)
   if action=='song-generate':
    self.body();return self.reply(song_engine.start(p,project(pid)),202)
   if action=='song-adopt':
    data=self.body();j=song_engine.read(project(pid),data.get('job_id'))
    if j['status']!='completed' or not (project(pid)/j.get('file','')).is_file():raise ValueError('该歌曲尚未生成完成')
    p['audio']=j['file'];p['audio_name']=j['title']+'.mp3';p['adopted_song_job_id']=j['id']
    if not any(a.get('file')==j['file'] for a in p['assets']):p['assets'].append({'name':p['audio_name'],'file':j['file']})
    if p.get('suite'):p['suite']['song'].setdefault('generation_adapter',{}).update(status='completed',prompt_id=j.get('prompt_id'),job_id=j['id'])
    save(p);return self.reply(p)
   if action=='reference':
    data=self.body();kind=data.get('kind');ref_id=data.get('ref_id');filename=data.get('file');suite=p.get('suite',{})
    if kind not in ['character','scene']:raise ValueError('类型须为 character 或 scene')
    key='characters' if kind=='character' else 'scenes';id_key='character_id' if kind=='character' else 'scene_id';slot='four_view' if kind=='character' else 'master'
    item=next((x for x in suite.get(key,{}).get(key,[]) if x.get(id_key)==ref_id),None)
    if item is None:raise ValueError('当前项目中不存在该人物或场景')
    if not any(a.get('file')==filename for a in p.get('assets',[])):raise ValueError('图片不属于当前项目素材')
    img=asset(p,filename)
    if img.suffix.lower() not in ['.png','.jpg','.jpeg','.webp']:raise ValueError('需要图片素材')
    from PIL import Image
    with Image.open(img) as im:im.verify()
    url='/media/'+pid+'/'+filename
    refs=item.setdefault('reference_images',{});old=refs.get(slot);history=item.setdefault('reference_history',[])
    if old and not any(x.get('url')==old for x in history):history.append({'slot':slot,'url':old,'source':'previous'})
    if not any(x.get('url')==url for x in history):history.append({'slot':slot,'url':url,'file':filename,'source':str(data.get('source','uploaded'))[:100]})
    refs[slot]=url
    if kind=='character':item['reference_layout']={'order':['face_detail','front','side_90','back'],'single_character':True}
    for shot in suite.get('shots',{}).get('shots',[]):
     for ref in shot.get('picture_inputs',[]):
      if ref.get('type')==kind and ref.get('ref_id')==ref_id:
       ref.update(path=url,status='available')
       if kind=='character':ref.update(reference_kind='four_view_character_sheet',panel_order=['face_detail','front','side_90','back'])
    if kind=='character':suite.get('shots',{}).setdefault('character_reference_specs',{}).setdefault(ref_id,{})['reference_image']=url
    mv_suite.validate(suite);save(p);return self.reply(p)
   if action=='suite':
    incoming=self.body();p=frame_engine.link_frames(mv_suite.runtime(incoming.get('files',{}),p));save(p);return self.reply(p)
   if action=='save':
    incoming=self.body();p=mv_suite.sync_runtime(p,incoming)
    for key in ['title','ratio','lyrics','shots','style','duration']: 
     if key in incoming:p[key]=incoming[key]
    save(p);return self.reply(p)
   if action=='upload':
    name=unquote(self.headers.get('X-Filename',''));ext=Path(name).suffix.lower()
    if ext not in ['.mp3','.wav','.m4a','.flac','.ogg','.mp4','.mov','.webm','.png','.jpg','.jpeg','.webp']:raise ValueError('不支持该素材格式')
    n=int(self.headers.get('Content-Length',0))
    if not 0<n<=2*1024**3:raise ValueError('文件须小于 2GB')
    stored=uuid.uuid4().hex+ext;dest=project(pid)/stored
    with dest.open('wb') as out:
     left=n
     while left:
      b=self.rfile.read(min(left,1024*1024))
      if not b:raise ValueError('上传中断')
      out.write(b);left-=len(b)
    p['assets'].append({'name':name,'file':stored})
    if self.headers.get('X-Kind')=='audio':p['audio']=stored;p['audio_name']=name
    save(p);return self.reply(p)
   if action=='timeline':
    data=self.body();w=timeline.waveform(p,project(pid),FF);p=timeline.apply(p,w,data);save(p);return self.reply(p)
   if action=='composition':
    data=self.body();p['composition']=composition.settings(p,data);save(p);return self.reply(p)
   if action=='render':
    data=self.body();p['composition']=composition.validate(p,project(pid),data.get('composition',{}))
    BUSY.add(pid);p['job']={'status':'running','progress':0,'message':'准备合成'};save(p);threading.Thread(target=render,args=(pid,),daemon=True).start();return self.reply(p,202)
   self.send_error(404)
  except Exception as e:self.reply({'error':str(e)},400)
if __name__=='__main__':
 for f in DATA.glob('*/project.json'):
  p=json.loads(f.read_text('utf-8'))
  if p.get('job',{}).get('status')=='running':p['job']={'status':'failed','message':'服务已重启，请重新导出'};save(p)
 auto_timeline.configure(read,save,project,FF)
 for f in DATA.glob('*/project.json'):
  p=json.loads(f.read_text('utf-8'))
  if p.get('alignment_job',{}).get('status')=='running':p['alignment_job']={'status':'failed','message':'服务已重启，请重新自动分析'};save(p)
 batch_engine.configure(read,save,project);batch_engine.resume(DATA)
 print('MV Studio http://127.0.0.1:4175',flush=True)
 ThreadingHTTPServer(('0.0.0.0',4175),Handler).serve_forever()
