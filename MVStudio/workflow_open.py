"""Open an immutable saved job graph in the existing ComfyUI workflow loader."""
import json,re,uuid,copy,urllib.request,urllib.parse
from pathlib import Path
import generation_backend

def read_job(folder,kind,jid):
 if kind not in ['video','frame'] or not re.fullmatch('[a-f0-9]{32}',str(jid)):raise ValueError('无效工作流任务')
 job=json.loads((Path(folder)/(kind+'-jobs')/(jid+'.json')).read_text('utf-8'))
 if job.get('project_id')!=Path(folder).name:raise ValueError('工作流不属于当前项目')
 return job

def graph_path(folder,kind,jid):
 read_job(folder,kind,jid)
 return Path(folder)/(kind+'-jobs')/(jid+'-workflow.json')

def links(folder,kind,job,visited=None):
 visited=set() if visited is None else visited
 jid=job['id']
 if jid in visited or len(visited)>20:return []
 visited.add(jid);pid=Path(folder).name;route=f'/api/project/{pid}/workflow/{kind}/{jid}'
 if (Path(folder)/(kind+'-jobs')/(jid+'-workflow.json')).is_file():return [{'label':'打开本次工作流 ↗','open_url':route+'?open=1','download_url':route+'?download=1'}]
 sources=job.get('source_jobs') or ([job['source_job_id']] if job.get('source_job_id') else [])
 result=[]
 for i,source in enumerate(sources[:20]):
  try:items=links(folder,kind,read_job(folder,kind,source),visited)
  except (ValueError,OSError):continue
  for item in items:item['label']=f'子段 {i+1} 工作流 ↗' if len(sources)>1 else '源生成工作流 ↗';result.append(item)
 return result

def prepare(folder,kind,jid,browser_host='127.0.0.1'):
 job=read_job(folder,kind,jid);graph=json.loads(graph_path(folder,kind,jid).read_text('utf-8'))
 if job.get('execution_backend')=='lightcc':
  state=generation_backend.bridge('/gateway-state')
  if not state.get('connected') or str(state.get('applicationId'))!=str(job.get('cloud_instance_id')):raise ValueError('请先连接本次任务所属的 LightCC 实例，再打开工作流')
  base=generation_backend.CLOUD;port=18191
 else:base=generation_backend.LOCAL;port=8188
 # Isolate preview node IDs from other open graphs; all model inputs stay identical.
 if not isinstance(graph,dict) or any(not isinstance(n,dict) or 'class_type' not in n for n in graph.values()):raise ValueError('保存的工作流格式无效')
 keys=list(graph);offset=100000+int(jid[:8],16)%1000000*1000;ids={key:str(offset+i) for i,key in enumerate(keys)};preview={}
 for key,node in graph.items():
  node=copy.deepcopy(node)
  for name,value in node.get('inputs',{}).items():
   if isinstance(value,list) and len(value)==2 and isinstance(value[1],int) and isinstance(value[0],(str,int)) and str(value[0]) in ids:node['inputs'][name]=[ids[str(value[0])],value[1]]
  preview[ids[key]]=node
 filename='DramaStudio-'+str(uuid.uuid5(uuid.NAMESPACE_URL,'MVStudio/'+Path(folder).name+'/'+kind+'/'+jid))+'.json'
 req=urllib.request.Request(base+'/api/userdata/'+urllib.parse.quote(filename,safe=''),data=json.dumps(preview,ensure_ascii=False).encode(),headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=15) as response:
  if response.status not in [200,201,204]:raise ValueError('ComfyUI 工作流载入准备失败')
 with urllib.request.urlopen(base+'/extensions',timeout=10) as response:extensions=json.load(response)
 host=browser_host if re.fullmatch(r'[a-zA-Z0-9.-]+',browser_host or '') else '127.0.0.1';url=f'http://{host}:{port}/'
 return url+'?studio_workflow='+urllib.parse.quote(filename) if '/extensions/drama-studio/open.js' in extensions else None,url
