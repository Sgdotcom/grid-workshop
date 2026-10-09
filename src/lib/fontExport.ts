import { glyphMetrics } from './specimen'
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

export function buildFestivalFont(contributions: Contribution[], library: ShapeDef[], options: {fontName?:string;proportional?:boolean} = {}) {
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
    new Glyph({ name: 'space', unicode: 32, advanceWidth: 550, path: new Path() }),
  ]
  const ordered = [...new Map(contributions.map(c=>[c.draft.char,c])).values()].sort(
    (a, b) => a.draft.char.codePointAt(0)! - b.draft.char.codePointAt(0)!,
  )
  for (const { draft } of ordered) {
    // Letters can sit on different lattices: normalise each to the em by its own grid.
    const own = canvasPixelSize(draft.grid ?? grid)
    const glyphScale = UNITS_PER_EM / own.height
    const glyphBaseline = letterGuideMetrics(own.width, own.height, 1).baseline
    const path = new Path()
    // Built from the unioned polygons, so contours never overlap and cannot cancel
    // each other under the font's non-zero winding rule.
    const polygons = glyphPolygons({
      grid: draft.grid!, library, glyphChar: draft.char, filledRegions: draft.filled,
      softness: draft.softness!, cornerRadius: draft.cornerRadius, brokenJoins: new Set(draft.brokenJoins),
      holeMode: draft.holeMode, fontDesign: draft.fontDesign,
    })
    const metrics=glyphMetrics(polygons,draft.grid??grid,options.proportional)
    for (const polygon of polygons) {
      polygon.forEach((ring, ringIndex) => {
        const last = ring[ring.length - 1]
        const open = ring.length > 1 && ring[0][0] === last[0] && ring[0][1] === last[1] ? ring.slice(0, -1) : ring
        const points = open.map(([x, y]): [number, number] => [
          Math.round((x-metrics.left) * glyphScale + SIDE_BEARING),
          Math.round((glyphBaseline - y) * glyphScale),
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
    glyphs.push(new Glyph({ name: glyphName(draft.char), unicode: draft.char.codePointAt(0), advanceWidth: metrics.advance, path }))
  }
  return new Font({
    familyName: options.fontName?.trim() || 'Beckmans Together', postScriptName: ((options.fontName || 'Beckmans Together').replace(/[^A-Za-z0-9-]/g,'').slice(0,50)||'GridWorkshop')+'-Regular', styleName: 'Regular', unitsPerEm: UNITS_PER_EM,
    ascender: Math.ceil(Math.max(baseline * scale,...glyphs.map(g=>g.path.getBoundingBox().y2))), descender: Math.floor(Math.min((baseline-height)*scale,...glyphs.map(g=>g.path.getBoundingBox().y1))), glyphs,
  })
}

export function toWoff(buffer:ArrayBuffer):ArrayBuffer {
 const src=new DataView(buffer),count=src.getUint16(4),tables=[];let offset=44+count*20;
 for(let i=0;i<count;i++){const at=12+i*16,start=src.getUint32(at+8),length=src.getUint32(at+12);tables.push({tag:src.getUint32(at),sum:src.getUint32(at+4),start,length,offset});offset+=(length+3)&~3}
 const out=new ArrayBuffer(offset),view=new DataView(out),bytes=new Uint8Array(out);view.setUint32(0,0x774f4646);view.setUint32(4,src.getUint32(0));view.setUint32(8,offset);view.setUint16(12,count);view.setUint32(16,12+count*16+tables.reduce((n,t)=>n+((t.length+3)&~3),0));view.setUint16(20,1);
 tables.forEach((t,i)=>{const at=44+i*20;view.setUint32(at,t.tag);view.setUint32(at+4,t.offset);view.setUint32(at+8,t.length);view.setUint32(at+12,t.length);view.setUint32(at+16,t.sum);bytes.set(new Uint8Array(buffer,t.start,t.length),t.offset)});return out
}
export function festivalFontFile(contributions:Contribution[],library:ShapeDef[],options:{fontName?:string;proportional?:boolean;format?:'otf'|'woff'}={}){
 const font=buildFestivalFont(contributions,library,options),buffer=font.toArrayBuffer(),format=options.format??'otf',name=(options.fontName||'beckmans-together').replace(/[^A-Za-z0-9_-]/g,'-');return {blob:new Blob([format==='woff'?toWoff(buffer):buffer],{type:`font/${format}`}),filename:`${name}.${format}`}
}
export async function exportFestivalFont(contributions:Contribution[],library:ShapeDef[],options:{fontName?:string;proportional?:boolean;format?:'otf'|'woff'}={}){
 const file=festivalFontFile(contributions,library,options);downloadBlob(file.blob,file.filename)
}
