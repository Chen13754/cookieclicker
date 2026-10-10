'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),dest=path.join(root,'dist');
// Only game runtime files enter Pages; tests, dependencies, caches and local saves never do.
const files=['index.html','style.css','base64.js','main.js','ajax.js','DungeonGen.js','dungeons.js','excanvas.compiled.js','minigameGarden.js','minigameGrimoire.js','minigameMarket.js','minigamePantheon.js','yc-save-core.js','yc-tools.js','yc-tools.css','.nojekyll'];
const dirs=['img','snd','loc','cf-fonts'];
if(path.dirname(dest)!==root || path.basename(dest)!=='dist')throw Error('Invalid output directory');
fs.rmSync(dest,{recursive:true,force:true});fs.mkdirSync(dest);
for(const file of files)fs.copyFileSync(path.join(root,file),path.join(dest,file));
for(const dir of dirs)fs.cpSync(path.join(root,dir),path.join(dest,dir),{recursive:true,filter:p=>!['index.html','_imglist.txt','_sndlist.txt','_loclist.txt'].includes(path.basename(p))});
console.log('Runtime package prepared in dist/');