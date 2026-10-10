'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {start,load,tool}=require('./helpers.cjs');
const passed=[];const run=async(name,fn)=>{await fn();passed.push(name);console.log('PASS',name);};
(async()=>{const app=await start();try{
 const context=await app.browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
 const {page,errors}=await load(context,process.env.YC_URL||app.url+'/cookieclicker/');
 await page.evaluate(()=>{Game.Logic=()=>{};Game.prefs.autosave=0;Game.cookies=1e70;Game.cookiesEarned=1e70;for(const b of Game.ObjectsById){b.amount=b.bought=100+b.id*7;b.level=3;b.locked=0;b.refresh();}Game.CalculateGains();Game.RebuildUpgrades();});
 async function refresh(){await page.evaluate(()=>{window.round=YCEfficiency.metrics.rounds;YCEfficiency.refresh();});await page.waitForFunction(()=>YCEfficiency.metrics.rounds>window.round||!!YCEfficiency.error);assert.equal(await page.evaluate(()=>YCEfficiency.error),'');}
 async function parity(){
  const report=await page.evaluate(()=>{
   const nativeWin=Game.Win,clock=Date.now,originalBuffs=Game.buffs,n=Game.shimmerTypes.golden.n;
   const s=YCEfficiency.snapshot(),p=YCEfficiencyCore.prepare(s);Date.now=()=>s.now;Game.Win=()=>{};
   const failures=[];let checked=0;
   const close=(a,b)=>Math.abs(a-b)<=Math.max(Math.abs(a),Math.abs(b),1)*1e-11;
   function native(full){Game.buffs=full?originalBuffs:{};Game.shimmerTypes.golden.n=full?n:0;Game.CalculateGains();return {cps:Game.cookiesPs,click:Game.computedMouseCps};}
   const base=native(false),full=native(true);if(!close(base.cps,p.base.cps)||!close(full.cps,p.full.cps))failures.push(['base',base,p.base,full,p.full]);
   try{for(const c of s.candidates){if(c.unsupported)continue;const row=YCEfficiencyCore.evaluate(p,c),me=c.type==='building'?Game.ObjectsById[c.id]:Game.UpgradesById[c.id],key=c.type==='building'?'amount':'bought',old=me[key];
    try{me[key]=c.type==='building'?old+1:1;const after=native(false),afterFull=native(true);for(const [actual,expected,label] of [[row.delta,after.cps-base.cps,'cps'],[row.click,after.click-base.click,'click'],[row.fullDelta,afterFull.cps-full.cps,'buff']])if(!close(actual,expected))failures.push([c.name,label,actual,expected]);checked++;}finally{me[key]=old;}
   }}finally{Game.buffs=originalBuffs;Game.shimmerTypes.golden.n=n;Game.Win=nativeWin;Date.now=clock;Game.CalculateGains();}
   return {failures,checked};
  });assert.deepEqual(report.failures,[]);assert.ok(report.checked>=20);return report.checked;
 }
 await run('普通建筑和未购买升级逐项对照原生全局产量',async()=>{await refresh();await parity();});
 await run('指针、老奶奶、协同、猫咪牛奶、转生、龙光环对照',async()=>{
  await page.evaluate(()=>{for(const u of Object.values(Game.UpgradesById)){u.bought=u.pool!=='debug'&&u.pool!=='unused'&&u.pool!=='toggle'&&u.id%3!==0?1:0;u.unlocked=1;}for(const name of ['Thousand fingers','Million fingers','One mind','Communal brainsweep','Elder Pact','Farmer grandmas','Worker grandmas','Kitten helpers','Kitten workers','Cat ladies','Heavenly chip secret','Heavenly key'])Game.Upgrades[name].bought=1;
   Game.prestige=10000;Game.AchievementsOwned=150;Game.lumps=80;Game.santaLevel=14;Game.dragonLevel=27;Game.dragonAura=Game.dragonAurasBN['Elder Battalion'].id;Game.dragonAura2=Game.dragonAurasBN['Reality Bending'].id;Game.RebuildUpgrades();Game.CalculateGains();});
  await parity();await refresh();
 });
 await run('小游戏效果、万神殿和限时加成与实际折扣',async()=>{
  await page.evaluate(()=>{for(const n of ['Farm','Bank','Temple','Wizard tower'])Game.Objects[n].level=9;Game.LoadMinigames();});
  await page.waitForFunction(()=>['Farm','Bank','Temple','Wizard tower'].every(n=>Game.isMinigameReady(Game.Objects[n])));
  await page.evaluate(()=>{const g=Game.Objects.Farm.minigame;g.effs={cps:1.15,milk:1.03,cursorCps:1.2,grandmaCps:1.05,buildingCost:0.97,upgradeCost:0.98,click:1.04};const t=Game.Objects.Temple.minigame;t.slotGod(t.gods.mother,0);t.slotGod(t.gods.industry,1);t.slotGod(t.gods.creation,2);
   Game.gainBuff('frenzy',77,7);Game.gainBuff('building buff',30,10,0);Game.gainBuff('haggler luck',60,1);Game.shimmerTypes.golden.n=2;Game.dragonAura=Game.dragonAurasBN["Dragon's Fortune"].id;Game.CalculateGains();});
  await parity();await refresh();const rows=await page.evaluate(()=>YCEfficiency.results.filter(r=>r.status==='ok'));assert.ok(rows.some(r=>Math.abs(r.fullDelta-r.delta)>1));
  assert.equal(await page.evaluate(()=>YCEfficiency.results.find(r=>r.type==='building'&&r.id===0).price===Game.Objects.Cursor.getPrice()),true);
 });
 await run('纯快照计算不修改进度或持久化存档',async()=>{
  const report=await page.evaluate(()=>{const state=()=>JSON.stringify({cookies:Game.cookies,earned:Game.cookiesEarned,amounts:Game.ObjectsById.map(b=>[b.amount,b.bought,b.level,b.storedCps,b.storedTotalCps]),upgrades:Object.values(Game.UpgradesById).map(u=>[u.bought,u.unlocked]),achievements:Object.values(Game.AchievementsById).map(a=>a.won),highest:Game.cookiesPsRawHighest,cps:Game.cookiesPs,storage:{...localStorage}});const before=state(),s=YCEfficiency.snapshot(),p=YCEfficiencyCore.prepare(s);for(const c of s.candidates)YCEfficiencyCore.evaluate(p,c);return before===state();});assert.equal(report,true);
 });
 await run('零、负、免费、溢出、浮点精度和点击分类',async()=>{
  const report=await page.evaluate(()=>{const s=YCEfficiency.snapshot(),p=YCEfficiencyCore.prepare(s),c=s.candidates.find(c=>c.type==='building');const free=YCEfficiencyCore.evaluate(p,{...c,price:0});const overflow=YCEfficiencyCore.evaluate(p,{...c,price:Infinity});
   const huge=structuredClone(s);huge.buildings.at(-1).amount=1e100;huge.upgrades.forEach(u=>u.bought=0);const precision=YCEfficiencyCore.evaluate(YCEfficiencyCore.prepare(huge),{...c,id:0});
   const fresh=structuredClone(s);fresh.upgrades.forEach(u=>u.bought=0);fresh.buildings.forEach(b=>b.amount=10);fresh.scalars.prestige=0;
   const mouse=fresh.upgrades.find(u=>u.name==='Plastic mouse'),click=YCEfficiencyCore.evaluate(YCEfficiencyCore.prepare(fresh),{type:'upgrade',id:mouse.id,price:100});
   const covenant=fresh.upgrades.find(u=>u.name==='Elder Covenant'),negative=YCEfficiencyCore.evaluate(YCEfficiencyCore.prepare(fresh),{type:'upgrade',id:covenant.id,price:100});
   return [free.status,overflow.status,precision.status,click.status,negative.status,click.click>0];});assert.deepEqual(report,['free','overflow','precision','click','negative',true]);
 });
 await run('建筑指数、原生说明、升级提示和比较排序',async()=>{
  await refresh();assert.ok(await page.locator('.yc-eff-score').count()>=20);
  const html=await page.evaluate(()=>({building:Game.Objects.Grandma.tooltip(),upgrade:Game.crateTooltip(Game.UpgradesInStore.find(u=>!u.bought),'store')}));assert.match(html.building,/购买1个/);assert.match(html.upgrade,/性价比/);
  await tool(page,'#yc-efficiency');await page.locator('.yc-eff-item').first().waitFor();
  assert.equal(await page.locator('#yc-toolbar').isVisible(),false);assert.ok((await page.locator('#yc-eff-status').innerText()).includes('更新于'));
  const scores=await page.evaluate(()=>[...document.querySelectorAll('.yc-eff-item')].map(e=>e.innerText.match(/性价比：(\d\.\d{3}e[+-]\d+)/)?.[1]).filter(Boolean).map(Number));assert.ok(scores.every((s,i)=>!i||s<=scores[i-1]));
  await page.locator('#yc-eff-category').selectOption('upgrade');assert.ok((await page.locator('.yc-eff-item small').allTextContents()).every(t=>t.startsWith('升级')));
  await page.locator('#yc-eff-category').selectOption('all');await page.locator('#yc-eff-affordable').check();assert.ok((await page.locator('.yc-eff-item small').allTextContents()).every(t=>t.endsWith('买得起')));await page.locator('#yc-eff-affordable').uncheck();
  await page.screenshot({path:'test-results/efficiency-desktop.png'});
 });
 await run('商店长价格和数量不被指数覆盖，建筑行保持原高',async()=>{
  await page.locator('#yc-close').click();
  const overlaps=await page.evaluate(()=>Game.ObjectsById.map(b=>{
   b.l.className='product unlocked enabled';const score=b.l.querySelector('.yc-eff-score');delete score.dataset.amount;const p=b.l,s=p.querySelector('.yc-eff-score').getBoundingClientRect(),price=p.querySelector('.price').getBoundingClientRect(),owned=p.querySelector('.owned').getBoundingClientRect();
   const hit=r=>r.width>0&&s.left<r.right&&s.right>r.left&&s.top<r.bottom&&s.bottom>r.top;
   return {name:b.name,price:hit(price),owned:hit(owned),height:p.getBoundingClientRect().height,inside:s.bottom<=p.getBoundingClientRect().bottom+1};
  }));assert.ok(overlaps.every(r=>!r.price&&!r.owned&&r.height===64&&r.inside),JSON.stringify(overlaps));
  await page.waitForTimeout(1100);assert.ok((await page.locator('.yc-eff-score').allTextContents()).every(text=>text.includes('性价比')));await page.screenshot({path:'test-results/efficiency-store.png'});
  await tool(page,'#yc-efficiency');
 });
 await run('批量按钮不改变单个口径，原生购买可点击',async()=>{
  const before=await page.evaluate(()=>YCEfficiency.results.find(r=>r.type==='building'&&r.id===0));await page.locator('#yc-close').click();await page.evaluate(()=>Game.storeBulkButton(3));await refresh();const after=await page.evaluate(()=>YCEfficiency.results.find(r=>r.type==='building'&&r.id===0));assert.equal(before.price,after.price);assert.equal(before.delta,after.delta);
  const count=await page.evaluate(()=>Game.Objects.Cursor.amount);await page.locator('#product0').click();assert.equal(await page.evaluate(()=>Game.Objects.Cursor.amount),count+10);await page.waitForFunction(old=>YCEfficiency.results.some(r=>r.type==='building'&&r.id===0&&r.price!==old),before.price);
 });
 await run('节流、进度变化刷新、后台暂停及恢复',async()=>{
  await refresh();const count=await page.evaluate(()=>YCEfficiency.metrics.rounds);await page.waitForTimeout(2200);assert.equal(await page.evaluate(()=>YCEfficiency.metrics.rounds),count);
  await page.evaluate(()=>{window.ycHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.ycHidden});document.dispatchEvent(new Event('visibilitychange'));Game.Objects.Cursor.amount++;});await page.waitForTimeout(2200);assert.equal(await page.evaluate(()=>YCEfficiency.metrics.rounds),count);
  await page.evaluate(()=>{window.ycHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(n=>YCEfficiency.metrics.rounds>n,count);
 });
 await run('开关本地保存、版本与其他产量Mod拒绝误算',async()=>{
  await tool(page,'#yc-efficiency');await page.locator('#yc-eff-enabled').uncheck();assert.equal(await page.locator('.yc-eff-score').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('YC-Efficiency-Enabled')),'false');await page.locator('#yc-eff-enabled').check();await refresh();
  await page.evaluate(()=>{Game.modHooks.cps.push(x=>x*2);YCEfficiency.refresh();});assert.match(await page.locator('#yc-eff-status').innerText(),/其他产量 Mod/);await page.evaluate(()=>Game.modHooks.cps.pop());await refresh();
  await page.evaluate(()=>{Game.version=2.059;YCEfficiency.refresh();});assert.match(await page.locator('#yc-eff-status').innerText(),/版本/);await page.evaluate(()=>Game.version=2.058);await refresh();await page.locator('#yc-close').click();
 });
 await run('手机、平板、桌面及旋转：布局、焦点、关闭',async()=>{
  for(const [w,h] of [[320,568],[390,844],[844,390],[768,1024],[1024,768],[1440,900]]){
   await page.setViewportSize({width:w,height:h});await tool(page,'#yc-efficiency');await page.waitForTimeout(100);
   const layout=await page.evaluate(()=>{const d=document.getElementById('yc-dialog'),v=visualViewport,r=d.getBoundingClientRect(),items=[...d.querySelectorAll('.yc-eff-item')];return {fits:r.left>=v.offsetLeft-1&&r.right<=v.offsetLeft+v.width+1&&r.top>=v.offsetTop-1&&r.bottom<=v.offsetTop+v.height+1,overflow:d.scrollWidth>d.clientWidth+1,columns:getComputedStyle(document.getElementById('yc-eff-list')).gridTemplateColumns.split(' ').length};});assert.equal(layout.fits,true,JSON.stringify({w,h,layout}));assert.equal(layout.overflow,false);if(w<620)assert.equal(layout.columns,1);
   if(w===390)await page.screenshot({path:'test-results/efficiency-mobile.png'});
   await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('yc-dialog').open);assert.equal(await page.evaluate(()=>document.activeElement.id),'yc-tools-toggle');
  }
  await page.setViewportSize({width:768,height:1024});await tool(page,'#yc-efficiency');await page.setViewportSize({width:1024,height:768});await page.waitForTimeout(100);await page.locator('#yc-close').click();
 });
 await run('导入和转生清除旧结果；无空闲回调时仍可计算',async()=>{
  await page.evaluate(()=>{Game.OnAscend=1;YCEfficiency.refresh();});assert.equal(await page.evaluate(()=>YCEfficiency.results.length),0);assert.match(await page.evaluate(()=>YCEfficiency.error),/转生/);
  await page.evaluate(()=>{Game.OnAscend=0;window.requestIdleCallback=undefined;});await refresh();
  const code=await page.evaluate(()=>Game.WriteSave(1));await page.evaluate(()=>{Game.Objects.Cursor.amount=1;});await refresh();const old=await page.evaluate(()=>YCEfficiency.results.find(r=>r.type==='building'&&r.id===0).price);
  await tool(page,'#yc-import');await page.locator('#yc-file').setInputFiles({name:'efficiency.txt',mimeType:'text/plain',buffer:Buffer.from(code)});await page.locator('#yc-confirm-import').click();
  await page.waitForFunction(previous=>YCEfficiency.results.some(r=>r.type==='building'&&r.id===0&&r.price!==previous),old);
 });
 await run('真实触屏模拟、功能关闭后刷新保留、外部点击关闭',async()=>{
  const touch=await app.browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try{const loaded=await load(touch,process.env.YC_URL||app.url+'/cookieclicker/'),p=loaded.page;await p.evaluate(()=>Game.Earn(1000));await p.waitForFunction(()=>YCEfficiency.results.length>=2);
   await tool(p,'#yc-efficiency',true);await p.locator('#yc-eff-enabled').tap();assert.equal(await p.locator('.yc-eff-score').count(),0);
   await p.reload();await p.waitForFunction(()=>Game.ready===1&&!document.getElementById('yc-tools-toggle').disabled);await tool(p,'#yc-efficiency',true);assert.equal(await p.locator('#yc-eff-enabled').isChecked(),false);await p.evaluate(()=>Game.Earn(1000));await p.locator('#yc-eff-enabled').tap();await p.waitForFunction(()=>YCEfficiency.metrics.rounds>0);await p.screenshot({path:'test-results/efficiency-touch.png'});
   await p.touchscreen.tap(5,55);await p.waitForFunction(()=>!document.getElementById('yc-dialog').open);assert.equal(await p.evaluate(()=>document.activeElement.id),'yc-tools-toggle');assert.deepEqual(loaded.errors,[]);
  }finally{await touch.close();}
 });
 console.log('METRICS',await page.evaluate(()=>YCEfficiency.metrics));assert.deepEqual(errors,[]);
 fs.writeFileSync('test-results/efficiency-summary.json',JSON.stringify({date:new Date().toISOString(),passed,metrics:await page.evaluate(()=>YCEfficiency.metrics)},null,2));await context.close();
}finally{await app.browser.close();app.server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
