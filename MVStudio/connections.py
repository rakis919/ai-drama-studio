"""Shared per-shot connection settings."""
import copy

def source(p,sid):return p.get('connection_settings',{}).get(sid,{}).get('first_source',sid)
def method(p,sid,fallback='first_last_frames'):return p.get('connection_settings',{}).get(sid,{}).get('method',fallback)
def apply(p,items):
 p=copy.deepcopy(p);known={x['shot_id'] for x in p.get('suite',{}).get('shots',{}).get('shots',[])}
 if not isinstance(items,list) or len(items)>300:raise ValueError('连接设置格式无效')
 for item in items:
  sid=item.get('shot_id');src=item.get('first_source',sid);kind=item.get('method','first_last_frames');action=item.get('action','')
  if sid not in known or src not in known or kind not in ['first_frame','first_last_frames','reference_images']:raise ValueError('分镜、首帧来源或生成方式无效')
  if not isinstance(action,str) or len(action)>8000:raise ValueError('简要动作过长')
  p.setdefault('connection_settings',{})[sid]={'method':kind,'first_source':src,'action':action}
  shot=next(x for x in p['suite']['shots']['shots'] if x['shot_id']==sid);shot['connection_action']=action
 return p
