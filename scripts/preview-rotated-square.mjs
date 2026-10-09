import { createJiti } from 'jiti'
import { mkdirSync,writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const root=fileURLToPath(new URL('../',import.meta.url)), out=fileURLToPath(new URL('../../../outputs/',import.meta.url))
const jiti=createJiti(import.meta.url,{alias:{'@':`${root}src`}})
const {makeSoftStamp,softnessFinishPolygons}=await jiti.import(`${root}src/lib/softness.ts`)
const {PRESET_SHAPES}=await jiti.import(`${root}src/lib/types.ts`)
const {toPolygon,unionPolygons,multiPolygonToPathList,differencePolygons}=await jiti.import(`${root}src/lib/polyBool.ts`)
const square=PRESET_SHAPES.find(s=>s.preset==='square'), diamond=PRESET_SHAPES.find(s=>s.preset==='diamond')
const rotate=([x,y],angle)=>[x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle)]
const rotatePolys=(ps,angle)=>ps.map(p=>p.map(r=>r.map(xy=>rotate(xy,angle))))
const area=ps=>ps.reduce((s,p)=>s+p.reduce((v,r,i)=>v+(i?-1:1)*Math.abs(r.reduce((a,xy,k)=>{const q=r[(k+1)%r.length];return a+xy[0]*q[1]-q[0]*xy[1]},0))/2,0),0)
const delta=(a,b)=>area(differencePolygons(a,b))+area(differencePolygons(b,a))
const stamp=(shape,size,x,y,col,row)=>makeSoftStamp(`${col}:${row}`,col,row,x,y,size,shape,x-size/2,y-size/2,0)
const layouts=[{name:'Horizontal · diamond tips',angle:0,cells:[[0,0],[1,0]],squareCells:[[0,1],[1,0]]},{name:'Vertical · diamond tips',angle:Math.PI/2,cells:[[0,0],[0,1]],squareCells:[[0,0],[1,1]]},{name:'Diagonal ↘ · diamond faces',angle:Math.PI/4,cells:[[0,0],[1,1]],squareCells:[[0,0],[1,0]]},{name:'Diagonal ↙ · diamond faces',angle:3*Math.PI/4,cells:[[1,0],[0,1]],squareCells:[[0,0],[0,1]]}]
const data={};let checks=0,changes=0,maxLoss=0
for(const size of [37,42,56])for(const spacing of ['grid','0','5','12']){
  data[`${size}|${spacing}`]=layouts.map((layout,index)=>{
    const diagonal=index>1, distance=spacing==='grid'?42*(diagonal?Math.SQRT2:1):(diagonal?size/Math.SQRT2:size)+Number(spacing)
    const dxy=rotate([distance,0],layout.angle), sqxy=rotate(dxy,-Math.PI/4), sqsize=size/Math.SQRT2
    const diamonds=[stamp(diamond,size,0,0,...layout.cells[0]),stamp(diamond,size,...dxy,...layout.cells[1])]
    const squares=[stamp(square,sqsize,0,0,...layout.squareCells[0]),stamp(square,sqsize,...sqxy,...layout.squareCells[1])]
    const diamondBodies=unionPolygons(diamonds.map(s=>toPolygon(s.rings))),squareBodies=unionPolygons(squares.map(s=>toPolygon(s.rings)))
    const bodyDelta=delta(diamondBodies,rotatePolys(squareBodies,Math.PI/4)); assert.ok(bodyDelta<.1,`Rotated square bodies differ: ${size} ${spacing} ${index}: ${bodyDelta}`)
    const comparisons=[0,.25,.55,1].map(softness=>{
      const before=softness?softnessFinishPolygons(diamonds,softness):diamondBodies
      const squareResult=softness?softnessFinishPolygons(squares,softness):squareBodies
      const candidate=rotatePolys(squareResult,Math.PI/4)
      const loss=area(differencePolygons(diamondBodies,candidate));maxLoss=Math.max(maxLoss,loss)
      assert.ok(loss<.1,`Stamp retention exceeds clipping tolerance: ${size} ${spacing} ${index} ${softness}: ${loss}`)
      assert.ok(Math.abs(area(candidate)-area(squareResult))<1e-6,'Rotation preserves area')
      for(const p of candidate)for(const r of p)for(const xy of r)assert.ok(xy.every(Number.isFinite))
      const reverse=softness?rotatePolys(softnessFinishPolygons([...squares].reverse(),softness),Math.PI/4):candidate
      assert.ok(delta(candidate,reverse)<.01,'Pair order must not change prototype')
      const difference=delta(before,candidate);if(difference>.01)changes++;checks++
      const all=[...before,...candidate].flat(2), xs=all.map(p=>p[0]),ys=all.map(p=>p[1]), minX=Math.min(...xs)-10,minY=Math.min(...ys)-10,w=Math.max(...xs)-minX+10,h=Math.max(...ys)-minY+10
      return{softness,before:multiPolygonToPathList(before),candidate:multiPolygonToPathList(candidate),square:multiPolygonToPathList(squareResult),viewBox:[minX,minY,w,h].join(' '),difference}
    })
    return{name:layout.name,distance,comparisons}
  })
}
mkdirSync(out,{recursive:true})
writeFileSync(`${out}diamond-rotated-square-preview.html`,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Diamond as a rotated square</title><style>*{box-sizing:border-box}body{margin:0;background:#f3f2ed;color:#24251f;font:15px system-ui}main{max-width:1250px;margin:auto;padding:30px}h1{font-size:28px}p{line-height:1.5;max-width:850px}.controls{display:flex;gap:24px;padding:18px 0;position:sticky;top:0;background:#f3f2ed}label{display:grid;gap:6px}select{padding:8px;font:inherit}section{border-top:1px solid #bbb;margin-top:22px}h2{font-size:18px;font-weight:600}.levels{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}svg{width:100%;height:140px;background:white}figure{margin:0}figcaption{font-size:11px;padding:5px 0;color:#555}h3{font-size:13px;font-weight:500}.state{font-size:11px;color:#56715c}footer{margin-top:30px;font-size:12px;color:#666;line-height:1.5}@media(max-width:950px){.levels{grid-template-columns:repeat(2,1fr)}}@media(max-width:500px){.levels{grid-template-columns:1fr}}</style><main><h1>Diamond as a rotated square</h1><p>The candidate is the existing square engine’s finished silhouette rotated by 45°. Diamond stamp outlines stay the same. Its equivalent square has a side length of diamond size ÷ √2; both use identical physical separation.</p><p>This isolates the proposed behaviour before changing Paint. Tip-facing diamond neighbours inherit square diagonal joins; face-facing diamond neighbours inherit square straight joins.</p><div class="controls"><label>Diamond size<select id="size"><option>37</option><option selected>42</option><option>56</option></select></label><label>Spacing<select id="spacing"><option value="grid">Actual Paint grid</option><option value="0">Matching outline gap · 0 px</option><option value="5">Matching outline gap · 5 px</option><option value="12">Matching outline gap · 12 px</option></select></label></div><div id="content"></div><footer>Source: grid-workshop main c4222756 · 8 October 2026. Sharp corners, default square join settings, melt on, open gaps. Same 42 px lattice step in Actual Paint grid. Prototype uses square-local direction and size for the full fuse, including reach and bridge width. A simple diamond → Weld switch does not achieve this equivalence. Pairs only; mixed shapes, rounded corners, clusters and broken joins need separate implementation checks before integration. ${checks} comparisons passed finite geometry, original stamp retention within 0.1 px² clipping tolerance, rotation-area and pair-order checks. Live code unchanged.</footer></main><script>const data=${JSON.stringify(data)};function svg(paths,box){return '<svg viewBox="'+box+'" role="img" aria-label="Join silhouette">'+paths.map(d=>'<path d="'+d+'" fill="#111" fill-rule="evenodd"/>').join('')+'</svg>'}function render(){document.getElementById('content').innerHTML=data[document.getElementById('size').value+'|'+document.getElementById('spacing').value].map(row=>'<section><h2>'+row.name+'</h2><div class="levels">'+row.comparisons.map(c=>'<div><h3>Softness '+Math.round(c.softness*100)+'%</h3><div class="pair"><figure>'+svg(c.before,c.viewBox)+'<figcaption>Current diamond</figcaption></figure><figure>'+svg(c.candidate,c.viewBox)+'<figcaption>Rotated-square candidate</figcaption></figure></div><div class="state">'+(c.difference>.01?'Join changed':'Same geometry')+'</div></div>').join('')+'</div></section>').join('')}['size','spacing'].forEach(id=>document.getElementById(id).addEventListener('change',render));render()</script></html>`)
writeFileSync(`${out}diamond-rotated-square-validation.json`,JSON.stringify({checks,changes,maxLoss},null,2))
console.log({checks,changes,maxLoss})
