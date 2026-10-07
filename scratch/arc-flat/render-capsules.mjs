import {writeFileSync} from 'node:fs'
import {createJiti} from 'jiti'
const root=new URL('../../',import.meta.url).pathname,j=createJiti(import.meta.url,{alias:{'@':root+'src'}})
const old=await j.import('/tmp/gridz-shapes-before.ts'),now=await j.import(root+'src/lib/shapes.ts'),{PRESET_SHAPES}=await j.import(root+'src/lib/types.ts')
let html='<!doctype html><html><meta charset="utf-8"><title>Smooth capsules</title><style>body{font:15px system-ui;background:#f5f4ef;margin:28px;color:#242522}main{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}article{padding:20px;background:white;border:1px solid #ddd}.row{display:flex}.row>div{width:50%;text-align:center}svg{width:100%;height:210px}</style><h1>Smoother capsules · applied</h1><p>Same size and proportions. More precise curves in the workshop and exports. Shown enlarged to expose the old facets.</p><main>'
for(const preset of ['capsule','capsuleV'])for(const rotation of [0,45]){
 const def=PRESET_SHAPES.find(s=>s.preset===preset);
 html+=`<article><h2>${def.label} · ${rotation}°</h2><div class="row">`;
 for(const [label,engine] of [['Before',old],['Implemented',now]])html+=`<div>${label}<svg viewBox="-10 -10 76 76"><path d="${engine.moduleShapePath(def,0,0,56,2,rotation)}" fill="#242522"/></svg></div>`;
 html+='</div></article>'
}
writeFileSync(root+'docs/capsules-applied.html',html+'</main></html>')
