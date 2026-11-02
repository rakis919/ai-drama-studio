"""Atomic JSON replacement tolerant of short Windows read handles."""
import json,os,time,uuid,threading
from pathlib import Path
_LOCKS={};_GUARD=threading.Lock()
def write_json(file,value):
 file=Path(file);file.parent.mkdir(parents=True,exist_ok=True)
 with _GUARD:lock=_LOCKS.setdefault(str(file.resolve()),threading.RLock())
 with lock:
  tmp=file.with_name(file.name+'.'+uuid.uuid4().hex+'.tmp')
  try:
   tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
   for attempt in range(10):
    try:os.replace(tmp,file);return
    except PermissionError:
     if attempt==9:raise
     time.sleep(min(.03*2**attempt,.4))
  finally:
   if tmp.exists():
    try:tmp.unlink()
    except OSError:pass
