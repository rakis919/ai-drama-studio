"""MV five-document interchange; preserves original documents and unknown fields."""
import json, math, io, zipfile, copy, re
NAMES=['project','characters','scenes','shots','song']
def number(x):
 v=float(x)
 if not math.isfinite(v):raise ValueError('时间必须为有效数字')
 return v
def validate(files):
 if not isinstance(files,dict):raise ValueError('需要五份 JSON 对象')
 docs={n:files.get(n,files.get(n+'.json')) for n in NAMES}
 if any(not isinstance(d,dict) for d in docs.values()):raise ValueError('请同时提供 project、characters、scenes、shots、song 五份 JSON')
 pid=docs['project'].get('project_id')
 if not pid or any(d.get('project_id')!=pid for d in docs.values()):raise ValueError('五份文件的 project_id 必须相同')
 song=docs['song'];total=number(song.get('duration_seconds',0))
 if not 0<total<=3600:raise ValueError('歌曲规划时长须在 0–3600 秒内')
 if song.get('timing_status') not in ['estimated','measured']:raise ValueError('歌曲需要标注 estimated 或 measured')
 def unique(items,key):
  if not isinstance(items,list):raise ValueError(key+' 所属列表无效')
  ids=[x.get(key) for x in items]
  if any(not isinstance(v,str) or not v for v in ids) or len(ids)!=len(set(ids)):raise ValueError(key+' 缺失或重复')
  return set(ids)
 chars=unique(docs['characters'].get('characters',[]),'character_id');scenes=unique(docs['scenes'].get('scenes',[]),'scene_id')
 if not scenes:raise ValueError('请提供至少一个场景')
 sections=song.get('sections',[]);section_ids=unique(sections,'section_id');line_ids=set();end=0
 for section in sections:
  a,b=number(section.get('start_time_seconds')),number(section.get('end_time_seconds'))
  if abs(a-end)>.05 or b<=a or b>total+.05:raise ValueError('歌曲段落时间不连续或越界')
  end=b
  for line in section.get('lines',[]):
   lid=line.get('line_id')
   if not lid or lid in line_ids or not str(line.get('text','')).strip():raise ValueError('歌词行 ID 重复或内容为空')
   line_ids.add(lid);la,lb=line.get('start_time_seconds'),line.get('end_time_seconds')
   if la is not None or lb is not None:
    if la is None or lb is None or not a<=number(la)<number(lb)<=b:raise ValueError('歌词时间越出段落')
 if abs(end-total)>.05:raise ValueError('歌曲段落需覆盖规划时长')
 if not song.get('instrumental') and not line_ids:raise ValueError('演唱歌曲缺少歌词')
 if song.get('instrumental') and (line_ids or song.get('lyrics_text','').strip()):raise ValueError('纯音乐不能包含演唱歌词')
 shots=docs['shots'].get('shots',[]);unique(shots,'shot_id')
 if not 1<=len(shots)<=300:raise ValueError('需要 1–300 个分镜')
 end=0
 for s in shots:
  a,b,d=map(number,[s.get('start_time_seconds'),s.get('end_time_seconds'),s.get('duration_seconds')])
  if abs(a-end)>.05 or not .1<=d<=120 or abs(b-a-d)>.05:raise ValueError('分镜时间不连续或时长不匹配')
  end=b
  if s.get('scene_id') not in scenes or not set(s.get('character_ids',[]))<=chars:raise ValueError('分镜引用的人物或场景不存在')
  m=s.get('mv_sync',{})
  if not set(m.get('section_ids',[]))<=section_ids or not set(m.get('lyric_line_ids',[]))<=line_ids:raise ValueError('分镜引用的歌词或段落不存在')
  if abs(number(m.get('audio_start_seconds',a))-a)>.05 or abs(number(m.get('audio_end_seconds',b))-b)>.05:raise ValueError('分镜与歌曲时间不一致')
 if abs(end-total)>.05:raise ValueError('分镜总时长与歌曲规划时长不同')
 return copy.deepcopy(docs)
def from_zip(data):
 if len(data)>8*1024*1024:raise ValueError('JSON ZIP 须小于 8MB')
 files={}
 with zipfile.ZipFile(io.BytesIO(data)) as z:
  if len(z.infolist())>100:raise ValueError('ZIP 文件数量过多')
  for item in z.infolist():
   name=item.filename.replace('\\','/').split('/')[-1]
   if name in [n+'.json' for n in NAMES]:
    if name in files:raise ValueError('ZIP 内存在同名 JSON')
    if item.file_size>2*1024*1024:raise ValueError('单份 JSON 须小于 2MB')
    files[name]=json.loads(z.read(item).decode('utf-8-sig'))
 return validate(files)
def runtime(files,existing=None):
 docs=validate(files);song=docs['song'];p=copy.deepcopy(existing or {})
 old={s.get('source_shot_id'):s for s in p.get('shots',[])}
 p.update(title=docs['project'].get('title',song.get('title','MV')),ratio=docs['project'].get('production_targets',{}).get('aspect_ratio','16:9'),lyrics=song.get('lyrics_text',''),duration=song['duration_seconds'],suite=docs,planning_version='1.0')
 lines={l['line_id']:l['text'] for sec in song['sections'] for l in sec.get('lines',[])}
 p['shots']=[]
 for s in docs['shots']['shots']:
  gen=s.get('generation',{});m=s.get('mv_sync',{});previous=old.get(s['shot_id'],{})
  p['shots'].append({**previous,'source_shot_id':s['shot_id'],'duration':s['duration_seconds'],'prompt':gen.get('image_prompt',''),'lyric':' / '.join(lines[x] for x in m.get('lyric_line_ids',[]) if x in lines),'camera':previous.get('camera','缓慢推进'),'asset':previous.get('asset',''),'scene_id':s['scene_id'],'character_ids':s.get('character_ids',[])})
 return p
def sync_runtime(p,incoming):
 p=copy.deepcopy(p)
 if not p.get('suite'):return p
 docs=p['suite'];changed=incoming.get('shots',p['shots']);canonical=docs['shots']['shots']
 if len(changed)!=len(canonical) or any(a.get('source_shot_id')!=b['shot_id'] or abs(number(a['duration'])-number(b['duration_seconds']))>.05 for a,b in zip(changed,canonical)):
  raise ValueError('插件项目的分镜结构请在「完整 JSON 编辑」中修改，以保持歌词和时间关联')
 if incoming.get('lyrics',p['lyrics'])!=docs['song'].get('lyrics_text',''):raise ValueError('插件项目的歌词请在「歌曲方案 → 完整 JSON 编辑」中修改并同步段落')
 if abs(number(incoming.get('duration',p['duration']))-number(docs['song']['duration_seconds']))>.05:raise ValueError('插件项目的时长请在完整 JSON 中同步歌曲和分镜')
 for a,b in zip(changed,canonical):
  if a.get('prompt','')!=b.get('generation',{}).get('image_prompt',''):
   b['generation']['image_prompt']=a.get('prompt','')
   frames=b['generation'].get('video_methods',{}).get('first_last_frames',{})
   if 'first_frame' in frames:frames['first_frame']['text_to_image']['prompt']=a.get('prompt','')
 docs['project']['title']=incoming.get('title',p['title']);docs['song']['title']=docs['project']['title'];docs['shots']['title']=docs['project']['title']
 ratio=incoming.get('ratio',p['ratio'])
 if ratio not in ['16:9','9:16','1:1']:raise ValueError('项目画幅无效')
 targets=docs['project'].setdefault('production_targets',{});targets['aspect_ratio']=ratio
 w,h={'16:9':(1280,720),'9:16':(720,1280),'1:1':(720,720)}[ratio];targets['output_resolution']={'width':w,'height':h}
 validate(docs)
 p['suite']=docs;return p
def archive(p):
 docs=validate(p['suite']);out=io.BytesIO()
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
  for n in NAMES:z.writestr(n+'.json',json.dumps(docs[n],ensure_ascii=False,indent=2))
 return out.getvalue()
