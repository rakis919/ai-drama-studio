const median=a=>{const v=a.filter(n=>Number.isFinite(n)&&n>=0).sort((a,b)=>a-b);return v.length?v[Math.floor(v.length/2)]:null;};
const seconds=(a,b)=>{const x=Date.parse(a),y=Date.parse(b);return Number.isFinite(x)&&Number.isFinite(y)&&x>=y?(x-y)/1000:null;};
function timing(job,history=[],now=Date.now()){
 const p=job.progress||{},end=job.finished_at||new Date(now).toISOString(),started=p.execution_started_at||job.started_at;
 const elapsed=seconds(end,job.created_at)||0,used=seconds(end,started)||0;
 const r={elapsed_seconds:elapsed,running_seconds:started?used:null,queue_seconds:seconds(started,job.created_at),actual_duration_seconds:job.actual_duration_seconds??null};
 const sampleUsed=seconds(end,p.sampling_started_at),sampleDone=seconds(p.sampling_finished_at,p.sampling_started_at);
 if(p.sampling_started_at){r.preparation_seconds=seconds(p.sampling_started_at,started);r.sampling_seconds=sampleDone??sampleUsed;}
 if(p.sampling_finished_at)r.postprocessing_seconds=seconds(end,p.sampling_finished_at);
 if(['completed','failed','cancelled','draft'].includes(job.status))return r;
 const video=!!job.generated_frames||/video/.test(job.kind||''),pixels=(job.width||864)*(job.height||480),frames=job.generated_frames||1,steps=Number(p.total_steps||job.steps||25),batch=job.batch_size||1;
 const compatible=history.filter(h=>h.status==='completed'&&h.id!==job.id&&(h.port||8188)===(job.port||8188)&&h.width===job.width&&h.height===job.height&&h.steps===job.steps&&(h.batch_size||1)===batch&&(!job.kind||h.kind===job.kind)&&(!job.video_method||h.video_method===job.video_method)&&(!job.model||h.model===job.model)&&(!job.video_quality||h.video_quality===job.video_quality));
 const near=compatible.filter(h=>{const ratio=frames/(h.generated_frames||1);return ratio>=0.8&&ratio<=1.25;});
 const peers=near.length?near:compatible;
 const scale=pixels/(864*480),frameScale=video?frames/124:1;
 const fallbackStep=video?18*scale*frameScale:4*scale*batch;
 const historyStep=median(peers.map(h=>{const t=seconds(h.progress?.sampling_finished_at,h.progress?.sampling_started_at);return t===null?null:t/Number(h.steps||steps)*frames/(h.generated_frames||1);}));
 const historyPost=median(peers.map(h=>{const t=seconds(h.finished_at,h.progress?.sampling_finished_at);return t===null?null:t*frames/(h.generated_frames||1);}));
 const overhead=Math.max(3,historyPost??(video?35*scale*frameScale:8*scale*batch));
 const preparation=median(peers.map(h=>seconds(h.progress?.sampling_started_at,h.progress?.execution_started_at||h.created_at)))??(video?50:25);
 const times=(p.step_times||[]).filter(t=>Number.isFinite(t.step)&&Number.isFinite(t.at)).sort((a,b)=>a.at-b.at);
 const intervals=[];for(let i=1;i<times.length;i++){const n=times[i].step-times[i-1].step;if(n>0&&times[i].at>times[i-1].at)intervals.push((times[i].at-times[i-1].at)/1000/n);}
 let perStep=median(intervals),basis=perStep!==null?'live_steps':historyStep!==null?'history':'workload';
 const completed=Math.max(0,Math.min(steps,Number(p.step)||0)),last=times.filter(t=>t.step===completed).at(-1);
 if(perStep===null&&completed>0&&last&&p.sampling_started_at){const first=seconds(new Date(last.at).toISOString(),p.sampling_started_at);if(first!==null&&first>0){perStep=Math.max(first/completed,historyStep||0);basis='first_step';}}
 perStep=perStep??historyStep??fallbackStep;
 let remaining,overdue=false;
 if(p.phase==='sampling'){
  const pending=steps-completed,since=last?Math.max(0,(now-last.at)/1000):sampleUsed||0;
  if(pending>0){
   // A slow current step cannot make the still-unstarted steps disappear.
   const current=Math.max(perStep-since,Math.min(perStep*0.25,5));
   if(since>perStep){overdue=true;remaining=Math.max(perStep,since)*Math.max(0,pending-1)+Math.max(perStep*0.25,since*0.2)+overhead;}
   else remaining=perStep*Math.max(0,pending-1)+current+overhead;
   r.sampling_remaining_seconds=Math.max(0,remaining-overhead);
  }else{remaining=Math.max(5,overhead);r.sampling_remaining_seconds=0;}
 }else if(['decode','save'].includes(p.phase)){
  const phaseStart=p.phase_marks?.[p.phase]||p.phase_started_at,phaseUsed=seconds(end,phaseStart)||0;
  const stageHistory=median(peers.map(h=>{const t=seconds(h.finished_at,h.progress?.phase_marks?.[p.phase]);return t===null?null:t*frames/(h.generated_frames||1);}));
  const stageEstimate=stageHistory??(p.phase==='save'?Math.max(5,overhead*0.35):overhead);
  overdue=phaseUsed>stageEstimate;remaining=overdue?Math.max(10,phaseUsed*0.25):Math.max(5,stageEstimate-phaseUsed);
 }else{
  const prepUsed=used,prepRemaining=Math.max(10,preparation-prepUsed);overdue=prepUsed>preparation;
  remaining=prepRemaining+perStep*steps+overhead;
 }
 const uncertainty=basis==='live_steps'&&!overdue?0.25:basis==='first_step'||basis==='workload'||overdue?0.5:0.35;
 r.estimate_samples=peers.length;r.estimate_basis=basis;r.estimate_overdue=overdue;r.history_match=near.length?'same_size_similar_frames':peers.length?'same_size_scaled_frames':'none';
 r.estimate_width=job.width;r.estimate_height=job.height;r.estimate_generated_frames=job.generated_frames;
 r.remaining_seconds=Math.ceil(remaining);r.postprocessing_estimate_seconds=Math.ceil(overhead);
 r.estimated_total_seconds=Math.ceil(used+remaining);
 const lower=Math.max(p.phase==='sampling'?Math.ceil(overhead):5,Math.floor(remaining*(1-uncertainty))),upper=Math.ceil(remaining*(1+uncertainty));
 r.remaining_range_seconds=[lower,upper];r.estimated_total_range_seconds=[Math.ceil(used+lower),Math.ceil(used+upper)];
 return r;
}
module.exports={timing};
