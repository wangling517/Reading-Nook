import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'};
const port=Number(process.env.READING_HOUSE_PORT||4177);
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    let relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
    const file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)||relative.includes('..')||!mime[path.extname(file)]){res.writeHead(404);res.end('Not found');return;}
    const content=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'microphone=(self)'});res.end(content);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`阅读小屋本机预览：http://127.0.0.1:${port}\n请保持此窗口开启。手机正式使用需部署到HTTPS静态网站。`));
