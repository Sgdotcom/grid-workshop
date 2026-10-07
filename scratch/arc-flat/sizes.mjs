import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {createJiti} from 'jiti'
const root=new URL('../../',import.meta.url).pathname,jiti=createJiti(import.meta.url,{alias:{'@':root+'src'}})
const {shapeOutlineRings}=await jiti.import(root+'src/lib/shapes.ts')
const {PRESET_SHAPES}=await jiti.import(root+'src/lib/types.ts')
const {multiPolygonToPathList,toPolygon}=await jiti.import(root+'src/lib/polyBool.ts')
const bounds=r=>{const p=r.flat(),xs=p.map(p=>p[0]),ys=p.map(p=>p[1]);return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}}
const records=[]
for(const def of PRESET_SHAPES)for(const size of [24,37,56])for(const corners of [0,2])for(const rotation of [0,45,90]){
const rings=shapeOutlineRings(def,0,0,size,corners,rotation),b=bounds(rings)
records.push({preset:def.preset,size,corners,rotation,width:b.w,height:b.h,longest:Math.max(b.w,b.h)})
}
writeFileSync(root+'scratch/arc-flat/size-audit.json',JSON.stringify(records,null,2))
const data=PRESET_SHAPES.map(def=>({label:def.label,frames:[24,37,56].map(size=>[0,2].map(corners=>{
const rings=shapeOutlineRings(def,0,0,size,corners,0),b=bounds(rings),scale=size/Math.max(b.w,b.h),cx=b.x+b.w/2,cy=b.y+b.h/2;
const normalized=rings.map(r=>r.map(([x,y])=>[(x-cx)*scale+size/2,(y-cy)*scale+size/2]));
const n=bounds(normalized);assert(Math.abs(Math.max(n.w,n.h)-size)<1e-8);assert(Math.abs(n.w/n.h-b.w/b.h)<1e-8);
return {size,b,current:multiPolygonToPathList([toPolygon(rings)]),proposed:multiPolygonToPathList([toPolygon(normalized)])}
}))}))
writeFileSync(root+'docs/shape-size-preview.html',`<!doctype html><html><meta charset="utf-8"><title>Shape size comparison</title><style>body{font:14px system-ui;margin:26px;background:#f5f4ef;color:#242522}header{position:sticky;top:0;background:#f5f4ef;padding:12px 0}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}article{background:white;padding:16px;border:1px solid #ddd}.pair{display:flex}.pair>div{width:50%;text-align:center}svg{width:100%;height:145px}p{max-width:900px;line-height:1.5}</style><header><h1>Same pixel size, side by side.</h1><p>Candidate definition: pixel size measures the longest unrotated side after corner rounding. Natural proportions remain intact; rectangles stay rectangular. Blue boxes show the requested size. Preview only.</p><label>Size <select id="size"><option value="0">24 px</option><option value="1" selected>37 px</option><option value="2">56 px</option></select></label> <label>Corners <select id="corners"><option value="0">Sharp</option><option value="1" selected>2 px</option></select></label> <a href="arc-flat-preview.html">Arc welds</a></header><main></main><script>const data=${JSON.stringify(data)};function draw(){document.querySelector('main').innerHTML=data.map(c=>{const f=c.frames[size.value][corners.value];return '<article><h3>'+c.label+'</h3><p>Current: '+f.b.w.toFixed(2)+' × '+f.b.h.toFixed(2)+' px</p><div class="pair">'+['current','proposed'].map(k=>'<div>'+(k==='current'?'Current':'Consistent size')+'<svg viewBox="-5 -5 66 66"><rect width="'+f.size+'" height="'+f.size+'" fill="none" stroke="#80b1da" stroke-width=".4"/>'+f[k].map(d=>'<path d="'+d+'" fill="#242522" fill-rule="evenodd"/>').join('')+'</svg></div>').join('')+'</div></article>'}).join('')}size.onchange=draw;corners.onchange=draw;draw()</script></html>`)
console.log(JSON.stringify(records.filter(r=>r.size===37&&r.corners===2&&r.rotation===0),null,2))
