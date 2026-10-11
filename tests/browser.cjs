'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {start,load,openTools,tool,cleanHeader}=require('./helpers.cjs');
const passed=[];
const run=async(name,fn)=>{await fn();passed.push(name);console.log('PASS',name);};
async function freeze(page){await page.evaluate(()=>{Game.Logic=function(){};Game.prefs.autosave=0;});}
async function idle(page){await page.waitForFunction(()=>!Game.ObjectsById.some(x=>x.minigameLoading));}
async function state(page){return page.evaluate(()=>({
 cookies:Game.cookies,earned:Game.cookiesEarned,resets:Game.resets,cookiesReset:Game.cookiesReset,prestige:Game.prestige,chips:Game.heavenlyChips,lumps:Game.lumps,lumpsTotal:Game.lumpsTotal,bakery:Game.bakeryName,
 buildings:Game.ObjectsById.map(x=>[x.amount,x.bought,Math.floor(x.totalCookies),x.level,x.highest]),
 upgrades:Object.values(Game.UpgradesById).map(x=>[x.unlocked,x.bought]),achievements:Object.values(Game.AchievementsById).map(x=>x.won),
 minigames:Object.fromEntries(['Farm','Bank','Temple','Wizard tower'].map(name=>[name,Game.Objects[name].minigame?.save()||Game.Objects[name].minigameSave||'']))
}));}
async function collapsed(page) {
 assert.equal(await page.locator('#yc-toolbar').isVisible(),false);
 const layout=await page.evaluate(()=>({bottom:Game.wrapper.getBoundingClientRect().bottom,height:document.documentElement.clientHeight,rects:document.getElementById('yc-toolbar').getClientRects().length}));
 assert.ok(Math.abs(layout.bottom-layout.height)<=2,JSON.stringify(layout));assert.equal(layout.rects,0);
 const point=await page.evaluate(()=>{
  const v=visualViewport,x=v.offsetLeft+v.width/2,y=v.offsetTop+v.height-5,target=document.elementFromPoint(x,y);
  if(!target?.closest('#wrapper'))throw Error('Visible bottom is not part of the native game');
  window.nativeBottomClicked=false;
  // Observe an actual visible game target, without changing the synthetic progress.
  target.addEventListener('click',event=>{nativeBottomClicked=true;event.stopImmediatePropagation();},{once:true,capture:true});
  return {x,y};
 });
 await page.mouse.click(point.x,point.y);assert.equal(await page.evaluate(()=>nativeBottomClicked),true);
}
async function choose(page,code){await tool(page,'#yc-import');await page.locator('#yc-file').setInputFiles({name:'native.txt',mimeType:'text/plain',buffer:Buffer.from(code)});}
async function confirm(page,code){await choose(page,code);await page.locator('#yc-confirm-import').click();await idle(page);}
async function exportFile(page){const promise=page.waitForEvent('download');await tool(page,'#yc-export');const file=await promise;assert.match(file.suggestedFilename(),/^yc-save-\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d\.txt$/);const code=fs.readFileSync(await file.path(),'utf8');assert.equal(code,await page.locator('#yc-save-text').inputValue());await page.locator('#yc-close').click();return code;}
(async()=>{
 const app=await start();let officialSave,expected,returned,offlineSave,offlineExpected,offlineNow;
 try{
  let ctx=await app.browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  let {page,errors}=await load(ctx,app.url+'/upstream/',true);
  await freeze(page);
  await page.evaluate(()=>{
   Game.cookies=123456789;Game.cookiesEarned=1e15;Game.cookiesReset=1e24;Game.resets=7;Game.prestige=Game.HowMuchPrestige(Game.cookiesReset);Game.heavenlyChips=6789;
   Game.bakeryName='跨设备测试店';Game.lumps=42;Game.lumpsTotal=100;Game.lumpT=Date.now();
   for(const name of ['Farm','Bank','Temple','Wizard tower']){let x=Game.Objects[name];x.amount=x.bought=x.highest=100;x.level=name==='Farm'?9:1;x.totalCookies=12345;}
   Game.Upgrades['Heavenly chip secret'].unlocked=Game.Upgrades['Heavenly chip secret'].bought=1;
   Game.Upgrades['Reinforced index finger'].unlocked=Game.Upgrades['Reinforced index finger'].bought=1;
   Game.Win('Wake and bake');Game.LoadMinigames();
  });
  await page.waitForFunction(()=>['Farm','Bank','Temple','Wizard tower'].every(name=>Game.isMinigameReady(Game.Objects[name]))).catch(async e=>{console.log('minigame debug',errors,await page.evaluate(()=>['Farm','Bank','Temple','Wizard tower'].map(n=>[n,Game.Objects[n].minigameUrl,Game.Objects[n].minigameLoaded,Game.Objects[n].minigameLoading])));throw e;});
  await page.evaluate(()=>{
   let m=Game.Objects.Farm.minigame;m.freeze=1;m.harvests=3;m.harvestsTotal=9;m.plants.bakerWheat.unlocked=1;m.plants.thumbcorn.unlocked=1;m.plot[2][2]=[1,25];
   m=Game.Objects.Bank.minigame;m.brokers=7;m.profit=12345;m.goodsById[0].stock=23;m.goodsById.forEach((g,i)=>{g.val=100+i;g.d=1;g.prev=100;g.mode=0;g.dur=100;});m.goodsById[0].val=42.5;
   m=Game.Objects.Temple.minigame;m.slotGod(m.godsById[0],0);m.swaps=2;
   m=Game.Objects['Wizard tower'].minigame;m.magic=5;m.spellsCast=22;m.spellsCastTotal=33;
  });
  officialSave=await page.evaluate(()=>Game.WriteSave(1));
  // Native normalization is the reference for both directions, including original migrations/offline behavior.
  assert.equal(await page.evaluate(code=>Game.ImportSaveCode(code),officialSave),true);await idle(page);expected=await state(page);
  offlineNow=Date.now();
  offlineSave=await page.evaluate(({code,now})=>{const p=b64_to_utf8(unescape(code).split('!END!')[0]).split('|'),stats=p[2].split(';');stats[2]=now-7200000;p[2]=stats.join(';');const bits=p[6].split('');bits[Game.Upgrades['Twin Gates of Transcendence'].id*2]=bits[Game.Upgrades['Twin Gates of Transcendence'].id*2+1]='1';p[6]=bits.join('');return escape(utf8_to_b64(p.join('|'))+'!END!');},{code:officialSave,now:offlineNow});
  offlineExpected=await page.evaluate(({code,now})=>{const clock=Date.now;Date.now=()=>now;try{Game.ImportSaveCode(code);return {cookies:Game.cookies,earned:Game.cookiesEarned};}finally{Date.now=clock;}},{code:offlineSave,now:offlineNow});
  assert.deepEqual(errors,[]);await ctx.close();
  ctx=await app.browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  ({page,errors}=await load(ctx,process.env.YC_URL||app.url+'/cookieclicker/'));
  await run('首次中文、持续标题、模块只初始化一次',async()=>{
   await page.waitForFunction(()=>Game.T>40);assert.equal(await page.title(),'YC自用');assert.equal(await page.evaluate(()=>locId),'ZH-CN');
   await page.addScriptTag({url:new URL('yc-tools.js?v=1',page.url()).href});
   assert.equal(await page.locator('#yc-toolbar').count(),1);assert.equal(await page.locator('#yc-dialog').count(),1);
  });
  await run('顶部推广及协议锁移除，语言切换和刷新不回填',async()=>{
   await cleanHeader(page);
   const key=await page.evaluate(()=>Game.SaveTo);
   for(const lang of ['EN','ZH-CN']){
    await page.locator('#changeLanguage').click();
    await Promise.all([page.waitForEvent('load'),page.locator('#langSelect-'+lang).click()]);
    await page.waitForFunction(lang=>window.Game?.ready===1 && locId===lang && !document.getElementById('yc-tools-toggle')?.disabled,lang);
    await cleanHeader(page);assert.equal(await page.evaluate(()=>Game.SaveTo),key);
   }
   await page.reload();await page.waitForFunction(()=>window.Game?.ready===1 && !document.getElementById('yc-tools-toggle')?.disabled);await cleanHeader(page);
   assert.equal(await page.evaluate(()=>locId),'ZH-CN');assert.deepEqual(errors,[]);
  });
  await freeze(page);
  await run('默认收起且无底部占位，原版底部内容可点击',async()=>{await collapsed(page);});
  await run('抽屉反复开关、收起、Esc、外部点击与焦点返回',async()=>{
   const before=await state(page);
   for(let i=0;i<2;i++){await openTools(page);assert.equal(await page.locator('#yc-tools-toggle').getAttribute('aria-expanded'),'true');await page.locator('#yc-collapse').click();await page.waitForFunction(()=>document.activeElement.id==='yc-tools-toggle');await collapsed(page);}
   await openTools(page);await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('yc-toolbar').open);await collapsed(page);
   await openTools(page);await page.mouse.click(10,55);await page.waitForFunction(()=>!document.getElementById('yc-toolbar').open && document.getElementById('yc-tools-toggle').getAttribute('aria-expanded')==='false');assert.equal(await page.locator('#yc-tools-toggle').getAttribute('aria-expanded'),'false');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'yc-tools-toggle');assert.deepEqual(await state(page),before);
  });
  await run('原版选项入口可直接打开导入，关闭后不自动展开工具',async()=>{
   await page.evaluate(()=>Game.ImportSave());await page.locator('#yc-file').waitFor();assert.equal(await page.locator('#yc-toolbar').isVisible(),false);await page.locator('#yc-close').click();await page.waitForFunction(()=>document.activeElement.id==='yc-tools-toggle');await collapsed(page);
  });
  await run('新进度原生文件导出、取消文件选择不改进度',async()=>{
   const before=await state(page),code=await exportFile(page);assert.match(unescape(code),/!END!$/);
   await tool(page,'#yc-import');await page.locator('#yc-file').setInputFiles([]);await page.locator('#yc-close').click();assert.deepEqual(await state(page),before);
  });
  await run('首次增益提示可取消，锁定糖块不可增加',async()=>{
   await tool(page,'#yc-boost');await page.locator('#yc-cancel-boost').click();await tool(page,'#yc-boost');await page.locator('#yc-accept-boost').click();
   assert.equal(await page.locator('[data-lumps="1"]').isDisabled(),true);
  });
  await run('三档饼干和自定义数值沿用原生累计统计',async()=>{
   for(const n of [1000,1000000,1000000000]){const before=await state(page);await page.locator('[data-cookies="'+n+'"]').click();const after=await state(page);assert.equal(after.cookies,before.cookies+n);assert.equal(after.earned,before.earned+n);}
   await page.locator('#yc-custom').fill('1e12');await page.locator('#yc-custom-add').click();assert.match(await page.locator('#yc-boost-status').innerText(),/已增加/);
   for(const bad of ['-1','0','NaN','Infinity','1e309','abc']){const before=await state(page);await page.locator('#yc-custom').fill(bad);await page.locator('#yc-custom-add').click();assert.deepEqual(await state(page),before);}
  });
  await run('糖块按原生接口增加当前和累计并触发成就',async()=>{
   for(const n of [1,10]){const before=await state(page);await page.locator('[data-lumps="'+n+'"]').click();const after=await state(page);assert.equal(after.lumps,Math.max(0,before.lumps)+n);assert.equal(after.lumpsTotal,Math.max(0,before.lumpsTotal)+n);}
   assert.equal(await page.evaluate(()=>Game.Achievements['Dude, sweet'].won),1);
   await page.locator('#yc-close').click();await tool(page,'#yc-boost');assert.equal(await page.locator('#yc-accept-boost').count(),0);await page.locator('#yc-close').click();
  });
  await run('官网原生存档预览时间、取消覆盖不改进度',async()=>{
   const before=await state(page);await choose(page,officialSave);assert.equal(await page.locator('#yc-import-version').innerText(),'2.058');assert.ok(await page.locator('#yc-import-time').innerText());await page.locator('#yc-cancel-import').click();assert.deepEqual(await state(page),before);
  });
  await run('损坏、新版本、结构缺失存档均不调用原生重置',async()=>{
   await page.evaluate(()=>{window.resetCalls=0;window.nativeReset=Game.Reset;Game.Reset=function(...args){resetCalls++;return nativeReset.apply(Game,args);};});
   const before=await state(page),raw=Buffer.from(unescape(officialSave).slice(0,-5),'base64').toString('utf8');
   for(const bad of ['broken',Buffer.from(raw.replace(/^2\.058/,'3.0')).toString('base64')+'!END!',Buffer.from(raw.split('|').slice(0,5).join('|')).toString('base64')+'!END!']){await choose(page,bad);await page.locator('#yc-error').waitFor();await page.locator('#yc-close').click();assert.deepEqual(await state(page),before);}
   assert.equal(await page.evaluate(()=>resetCalls),0);await page.evaluate(()=>{Game.Reset=nativeReset;});
  });
  await run('官网同版本存档完整导入：建筑、升级、成就、转生、四个小游戏',async()=>{
   await confirm(page,officialSave);assert.deepEqual(await state(page),expected);assert.match(await page.locator('#yc-status').innerText(),/已导入/);returned=await exportFile(page);
  });
  await run('导入立即持久化，刷新自动恢复且语言和标题正确',async()=>{
   await page.reload();await page.waitForFunction(()=>window.Game?.ready && !document.getElementById('yc-tools-toggle')?.disabled);await idle(page);await freeze(page);await collapsed(page);const after=await state(page);
   for(const field of ['resets','prestige','chips','bakery'])assert.deepEqual(after[field],expected[field]);
   after.buildings.forEach((b,i)=>{for(const n of [0,1,3,4])assert.equal(b[n],expected.buildings[i][n]);assert.ok(b[2]>=expected.buildings[i][2]);});
   assert.deepEqual(after.upgrades.map(x=>x[1]),expected.upgrades.map(x=>x[1]));
   assert.equal(after.minigames.Farm.split(' ')[2],expected.minigames.Farm.split(' ')[2]);assert.equal(await page.title(),'YC自用');assert.equal(await page.evaluate(()=>locId),'ZH-CN');
  });
  await run('原生重置后模拟读档失败，当前进度和小游戏恢复',async()=>{
   const before=await state(page);await page.evaluate(()=>{window.nativeLoad=Game.LoadSave;let once=true;Game.LoadSave=function(...args){if(once){once=false;return false;}return nativeLoad.apply(Game,args);};});
   await choose(page,officialSave);await page.locator('#yc-confirm-import').click();await page.locator('#yc-import-failure').waitFor();await idle(page);assert.deepEqual(await state(page),before);await page.locator('#yc-close').click();await page.evaluate(()=>{Game.LoadSave=nativeLoad;});
  });
  await run('存储写入失败时恢复游戏及原存储',async()=>{
   const before=await state(page);const stored=await page.evaluate(()=>localStorage.getItem(Game.SaveTo));
   await page.evaluate(()=>{window.nativeSet=Storage.prototype.setItem;let once=true;Storage.prototype.setItem=function(k,v){if(k===Game.SaveTo && once){once=false;nativeSet.call(this,k,v);throw Error('test quota');}return nativeSet.call(this,k,v);};});
   await choose(page,officialSave);await page.locator('#yc-confirm-import').click();await page.locator('#yc-import-failure').waitFor();await idle(page);assert.deepEqual(await state(page),before);assert.equal(await page.evaluate(()=>localStorage.getItem(Game.SaveTo)),stored);await page.locator('#yc-close').click();await page.evaluate(()=>{Storage.prototype.setItem=nativeSet;});
  });
  await run('原生报告成功但生成损坏进度时，持久化前拒绝并恢复',async()=>{
   const before=await state(page),stored=await page.evaluate(()=>localStorage.getItem(Game.SaveTo));
   await page.evaluate(()=>{window.nativeLoad=Game.LoadSave;let once=true;Game.LoadSave=function(...args){const ok=nativeLoad.apply(Game,args);if(once){once=false;Game.cookies=NaN;}return ok;};});
   await choose(page,officialSave);await page.locator('#yc-confirm-import').click();await page.locator('#yc-import-failure').waitFor();await idle(page);assert.deepEqual(await state(page),before);assert.equal(await page.evaluate(()=>localStorage.getItem(Game.SaveTo)),stored);await page.locator('#yc-close').click();await page.evaluate(()=>{Game.LoadSave=nativeLoad;});
  });
  await run('原版离线收益一致：跨越一小时衰减边界',async()=>{
   const actual=await page.evaluate(({code,now})=>{YCSaveCore.parseSave(code,Game.version,b64_to_utf8);const clock=Date.now;Date.now=()=>now;try{const result=YCSaveCore.importSave(Game,localStorage,code);if(!result.ok)throw Error(result.message);return {cookies:Game.cookies,earned:Game.cookiesEarned};}finally{Date.now=clock;}},{code:offlineSave,now:offlineNow});
   assert.ok(actual.cookies>123456789);assert.deepEqual(actual,offlineExpected);
  });
  await run('精度无效和溢出增益不改资源',async()=>{
   await page.evaluate(()=>{Game.cookies=Game.cookiesEarned=1e30;});await tool(page,'#yc-boost');if(await page.locator('#yc-accept-boost').count())await page.locator('#yc-accept-boost').click();
   await page.locator('[data-cookies="1000"]').click();assert.match(await page.locator('#yc-boost-status').innerText(),/精度/);assert.equal((await state(page)).cookies,1e30);
   await page.evaluate(()=>{Game.cookies=Game.cookiesEarned=Number.MAX_VALUE;});await page.locator('#yc-custom').fill(String(Number.MAX_VALUE));await page.locator('#yc-custom-add').click();assert.match(await page.locator('#yc-boost-status').innerText(),/溢出/);await page.locator('#yc-close').click();
  });
  await run('剪贴板受限时选中完整存档文本作为后备',async()=>{
   await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}}));await exportFile(page);await tool(page,'#yc-export');await page.locator('#yc-copy').click();assert.match(await page.locator('#yc-copy-status').innerText(),/已选中/);assert.equal(await page.locator('#yc-save-text').evaluate(el=>el.selectionEnd-el.selectionStart===el.value.length),true);await page.locator('#yc-close').click();
  });
  await run('双重恢复失败时暂停自动保存并下载导入前快照',async()=>{
   await page.evaluate(()=>{Game.cookies=333;Game.cookiesEarned=444;Game.prefs.autosave=1;window.beforeEmergency=Game.WriteSave(1);Game.LoadSave=()=>false;});
   await choose(page,officialSave);const download=page.waitForEvent('download');await page.locator('#yc-confirm-import').click();const file=await download;const backup=fs.readFileSync(await file.path(),'utf8');assert.equal(Buffer.from(unescape(backup).slice(0,-5),'base64').toString('utf8').split('|')[4].split(';')[0],'333');
   assert.equal(await page.evaluate(()=>Game.prefs.autosave),0);assert.equal(await page.locator('#yc-import').isDisabled(),true);assert.match(await page.locator('#yc-copy-status').innerText(),/暂停自动保存/);await page.locator('#yc-close').click();
  });
  assert.deepEqual(errors,[]);await ctx.close();
  ctx=await app.browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});({page,errors}=await load(ctx,app.url+'/upstream/',true));await freeze(page);
  await run('本站导出重新由未修改的原版引擎读取，完整进度往返',async()=>{
   assert.equal(await page.evaluate(code=>Game.ImportSaveCode(code),returned),true);await idle(page);assert.deepEqual(await state(page),expected);assert.deepEqual(errors,[]);
  });await ctx.close();
  for(const size of [[320,568],[390,844],[844,390],[768,1024],[1024,768],[1440,900]]){
   await run('触屏/桌面 '+size.join('×')+'：面板、文件选择、确认、导出',async()=>{
    ctx=await app.browser.newContext({viewport:{width:size[0],height:size[1]},isMobile:size[0]<1100,hasTouch:size[0]<1100,deviceScaleFactor:1,acceptDownloads:true});({page,errors}=await load(ctx,process.env.YC_URL||app.url+'/cookieclicker/'));await freeze(page);
    const click=async selector=>['#yc-export','#yc-import','#yc-boost'].includes(selector)?tool(page,selector,size[0]<1100):(size[0]<1100?page.locator(selector).tap():page.locator(selector).click());
    await collapsed(page);await cleanHeader(page);
    await page.screenshot({path:'test-results/'+size.join('x')+'-collapsed.png'});
    await openTools(page,size[0]<1100);
    await page.screenshot({path:'test-results/'+size.join('x')+'-drawer.png'});
    if(size[0]===768){
     await page.setViewportSize({width:1024,height:768});await page.waitForFunction(()=>Math.abs(visualViewport.width*visualViewport.scale-1024)<1);
     await page.waitForFunction(()=>{const el=document.getElementById('yc-toolbar'),r=el.getBoundingClientRect(),v=visualViewport;return el.open && r.left>=v.offsetLeft-1 && r.right<=v.offsetLeft+v.width+1 && r.top>=v.offsetTop-1 && r.bottom<=v.offsetTop+v.height+1;},null,{timeout:5000}).catch(async e=>{console.log('rotation',await page.evaluate(()=>({rect:document.getElementById('yc-toolbar').getBoundingClientRect().toJSON(),viewport:{width:visualViewport.width,height:visualViewport.height,left:visualViewport.offsetLeft,top:visualViewport.offsetTop},style:document.documentElement.getAttribute('style')})));throw e;});
     await page.setViewportSize({width:768,height:1024});await page.waitForFunction(()=>Math.abs(visualViewport.width*visualViewport.scale-768)<1 && Math.abs(document.getElementById('yc-toolbar').getBoundingClientRect().width-visualViewport.width)<1);
    }
    const physical=await page.evaluate(()=>{const b=document.getElementById('yc-export').getBoundingClientRect(),s=visualViewport.scale;return {height:b.height*s,right:b.right*s,left:b.left*s,width:visualViewport.width*s};});
    assert.ok(physical.height>=43.9);assert.ok(physical.left>=0&&physical.right<=physical.width+1);
    await click('#yc-boost');await click('#yc-accept-boost');await click('[data-cookies="1000"]');assert.equal((await state(page)).cookies,1000);
    let bounds=await page.locator('#yc-dialog').evaluate(el=>{const r=el.getBoundingClientRect(),v=visualViewport;return {left:r.left-v.offsetLeft,right:r.right-v.offsetLeft,width:v.width,top:r.top-v.offsetTop,bottom:r.bottom-v.offsetTop,height:v.height};});assert.ok(bounds.left>=0&&bounds.right<=bounds.width+1&&bounds.top>=0&&bounds.bottom<=bounds.height+1);
    if(size[0]===768){await page.setViewportSize({width:1024,height:768});await page.waitForFunction(()=>Math.abs(visualViewport.width*visualViewport.scale-1024)<1);assert.ok(await page.locator('#yc-dialog').isVisible());await page.setViewportSize({width:768,height:1024});}
    await page.screenshot({path:'test-results/'+size.join('x')+'.png'});await click('#yc-close');await choose(page,officialSave);await click('#yc-cancel-import');assert.equal((await state(page)).cookies,1000);
    await confirm(page,officialSave);assert.deepEqual(await state(page),expected);const code=await exportFile(page);assert.ok(code.length>1000);assert.deepEqual(errors,[]);await ctx.close();
   });
  }
  fs.writeFileSync('test-results/native-fixture.txt',returned);
  fs.writeFileSync('test-results/browser-summary.json',JSON.stringify({date:new Date().toISOString(),url:process.env.YC_URL||'local /cookieclicker/',passed},null,2));
  console.log(passed.length+' browser scenarios passed');
 } finally {await app.browser.close();app.server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});