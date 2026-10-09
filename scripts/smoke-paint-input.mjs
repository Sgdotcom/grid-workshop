import assert from 'node:assert/strict'
import { createJiti } from 'jiti'
const j = createJiti(import.meta.url)
const { strokeCells } = await j.import('../src/lib/paintInput.ts')
let checks=0
for (const from of [{col:0,row:0},{col:19,row:23},{col:4,row:7}]) {
  for(let col=0;col<20;col++) for(let row=0;row<24;row++) {
    const to={col,row}, cells=strokeCells(from,to)
    assert.equal(cells.length,Math.max(Math.abs(col-from.col),Math.abs(row-from.row)))
    if(cells.length) assert.deepEqual(cells.at(-1),to)
    let prev=from
    for(const cell of cells) {
      assert.ok(Math.abs(cell.col-prev.col)<=1 && Math.abs(cell.row-prev.row)<=1)
      assert.notDeepEqual(cell,prev)
      assert.ok(cell.col>=0 && cell.col<20 && cell.row>=0 && cell.row<24)
      prev=cell
    }
    assert.equal(new Set(cells.map(c=>`${c.col}:${c.row}`)).size,cells.length)
    checks++
  }
}
// Existing projects can exceed the reference tool's 24-row grid.
assert.equal(strokeCells({col:0,row:0},{col:0,row:600}).length,600)
console.log(`Paint interpolation passed ${checks} paths and a 600-cell legacy path`)
