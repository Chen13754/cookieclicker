'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../yc-efficiency-core.js');
function snapshot(){return {
 now:100000000,scalars:{ascensionMode:0,prestige:0,heavenlyPower:1,heralds:0,santaLevel:0,AchievementsOwned:0,lumps:0,dragonAura:0,dragonAura2:0,dragonLevel:0,startDate:0,bakeryName:'YC',cookiesPsRawHighest:0},
 buildings:['Cursor','Grandma','Farm'].map((name,id)=>({id,name,baseCps:[0.1,1,8][id],amount:[100,10,1][id],level:0,tiered:[],synergyIds:[],effects:{},minigameLoaded:false})),
 upgrades:[{id:0,name:'Thousand fingers',bought:0,pool:'',tier:0,power:0},{id:1,name:'Plastic mouse',bought:0,pool:'',tier:0,power:0},{id:2,name:'Elder Covenant',bought:0,pool:'',tier:0,power:0}],
 tiers:{},cookieIds:[],kittenIds:[],grandmaSynergies:[],goldenCookieUpgrades:[],auras:{0:{name:'None'}},aurasByName:{},gods:null,buffs:{Frenzy:{multCpS:7}},goldenCount:0,wrinklers:[]};}
const building=(id,price)=>({type:'building',id,price});
test('单个建筑全局增量、科学指数及回本',()=>{const p=core.prepare(snapshot()),r=core.evaluate(p,building(2,100));assert.equal(p.base.cps,28);assert.equal(r.delta,8);assert.equal(r.fullDelta,56);assert.equal(r.score,0.08);assert.equal(r.payback,12.5);});
test('非指针建筑同时增加已有指针的手指产量',()=>{const s=snapshot();s.upgrades[0].bought=1;const p=core.prepare(s),r=core.evaluate(p,building(2,100));assert.ok(Math.abs(r.delta-18)<1e-10);});
test('升级收益按当前全局状态计算',()=>{const s=snapshot(),p=core.prepare(s),r=core.evaluate(p,{type:'upgrade',id:0,price:100000});assert.equal(r.delta,110);assert.equal(r.score,0.0011);});
test('只影响点击不伪造挂机产量',()=>{const r=core.evaluate(core.prepare(snapshot()),{type:'upgrade',id:1,price:100});assert.equal(r.status,'click');assert.equal(r.delta,0);assert.ok(r.click>0);assert.equal(r.payback,null);});
test('零增量、负增量、免费与未知项目分别处理',()=>{const s=snapshot();s.buildings[2].amount=0;const p=core.prepare(s);assert.equal(core.evaluate(p,{type:'upgrade',id:0,price:0}).status,'free');assert.equal(core.evaluate(p,{type:'upgrade',id:2,price:100}).status,'negative');assert.equal(core.evaluate(p,{type:'upgrade',id:1,price:100,unsupported:true}).status,'unsupported');const empty=snapshot();empty.buildings.forEach(b=>b.amount=0);assert.equal(core.evaluate(core.prepare(empty),{type:'upgrade',id:0,price:1}).status,'zero');});
test('溢出和不可测浮点增量不进入有效排名',()=>{const s=snapshot();s.buildings[2].amount=1e100;const p=core.prepare(s);assert.equal(core.evaluate(p,building(0,100)).status,'precision');assert.equal(core.evaluate(p,building(0,Infinity)).status,'overflow');});
test('多次候选模拟不污染输入快照或相互叠加',()=>{const s=snapshot(),before=structuredClone(s),p=core.prepare(s),first=core.evaluate(p,building(1,100));for(let i=0;i<10;i++)core.evaluate(p,{type:'upgrade',id:0,price:100});assert.deepEqual(core.evaluate(p,building(1,100)),first);assert.deepEqual(s,before);});
