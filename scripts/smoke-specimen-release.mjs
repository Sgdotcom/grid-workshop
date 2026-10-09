import assert from 'node:assert/strict'
import {createJiti} from 'jiti'
const j=createJiti(import.meta.url,{alias:{'@':new URL('../src',import.meta.url).pathname}}),{specimenSvg,DEFAULT_SPECIMEN}=await j.import('../src/lib/specimen.ts')
const grid={cols:7,rows:9,cellSize:40,gap:2},polygons=[[[[0,0],[200,0],[200,300],[0,300],[0,0]]]],glyphs=new Map([['a',{grid,polygons}]])
const view=s=>s.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number)
for(const proportional of [true,false])for(const tracking of [-20,0,100]) {
 const {svg}=specimenSvg('aaa',glyphs,{...DEFAULT_SPECIMEN,proportional,tracking}); const [left,top,width,height]=view(svg)
 for(const d of svg.matchAll(/d="([^"]+)"/g))for(const point of d[1].matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)) {assert.ok(+point[1]>=left-.002&&+point[1]<=left+width+.002);assert.ok(+point[2]>=top-.002&&+point[2]<=top+height+.002)}
}
assert.ok(view(specimenSvg('a\n\n',glyphs,DEFAULT_SPECIMEN).svg)[3]>250)
assert.deepEqual(specimenSvg('a\r\na',glyphs,DEFAULT_SPECIMEN).unsupported,[])
assert.throws(()=>specimenSvg('a',glyphs,{...DEFAULT_SPECIMEN,ink:'" onload="alert(1)'}))
assert.throws(()=>specimenSvg('a',glyphs,{...DEFAULT_SPECIMEN,size:NaN}))
console.log('Specimen release audit passed: fixed/proportional bounds at three tracking values, blank lines, CRLF, invalid colours and values.')
