'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../yc-save-core.js');
const decode=s=>Buffer.from(s,'base64').toString('utf8');
const encode=s=>escape(Buffer.from(s).toString('base64')+'!END!');
function fixture(){const values=Array(55).fill('0');values[22]='';values[47]='';return ['2.058','','1700000000000;1700000000000;1700000001234;测试店;seed;0', '10101',values.join(';'),Array(20).fill('0,0,0,0,,0,0').join(';')+';','1010','1010','',''].join('|');}
test('原生编码、Unicode、保存时间及文本换行',()=>{
 const parsed=core.parseSave(encode(fixture())+'\n',2.058,decode);
 assert.equal(parsed.version,2.058);assert.equal(parsed.bakery,'测试店');assert.equal(parsed.savedAt,1700000001234);
 assert.equal(core.parseSave(parsed.code,2.058,decode).bakery,'测试店');
});
test('空白、截断、错误编码、过大及新版存档在读档前拒绝',()=>{
 for(const bad of ['', 'abc',encode(fixture()).slice(0,-8),'@@@!END!','x'.repeat(core.MAX_BYTES+1),encode(fixture().replace('2.058','3.0')),encode('2.058||x')]) assert.throws(()=>core.parseSave(bad,2.058,decode));
});
test('损坏的日期、统计、建筑、设置、成就、效果数据拒绝',()=>{
 for(const mutate of [p=>p[2]='NaN;1700000000000;1700000001234;a;b',p=>p[3]='101x',p=>p[4]=p[4].replace(/^0;/,'Infinity;'),p=>p[5]='-1,0,0,0,,0,0;',p=>p[5]='1,2;',p=>p[6]='',p=>p[7]='NaN',p=>p[8]='1,2,NaN;']) {
  const parts=fixture().split('|');mutate(parts);assert.throws(()=>core.parseSave(encode(parts.join('|')),2.058,decode));
 }
});
test('非小游戏建筑的 Mod 载荷透传，避免丢弃内容',()=>{
 const parts=fixture().split('|');parts[5]=parts[5].replace(',,',',farm:1 2 3;not-a-number,'.replace(';not-a-number',''));
 parts[9]='someMod:opaque text';assert.equal(core.parseSave(encode(parts.join('|')),2.058,decode).version,2.058);
});
test('有限正数及科学计数增量',()=>{assert.equal(core.increment(10,20,' 1e6 '),1000000);assert.equal(core.increment(0,0,'.5'),.5);});
test('非法数、溢出、库存或累计无实际增量时拒绝',()=>{
 for(const input of [0,-1,'','NaN','Infinity','0x10','1+2','1e309'])assert.throws(()=>core.increment(0,0,input));
 assert.throws(()=>core.increment(Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE));
 assert.throws(()=>core.increment(1e30,1e30,1));assert.throws(()=>core.increment(0,1e30,1));assert.throws(()=>core.increment(NaN,0,1));
});
function game(){return {SaveTo:'YC',value:'before',modSaveData:{stale:'x'},prefs:{autosave:1},WriteSave(){return this.value},ImportSaveCode(code){this.value=code;return true}};}
function storage(){const map=new Map([['YC','older']]);return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};}
test('原生导入成功即持久化，清理旧 Mod 载荷',()=>{const g=game(),s=storage();assert.deepEqual(core.importSave(g,s,'after'),{ok:true});assert.equal(g.value,'after');assert.equal(s.getItem('YC'),'after');assert.deepEqual(g.modSaveData,{});});
test('原生重置后读档失败，恢复即时快照',()=>{const g=game(),s=storage();g.ImportSaveCode=function(code){this.value=code;if(code==='bad')return false;return true};const r=core.importSave(g,s,'bad');assert.equal(r.restored,true);assert.equal(g.value,'before');assert.equal(s.getItem('YC'),'older');});
test('写存储中途失败，恢复当前进度及此前持久化值',()=>{const g=game(),s=storage(),set=s.setItem;s.setItem=(key,value)=>{set(key,value);if(value==='after')throw Error('quota')};const r=core.importSave(g,s,'after');assert.equal(r.restored,true);assert.equal(g.value,'before');assert.equal(s.getItem('YC'),'older');});
test('静默存储失败也不报告成功',()=>{const g=game(),s=storage();s.setItem=()=>{};assert.equal(core.importSave(g,s,'after').restored,true);assert.equal(g.value,'before');});
test('首次存储访问被拒绝，不调用原生重置',()=>{const g=game();assert.throws(()=>core.importSave(g,{getItem(){throw Error('denied')}},'after'));assert.equal(g.value,'before');});
test('双重读档失败保留备份并关闭自动保存',()=>{const g=game(),s=storage();g.ImportSaveCode=()=>false;const r=core.importSave(g,s,'after');assert.equal(r.restored,false);assert.equal(r.snapshot,'before');assert.equal(g.prefs.autosave,0);assert.equal(g.toSave,false);});
test('当前版本缺少建筑/位字段和损坏的小游戏网格被拒绝',()=>{
 const schema={buildings:20,upgrades:2,achievements:4};
 assert.equal(core.parseSave(encode(fixture()),2.058,decode,schema).version,2.058);
 const p=fixture().split('|');p[5]='0,0,0,0,,0,0;';assert.throws(()=>core.parseSave(encode(p.join('|')),2.058,decode,schema));
 const q=fixture().split('|'),b=q[5].split(';');b[2]='1,1,0,1,0:0:0:1:0:0:0:0:0: 1 1:NaN:,0,1';q[5]=b.join(';');assert.throws(()=>core.parseSave(encode(q.join('|')),2.058,decode,schema));
});

test('原生函数报告成功但产生损坏存档时，写入前拒绝并恢复',()=>{const g=game(),s=storage();const r=core.importSave(g,s,'corrupt',code=>{if(code==='corrupt')throw Error('bad native data')});assert.equal(r.restored,true);assert.equal(g.value,'before');assert.equal(s.getItem('YC'),'older');});
