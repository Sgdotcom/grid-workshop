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
const section = (polys, mid, n, u) => {
  const hits=[]
  for(const p of polys)for(const ring of p)for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length], da=(a[0]-mid[0])*u[0]+(a[1]-mid[1])*u[1], db=(b[0]-mid[0])*u[0]+(b[1]-mid[1])*u[1]
    if((da<=0&&db>0)||(db<=0&&da>0)){const t=da/(da-db);hits.push((a[0]+t*(b[0]-a[0])-mid[0])*n[0]+(a[1]+t*(b[1]-a[1])-mid[1])*n[1])}
  }
  return hits.length ? Math.max(...hits)-Math.min(...hits) : 0
}
function cornerBridge(stamps, polys){
  const [a,b]=stamps, length=Math.hypot(b.cx-a.cx,b.cy-a.cy),u=[(b.cx-a.cx)/length,(b.cy-a.cy)/length],n=[-u[1],u[0]],mid=[(a.cx+b.cx)/2,(a.cy+b.cy)/2]
  const width=section(polys,mid,n,u);assert.ok(width>0,'Reference join must cross midpoint')
  const anchor=(s,t,sign)=>s.rings[0].filter(p=>(p[0]-s.cx)*(t.cx-s.cx)+(p[1]-s.cy)*(t.cy-s.cy)>=-1e-6).reduce((best,p)=>!best||sign*((p[0]-s.cx)*n[0]+(p[1]-s.cy)*n[1])>sign*((best[0]-s.cx)*n[0]+(best[1]-s.cy)*n[1])?p:best,null)
  const cubic=(p,c1,c2,q)=>Array.from({length:33},(_,i)=>{const t=i/32,v=1-t;return[0,1].map(k=>v*v*v*p[k]+3*v*v*t*c1[k]+3*v*t*t*c2[k]+t*t*t*q[k])})
  const facePair=Math.abs(u[0])>.1&&Math.abs(u[1])>.1
  const softenShoulder=facePair?Math.min(1,Math.max(0,(length/(a.size/Math.SQRT2)-2.2)*14)):0
  const flank=sign=>{const p=anchor(a,b,sign),q=anchor(b,a,sign),m=[mid[0]+n[0]*sign*width/2,mid[1]+n[1]*sign*width/2], reach=Math.max(0,Math.min(length*.23,((m[0]-p[0])*u[0]+(m[1]-p[1])*u[1])*.45,((q[0]-m[0])*u[0]+(q[1]-m[1])*u[1])*.45))
    return [...cubic(p,[p[0]+u[0]*reach-n[0]*sign*reach*softenShoulder,p[1]+u[1]*reach-n[1]*sign*reach*softenShoulder],[m[0]-u[0]*reach,m[1]-u[1]*reach],m),...cubic(m,[m[0]+u[0]*reach,m[1]+u[1]*reach],[q[0]-u[0]*reach-n[0]*sign*reach*softenShoulder,q[1]-u[1]*reach-n[1]*sign*reach*softenShoulder],q).slice(1)]}
  const top=flank(1),bottom=flank(-1),bridge=toPolygon([[...top,...bottom.reverse()]])
  const result=unionPolygons([...stamps.map(s=>toPolygon(s.rings)),bridge])
  assert.equal(result.length,1,'Full Softness must connect both stamps')
  assert.ok(Math.abs(section(result,mid,n,u)-width)<.03,'Full Softness must retain slim midpoint width')
  return result
}
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
      const rotated=rotatePolys(squareResult,Math.PI/4)
      const candidate=softness===1?cornerBridge(diamonds,rotated):rotated
      const loss=area(differencePolygons(diamondBodies,candidate));maxLoss=Math.max(maxLoss,loss)
      assert.ok(loss<.1,`Stamp retention exceeds clipping tolerance: ${size} ${spacing} ${index} ${softness}: ${loss}`)
      assert.ok(Math.abs(area(rotated)-area(squareResult))<1e-6,'Rotation preserves area')
      for(const p of candidate)for(const r of p)for(const xy of r)assert.ok(xy.every(Number.isFinite))
      const reverse=softness===1?cornerBridge([...diamonds].reverse(),rotated):softness?rotatePolys(softnessFinishPolygons([...squares].reverse(),softness),Math.PI/4):candidate
      assert.ok(delta(candidate,reverse)<.01,'Pair order must not change prototype')
      const difference=delta(rotated,candidate); assert.ok(delta(before,candidate)<.1,`Paint/export differs from accepted reference: ${size} ${spacing} ${index} ${softness}`);if(difference>.01)changes++;checks++
      const all=[...before,...candidate].flat(2), xs=all.map(p=>p[0]),ys=all.map(p=>p[1]), minX=Math.min(...xs)-10,minY=Math.min(...ys)-10,w=Math.max(...xs)-minX+10,h=Math.max(...ys)-minY+10
      return{softness,before:multiPolygonToPathList(before),candidate:multiPolygonToPathList(candidate),rotated:multiPolygonToPathList(rotated),square:multiPolygonToPathList(squareResult),viewBox:[minX,minY,w,h].join(' '),difference}
    })
    return{name:layout.name,distance,comparisons}
  })
}
console.log({checks,maxLoss})
