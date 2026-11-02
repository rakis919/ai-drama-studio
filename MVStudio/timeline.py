"""Measured audio waveform and explicit user-reviewed lyric/cut alignment."""
import json,hashlib,subprocess,array,math,copy,time
from pathlib import Path
from atomic_io import write_json

def waveform(p,folder,ff):
 name=p.get('audio')
 if not name or Path(name).name!=name or not (folder/name).is_file():raise ValueError('先采用一条歌曲音轨，再校对实际时间轴')
 file=folder/name;digest=hashlib.sha256(file.read_bytes()).hexdigest();cache=folder/('waveform-'+digest[:16]+'.json')
 if cache.exists():return json.loads(cache.read_text('utf-8'))
 result=subprocess.run([ff,'-v','error','-i',str(file),'-vn','-ac','1','-ar','2000','-f','f32le','pipe:1'],capture_output=True,creationflags=0x08000000)
 if result.returncode:raise ValueError('无法读取歌曲音频：'+result.stderr.decode('utf-8','replace')[-800:])
 values=array.array('f');values.frombytes(result.stdout)
 if not values:raise ValueError('音频没有可用采样')
 step=max(1,math.ceil(len(values)/1200));peaks=[max(abs(x) for x in values[i:i+step]) for i in range(0,len(values),step)];peak=max(peaks) or 1
 data={'audio':name,'sha256':digest,'duration_seconds':len(values)/2000,'peaks':[round(x/peak,4) for x in peaks],'sample_rate':2000};write_json(cache,data);return data

def state(p,w):
 old=p.get('alignment',{})
 expected=[(l['line_id'],l['text']) for sec in p.get('suite',{}).get('song',{}).get('sections',[]) for l in sec.get('lines',[])]
 if old.get('audio_sha256')==w['sha256'] and [(l['line_id'],l['text']) for l in old.get('lines',[])]==expected:return copy.deepcopy(old)
 song=p.get('suite',{}).get('song',{});lines=[{'line_id':l['line_id'],'text':l['text'],'start':None,'end':None} for sec in song.get('sections',[]) for l in sec.get('lines',[])]
 cuts=[float(s['start_time_seconds']) for s in p.get('suite',{}).get('shots',{}).get('shots',[])]+[w['duration_seconds']]
 return {'status':'draft','audio':w['audio'],'audio_sha256':w['sha256'],'audio_duration_seconds':w['duration_seconds'],'lines':lines,'cuts':cuts,'method':'manual_listening','revision':0}

def apply(p,w,data,automatic=False):
 p=copy.deepcopy(p);current=state(p,w);lines=data.get('lines',current['lines']);cuts=data.get('cuts',current['cuts']);confirmed=(data.get('confirmed') is True) or automatic;method='faster_whisper_word_timestamps' if automatic else 'manual_listening';status='automatic' if automatic else 'confirmed';total=w['duration_seconds'];shots=p['suite']['shots']['shots'];song=p['suite']['song'];expected=[l for sec in song['sections'] for l in sec['lines']]
 if len(lines)!=len(expected) or [l.get('line_id') for l in lines]!=[l['line_id'] for l in expected]:raise ValueError('歌词行编号或顺序不一致，请刷新后重新核对')
 if len(cuts)!=len(shots)+1:raise ValueError('切点数量应为分镜数加一')
 cuts=[float(x) for x in cuts]
 if not all(math.isfinite(x) for x in cuts) or abs(cuts[0])>.01 or abs(cuts[-1]-total)>.05 or any(b<=a for a,b in zip(cuts,cuts[1:])):raise ValueError('切点必须从0连续递增，到实际歌曲末尾结束')
 previous=0;clean=[]
 for l,original in zip(lines,expected):
  a,b=l.get('start'),l.get('end')
  if a in ['',None] or b in ['',None]:
   if confirmed:raise ValueError('请先标记每一句歌词的开始和结束，再确认时间轴')
   a=b=None
  else:
   a,b=float(a),float(b)
   if not math.isfinite(a+b) or not 0<=a<b<=total+.05 or a<previous-.02:raise ValueError('歌词时间必须顺序递增、不重叠并位于歌曲范围内')
   previous=b
  clean.append({'line_id':original['line_id'],'text':original['text'],'start':a,'end':b,**({'performed_text':str(l.get('performed_text',original['text'])),'recognition_differs':bool(l.get('recognition_differs'))} if automatic else {})})
 if confirmed and any(not 5<=b-a<=12 for a,b in zip(cuts,cuts[1:])):raise ValueError('请将每个独立生成分镜调整为5–12秒；需要增减分镜时先编辑完整JSON')
 revision=int(current.get('revision',0))+(1 if confirmed else 0)
 alignment={'status':status if confirmed else 'draft','audio':w['audio'],'audio_sha256':w['sha256'],'audio_duration_seconds':total,'lines':clean,'cuts':cuts,'method':method,'reviewed_by_user':confirmed and not automatic,'revision':revision,'updated_at':time.time()};p['alignment']=alignment
 if not confirmed:return p
 # Actual line positions are supplied by explicit listening review; never synthesize word timestamps.
 lookup={l['line_id']:l for l in clean};last=0
 for i,sec in enumerate(song['sections']):
  if i==0:sec['start_time_seconds']=0
  else:
   sec['start_time_seconds']=min((lookup[l['line_id']]['start'] for l in sec['lines']),default=last)
   song['sections'][i-1]['end_time_seconds']=sec['start_time_seconds']
  for l in sec['lines']:
   l['start_time_seconds']=lookup[l['line_id']]['start'];l['end_time_seconds']=lookup[l['line_id']]['end']
   if automatic:l['performed_text']=lookup[l['line_id']].get('performed_text',l['text'])
  last=max((lookup[l['line_id']]['end'] for l in sec['lines']),default=sec['start_time_seconds'])
 song['sections'][-1]['end_time_seconds']=total;song.update(duration_seconds=total,timing_status='measured',alignment_method=method,alignment_reviewed=not automatic,audio_alignment={'audio':w['audio'],'sha256':w['sha256'],'status':status,'method':method,'revision':revision})
 song['sections']=[sec for sec in song['sections'] if sec['end_time_seconds']>sec['start_time_seconds']]
 changed=[]
 for i,shot in enumerate(shots):
  a,b=cuts[i:i+2];old=float(shot['duration_seconds']);d=b-a
  if abs(shot['start_time_seconds']-a)>.05 or abs(old-d)>.05:changed.append(shot['shot_id'])
  shot.update(start_time_seconds=a,end_time_seconds=b,duration_seconds=d)
  for sub in shot.get('sub_shots',[]):
   for k in ['start_offset_seconds','end_offset_seconds','duration_seconds']:sub[k]=float(sub[k])*d/old
  ids=[l['line_id'] for l in clean if l['start']<b and l['end']>a]
  shot['mv_sync'].update(lyric_line_ids=ids,section_ids=[sec['section_id'] for sec in song['sections'] if sec['start_time_seconds']<b and sec['end_time_seconds']>a],audio_start_seconds=a,audio_end_seconds=b,timing_status='measured',alignment_revision=revision)
  shot['generation_review_required']=shot['shot_id'] in changed
  if changed:shot['timing_review_note']='切点已按歌曲时间轴更新；旧片段与带时间的动作提示词需复核，未自动重新生成。'
 alignment['changed_shot_ids']=changed
 p['suite']['shots'].update(target_duration_seconds=total,actual_duration_seconds=total)
 p['suite']['project']['basic_info']['target_duration_seconds']=total;p['suite']['project']['production_targets']['target_duration_seconds']=total
 import mv_suite
 p=mv_suite.runtime(p['suite'],p);p['alignment']=alignment;return p

def assert_ready(p,folder):
 alignment=p.get('alignment',{})
 if alignment.get('status') not in ['confirmed','automatic'] or alignment.get('audio')!=p.get('audio'):raise ValueError('歌曲尚未自动分析，请在歌曲页点击自动分析，或直接开始批量生成。')
 expected=[(l['line_id'],l['text']) for sec in p.get('suite',{}).get('song',{}).get('sections',[]) for l in sec.get('lines',[])]
 if [(l['line_id'],l['text']) for l in alignment.get('lines',[])]!=expected:raise ValueError('歌词已经修改，请重新核对时间轴')
 cuts=[float(s['start_time_seconds']) for s in p['suite']['shots']['shots']]+[float(p['suite']['song']['duration_seconds'])]
 if len(cuts)!=len(alignment.get('cuts',[])) or any(abs(a-b)>.05 for a,b in zip(cuts,alignment['cuts'])):raise ValueError('分镜切点已修改，请重新确认时间轴')
 digest=hashlib.sha256((folder/p['audio']).read_bytes()).hexdigest()
 if digest!=alignment.get('audio_sha256'):raise ValueError('歌曲音轨已改变，请重新核对歌词时间轴')
