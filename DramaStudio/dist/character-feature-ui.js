// JSON owns identity and clothing; the server owns camera framing and background.
const featureFetchBefore=frontFetch;
frontFetch=async function(url,input){
  if(url==='/api/front-image'&&input&&input.resource_type!=='scene'){
    const c=data.characters.find(c=>String(c.id||c.character_id||c.name)===String(input.character_id));
    if(c)input={...input,prompt:CharacterViewPrompts.features(c,input.mode==='portrait'||input.angle==='portrait'),style:data.style||'',prompt_policy:CharacterViewPrompts.version,negative_prompt:[c.negativePrompt||c.generation?.negative_prompt||'',...(c.negative_constraints||[])].filter(Boolean).join('，')};
  }
  return featureFetchBefore(url,input);
};
portraitPromptFor=function(c){return CharacterViewPrompts.features(c,true)};
const featureStartBefore=startCharacterAuto;
startCharacterAuto=async function(c,resume=false,options={}){if(resume&&c.oneClick?.prompt_policy!==CharacterViewPrompts.version){resume=false;toast('已切换新构图规则，从新头像开始生成')};return featureStartBefore(c,resume,options)};
const featureCharactersBefore=characters;
characters=function(){featureCharactersBefore();const c=data.characters[ci];if(!c)return;
  const box=document.querySelector('#charPrompt');if(box){box.value=CharacterViewPrompts.features(c);box.oninput=e=>{c.prompt=e.target.value;if(c.feature_description!==undefined)c.feature_description=e.target.value;save()};const title=box.closest('.card')?.querySelector('.right-title.flex');if(title?.firstChild)title.firstChild.textContent='人物外观特征（所有视图共用）';}
  const reset=document.querySelector('#resetPrompt');if(reset)reset.onclick=()=>{c.prompt=c.prompt_anchor_zh||c.generation?.front_prompt||c.description||'';delete c.feature_description;save();render()};
  for(const p of document.querySelectorAll('#panel p.subtle'))if(p.textContent.startsWith('第一步：'))p.textContent='第一步：1024×1440正面胸像，头顶至胸部。视图构图由平台固定，人物描述只填写外观特征。';
  const help=document.createElement('p');help.className='subtle';help.textContent='头像只提取脸、发型与上身服装；全身与其他角度使用完整人物特征。背景和视角由平台添加。';if(box)box.after(help);
  for(const button of document.querySelectorAll('#panel button'))if(button.id==='editFullFrontPrompt'||(button.closest('.angle')&&button.textContent==='修改提示词')){button.textContent='编辑人物特征';button.onclick=()=>{const shared=document.querySelector('#charPrompt');shared?.scrollIntoView({block:'center',behavior:'smooth'});shared?.focus()};}
  const negativeHelp=document.createElement('p');negativeHelp.className='subtle';negativeHelp.textContent='负面词已连接采样器：头像 Turbo 使用低强度 CFG 1.5（试用）；全身与其他角度使用 Qwen Lightning 4步、CFG 1；该加速模式保留负面词，但不启用独立负面引导。';document.querySelector('#charPrompt')?.after(negativeHelp);
};render();
