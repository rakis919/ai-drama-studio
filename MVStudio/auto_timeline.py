"""Automatic song timing; never represents recognition as human listening."""
import copy,json,time,threading,subprocess,sys,hashlib,unicodedata,difflib,math
from pathlib import Path
import timeline
BASE=Path('D:/AIPlatform/GptWork/mv-auto-alignment')
GUARD=threading.RLock();READ=SAVE=FOLDER=FF=None

def configure(read,save,folder,ff):
 global READ,SAVE,FOLDER,FF
 READ,SAVE,FOLDER,FF=read,save,folder,ff

def norm(text):return ''.join(c.lower() for c in unicodedata.normalize('NFKC',text) if c.isalnum())

def match_lines(expected,segments,total):
 chars=[];times=[]
 for seg in segments:
  for word in seg['words']:
   for c in norm(word['text']):chars.append(c);times.append((float(word['start']),float(word['end'])))
 target=''.join(norm(l['text']) for l in expected);actual=''.join(chars)
 if not target or not actual:raise ValueError('没有识别到可匹配的歌词')
 ratio=difflib.SequenceMatcher(None,target,actual,autojunk=False).ratio()
 if ratio<.65 or len(actual)>len(target)*1.35:raise ValueError('识别结果与原歌词差异过大或存在额外复唱，请检查歌曲或歌词。实际识别：'+actual[:350])
 # Edit alignment associates observed words with original lines, including substitutions.
 # Missing words receive no invented timestamps; original lyrics are never rewritten.
 n,m=len(target),len(actual);dp=[list(range(m+1))]
 for i in range(1,n+1):
  row=[i]+[0]*m
  for j in range(1,m+1):row[j]=min(dp[i-1][j]+1,row[j-1]+1,dp[i-1][j-1]+(target[i-1]!=actual[j-1]))
  dp.append(row)
 mapping={};i,j=n,m
 while i or j:
  if i and j and dp[i][j]==dp[i-1][j-1]+(target[i-1]!=actual[j-1]):mapping[i-1]=j-1;i-=1;j-=1
  elif i and dp[i][j]==dp[i-1][j]+1:i-=1
  else:j-=1
 result=[];offset=0;previous=0
 for line in expected:
  text=norm(line['text']);indices=[mapping[i] for i in range(offset,offset+len(text)) if i in mapping]
  exact=sum(target[i]==actual[mapping[i]] for i in range(offset,offset+len(text)) if i in mapping)
  if not text or not indices or exact/len(text)<.45:raise ValueError('整句未能可靠定位：'+line['text']+'；实际识别：'+actual[:350])
  first,last=min(indices),max(indices);a=times[first][0];b=times[last][1];heard=actual[first:last+1]
  if not math.isfinite(a+b) or a<previous-.02 or not 0<=a<b<=total+.05:raise ValueError('识别时间存在重叠或异常：'+line['text'])
  result.append({'line_id':line['line_id'],'text':line['text'],'performed_text':heard,'recognition_differs':heard!=text,'start':a,'end':min(b,total)});previous=b;offset+=len(text)
 return result,round(ratio,4),actual

def choose_cuts(lines,total,count):
 if not count or not count*5<=total<=count*12:raise ValueError('当前分镜数量无法覆盖实测歌曲且每镜保持5–12秒，请先调整分镜数量')
 # Dynamic programming prefers complete lyric boundaries, using instrumental gaps when needed.
 points={0.,float(total)}
 for l in lines:points.update([l['start'],l['end']])
 for i in range(1,math.ceil(total*2)):
  t=i/2
  if not any(l['start']<t<l['end'] for l in lines):points.add(t)
 points=sorted(points);cost={0.:(0,[])}
 boundaries={x for l in lines for x in [l['start'],l['end']]}
 for step in range(count):
  nxt={}
  for end in points[1:]:
   remaining=count-step-1
   if not remaining*5-.001<=total-end<=remaining*12+.001:continue
   best=None
   for start,(score,path) in cost.items():
    d=end-start
    if not 5-.001<=d<=12+.001:continue
    value=score+(d-total/count)**2+(0 if end in boundaries or end==total else 2)
    if best is None or value<best[0]:best=(value,path+[end])
   if best:nxt[end]=best
  cost=nxt
 if total not in cost:raise ValueError('无法在完整唱句之间安排5–12秒切点，请调整分镜数量；无需手动标歌词')
 return [0.]+cost[total][1]

def start(p,continuation=None):
 with GUARD:
  if p.get('alignment_job',{}).get('status')=='running':
   if continuation:raise ValueError('歌曲正在自动分析，完成后再点击批量生成即可')
   return p['alignment_job']
  if p.get('job',{}).get('status')=='running':raise ValueError('请等待当前合成结束后再自动分析歌曲')
  import batch_engine
  if any(b['status'] in ['running','pausing'] for b in batch_engine.listing(p['id'])):raise ValueError('请等待当前批量生成完成，或先停止后再自动分析歌曲')
  w=timeline.waveform(p,FOLDER(p['id']),FF)
  job={'status':'running','message':'正在自动识别歌曲歌词与时间，无需手动查看WAV','audio_sha256':w['sha256'],'started_at':time.time()}
  p['alignment_job']=job;SAVE(p)
  threading.Thread(target=work,args=(p['id'],w,continuation),daemon=True).start();return job

def work(pid,w,continuation):
 try:
  p=READ(pid);folder=FOLDER(pid);expected=[l for sec in p['suite']['song']['sections'] for l in sec['lines']]
  key=hashlib.sha256(json.dumps(expected,ensure_ascii=False).encode()).hexdigest()
  request=folder/('asr-request-'+w['sha256'][:16]+'.json');result=folder/('asr-turbo-result-'+w['sha256'][:16]+'.json')
  if not result.exists():
   language=p['suite']['song'].get('language',{});language=language.get('code') if isinstance(language,dict) else language
   language={'zh-CN':'zh','yue':'zh'}.get(language,language)
   request.write_text(json.dumps({'audio':str(folder/w['audio']),'language':language}),'utf-8')
   proc=subprocess.run([sys.executable,str(BASE/'recognize.py'),str(request),str(result)],capture_output=True,creationflags=0x08000000,timeout=1800)
   if proc.returncode:raise ValueError(proc.stderr.decode('utf-8','replace')[-1500:])
  recognized=json.loads(result.read_text('utf-8'));lines,confidence,text=match_lines(expected,recognized['segments'],w['duration_seconds']);cuts=choose_cuts(lines,w['duration_seconds'],len(p['suite']['shots']['shots']))
  with GUARD:
   current=READ(pid);latest=timeline.waveform(current,folder,FF);now=[l for sec in current['suite']['song']['sections'] for l in sec['lines']]
   if latest['sha256']!=w['sha256'] or hashlib.sha256(json.dumps(now,ensure_ascii=False).encode()).hexdigest()!=key:raise ValueError('分析期间歌曲或歌词已改变，请重新自动分析')
   current=timeline.apply(current,w,{'lines':lines,'cuts':cuts},automatic=True)
   current['alignment'].update(recognition_similarity=confidence,recognized_text=text,model='faster-whisper-large-v3-turbo',result_file=result.name)
   differences=[{'line_id':l['line_id'],'original':l['text'],'recognized':l['performed_text']} for l in lines if l['recognition_differs']]
   current['alignment']['recognition_differences']=differences
   current['alignment_job']={'status':'completed','message':'歌词时间与分镜切点已自动更新，可直接生成分镜'+('；部分识别唱词与原文不同，已保留原文并列出差异' if differences else ''),'finished_at':time.time()};SAVE(current)
  if continuation:
   import batch_engine
   batch_engine.start(current,continuation)
 except Exception as e:
  with GUARD:
   current=READ(pid);current['alignment_job']={'status':'failed','message':'自动分析未完成：'+str(e),'finished_at':time.time()};SAVE(current)
