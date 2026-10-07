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
const make=(preset,col,row,size=37,rotation=0)=>({...makeSoftStamp(`${col}:${row}`,col,row,20+42*col,20+42*row,size,PRESET_SHAPES.find(s=>s.preset===preset),20+42*col-size/2,20+42*row-size/2,2,rotation),rotation})
const cases=[
 ['Square → arc flat end',[make('square',0,0),make('arc',1,0)]],
 ['Arc flat end → square',[make('arc',0,0),make('square',0,1)]],
 ['Arc curved edge → square',[make('arc',0,0),make('square',1,0)]],
 ['Square above the curve',[make('square',0,0),make('arc',0,1)]],
 ['Two arc flat ends',[make('arc',0,0,37,180),make('arc',1,0)]],
 ['Rectangle → arc flat end',[make('rect',0,0),make('arc',1,0)]],
 ['Small square → large arc',[make('square',0,0,24),make('arc',1,0,56)]],
 ['Small arc → large square',[make('arc',0,0,24),make('square',0,1,56)]],
]

const toPaths=p=>multiPolygonToPathList(p.map(poly=>poly.map(r=>r.map(([x,y])=>[x/1000,y/1000]))))
function opening(stamp,stamps){
 const {cx,cy,size,rotation}=stamp,ox=cx-size/2,oy=cy+size/2,r=size*.28,a=rotation*Math.PI/180;
 const local=([x,y])=>[cx+(x-cx)*Math.cos(a)+(y-cy)*Math.sin(a),cy-(x-cx)*Math.sin(a)+(y-cy)*Math.cos(a)];
 const other=stamps.find(s=>s!==stamp),ptsOther=other.rings.flat().map(local),center=local([other.cx,other.cy]);
 const lg=center[0]<cx?Math.max(0,Math.min(r*.95,ox-Math.max(...ptsOther.map(p=>p[0])))):0;
 const bg=center[1]>cy?Math.max(0,Math.min(r*.95,Math.min(...ptsOther.map(p=>p[1]))-oy)):0;
 const pts=[[ox-lg,oy+bg],[ox-lg,oy-r+lg]];
 const cubic=(p,c,d,q)=>{for(let i=1;i<=24;i++){const t=i/24,u=1-t;pts.push([u*u*u*p[0]+3*u*u*t*c[0]+3*u*t*t*d[0]+t*t*t*q[0],u*u*u*p[1]+3*u*u*t*c[1]+3*u*t*t*d[1]+t*t*t*q[1]])}};
 cubic(pts.at(-1),[ox-lg,oy-r+lg*.448],[ox-lg*.552,oy-r],[ox,oy-r]);
 for(let i=1;i<=64;i++){const t=-Math.PI/2+i/64*Math.PI/2;pts.push([ox+r*Math.cos(t),oy+r*Math.sin(t)])}
 cubic(pts.at(-1),[ox+r,oy+bg*.552],[ox+r-bg*.448,oy+bg],[ox+r-bg,oy+bg]);
 if(bg>0){const left=Math.min(ox,...ptsOther.map(p=>p[0]))-10;pts.splice(0,26,[left,oy+bg],[left,oy-r],[ox,oy-r])}
 return geometry(multiPolygonToPathList([toPolygon([pts.map(([x,y])=>[cx+(x-cx)*Math.cos(a)-(y-cy)*Math.sin(a),cy+(x-cx)*Math.sin(a)+(y-cy)*Math.cos(a)])])]))
}

function candidate(stamps,body,s){
 const melt=geometry(fieldBlend(stamps.map(s=>s.rings),Math.min(...stamps.map(s=>s.size)),s*.65,'offset'));
 const protectedSpace=pc.difference(pc.union(...stamps.filter(s=>s.preset==='arc').map(stamp=>opening(stamp,stamps))),body);
 return toPaths(pc.union(body,pc.difference(melt,protectedSpace)))
}
const data=cases.map(([title,stamps])=>{
const outline=multiPolygonToPathList(stamps.map(s=>toPolygon(s.rings)));const body=geometry(outline)
return {title,outline,steps:Array.from({length:5},(_,i)=>{const s=i/4;return [s?multiPolygonToPathList(unionPolygons([...stamps.map(s=>toPolygon(s.rings)),...organicWeld(...stamps,s)])):outline,s?candidate(stamps,body,s):outline]})}
})
writeFileSync(root+'docs/arc-flat-preview.html',`<!doctype html><html><head><meta charset="utf-8"><title>Arc + flat-side joins</title><style>body{font:14px system-ui;background:#f5f4ef;color:#242522;margin:24px}h1{font-size:25px}header{position:sticky;top:0;background:#f5f4ef;padding:10px;z-index:1}article{background:white;border:1px solid #ddd;margin:16px 0;padding:16px}.row{display:grid;grid-template-columns:repeat(3,1fr)}svg{width:100%;height:245px}.label{text-align:center}.outline{fill:none;stroke:#b25939;stroke-width:.25;stroke-dasharray:1 1}body.hide .outline{display:none}input{vertical-align:middle}</style></head><body class="hide"><header><h1>Arcs meeting flat sides.</h1><p>Preview only. Compare the flat ends and curved sides against squares, rectangles and another arc. The workshop is unchanged.</p><label>Softness <input type="range" id="s" min="0" max="4" value="4"><output id="v">1.00</output></label> <label><input type="checkbox" id="o"> Original outlines</label></header><main></main><script>const data=${JSON.stringify(data)};const labels=['Original shapes','Current weld','New candidate'];function draw(){v.textContent=(s.value/4).toFixed(2);document.querySelector('main').innerHTML=data.map(c=>'<article><h2>'+c.title+'</h2><div class="row">'+[c.outline,...c.steps[s.value]].map((paths,i)=>'<div><div class="label">'+labels[i]+'</div><svg viewBox="-12 -12 110 110">'+paths.map(d=>'<path fill="#242522" fill-rule="evenodd" d="'+d+'"/>').join('')+c.outline.map(d=>'<path class="outline" d="'+d+'"/>').join('')+'</svg></div>').join('')+'</div></article>').join('')}s.oninput=draw;o.onchange=()=>document.body.classList.toggle('hide',!o.checked);draw();</script></body></html>`)
console.log('Rendered eight arc contacts at five softness levels')
