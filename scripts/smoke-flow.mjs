import assert from 'node:assert/strict'
import {createJiti} from 'jiti'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url))
const j=createJiti(import.meta.url,{alias:{'@':`${root}src`}})
const {glyphPolygons,stampsFromFills}=await j.import('../src/lib/export.ts')
const {softnessFinishPolygons,softEdgeKey}=await j.import('../src/lib/softness.ts')
const {PRESET_SHAPES}=await j.import('../src/lib/types.ts')
const {unionPolygons,differencePolygons,intentionalHoleCutters,toPolygon,ringAbsArea,multiPolygonFills}=await j.import('../src/lib/polyBool.ts')
const area=ps=>ps.reduce((n,p)=>n+p.reduce((a,r,i)=>a+(i?-1:1)*ringAbsArea(r),0),0)
const delta=(a,b)=>area(differencePolygons(a,b))+area(differencePolygons(b,a))
const pairs=[['cross','cross'],['x','x'],['chevron','chevron'],['triangle','triangle'],['hexagon','hexagon'],['star5','star5'],['capsule','capsule'],['arc','arc'],['circle','cross'],['square','star5'],['square','chevron'],['arc','triangle'],['capsule','star4'],['ring','square'],['square','triangle'],['diamond','circle']]
let checks=0
const issues=[]
for(const pair of pairs)for(const rotation of (process.env.FLOW_EXTRA ? [180,270] : [0,90]))for(const sizes of [[37,37],[42,42],[37,56]])for(const cells of [[[0,0],[1,0]],[[0,0],[0,1]],[[0,0],[1,1]]]){
 const regions=cells.map(([col,row],i)=>({key:`${col}:${row}`,col,row,layer:'a',kind:'shape',shapeId:`preset-${pair[i]}`,size:sizes[i],rotation,mode:'ink'}))
 const payload={grid:{cols:7,rows:9,cellSize:40,gap:2},library:PRESET_SHAPES,filledRegions:regions,glyphChar:'a',softness:1,cornerRadius:process.env.FLOW_EXTRA ? 2 : 0,holeMode:'open',brokenJoins:new Set()}
 const stamps=stampsFromFills(regions,payload.grid,PRESET_SHAPES,payload.cornerRadius)
 const cutters=intentionalHoleCutters(stamps.map(s=>s.rings))
 const raw=unionPolygons(stamps.map(s=>toPolygon(s.rings))),bodies=cutters.length?differencePolygons(raw,cutters):raw
 const actual=glyphPolygons(payload),paint=softnessFinishPolygons(stamps,1)
 assert.ok(actual.length,'Must retain ink')
 for(const p of actual)for(const ring of p)for(const xy of ring)assert.ok(xy.every(Number.isFinite),'Finite coordinates')
 assert.ok(delta(actual,paint)<.1,'Paint/export must share finished geometry')
 assert.ok(delta(actual,glyphPolygons({...payload,filledRegions:[...regions].reverse()}))<.1,'Stamp order must not change result')
 const removed=area(differencePolygons(bodies,actual))
 if(removed>.1 || actual.length!==1) issues.push({pair,rotation,sizes,cells,removed,components:actual.length})
 if(pair.includes('ring')){
  const ring=stamps[pair.indexOf('ring')]
  assert.equal(multiPolygonFills(actual,ring.cx,ring.cy),false,'Intentional ring centre stays open')
 }
 checks++
}
// Split and melt-off disable bridges across a real gap; overlap remains ink.
const regions=[0,1].map(col=>({key:`${col}:0`,col,row:0,layer:'a',kind:'shape',shapeId:'preset-cross',size:37,rotation:0,mode:'ink'}))
const payload={grid:{cols:7,rows:9,cellSize:40,gap:2},library:PRESET_SHAPES,filledRegions:regions,glyphChar:'a',softness:1,cornerRadius:process.env.FLOW_EXTRA ? 2 : 0,holeMode:'open',brokenJoins:new Set([softEdgeKey(0,0,1,0)])}
assert.equal(glyphPolygons(payload).length,2,'Broken join must stay split')
globalThis.window={localStorage:{getItem:key=>key==='gridz-melt-off-presets-v1'?'["cross"]':null}}
assert.equal(glyphPolygons({...payload,brokenJoins:new Set()}).length,2,'Melt-off must stay split')
delete globalThis.window
console.log(JSON.stringify({checks,issues}))
assert.deepEqual(issues,[],'Full Softness must connect the tested layouts and retain stamps')
