import {createJiti} from 'jiti'
import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
const root=fileURLToPath(new URL('../',import.meta.url)),out=fileURLToPath(new URL('../../../outputs/',import.meta.url))
const j=createJiti(import.meta.url,{alias:{'@':`${root}src`}})
const {glyphPolygons,stampsFromFills}=await j.import('../src/lib/export.ts')
const {PRESET_SHAPES}=await j.import('../src/lib/types.ts')
const {multiPolygonToPathList,toPolygon,unionPolygons,differencePolygons,ringAbsArea}=await j.import('../src/lib/polyBool.ts')
const source=readFileSync(`${out}flow-iterations-v2.html`,'utf8')
const start=source.indexOf('const data=')+'const data='.length,end=source.indexOf(',names=',start)
const data=JSON.parse(source.slice(start,end))
const layouts=[[[0,0],[1,0]],[[0,0],[0,1]],[[0,0],[1,1]],[[0,0],[1,0],[0,1]],[[0,0],[1,0],[0,1],[1,1]]]
const area=ps=>ps.reduce((n,p)=>n+p.reduce((a,r,i)=>a+(i?-1:1)*ringAbsArea(r),0),0)
const diagnostics=[]
for(const [key,item]of Object.entries(data)){
 const [a,b,sizeText]=key.split('|'),size=Number(sizeText)
 for(let index=0;index<item.rows.length;index++){
  const row=item.rows[index]
  const regions=layouts[index].map(([col,r],i)=>({key:`${col}:${r}`,col,row:r,layer:'a',kind:'shape',shapeId:`preset-${[a,b][i%2]}`,size,rotation:0,mode:'ink'}))
  const payload={grid:{cols:7,rows:9,cellSize:40,gap:2},library:PRESET_SHAPES,filledRegions:regions,glyphChar:'a',softness:1,cornerRadius:0,holeMode:'open',brokenJoins:new Set()}
  const bodies=unionPolygons(stampsFromFills(regions,payload.grid,PRESET_SHAPES,0).map(s=>toPolygon(s.rings)))
  for(const level of row.levels){
   const polys=glyphPolygons({...payload,softness:level.softness})
   for(const p of polys)for(const ring of p)for(const xy of ring)assert.ok(xy.every(Number.isFinite))
   const result={method:'current-flow',components:polys.length,holes:polys.reduce((n,p)=>n+p.length-1,0),removedArea:area(differencePolygons(bodies,polys)),paths:multiPolygonToPathList(polys)}
   assert.ok(result.removedArea<.1,`Stamp loss: ${key} ${row.name}`)
   if(level.softness===1)assert.equal(result.components,1,`Disconnected full Softness: ${key} ${row.name}`)
   level.options=[level.options[0],result]
   diagnostics.push({key,layout:row.name,softness:level.softness,...result,paths:undefined})
  }
 }
 console.log(`${item.pairName} ${size}: current Paint rendered`)
}
const html=source.slice(0,start)+JSON.stringify(data)+source.slice(end)
writeFileSync(`${out}flow-in-paint.html`,html.replace(/const data=.*?,names=\[.*?\];function svg/s,`const data=${JSON.stringify(data)},names=["Before update","Current local Paint · contour flow"];function svg`)
 .replace('repeat(5,minmax(0,1fr))','repeat(2,minmax(0,1fr))')
 .replace(/<h1>.*?<\/h1>/,'<h1>Flow in Paint · latest iteration</h1>')
 .replace('This is a development lab, not a change to the live workshop.','The right-hand panels are rendered through the actual local Paint/export pipeline. The public website has not been deployed yet.')
 .replace('More roundedness, unequal-size, rotation, broken-join and performance checks follow candidate selection.','Square and Arc reference joins, circular metaballs, and the accepted rotated Diamond geometry remain protected. Separate rotation/unequal-size/broken-join and worker checks validate the local implementation.'))
writeFileSync(`${out}flow-in-paint-validation.json`,JSON.stringify({currentFrames:diagnostics.length,diagnostics},null,2))
console.log(`${diagnostics.length} actual Paint/export frames verified`)
