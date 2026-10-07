/** Throwaway probe for flagged fuse cases. Delete when the weld is green. */
import { cellCenter, cellOrigin } from '@/lib/gridGeometry'
import { blendStrength, fuseMaxGap, makeSoftStamp, softnessFinishPathList } from '@/lib/softness'
import { PRESET_SHAPES, shapeLabel, type ShapeDef } from '@/lib/types'

const GRID = { cols: 3, rows: 3, cellSize: 40, gap: 2 }

function stamp(def: ShapeDef, col: number, row: number, size: number, corner: number) {
  const { cx, cy } = cellCenter(col, row, GRID)
  const { x, y } = cellOrigin(col, row, GRID)
  const ox = x + (GRID.cellSize - size) / 2
  const oy = y + (GRID.cellSize - size) / 2
  return makeSoftStamp(`${def.id}:${col}:${row}`, col, row, cx, cy, size, def, ox, oy, corner)
}

const cases: [string, number, number, number, boolean][] = [
  ['triangle', 56, 0, 0.35, false],
  ['star5', 56, 18, 0.35, false],
  ['star5', 56, 18, 1, false],
  ['chevron', 56, 18, 0.35, true],
  ['chevron', 56, 18, 1, true],
]

for (const [preset, size, corner, soft, vertical] of cases) {
  const def = PRESET_SHAPES.find((d) => d.kind === 'preset' && d.preset === preset)
  if (!def) continue
  const a = stamp(def, 0, 0, size, corner)
  const b = stamp(def, vertical ? 0 : 1, vertical ? 1 : 0, size, corner)
  const blend = blendStrength(a, b, soft, false)
  const paths = softnessFinishPathList([a, b], soft)
  console.log(
    [
      `${shapeLabel(def)} ${size}px r${corner} ${Math.round(soft * 100)}% ${vertical ? 'V' : 'H'}`,
      `paired=${!!blend}`,
      `gap=${blend ? blend.gap.toFixed(2) : 'n/a'}`,
      `maxGap=${fuseMaxGap(size, soft).toFixed(2)}`,
      `paths=${paths.length}`,
    ].join('  '),
  )
}
