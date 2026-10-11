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
  const upstreamIndex=execFileSync('git',['show',baseline+':index.html'],{cwd:root,maxBuffer:1024*1024}).toString();
  const topBar=/<div id="topBar">[\s\S]*?(?=<div id="game">)/;
  const originalIndex=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/var PRESETMODS=\[[^\]]*\];/,'var PRESETMODS=[];').replace("var SAVESUFFIX='YC';","var SAVESUFFIX='';").replace(/<script src="yc-save-core[^>]*><\/script>/,'').replace(/<link href="yc-tools[^>]*>/,'').replace(topBar,()=>upstreamIndex.match(topBar)[0]);
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
  const requests=[];page.on('request',r=>requests.push(r.url()));
  if(original)await page.addInitScript(()=>localStorage.setItem('CookieClickerLang','ZH-CN'));
  const response=await page.goto(url,{waitUntil:'load'}); if(response.status()!==200)throw Error('HTTP '+response.status());
  await page.waitForFunction(()=>window.Game && Game.ready===1).catch(async e=>{console.log('load debug',errors,await page.evaluate(()=>({ready:window.Game?.ready,lang:window.locId,html:document.body.innerText.slice(0,400),scripts:[...document.scripts].map(x=>x.src)})));throw e;});
  if(!original)await page.locator('#yc-tools-toggle').waitFor({state:'visible'});
  if(!original)await page.waitForFunction(()=>!document.getElementById('yc-tools-toggle').disabled);
  return {page,errors,requests};
}
async function openTools(page,touch=false) {
  if(!await page.locator('#yc-toolbar').evaluate(el=>el.open))await page.locator('#yc-tools-toggle')[touch?'tap':'click']();
}
async function tool(page,selector,touch=false) {
  await openTools(page,touch);
  await page.locator(selector)[touch?'tap':'click']();
  if(await page.locator('#yc-toolbar').evaluate(el=>el.open))throw Error('Drawer remained open behind action dialog');
}
async function cleanHeader(page) {
  const assert=require('node:assert/strict');
  assert.equal(await page.locator('#topBar a').count(),3);
  assert.equal(await page.locator('#topBar > div').first().getAttribute('id'),'yc-tools-entry');
  assert.equal(await page.locator('#topBar .topLink, #topbarOtherVersions, #httpsSwitch').count(),0);
  assert.equal((await page.locator('#versionNumber').innerText()).trim(),'v. 2.058');
  assert.match(await page.locator('#topBar').innerText(),/YC自用.*Cookie Clicker.*Orteil/s);
  assert.equal(await page.locator('#topbarOrteil').getAttribute('onmouseover'),null);
  assert.equal(await page.locator('#changeLanguage').isVisible(),true);
  const layout=await page.evaluate(()=>{
    const bar=document.getElementById('topBar').getBoundingClientRect();
    return [...document.querySelectorAll('#topBar > div')].filter(el=>el.getClientRects().length && el.id!=='topBarEnd').map(el=>{const r=el.getBoundingClientRect();return {id:el.id,left:r.left,right:r.right,top:r.top,bottom:r.bottom,bar:bar.toJSON()};});
  });
  // Heralds is a native production indicator, not a navigation or promotional link.
  assert.equal(layout.filter(r=>r.id!=='heralds').length,3);
  assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('cookieclickerinfo.json'))),false);
  for(const r of layout)assert.ok(r.top>=r.bar.top && r.bottom<=r.bar.bottom+1 && r.left>=0 && r.right<=r.bar.right+1,JSON.stringify(r));
}
module.exports={start,load,root,baseline,openTools,tool,cleanHeader};