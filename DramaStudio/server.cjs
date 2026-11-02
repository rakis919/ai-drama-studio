const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, 'dist');
const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, 'http://localhost');
  if(req.method==='POST'&&/^\/api\/(video|front-image|scene-image|tools\/generate)$/.test(requestUrl.pathname)&&require('./local-audio-engine.cjs').blocking()){res.writeHead(409,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'音效正在使用显卡，请等待完成或先停止声音任务'}));return;}
  if(requestUrl.pathname.startsWith('/api/lightcc/')){require('./lightcc-manager.cjs').handle(req,res,requestUrl);return;}
  if(requestUrl.pathname==='/api/video-cloud/connect'){require('./lightcc-manager.cjs').handle(req,res,new URL('/api/lightcc/auto-connect','http://localhost'));return;}
  if(requestUrl.pathname==='/api/character-reference-upload'){require('./character-reference-upload.cjs').handle(req,res);return;}
  if(requestUrl.pathname==='/api/comfy-force-stop'){require('./comfy-force-stop-api.cjs').handle(req,res);return;}
  if(requestUrl.pathname.startsWith('/api/shot-upscale')){require('./shot-upscale-api.cjs').handle(req,res,requestUrl);return;}
  if(requestUrl.pathname.startsWith('/api/audio-batch')){require('./audio-batch-api.cjs').handle(req,res,requestUrl);return;}
  if(requestUrl.pathname.startsWith('/api/audio')){require('./audio-api.cjs').handle(req,res,requestUrl);return;}
  if(requestUrl.pathname==='/api/memory'||requestUrl.pathname==='/api/memory/clean'){require('./memory-api.cjs').handle(req,res,requestUrl);return;}
  if(requestUrl.pathname.startsWith('/api/first-frame-batch')){require('./first-frame-batch-api.cjs').handle(req,res,requestUrl);return;}
  if(requestUrl.pathname.startsWith('/api/shot-frame')){require('./shot-frame-api.cjs').handle(req,res,requestUrl);return;}
  if(requestUrl.pathname.startsWith('/api/h3-tools')){require('./h3-tools-api.cjs').handle(req,res,requestUrl);return;}
  if(requestUrl.pathname.startsWith('/api/tools/')){require('./quick-tools-api.cjs').handle(req,res,requestUrl);return;}
  if(requestUrl.pathname==='/api/character-cancel'){require('./character-cancel-api.cjs').handle(req,res);return;}
  if(requestUrl.pathname.startsWith('/api/film-export')){require('./film-export-api.cjs').handle(req,res,requestUrl);return;}
  if(requestUrl.pathname==='/api/video-frame'){require('./video-frame-api.cjs').handle(req,res);return;}
  if(requestUrl.pathname.startsWith('/api/video-batch')){require('./video-batch-api.cjs').handle(req,res,requestUrl);return;}
  if(requestUrl.pathname.startsWith('/api/video')){require('./video-api.cjs').handle(req,res,requestUrl);return;}
  if(requestUrl.pathname.startsWith('/api/open-workflow/')){require('./workflow-open-api.cjs').handle(req,res,requestUrl);return;}
  if(requestUrl.pathname.startsWith('/api/contact-sheet')){require('./contact-sheet-api.cjs').handle(req,res,requestUrl);return;}
  if(requestUrl.pathname==='/api/project'||requestUrl.pathname==='/api/projects'){require('./project-store.cjs').handle(req,res);return;}
  if(requestUrl.pathname.startsWith('/api/front-image')) { require('./front-image-api.cjs').handle(req,res,requestUrl).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end('Local generation error')}); return; }
  if (requestUrl.pathname.startsWith('/api/comfy/')) {
    const requestedPort = Number(requestUrl.searchParams.get('port') || 8188);
    const port = requestedPort === 8189 ? 8188 : requestedPort;
    if (!Number.isInteger(port) || port < 1 || port > 65535) { res.writeHead(400); return res.end('Invalid port'); }
    const comfyPath = requestUrl.pathname.slice('/api/comfy'.length);
    if (!/^\/(system_stats|prompt|history|queue|view|upload\/image)(\/|$)/.test(comfyPath)) { res.writeHead(404); return res.end('Unsupported ComfyUI endpoint'); }
    const origin = req.headers.origin;
    if (origin && origin !== 'http://127.0.0.1:4173' && origin !== 'http://localhost:4173' && origin !== 'http://127.0.0.1:4173') { res.writeHead(403); return res.end('Local requests only'); }
    requestUrl.searchParams.delete('port');
    const query = requestUrl.searchParams.toString();
    const upstream = http.request({hostname:'127.0.0.1', port, path:comfyPath + (query ? '?' + query : ''), method:req.method, headers:{'Content-Type':req.headers['content-type'] || 'application/json'}, timeout:15000}, reply => {
      res.writeHead(reply.statusCode, {'Content-Type':reply.headers['content-type'] || 'application/json', 'Cache-Control':'no-store'}); reply.pipe(res);
    });
    upstream.on('timeout', () => upstream.destroy(new Error('ComfyUI request timed out')));
    upstream.on('error', () => { if(!res.headersSent) res.writeHead(502, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'无法连接本机 ComfyUI，请确认已经启动及端口正确。'})); });
    req.pipe(upstream); return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); return res.end('Invalid path'); }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, bytes) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const type = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, {'Content-Type':type,'Cache-Control':'no-store'}); res.end(bytes);
  });
});
require('./h3-tools-api.cjs').resumePending();
require('./quick-tools-api.cjs').resumePending();
require('./video-batch-api.cjs').resumePending();
require('./film-export-api.cjs').resumePending();
require('./lightcc-demand.cjs');
server.listen(4173, '0.0.0.0', () => console.log('Local studio: http://127.0.0.1:4173'));
server.on('error', err => { if(err.code === 'EADDRINUSE') console.error('Port 4173 is already in use.'); else console.error(err.message); process.exitCode=1; });



require('./first-frame-batch-api.cjs').resumePending();
