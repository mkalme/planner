import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=fileURLToPath(new URL('./public/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    const relative=decodeURIComponent(url.pathname.replace(/^\/planner(?=\/|$)/,'')).replace(/^\/+/, '')||'index.html';
    const filename=path.resolve(base,relative);
    if(!filename.startsWith(base)){res.writeHead(403);return res.end('Forbidden');}
    const data=await fs.readFile(filename);
    res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Still prototypes: http://127.0.0.1:4173'));
