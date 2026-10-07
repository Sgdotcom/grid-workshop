import {writeFileSync} from 'node:fs'
import {createJiti} from 'jiti'
import pc from 'polygon-clipping'
import {geometry} from '../../scripts/join-geometry.mjs'
const root=new URL('../../',import.meta.url).pathname
const jiti=createJiti(import.meta.url,{alias:{'@':root+'src'}})
const {makeSoftStamp,organicWeld}=await jiti.import(root+'src/lib/softness.ts')
const {PRESET_SHAPES}=await jiti.import(root+'src/lib/types.ts')
const {fieldBlend}=await jiti.import(root+'src/lib/fieldExperiments.ts')
const {toPolygon,multiPolygonToPathList,unionPolygons}=await jiti.import(root+'src/lib/polyBool.ts')
const make=(preset,col,row,size)=>makeSoftStamp(`${col}:${row}`,col,row,20+42*col,20+42*row,size,PRESET_SHAPES.find(s=>s.preset===preset),20+42*col-size/2,20+42*row-size/2,preset==='star5'?0:2)
const cases=[['Stars',[make('star5',0,0,56),make('star5',0,1,56)]],['Arc + notch',[make('arc',0,0,24),make('notch',1,0,56)]],['Wedge + notch',[make('wedge',0,0,24),make('notch',1,0,56)]]]
const toPaths=p=>multiPolygonToPathList(p.map(poly=>poly.map(r=>r.map(([x,y])=>[x/1000,y/1000]))))
const data=cases.map(([title,stamps])=>{
const outline=multiPolygonToPathList(stamps.map(s=>toPolygon(s.rings)));const body=geometry(outline)
return {title,outline,steps:Array.from({length:21},(_,i)=>{const s=i/20;return [s?multiPolygonToPathList(unionPolygons([...stamps.map(s=>toPolygon(s.rings)),...organicWeld(...stamps,s)])):outline,...[title==='Stars'?'sdf':'offset'].map(method=>s?toPaths(pc.union(body,geometry(fieldBlend(stamps.map(s=>s.rings),Math.min(...stamps.map(s=>s.size)),s*(title==='Stars'?(method==='sdf'?.5:.22):1),method)))):outline)]})}
})
writeFileSync(root+'docs/weld-retry.html',`<!doctype html><html><head><meta charset="utf-8"><title>Weld retry</title><style>body{font:14px system-ui;background:#f5f4ef;color:#242522;margin:24px}h1{font-size:25px}header{position:sticky;top:0;background:#f5f4ef;padding:10px;z-index:1}article{background:white;border:1px solid #ddd;margin:16px 0;padding:16px}.row{display:grid;grid-template-columns:repeat(3,1fr)}svg{width:100%;height:245px}.label{text-align:center}.outline{fill:none;stroke:#b25939;stroke-width:.25;stroke-dasharray:1 1}body.hide .outline{display:none}input{vertical-align:middle}</style></head><body class="hide"><header><h1>Smoother joins, with the original shapes retained.</h1><p>Preview only. Stars use a gentle local melt; curved shapes use a rounded contact. Original pointed tips remain. The workshop is unchanged.</p><label>Softness <input type="range" id="s" min="0" max="20" value="20"><output id="v">1.00</output></label> <label><input type="checkbox" id="o"> Original outlines</label></header><main></main><script>const data=${JSON.stringify(data)};const labels=['Original shapes','Current weld','New candidate'];function draw(){v.textContent=(s.value/20).toFixed(2);document.querySelector('main').innerHTML=data.map(c=>'<article><h2>'+c.title+'</h2><div class="row">'+[c.outline,...c.steps[s.value]].map((paths,i)=>'<div><div class="label">'+labels[i]+'</div><svg viewBox="-12 -12 110 110">'+paths.map(d=>'<path fill="#242522" fill-rule="evenodd" d="'+d+'"/>').join('')+c.outline.map(d=>'<path class="outline" d="'+d+'"/>').join('')+'</svg></div>').join('')+'</div></article>').join('')}s.oninput=draw;o.onchange=()=>document.body.classList.toggle('hide',!o.checked);draw();</script></body></html>`)
console.log('Rendered three contour experiments at 21 softness levels')
