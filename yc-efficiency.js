/* Read-only efficiency UI and low-frequency snapshot scheduling. */
(function () {
'use strict';
if(window.YCEfficiency)return;
const core=window.YCEfficiencyCore,key='YC-Efficiency-Enabled';
let initialized=false,bridge,enabled=true,cache=[],stamp=0,error='',generation=0,active=false,lastSignature='',nextAt=0,timer;
let category='all',affordable=false,renderedList=null,renderedKey='';
const metrics={rounds:0,lastMs:0,maxSliceMs:0};
const scalarKeys=['ascensionMode','prestige','heavenlyPower','heralds','santaLevel','AchievementsOwned','lumps','dragonAura','dragonAura2','dragonLevel','startDate','bakeryName','cookiesPsRawHighest'];
const godNames=['asceticism','ages','decadence','industry','labor','mother','creation'];
const byId=id=>document.getElementById(id);
const normalize=fn=>Function.prototype.toString.call(fn).replace(/\r/g,'').trim();
const sci=value=>Number.isFinite(value)?value.toExponential(3):'—';
const number=value=>Number.isFinite(value)?(value!==0&&Math.abs(value)<0.001?sci(value):Beautify(value,3)):'—';
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function duration(seconds){
 if(seconds===null||!Number.isFinite(seconds)||seconds<0)return '不适用';
 if(seconds<60)return number(seconds)+' 秒';
 if(seconds<3600)return number(seconds/60)+' 分钟';
 if(seconds<86400)return number(seconds/3600)+' 小时';
 if(seconds<31557600)return number(seconds/86400)+' 天';
 return number(seconds/31557600)+' 年';
}
function unsupported(){
 if(Game.version!==2.058)return '当前游戏版本尚未支持';
 if(Game.ObjectsById.some(b=>!b.vanilla)||Object.values(Game.UpgradesById).some(u=>!u.vanilla))return '检测到额外建筑或升级，暂不支持计算';
 if(['cps','cpsMult','cookiesPerClick'].some(k=>Game.modHooks[k].length))return '检测到其他产量 Mod，暂不支持计算';
 for(const [name,source] of Object.entries(core.sources)){
  const fn=Game[name]||Game.Objects[name]?.cps;
  if(typeof fn!=='function'||normalize(fn)!==source.trim())return '原生产量公式已被修改，暂不支持计算';
 }
 // All other vanilla buildings use the same production formula as Farm.
 if(Game.ObjectsById.slice(2).some(b=>normalize(b.cps)!==core.sources.Farm.trim()))return '建筑产量公式已被修改，暂不支持计算';
 return '';
}
function gods(){return Game.hasGod?Object.fromEntries(godNames.map(n=>[n,Game.hasGod(n)])):null;}
function buffs(){return Object.fromEntries(Object.entries(Game.buffs).map(([name,b])=>[name,{multCpS:b.multCpS,multClick:b.multClick,power:b.power}]));}
function signature(){
 return JSON.stringify([Game.version,Game.OnAscend,Game.AscendTimer,Game.ReincarnateTimer,scalarKeys.filter(k=>k!=='cookiesPsRawHighest').map(k=>Game[k]),
 Game.ObjectsById.map(b=>[b.amount,b.level,b.locked,b.minigameLoaded,b.minigameLoading,b.minigame?.effs]),
 Object.values(Game.UpgradesById).map(u=>[u.bought,u.unlocked]),Game.UpgradesInStore.map(u=>u.id),Game.effs,gods(),buffs(),Game.shimmerTypes.golden.n,
 ['cps','cpsMult','cookiesPerClick'].map(k=>Game.modHooks[k].length)]);
}
function snapshot(){
 const upgrades=Object.values(Game.UpgradesById).map(u=>({id:u.id,name:u.name,bought:u.bought,pool:u.pool,tier:u.tier,power:typeof u.power==='function'?u.power(u):u.power,
  buildingTie1:u.buildingTie1?.id,buildingTie2:u.buildingTie2?.id}));
 const buildings=Game.ObjectsById.map(b=>({id:b.id,name:b.name,amount:b.amount,baseCps:typeof b.baseCps==='number'?b.baseCps:0.1,level:b.level,unshackleUpgrade:b.unshackleUpgrade,
  tiered:Object.values(b.tieredUpgrades).map(u=>u.id),synergyIds:b.synergies.map(u=>u.id),fortuneId:b.fortune?.id,grandmaId:b.grandma?.id,
  minigameLoaded:b.minigameLoaded,effects:{...b.minigame?.effs}}));
 const direct=new Set(core.directNames);
 for(const b of Game.ObjectsById){for(const u of [...Object.values(b.tieredUpgrades),...b.synergies,b.fortune,b.grandma])if(u)direct.add(u.name);}
 for(const u of [...Game.cookieUpgrades,...Game.UpgradesByPool.kitten])direct.add(u.name);
 const candidates=Game.ObjectsById.filter(b=>!b.locked).map(b=>({type:'building',id:b.id,name:b.dname,price:b.getPrice()}));
 for(const u of Game.UpgradesInStore){if(u.bought)continue;candidates.push({type:'upgrade',id:u.id,name:u.dname,price:u.priceLumps?u.priceLumps:u.getPrice(),
  currency:u.priceLumps?'糖块':'饼干',unsupported:u.priceLumps>0||u.pool==='toggle'||(!direct.has(u.name)&&!!u.buyFunction),indirect:!direct.has(u.name)});}
 return {now:Date.now(),scalars:Object.fromEntries(scalarKeys.map(k=>[k,Game[k]])),buildings,upgrades,
  tiers:Object.fromEntries(Object.entries(Game.Tiers).map(([id,t])=>[id,{special:t.special,unshackleUpgrade:t.unshackleUpgrade}])),
  cookieIds:Game.cookieUpgrades.map(u=>u.id),kittenIds:Game.UpgradesByPool.kitten.map(u=>u.id),grandmaSynergies:[...Game.GrandmaSynergies],goldenCookieUpgrades:[...Game.goldenCookieUpgrades],
  auras:Object.fromEntries(Object.entries(Game.dragonAuras).map(([id,a])=>[id,{name:a.name}])),aurasByName:Object.fromEntries(Object.entries(Game.dragonAurasBN).map(([n,a])=>[n,{id:a.id}])),
  gods:gods(),buffs:buffs(),goldenCount:Game.shimmerTypes.golden.n,wrinklers:Game.wrinklers.map(w=>({phase:w.phase})),candidates};
}
function label(row){
 switch(row.status){case 'unsupported':return '暂不可量化';case 'overflow':return '数值超出范围';case 'precision':return '低于数值精度';case 'free':return '免费';case 'negative':return '降低挂机产量';case 'click':return '点击收益';case 'zero':return row.indirect?'非直接挂机收益':'当前无挂机增量';default:return sci(row.score);}
}
function buyable(row){return row.currency==='糖块'?Game.lumps>=row.price:Game.cookies>=row.price;}
function details(row){
 if(row.status==='unsupported')return '暂不可量化：特殊操作或非饼干价格，不参与排名。';
 if(row.status==='overflow')return '数值超出可计算范围，不参与排名。';
 return '价格（'+(row.type==='building'?'购买1个':'当前升级')+'）：'+number(row.price)+' '+(row.currency||'饼干')+
  '<br>挂机产量增量：'+number(row.delta)+' 饼干/秒<br>性价比：'+label(row)+'<br>理想回本：'+duration(row.payback)+
  (row.click>0?'<br>每次点击增量：'+number(row.click)+' 饼干':'')+
  '<br>含当前限时效果的增量：'+number(row.fullDelta)+' 饼干/秒（效果会过期）';
}
function tip(type,id){
 if(!enabled)return '';
 const row=cache.find(r=>r.type===type&&r.id===id);
 return '<div class="descriptionBlock yc-eff-tip"><b>性价比'+(type==='building'?' · 购买1个':'')+'</b><br>'+(error?escape(error):row?details(row):'正在计算…')+'<br><small>不含限时产量加成；固定现有成就，不预测未来解锁。</small></div>';
}
function updateStore(){
 for(const b of Game.ObjectsById){const content=byId('product'+b.id)?.querySelector('.content');if(!content)continue;
  let node=content.querySelector('.yc-eff-score');
  if(!enabled||b.locked){if(node)node.remove();continue;}
  if(!node){node=document.createElement('span');node.className='yc-eff-score';content.appendChild(node);}
  if(node.dataset.amount!==String(b.amount)){const width=content.clientWidth;if(width>0){node.dataset.amount=String(b.amount);const owned=content.querySelector('.owned');node.style.maxWidth=Math.max(20,width-Math.max(84,owned?.offsetWidth||0)-16)+'px';}}
  const row=cache.find(r=>r.type==='building'&&r.id===b.id),text=error?'不可计算':row?label(row):'计算中';
  if(node.textContent!=='性价比 '+text)node.textContent='性价比 '+text;
  node.setAttribute('aria-label','再购买1个的性价比 '+text);
 }
}
function render(){
 updateStore();
 const list=byId('yc-eff-list');if(!list||!bridge.dialog.open)return;
 const hint=byId('yc-eff-status');
 hint.textContent=!enabled?'计算已关闭':error||(!stamp?'正在计算…':(active?'正在更新；':'')+'更新于 '+new Date(stamp).toLocaleTimeString('zh-CN'));
 const viewKey=JSON.stringify([stamp,metrics.rounds,enabled,error,category,affordable,cache.map(buyable)]);
 if(list===renderedList&&viewKey===renderedKey)return;renderedList=list;renderedKey=viewKey;
 list.replaceChildren();if(!enabled||error)return;
 const rows=cache.filter(r=>(category==='all'||r.type===category)&&(!affordable||buyable(r)));
 rows.sort((a,b)=>{const ranked=r=>r.status==='ok'&&r.delta>0;return Number(ranked(b))-Number(ranked(a))||(ranked(a)&&ranked(b)?b.score-a.score:0)||a.price-b.price||a.id-b.id;});
 for(const row of rows){
  const item=document.createElement('li');item.className='yc-eff-item';
  const title=document.createElement('strong');title.textContent=row.name;item.appendChild(title);
  const kind=document.createElement('small');kind.textContent=(row.type==='building'?'建筑 · 再买1个':'升级')+' · '+(buyable(row)?'买得起':'资源不足');item.appendChild(kind);
  const info=document.createElement('div');info.innerHTML=details(row);item.appendChild(info);list.appendChild(item);
 }
 if(stamp&&!rows.length)list.textContent='没有符合条件的项目。';
}
function cancel(){generation++;active=false;}
function scheduleSlice(fn){if(window.requestIdleCallback)requestIdleCallback(fn,{timeout:250});else setTimeout(()=>fn({didTimeout:true,timeRemaining:()=>4}),0);}
function refresh(){
 if(!enabled||document.hidden)return;
 cancel();const ticket=generation;
 if(bridge.busy()){error='游戏状态尚未稳定（转生、加载或存档恢复中），请稍后查看';cache=[];stamp=0;render();return;}
 error=unsupported();if(error){cache=[];stamp=0;render();return;}
 let s,p;const start=performance.now();
 try{s=snapshot();p=core.prepare(s);}catch(e){error='当前状态暂不可计算';cache=[];render();console.error('YC efficiency',e);return;}
 const inputSignature=signature(),rows=[];let at=0,computeMs=performance.now()-start;metrics.maxSliceMs=Math.max(metrics.maxSliceMs,computeMs);active=true;render();
 function batch(deadline){
  if(ticket!==generation||!enabled||document.hidden)return;
  const begin=performance.now();
  try {do{rows.push(core.evaluate(p,s.candidates[at++]));}while(at<s.candidates.length&&performance.now()-begin<4&&(deadline.didTimeout||deadline.timeRemaining()>1));}
  catch(e){active=false;error='当前状态暂不可计算';cache=[];render();console.error('YC efficiency',e);return;}
  const elapsed=performance.now()-begin;computeMs+=elapsed;metrics.maxSliceMs=Math.max(metrics.maxSliceMs,elapsed);
  if(at<s.candidates.length){scheduleSlice(batch);return;}
  active=false;if(inputSignature!==signature()){nextAt=0;return;}
  cache=rows;stamp=s.now;lastSignature=inputSignature;nextAt=Date.now()+10000;metrics.rounds++;metrics.lastMs=computeMs;render();
 }
 if(!s.candidates.length){active=false;cache=[];stamp=s.now;lastSignature=inputSignature;nextAt=Date.now()+10000;render();return;}
 scheduleSlice(batch);
}
function tick(){
 if(!enabled||document.hidden)return;
 const current=signature();
 if(current!==lastSignature){cancel();cache=[];stamp=0;lastSignature=current;nextAt=0;}
 if(!active&&Date.now()>=nextAt)refresh();
 else if(bridge.dialog.open&&byId('yc-eff-list'))render();
 else updateStore();
}
function setEnabled(value){enabled=value;try{localStorage.setItem(key,String(value));}catch(_){}cancel();cache=[];stamp=0;error='';nextAt=0;render();if(enabled)refresh();}
function panel(){
 bridge.show('性价比比较','<div class="yc-eff-controls"><label><input id="yc-eff-enabled" type="checkbox"> 启用计算</label><button type="button" id="yc-eff-refresh">刷新</button><label>类别 <select id="yc-eff-category"><option value="all">建筑和升级</option><option value="building">建筑</option><option value="upgrade">升级</option></select></label><label><input id="yc-eff-affordable" type="checkbox"> 只看买得起</label></div><p id="yc-eff-status" role="status"></p><details class="yc-eff-rule"><summary>计算规则与限制</summary><p>按购买1个建筑或当前升级，比较全局产量增量。性价比＝增量÷价格，单位为每秒，数值越大越好；例如 1.250e-4 表示 0.000125。理想回本不含攒钱等待。</p><p>主排名排除限时产量加成，价格采用当前折扣。固定现有成就和小游戏效果，不预测新成就、未来解锁、金饼或皱纹虫回收收益。手动点击单独显示，不折算成挂机产量。</p><p>每10秒更新，进度变化后合并刷新；页面进入后台暂停计算。</p></details><ol id="yc-eff-list"></ol>','efficiency');
 byId('yc-eff-enabled').checked=enabled;byId('yc-eff-category').value=category;byId('yc-eff-affordable').checked=affordable;
 byId('yc-eff-enabled').addEventListener('change',e=>setEnabled(e.target.checked));
 byId('yc-eff-refresh').addEventListener('click',refresh);
 byId('yc-eff-category').addEventListener('change',e=>{category=e.target.value;render();});
 byId('yc-eff-affordable').addEventListener('change',e=>{affordable=e.target.checked;render();});
 render();
}
function init(options){
 if(initialized)return;initialized=true;bridge=options;
 try{enabled=localStorage.getItem(key)!=='false';}catch(_){}
 for(const b of Game.ObjectsById){const original=b.tooltip;b.tooltip=function(){return original.apply(this,arguments)+tip('building',this.id);};}
 const original=Game.crateTooltip;Game.crateTooltip=function(me,context){return original.apply(this,arguments)+(me.type==='upgrade'&&context==='store'&&!me.bought?tip('upgrade',me.id):'');};
 document.addEventListener('visibilitychange',()=>{cancel();if(!document.hidden){nextAt=0;tick();}});
 timer=setInterval(tick,1000);tick();
}
window.YCEfficiency={init,panel,refresh,snapshot,get results(){return cache;},get metrics(){return {...metrics};},get enabled(){return enabled;},get error(){return error;}};
}());
