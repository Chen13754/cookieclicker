'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cache = path.join(root, '.cache', 'browser');
fs.mkdirSync(cache, {recursive:true});
process.env.TEMP = process.env.TMP = process.env.TMPDIR = cache;
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'.cache','playwright');
const {chromium} = require('playwright-core');
const baseline = 'c77f00c51854a667da35a3135120797a579c2d72';
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.ico':'image/x-icon','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg','.json':'application/json','.txt':'text/plain'};
async function start() {
  const originalIndex=fs.readFileSync(path.join(root,'index.html'),'utf8').replace("var PRESETMODS=['yc-tools.js?v=1'];",'var PRESETMODS=[];').replace("var SAVESUFFIX='YC';","var SAVESUFFIX='';").replace(/<script src="yc-save-core[^>]*><\/script>/,'').replace(/<link href="yc-tools[^>]*>/,'');
  const originalMain=execFileSync('git',['show',baseline+':main.js'],{cwd:root,maxBuffer:8*1024*1024});
  const server = http.createServer((req,res) => {
    let url = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const original = url.startsWith('/upstream/');
    url = url.replace(/^\/(?:cookieclicker|upstream)\//,'/');
    if(url === '/')url='/index.html';
    const filename=path.resolve(root,'.'+url);
    if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    try {
      let data;
      if(original && url === '/index.html') {
        data=originalIndex;
      } else if(original && url === '/main.js') data=originalMain;
      else data=fs.readFileSync(filename);
      res.writeHead(200,{'Content-Type':(mime[path.extname(filename)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-store'});res.end(data);
    } catch(_){res.writeHead(404);res.end('Not found');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({...(process.env.YC_BROWSER?{channel:process.env.YC_BROWSER}:{}),headless:true});
  return {browser,server,url:'http://127.0.0.1:'+server.address().port};
}
async function load(context,url,original=false) {
  const page=await context.newPage();
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  if(original)await page.addInitScript(()=>localStorage.setItem('CookieClickerLang','ZH-CN'));
  const response=await page.goto(url,{waitUntil:'load'}); if(response.status()!==200)throw Error('HTTP '+response.status());
  await page.waitForFunction(()=>window.Game && Game.ready===1).catch(async e=>{console.log('load debug',errors,await page.evaluate(()=>({ready:window.Game?.ready,lang:window.locId,html:document.body.innerText.slice(0,400),scripts:[...document.scripts].map(x=>x.src)})));throw e;});
  if(!original)await page.locator('#yc-export').waitFor({state:'visible'});
  if(!original)await page.waitForFunction(()=>!document.getElementById('yc-export').disabled);
  return {page,errors};
}
module.exports={start,load,root,baseline};