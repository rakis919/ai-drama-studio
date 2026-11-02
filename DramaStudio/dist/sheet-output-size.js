(function(root){
 function choose(images,panels,mode='native'){
  if(mode==='2k')return {width:2560,height:1440};
  if(mode==='4k')return {width:3840,height:2160};
  if(mode!=='native')throw Error('请选择有效的合并尺寸');
  let multiplier=1;
  images.forEach((image,i)=>{const w=Number(image.naturalWidth??image.width),h=Number(image.naturalHeight??image.height),fraction=Number(panels[i]?.width);if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||!Number.isFinite(fraction)||fraction<=0)throw Error('原图尺寸无效');multiplier=Math.max(multiplier,Math.ceil((w+24)/(fraction*16)),Math.ceil((h+24)/9));});
  const width=multiplier*16,height=multiplier*9;
  if(width>8192||height>8192||width*height>32000000)throw Error('保留原图需要 '+width+' × '+height+'，超出合并上限；请选择4K或2K尺寸');
  return {width,height};
 }
 const api={choose};if(typeof module==='object'&&module.exports)module.exports=api;else root.SheetOutputSize=api;
})(typeof window==='undefined'?globalThis:window);
