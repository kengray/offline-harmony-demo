const http=require('http'),fs=require('fs'),path=require('path');
const port=+process.argv[2]||8080, root=path.join(__dirname,'..'), PREFIX='/offline-harmony-demo';
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.wav':'audio/wav','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  let p=new URL(req.url,'http://x').pathname;
  if(!p.startsWith(PREFIX)){res.statusCode=404;return res.end('nf');}
  p=p.slice(PREFIX.length)||'/'; if(p==='/')p='/index.html';
  const f=path.join(root,path.normalize(p));
  if(!f.startsWith(root)||!fs.existsSync(f)){res.statusCode=404;return res.end('nf');}
  res.setHeader('content-type',types[path.extname(f)]||'application/octet-stream');res.setHeader('cache-control','no-store');
  fs.createReadStream(f).pipe(res);
}).listen(port);
