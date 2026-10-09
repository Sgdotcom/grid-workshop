import assert from 'node:assert/strict'
import {createJiti} from 'jiti'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url)),j=createJiti(import.meta.url,{alias:{'@':root+'src'}})
const {glyphPolygons,glyphContentBounds,exactGlyphContentBounds,buildSvgMarkup}=await j.import('../src/lib/export.ts')
const {PRESET_SHAPES}=await j.import('../src/lib/types.ts')
const {DEFAULT_FONT_DESIGN}=await j.import('../src/lib/fontDesign.ts')
let checks=0
for(const shape of PRESET_SHAPES)for(const rotation of [0,45,90,135])for(const softness of [0,1])for(const thickness of [0,30,200]){
 const payload={grid:{cols:7,rows:9,cellSize:40,gap:2},library:PRESET_SHAPES,filledRegions:[{key:'0:0',col:0,row:0,layer:'a',kind:'shape',shapeId:shape.id,size:400,rotation,mode:'ink'}],glyphChar:'a',softness,cornerRadius:0,brokenJoins:new Set(),fontDesign:{...DEFAULT_FONT_DESIGN,thickness}}
 const stage=glyphContentBounds(payload)
 assert.ok(Object.values(stage).every(Number.isFinite))
 for(const [x,y] of glyphPolygons(payload).flat(2))assert.ok(x>=stage.x&&y>=stage.y&&x<=stage.x+stage.width&&y<=stage.y+stage.height,'Stage clipping')
 const b=exactGlyphContentBounds(payload)
 for(const [x,y] of glyphPolygons(payload).flat(2))assert.ok(x>=b.x&&y>=b.y&&x<=b.x+b.width&&y<=b.y+b.height,`${shape.id} rotation ${rotation} thickness ${thickness} clipped`)
 for(const fitContent of [true,false]){
  const svg=buildSvgMarkup(payload,{fitContent})
  assert.ok(!svg.includes('NaN'))
  const [x,y,w,h]=svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number)
  for(const [px,py] of glyphPolygons(payload).flat(2))assert.ok(px>=x-1e-8&&py>=y-1e-8&&px<=x+w+1e-8&&py<=y+h+1e-8,`${shape.id} ${rotation} ${softness} ${thickness} ${fitContent}: ${px},${py} outside ${x},${y},${w},${h}`)
 }
 checks++
}
console.log(JSON.stringify({checks,clipped:0}))
