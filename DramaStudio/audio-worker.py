import sys,os,json,pathlib,types,importlib,subprocess,traceback,math,time
ROOT=pathlib.Path(__file__).resolve().parent
RUNTIME=ROOT/'audio-runtime'
MODELS=pathlib.Path('D:/AIPlatform/ComfyUI_1.3.5/models')
FFMPEG='D:/AIPlatform/ComfyUI_1.3.5/.ext/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
sys.path[:0]=[str(RUNTIME/'packages'),str(RUNTIME/'stable-audio-3')]
os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',ENABLE_TORCH_COMPILE='0',HF_HUB_DISABLE_PROGRESS_BARS='1',USE_TF='0',USE_FLAX='0')
def mma_module():
 import torch
 from safetensors.torch import load_file
 comfy=types.ModuleType('comfy');mm=types.ModuleType('comfy.model_management');utils=types.ModuleType('comfy.utils');folders=types.ModuleType('folder_paths')
 mm.get_torch_device=lambda:torch.device('cuda');mm.unet_offload_device=lambda:torch.device('cpu');mm.soft_empty_cache=lambda:torch.cuda.empty_cache()
 utils.load_torch_file=lambda file,device=None:load_file(file,device=str(device or 'cpu')) if str(file).endswith('.safetensors') else torch.load(file,map_location=device or 'cpu',weights_only=True)
 class ProgressBar:
  def __init__(self,total):self.total=total;self.step=0
  def update(self,n):self.step+=n
 utils.ProgressBar=ProgressBar
 folders.folder_names_and_paths={};folders.models_dir=str(MODELS);folders.add_model_folder_path=lambda *args:None;folders.get_folder_paths=lambda key:[str(MODELS/'mmaudio')];folders.get_full_path_or_raise=lambda key,name:str(MODELS/'mmaudio'/name);folders.get_filename_list=lambda key:[]
 sys.modules.update({'comfy':comfy,'comfy.model_management':mm,'comfy.utils':utils,'folder_paths':folders});comfy.model_management=mm;comfy.utils=utils
 pkg=types.ModuleType('studio_mma');pkg.__path__=[str(RUNTIME/'ComfyUI-MMAudio')];sys.modules['studio_mma']=pkg
 return importlib.import_module('studio_mma.nodes')
def state(folder,phase,**extra):
 data={'phase':phase,**extra};tmp=folder/'worker-state.tmp';tmp.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8');os.replace(tmp,folder/'worker-state.json');print(phase,flush=True)
def frames(video,fps,size,duration,offset=0):
 import torch,numpy as np
 args=[FFMPEG,'-hide_banner','-loglevel','error','-ss',str(offset),'-i',video,'-t',str(duration),'-vf',f'fps={fps},scale={size}:{size}:force_original_aspect_ratio=increase,crop={size}:{size}','-pix_fmt','rgb24','-f','rawvideo','pipe:1']
 raw=subprocess.check_output(args);arr=np.frombuffer(raw,dtype=np.uint8).reshape(-1,size,size,3).copy();needed=max(16 if fps==25 else 1,int(duration*fps))
 if len(arr)==0:raise ValueError('视频没有可用画面')
 if len(arr)<needed:arr=np.concatenate([arr,np.repeat(arr[-1:],needed-len(arr),axis=0)])
 return torch.from_numpy(arr[:needed]).permute(0,3,1,2).float().div_(255).unsqueeze(0)
def stable(job,folder):
 import torch
 from stable_audio_3.loading_utils import load_diffusion_cond
 from stable_audio_3.model import StableAudioModel
 base=MODELS/'stable_audio/stable-audio-3-small-sfx';config=json.loads((base/'model_config.json').read_text(encoding='utf-8'))
 for cond in config['model']['conditioning']['configs']:
  if cond['type']=='t5gemma':cond['config'].update(model_path=str(base/'t5gemma-b-b-ul2'),subfolder=None)
 state(folder,'正在加载音效模型与文字编码器')
 model=load_diffusion_cond(config,str(base/'model.safetensors'),device='cuda',model_half=True)
 api=StableAudioModel(model,config,'cuda',True)
 state(folder,'正在生成'+('环境音' if job['kind']=='ambience' else '动作音效'))
 with torch.inference_mode():audio=api.generate(prompt=job['prompt'],negative_prompt=job.get('negative_prompt') or None,duration=job['duration'],steps=8,cfg_scale=1.0,seed=job['seed'],chunked_decode=True)
 return audio[0].float().cpu(),44100
def sync(job,folder):
 import torch
 n=mma_module();state(folder,'正在加载视频同步音效模型')
 model=n.MMAudioModelLoader().loadmodel('mmaudio_large_44k_v2_fp16.safetensors','fp16')[0]
 features=n.MMAudioFeatureUtilsLoader().loadmodel('mmaudio_vae_44k_fp16.safetensors','fp16','mmaudio_synchformer_fp16.safetensors','apple_DFN5B-CLIP-ViT-H-14-384_fp16.safetensors','44k')[0]
 duration=job['duration'];state(folder,'正在读取视频画面并分析动作')
 clip=frames(job['video_path'],8,384,duration,job.get('video_offset_seconds',0));syn=frames(job['video_path'],25,224,duration,job.get('video_offset_seconds',0)).mul_(2).sub_(1)
 cfg=model.seq_cfg;cfg.duration=duration;model.update_seq_lengths(cfg.latent_seq_len,cfg.clip_seq_len,cfg.sync_seq_len)
 fm=n.FlowMatching(min_sigma=0,inference_mode='euler',num_steps=25);rng=torch.Generator(device='cuda').manual_seed(job['seed'])
 state(folder,'正在生成视频同步音效');model.to('cuda');features.to('cuda')
 with torch.inference_mode():audio=n.generate(clip,syn,[job['prompt']],negative_text=[job.get('negative_prompt') or 'speech, dialogue, music, singing'],feature_utils=features,net=model,fm=fm,rng=rng,cfg_strength=4.5)
 return audio[0].float().cpu(),44100
def check():
 result={}
 for kind in ['stable','mmaudio']:
  try:
   if kind=='stable':
    from stable_audio_3.model import StableAudioModel
    from transformers import T5GemmaEncoderModel,AutoTokenizer
    AutoTokenizer.from_pretrained(str(MODELS/'stable_audio/stable-audio-3-small-sfx/t5gemma-b-b-ul2'),local_files_only=True)
   else:mma_module()
   result[kind]={'ready':True}
  except Exception as e:result[kind]={'ready':False,'error':str(e)};traceback.print_exc()
 (RUNTIME/'readiness.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result),flush=True)
if __name__=='__main__':
 if sys.argv[1:] == ['--check']:check();sys.exit()
 jobpath=pathlib.Path(sys.argv[1]);sys.argv=[sys.argv[0]];folder=jobpath.parent
 try:
  import torch,soundfile as sf
  if not torch.cuda.is_available():raise RuntimeError('没有可用的CUDA显卡')
  job=json.loads(jobpath.read_text(encoding='utf-8'));audio,sr=sync(job,folder) if job['kind']=='sync' else stable(job,folder)
  state(folder,'正在编码并保存音频');sf.write(str(folder/'audio.wav'),audio.T.numpy(),sr,subtype='PCM_16')
  subprocess.run([FFMPEG,'-hide_banner','-loglevel','error','-y','-i',str(folder/'audio.wav'),'-t',str(job['duration']),'-c:a','libmp3lame','-b:a','320k',str(folder/'audio.mp3')],check=True)
  state(folder,'音频已完成',completed=True)
 except Exception as e:state(folder,'生成失败',error=str(e));traceback.print_exc();sys.exit(1)
