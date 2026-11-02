const fs=require('node:fs'),path=require('node:path');
function save(job,png,root=process.env.DRAMA_SHEET_ROOT||'D:/AIPlatform/Output/DramaStudio/ContactSheets'){
 if(job.resource_type!=='character_sheet')return;
 if(png.length<24||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('人物设定图不是有效PNG');
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 const meta={id:job.id,project_id:job.project_id,character_id:job.character_id,layout:'portrait_front_side_back',sources:'[]',width,height,created_at:job.created_at,image_url:'/api/contact-sheet/'+job.id+'/image',source:'direct_generation',generation_job_id:job.id,prompt:job.prompt};
 fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,job.id+'.png'),png);fs.writeFileSync(path.join(root,job.id+'.json'),JSON.stringify(meta,null,2));return meta;
}
module.exports={save};
