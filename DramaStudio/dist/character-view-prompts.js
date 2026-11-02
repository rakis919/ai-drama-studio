(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CharacterViewPrompts=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const version='features-v1-chest';
  const text=v=>typeof v==='string'?v.trim():'';
  function clean(value){return text(value).replace(/(?:全身完整入镜|全身构图|正面全身|全身正面|全身入镜|正面半身|半身大头像|从头到脚|头顶和双脚均不裁切|四视图|三视图|角色设定板)/g,'').trim();}
  function identityOnly(value,name=''){let result=text(value);if(name&&result.startsWith(name))result=result.slice(name.length).replace(/^[，,、：:\s]+/,'');return result.replace(/围观弟子[一二三四五六七八九十\d]*/g,'').replace(/保留区别于其他弟子的独立脸型与五官/g,'脸型与五官清晰，个体特征鲜明').replace(/区别于其他(?:人物|角色|弟子|人)[^，。；;]*/g,'个体特征鲜明');}
  function upper(value){return clean(value).split(/[，,、；;。\n]/).filter(s=>s.trim()&&!/(靴|鞋|裤|袜|裙摆|衣摆|下摆|腰带|腰封|护腕|身形|身材|身高|体型|比例|修长|挺拔|磨损位置)/.test(s)).join('，');}
  function features(c,portrait=false){
    const source=c.feature_description||c.prompt||c.prompt_anchor_zh||c.generation?.front_prompt||c.description||'';
    // The shared description is authoritative; structured appearance is only a fallback.
    const fallback=[c.appearance?.age_range,c.appearance?.face_and_hair,c.appearance?.clothing,c.appearance?.proportions].filter(Boolean).join('，');
    const identity=identityOnly(source||fallback,c.name);return portrait?upper(identity):clean(identity);
  }
  const framing={
    portrait:'单人正面胸像特写（head-and-shoulders portrait, chest-up close-up）。镜头靠近人物，取景上界略高于完整发型，下界在胸部；完整头顶、发饰、脸、颈部、双肩和衣领入画。脸部是画面视觉主体，头部与双肩占据画面大部分。人物正对镜头，眼睛平视镜头，表情自然。画面在胸部截断，腰、手、腿和鞋均不入画。',
    front:'单人严格正面全身设定照，面向镜头，头顶至鞋底完整入画，双脚清楚，身体居中自然站立，双臂自然下垂，留少量上下边距。以输入头像锁定同一人物的五官、脸型、年龄、发型，向下扩展身体和完整服装。',
    left:'同一人物的单个严格90度全身左侧面（true 90-degree LEFT-FACING PROFILE）。相机位于人物正侧方，以平视角度拍摄。人物的头、胸廓、肩线、骨盆、膝盖与双脚保持同向，全部朝画面左侧。头部保持自然中立，与躯干同向，不扭颈、不回头、不朝镜头转脸；视线沿鼻尖水平看向画面左侧。面部只见近侧的一只眼睛、一侧眉毛和清楚的鼻梁侧面轮廓，远侧眼睛被遮挡；不展示正面脸或四分之三侧脸。双肩在侧面投影中前后重叠，双臂自然下垂；双腿自然站直，双脚脚尖同朝左，脚跟不抬起，不交叉腿，不走台步。头顶至鞋底完整入画，保持参考图的身份、发型、服装和自然人体比例。',
    back:'同一人物的严格全身背面，头部与身体同时背对镜头，不回头，不露正脸，头顶至鞋底完整入画，自然站立。保持参考图的发型、服装和身材比例。'
  };
  function build(input){const angle=input.mode==='portrait'?'portrait':input.angle||'front';if(!framing[angle])throw Error('不支持的人物视图');const background=input.background==='gray'?'均匀中性灰色背景':'均匀纯白背景（#FFFFFF），无灰色底块、渐变或暗角';const identity=identityOnly(input.prompt,input.character_name);const description=angle==='portrait'?upper(identity):clean(identity);return ['画面中总共只有一个人（exactly one person, solo character）。人物独自在空摄影棚中，身后和两侧全部是空白背景，没有站在后面的人、虚化人影、倒影或重复分身。',framing[angle],input.style,description,background+'，柔和均匀光照，清晰细节。单幅仅一个人物、一个视角，不要拼图、设定板、文字、水印或额外人物。保持项目指定的艺术风格。',framing[angle]].filter(Boolean).join('\n');}
  return {version,features,upper,build,framing};
});
