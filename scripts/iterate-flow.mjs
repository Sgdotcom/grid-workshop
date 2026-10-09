import {createJiti} from 'jiti'
import {writeFileSync,mkdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {performance} from 'node:perf_hooks'
const root=fileURLToPath(new URL('../',import.meta.url)),out=fileURLToPath(new URL('../../../outputs/',import.meta.url))
const j=createJiti(import.meta.url,{alias:{'@':`${root}src`}})
const {flowBlend}=await j.import('../src/lib/flowBlend.ts')
const {makeSoftStamp,softnessFinishPolygons}=await j.import('../src/lib/softness.ts')
const {PRESET_SHAPES}=await j.import('../src/lib/types.ts')
const {toPolygon,unionPolygons,differencePolygons,multiPolygonToPathList,ringAbsArea}=await j.import('../src/lib/polyBool.ts')
const pairs=[...['square','triangle','hexagon','cross','x','chevron','star5','capsule','arc','ring'].map(p=>[p,p]),['circle','cross'],['square','star5'],['square','chevron'],['arc','triangle'],['capsule','star4'],['ring','square'],['square','triangle'],['diamond','circle']]
const layouts=[{name:'Horizontal',cells:[[0,0],[1,0]]},{name:'Vertical',cells:[[0,0],[0,1]]},{name:'Diagonal',cells:[[0,0],[1,1]]},{name:'L cluster',cells:[[0,0],[1,0],[0,1]]},{name:'2 × 2 cluster',cells:[[0,0],[1,0],[0,1],[1,1]]}]
const methods=['current','soft-field','full-field','rounded-closing'],names=['Current Paint','Soft field · iteration 1','Full field · iteration 2','Rounded closing · iteration 3']
const area=ps=>ps.reduce((n,p)=>n+p.reduce((a,r,i)=>a+(i?-1:1)*ringAbsArea(r),0),0)
const data={},diagnostics=[]
let count=0
for(const pair of pairs)for(const size of [37,42]){
 const pairName=pair.map(p=>PRESET_SHAPES.find(s=>s.preset===p).label).filter((s,i,a)=>!i||s!==a[0]).join(' + ')
 const rows=[]
 for(const layout of layouts){
  const stamps=layout.cells.map(([col,row],i)=>{const s=PRESET_SHAPES.find(s=>s.preset===pair[i%2]),cx=20+col*42,cy=20+row*42;return makeSoftStamp(`${col}:${row}`,col,row,cx,cy,size,s,cx-size/2,cy-size/2,0)})
  const bodies=unionPolygons(stamps.map(s=>toPolygon(s.rings)))
  const levels=[]
  for(const softness of [.55,1]){
   const options=[]
   for(const method of methods){
    const start=performance.now(),polys=method==='current'?softnessFinishPolygons(stamps,softness):flowBlend(stamps,softness,method)
    const loss=area(differencePolygons(bodies,polys)),holes=polys.reduce((n,p)=>n+p.length-1,0)
    const record={pair:pair.join('|'),size,layout:layout.name,softness,method,components:polys.length,holes,removedArea:loss,addedArea:area(polys)-area(bodies),milliseconds:performance.now()-start}
    diagnostics.push(record);options.push({...record,paths:multiPolygonToPathList(polys)})
    count++
   }
   levels.push({softness,options})
  }
  rows.push({name:layout.name,levels,outlines:multiPolygonToPathList(bodies)})
 }
 data[`${pair.join('|')}|${size}`]={pairName,rows}
 console.log(`${pairName} ${size}px: ${count} frames`)
}
mkdirSync(out,{recursive:true})
writeFileSync(`${out}flow-iterations-validation.json`,JSON.stringify({count,diagnostics},null,2))
const labels=pairs.map(pair=>({id:pair.join('|'),name:data[`${pair.join('|')}|37`].pairName}))
writeFileSync(`${out}flow-iterations.html`,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flow at full Softness · shape and mixed-pair iterations</title><style>*{box-sizing:border-box}body{margin:0;background:#f3f2ed;color:#24251f;font:15px system-ui}main{max-width:1400px;margin:auto;padding:28px}h1{font-size:28px;margin:0 0 12px}p{line-height:1.5;max-width:1000px}.controls{display:flex;gap:20px;padding:14px 0;position:sticky;top:0;background:#f3f2ed;z-index:2}label{display:grid;gap:5px}select{font:inherit;padding:8px}section{border-top:1px solid #bbb;margin-top:20px}h2{font-size:18px}h3{font-size:14px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}figure{margin:0}svg{width:100%;height:170px;background:white}figcaption{font-size:12px;margin-top:5px}.stats{font-size:11px;color:#62665a;margin:6px 0 16px}.bad{color:#a4422d}footer{font-size:12px;line-height:1.5;margin-top:28px;color:#666}@media(max-width:900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}</style><main><h1>Flow at full Softness</h1><p>Target: at 100%, non-circular shapes should flow together with the soft, rounded feel of circle metaballs. These iterations replace hard bridge intersections with smooth outline-distance blending. Original stamp bodies and ring centres are retained; accepted same-shape Circle, Ring and Diamond joins stay on their existing engine.</p><p>Compare 55% with 100%. Soft field is the gentler smooth union; Full field increases the curved joining region; Rounded closing uses expansion and contraction. Each panel reports disconnected outlines, counters and any stamp loss. This is a development lab, not a change to the live workshop.</p><div class="controls"><label>Shapes<select id="pair">${labels.map(o=>`<option value="${o.id}">${o.name}</option>`).join('')}</select></label><label>Stamp size<select id="size"><option value="37">37 px · 5 px straight gap</option><option value="42" selected>42 px · touching straight neighbours</option></select></label><label>Original outlines<select id="outlines"><option value="off">Hidden</option><option value="on">Shown</option></select></label></div><div id="content"></div><footer>Source: current local grid-workshop geometry · 8 October 2026. 40 px cells, 2 px gap, 0 px corners, 0° rotation. ${count} fresh frames across ${pairs.length} shape combinations, two sizes, five layouts and two Softness levels. No image smoothing or CSS tricks: every candidate is exportable polygon geometry. More roundedness, unequal-size, rotation, broken-join and performance checks follow candidate selection.</footer></main><script>const data=${JSON.stringify(data)},names=${JSON.stringify(names)};function svg(paths,outlines){return '<svg viewBox="-14 -14 110 110" role="img" aria-label="Fused shape silhouette">'+paths.map(d=>'<path d="'+d+'" fill="#111" fill-rule="evenodd"/>').join('')+(document.getElementById('outlines').value==='on'?outlines.map(d=>'<path d="'+d+'" fill="none" stroke="#3b8768" stroke-width=".45"/>').join(''):'')+'</svg>'}function render(){const item=data[document.getElementById('pair').value+'|'+document.getElementById('size').value];document.getElementById('content').innerHTML=item.rows.map(row=>'<section><h2>'+item.pairName+' · '+row.name+'</h2>'+row.levels.map(level=>'<h3>Softness '+Math.round(level.softness*100)+'%</h3><div class="grid">'+level.options.map((option,i)=>'<figure>'+svg(option.paths,row.outlines)+'<figcaption>'+names[i]+'</figcaption><div class="stats '+(option.removedArea>.1?'bad':'')+'">'+option.components+' outlines · '+option.holes+' counters'+(option.removedArea>.1?'<br>Stamp loss '+option.removedArea.toFixed(2)+' px²':'')+'</div></figure>').join('')+'</div>').join('')+'</section>').join('')}['pair','size','outlines'].forEach(id=>document.getElementById(id).addEventListener('change',render));render()</script></html>`)
console.log(`Saved ${count} frames. Loss flags: ${diagnostics.filter(d=>d.removedArea>.1).length}`)
