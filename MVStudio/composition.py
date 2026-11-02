"""MV composition workspace: ordered adopted clips + one song master."""
import json,uuid,time,math,subprocess,shutil
from pathlib import Path

def settings(p,raw):
 v={**{'resolution':'720p','fps':25,'volume':100,'fade_in':0,'fade_out':1,'audio':p.get('audio'),'burn_subtitles':True},**p.get('composition',{}),**(raw or {})}
 if v['resolution'] not in ['540p','720p','1080p'] or int(v['fps']) not in [24,25,30]:raise ValueError('请选择有效导出规格')
 for key,low,high in [('volume',0,150),('fade_in',0,5),('fade_out',0,5)]:
  v[key]=float(v[key])
  if not math.isfinite(v[key]) or not low<=v[key]<=high:raise ValueError('音量或淡入淡出参数无效')
 v['fps']=int(v['fps']);return v

def dimensions(ratio,resolution):
 w,h={'540p':(960,540),'720p':(1280,720),'1080p':(1920,1080)}[resolution]
 if ratio=='9:16':w,h=h,w
 elif ratio=='1:1':w=h
 return w,h

def validate(p,folder,raw):
 opts=settings(p,raw);shots=p.get('shots',[])
 if not 1<=len(shots)<=300:raise ValueError('请准备需要合成的分镜')
 def file(name):
  if not isinstance(name,str) or Path(name).name!=name or not (folder/name).is_file():raise ValueError('素材不存在或尚未采用')
  return folder/name
 missing=[s.get('source_shot_id',str(i+1)) for i,s in enumerate(shots) if not s.get('asset') or not (folder/s['asset']).is_file()]
 if missing:raise ValueError('以下分镜尚未采用素材：'+'、'.join(missing))
 for s in shots:
  file(s['asset']);d=float(s['duration'])
  if not math.isfinite(d) or not .1<=d<=120:raise ValueError('分镜时长无效')
 audio=file(opts.get('audio'))
 if audio.suffix.lower() not in ['.mp3','.wav','.m4a','.flac','.ogg']:raise ValueError('请选择有效的歌曲主音轨')
 if opts.get('burn_subtitles',True):subtitle_text(p,sum(float(s['duration']) for s in shots),opts['audio'])
 return opts

def subtitle_text(p,total,audio):
 lines=p.get('alignment',{}).get('lines',[])
 if p.get('alignment',{}).get('audio')!=audio:raise ValueError('字幕时间轴与所选歌曲不一致，请先保存该歌曲的歌词切分')
 if not lines:raise ValueError('请先在歌曲页切分歌词并保存时间轴，再烧录字幕')
 def stamp(t):
  c=round(float(t)*100);return f'{c//360000}:{c//6000%60:02}:{c//100%60:02}.{c%100:02}'
 header='[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Microsoft YaHei,48,&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,70,70,65,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
 events=[];previous=0
 for line in lines:
  a,b=line.get('start'),line.get('end');text=line.get('text','').strip()
  if not text or not isinstance(a,(int,float)) or not isinstance(b,(int,float)) or not math.isfinite(a+b) or not 0<=a<b<=total+.1 or a<previous-.01:raise ValueError('歌词字幕时间无效，请检查每句的开始和结束时间')
  previous=b
  text=text.replace('\\','／').replace('{','（').replace('}','）').replace('\n',' ').replace('\r',' ')
  events.append(f'Dialogue: 0,{stamp(a)},{stamp(min(b,total))},Default,,0,0,0,,{text}')
 return header+'\n'.join(events)+'\n'

def work(p,folder,save,ff):
 export_id=uuid.uuid4().hex;opts=validate(p,folder,p.get('composition',{}));w,h=dimensions(p.get('ratio','16:9'),opts['resolution']);fps=opts['fps'];total=sum(float(s['duration']) for s in p['shots']);started=time.time();temp=folder/('compose-'+export_id);temp.mkdir()
 def update(progress,message,status='running',**extra):
  p['job']={'status':status,'progress':progress,'message':message,'export_id':export_id,'width':w,'height':h,'fps':fps,'duration_seconds':total,'started_at':started,**extra};save(p)
 def run(args):
  result=subprocess.run([ff,'-hide_banner','-y',*args],capture_output=True,creationflags=0x08000000,cwd=str(temp))
  if result.returncode:raise ValueError(result.stderr.decode('utf-8','replace')[-1800:])
 try:
  # Retain the earlier export before replacing the current preview.
  if (folder/'mv.mp4').is_file() and not p.get('exports'):
   old='film-'+uuid.uuid4().hex+'.mp4';shutil.copyfile(folder/'mv.mp4',folder/old);p.setdefault('exports',[]).append({'id':old[5:-4],'file':old,'title':p['title'],'created_at':time.time(),'label':'之前导出的版本'})
  done=0
  for i,s in enumerate(p['shots']):
   d=float(s['duration']);update(round(done/total*90),'统一画幅与帧率 · '+s.get('source_shot_id',str(i+1))+'（'+str(i+1)+'/'+str(len(p['shots']))+'）')
   src=folder/s['asset'];still=src.suffix.lower() in ['.png','.jpg','.jpeg','.webp'];inputs=['-loop','1','-i',str(src)] if still else ['-stream_loop','-1','-i',str(src)]
   run([*inputs,'-t',str(d),'-vf',f'scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1,fps={fps},format=yuv420p','-an','-c:v','libx264','-preset','veryfast','-crf','20','-threads','2',str(temp/f'clip-{i}.mp4')]);done+=d
  (temp/'concat.txt').write_text('\n'.join("file 'clip-"+str(i)+".mp4'" for i in range(len(p['shots']))),'utf-8');update(94,'拼接全部分镜并混入歌曲主音轨')
  filters=[f"volume={opts['volume']/100}",'apad']
  if opts['fade_in']:filters.append('afade=t=in:st=0:d='+str(min(opts['fade_in'],total/2)))
  if opts['fade_out']:filters.append('afade=t=out:st='+str(max(0,total-opts['fade_out']))+':d='+str(min(opts['fade_out'],total/2)))
  output=folder/('film-'+export_id+'.mp4')
  video_options=['-c:v','copy']
  subtitle_file=None
  if opts.get('burn_subtitles',True):
   subtitle_file='lyrics-'+export_id+'.ass';(folder/subtitle_file).write_text(subtitle_text(p,total,opts['audio']),'utf-8-sig');shutil.copyfile(folder/subtitle_file,temp/'lyrics.ass');update(95,'烧录歌词字幕并混入歌曲主音轨');video_options=['-vf','subtitles=lyrics.ass','-c:v','libx264','-preset','veryfast','-crf','20','-threads','2']
  run(['-f','concat','-safe','0','-i',str(temp/'concat.txt'),'-i',str(folder/opts['audio']),'-map','0:v:0','-map','1:a:0',*video_options,'-af',','.join(filters),'-t',str(total),'-c:a','aac','-b:a','192k','-movflags','+faststart',str(output)])
  update(99,'保存成片和导出记录');shutil.copyfile(output,folder/'mv-new.mp4');(folder/'mv-new.mp4').replace(folder/'mv.mp4')
  entry={'id':export_id,'file':output.name,'title':p['title'],'created_at':time.time(),'width':w,'height':h,'fps':fps,'duration_seconds':total,'audio':opts['audio'],'settings':opts,'subtitle_file':subtitle_file};p.setdefault('exports',[]).insert(0,entry);p['composition']=opts;update(100,'成片合成完成，可预览和下载','completed',file=output.name,finished_at=time.time())
  for f in temp.iterdir():f.unlink()
  temp.rmdir()
 except Exception as e:update(0,'合成失败：'+str(e),'failed',finished_at=time.time())
