import { Font, Glyph, Path } from 'opentype.js'
import { glyphPolygons } from './export'
import { canvasPixelSize, letterGuideMetrics } from './gridGeometry'
import type { Contribution } from './festival'
import type { ShapeDef } from './types'
import { downloadBlob } from './utils'

const UNITS_PER_EM = 1000
const SIDE_BEARING = 60

const GLYPH_NAMES: Record<string, string> = {
  å: 'aring', ä: 'adieresis', ö: 'odieresis', Å: 'Aring', Ä: 'Adieresis', Ö: 'Odieresis',
}

function glyphName(char: string) {
  if (/^[A-Za-z]$/.test(char)) return char
  return GLYPH_NAMES[char] ?? `uni${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`
}

function signedArea(points: [number, number][]) {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    area += x1 * y2 - x2 * y1
  }
  return area / 2
}

export function buildFestivalFont(contributions: Contribution[], library: ShapeDef[]) {
  if (!contributions.length) throw new Error('Add a letter to the typeface first.')
  const grid = contributions[0].draft.grid!
  const { width, height } = canvasPixelSize(grid)
  const scale = UNITS_PER_EM / height
  // Fixed Arial metrics, never measured: the same baseline on every machine.
  const baseline = letterGuideMetrics(width, height, 1).baseline
  const advanceWidth = Math.round(width * scale + SIDE_BEARING * 2)
  const missing = new Path()
  missing.moveTo(SIDE_BEARING, 0)
  missing.lineTo(advanceWidth - SIDE_BEARING, 0)
  missing.lineTo(advanceWidth - SIDE_BEARING, 600)
  missing.lineTo(SIDE_BEARING, 600)
  missing.close()
  const glyphs = [
    new Glyph({ name: '.notdef', advanceWidth, path: missing }),
    new Glyph({ name: 'space', unicode: 32, advanceWidth: Math.round(advanceWidth * 0.55), path: new Path() }),
  ]
  const ordered = [...contributions].sort(
    (a, b) => a.draft.char.codePointAt(0)! - b.draft.char.codePointAt(0)!,
  )
  for (const { draft } of ordered) {
    const path = new Path()
    // Built from the unioned polygons, so contours never overlap and cannot cancel
    // each other under the font's non-zero winding rule.
    const polygons = glyphPolygons({
      grid: draft.grid!, library, glyphChar: draft.char, filledRegions: draft.filled,
      softness: draft.softness!, cornerRadius: draft.cornerRadius, brokenJoins: new Set(draft.brokenJoins),
      holeMode: draft.holeMode,
    })
    for (const polygon of polygons) {
      polygon.forEach((ring, ringIndex) => {
        const last = ring[ring.length - 1]
        const open = ring.length > 1 && ring[0][0] === last[0] && ring[0][1] === last[1] ? ring.slice(0, -1) : ring
        const points = open.map(([x, y]): [number, number] => [
          Math.round(x * scale + SIDE_BEARING),
          Math.round((baseline - y) * scale),
        ]).filter((point, index, all) => {
          const previous = all[(index - 1 + all.length) % all.length]
          return all.length < 2 || point[0] !== previous[0] || point[1] !== previous[1]
        })
        if (points.length < 3) return
        // PostScript outlines: outer contours counter-clockwise, counters clockwise.
        const area = signedArea(points)
        if (area === 0) return
        if (ringIndex === 0 ? area < 0 : area > 0) points.reverse()
        path.moveTo(points[0][0], points[0][1])
        for (let i = 1; i < points.length; i++) path.lineTo(points[i][0], points[i][1])
        path.close()
      })
    }
    glyphs.push(new Glyph({ name: glyphName(draft.char), unicode: draft.char.codePointAt(0), advanceWidth, path }))
  }
  return new Font({
    familyName: 'Beckmans Together', styleName: 'Regular', unitsPerEm: UNITS_PER_EM,
    ascender: Math.ceil(baseline * scale), descender: Math.floor((baseline - height) * scale), glyphs,
  })
}

export async function exportFestivalFont(contributions: Contribution[], library: ShapeDef[]) {
  const font = buildFestivalFont(contributions, library)
  downloadBlob(new Blob([font.toArrayBuffer()], { type: 'font/otf' }), 'beckmans-together.otf')
}
