import {createJiti} from 'jiti'
import pc from 'polygon-clipping'
import {geometry, measure} from '../scripts/join-geometry.mjs'
const jiti=createJiti(import.meta.url,{alias:{'@':`${process.cwd()}/src`}})
const {PRESET_SHAPES}=await jiti.import('../src/lib/types.ts')
const {compareJoin}=await jiti.import('../src/lib/joinExperiments.ts')
const {makeSoftStamp,softnessFinishPathList}=await jiti.import('../src/lib/softness.ts')
const {getActiveJoinMethod}=await jiti.import('../src/lib/shapeJoinRegistry.ts')
const {multiPolygonToPathList,toPolygon}=await jiti.import('../src/lib/polyBool.ts')
const shape=id=>PRESET_SHAPES.find(s=>s.preset===id)
const make=(id,col,row,size)=>makeSoftStamp(`${col}:${row}`,col,row,20+42*col,20+42*row,size,shape(id),20+42*col-size/2,20+42*row-size/2,2)
const area=polys=>polys.reduce((n,p)=>n+p.reduce((s,r,i)=>s+(i?-1:1)*Math.abs(r.reduce((t,a,j)=>{const b=r[(j+1)%r.length];return t+a[0]*b[1]-b[0]*a[1]},0))/2,0),0)/1e6
const results={directionLookups:[],edgeCases:[],holes:[]}
for(const id of ['square','diamond'])for(const dir of ['horizontal','h','diagonal-right','d'])results.directionLookups.push({shape:id,direction:dir,method:getActiveJoinMethod(id,dir)})
for(const [id,cells,layout,size,softness,corners] of [
 ['triangle',[[0,0],[0,1]],'vertical',56,1,2],
 ['star5',[[0,0],[0,1]],'vertical',56,.2,0],
 ['star5',[[0,0],[1,0],[0,1]],'elbow',56,.2,0],
 ['star5',[[0,0],[1,0],[0,1],[1,1]],'block',56,.2,0],
])for(const method of ['weld','current']){
 const result=compareJoin(shape(id),cells,{size,softness,roundedness:corners,radius:1,neck:1},method)
 const output=geometry(result.paths),body=geometry(result.outlines)
 const detached=output.filter(p=>area(pc.intersection([p],body))<.00001)
 results.edgeCases.push({shape:id,layout,method,...measure(result,layout),detached:detached.length,detachedArea:area(detached)})
}
const stamps=[make('square',0,0,56),make('ring',1,0,24)]
const hole=geometry(multiPolygonToPathList([toPolygon([stamps[1].rings[1]])]))
for(const holeMode of ['open','no-gaps','solid']){
 const output=geometry(softnessFinishPathList(stamps,{softness:1,holeMode}))
 results.holes.push({holeMode,filledHoleArea:area(pc.intersection(output,hole)),originalHoleArea:area(hole)})
}
console.log(JSON.stringify(results,null,2))
const {organicWeld,softnessFinishPolygons}=await jiti.import('../src/lib/softness.ts')
const {unionPolygons,multiPolygonFills}=await jiti.import('../src/lib/polyBool.ts')
for(const preset of ['arc','wedge']){
 const pair=[make(preset,0,0,56),make(preset,0,1,24)]
 const bodies=pair.map(s=>toPolygon(s.rings))
 const bridges=organicWeld(...pair,1)
 const raw=unionPolygons([...bodies,...bridges])
 const prod=softnessFinishPolygons(pair,1)
 let inside=0,missingWeld=0,missingProd=0
 for(let y=-10;y<90;y+=.25)for(let x=-10;x<55;x+=.25){
   if(!multiPolygonFills(bodies,x,y))continue
   inside++
   if(!multiPolygonFills(raw,x,y))missingWeld++
   if(!multiPolygonFills(prod,x,y))missingProd++
 }
 let directUnion
 try {const direct=pc.union(...bodies,...bridges);directUnion={ok:true,components:direct.length}}
 catch(error){directUnion={ok:false,error:error.message}}
 console.log(JSON.stringify({preset,sampledBodyLossWeld:100*missingWeld/inside,sampledBodyLossProduction:100*missingProd/inside,directUnion}))
}
for(const preset of ['arc','wedge']){
 const pair=[make(preset,0,0,56),make(preset,0,1,24)]
 const bodies=pair.map(s=>toPolygon(s.rings))
 const alone=unionPolygons(bodies)
 let inside=0,missing=0
 for(let y=-10;y<90;y+=.25)for(let x=-10;x<55;x+=.25){
   if(!multiPolygonFills(bodies,x,y))continue
   inside++
   if(!multiPolygonFills(alone,x,y))missing++
 }
 console.log(JSON.stringify({preset,bodyOnlyLossPercent:100*missing/inside}))
}
