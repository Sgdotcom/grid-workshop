import { SHAPE_JOIN_STORAGE_KEY, JOIN_ENGINE_STORAGE_KEY, MELT_OFF_STORAGE_KEY } from './shapeJoinRegistry'
import { DEFAULT_FONT_DESIGN, type FontDesign } from './fontDesign'
import { weightContours } from './outlineWeight'
import { canvasPixelSize, cellCenter, cellOrigin, stepSize } from '@/lib/gridGeometry'
import {
  makeSoftStamp,
  softEdgeKey,
  softnessFinishPolygons,
  type BrokenJoins,
  type SoftStamp,
} from '@/lib/softness'
import { moduleShapeFillRule, moduleShapePath, shapeOutlineRings } from '@/lib/shapes'
import {
  differencePolygons,
  filterPolygonHolesPreserving,
  intentionalHoleCutters,
  multiPolygonToPathList,
  toPolygon,
  unionPolygons,
} from '@/lib/polyBool'
import type { MultiPolygon, Polygon } from 'polygon-clipping'
import type { FilledRegion, GridConfig, HoleMode, ShapeDef } from '@/lib/types'
import { downloadBlob } from '@/lib/utils'

export interface ExportPayload {
  fontDesign?: FontDesign
  grid: GridConfig
  library: ShapeDef[]
  filledRegions: FilledRegion[]
  glyphChar: string
  /** Paint Softness — fused outline baked into the finished glyph. */
  softness: number
  cornerRadius?: number
  /** Disabled Softness joins. */
  brokenJoins?: BrokenJoins
  holeMode?: HoleMode
}

// Finished polygons are immutable shared results, including offsets and cutouts.
const glyphCache = new Map<string, MultiPolygon>()
const GLYPH_CACHE_LIMIT = 256
export function geometryPreferences(): Record<string, string | null> {
  return Object.fromEntries([SHAPE_JOIN_STORAGE_KEY, JOIN_ENGINE_STORAGE_KEY, MELT_OFF_STORAGE_KEY].map(key => {
    try { return [key, typeof window === 'undefined' ? null : window.localStorage.getItem(key)] }
    catch { return [key, null] }
  }))
}
export function glyphGeometryKey(payload: ExportPayload, storage = geometryPreferences()): string {
  return JSON.stringify(['finished-glyph-v1', payload.grid, payload.library, payload.filledRegions,
    payload.softness, payload.cornerRadius ?? 0, payload.holeMode ?? 'open',
    [...payload.brokenJoins ?? []].sort(), payload.fontDesign ?? DEFAULT_FONT_DESIGN,
    [SHAPE_JOIN_STORAGE_KEY, JOIN_ENGINE_STORAGE_KEY, MELT_OFF_STORAGE_KEY].map(key => storage[key] ?? null)])
}
export function rememberGlyphGeometry(key: string, polygons: MultiPolygon): void {
  if (!glyphCache.has(key) && glyphCache.size >= GLYPH_CACHE_LIMIT) glyphCache.delete(glyphCache.keys().next().value!)
  glyphCache.set(key, polygons)
}

const PAPER = '#ffffff'
const INK = '#000000'

function resolveShape(library: ShapeDef[], id: string): ShapeDef {
  return library.find((s) => s.id === id) ?? library[0]
}

function stampOrigin(fr: FilledRegion, grid: GridConfig) {
  const { x, y } = cellOrigin(fr.col, fr.row, grid)
  return { ox: x + (grid.cellSize - fr.size) / 2, oy: y + (grid.cellSize - fr.size) / 2 }
}

export function stampsFromFills(
  filledRegions: FilledRegion[],
  grid: GridConfig,
  library: ShapeDef[],
  cornerRadius = 0,
): SoftStamp[] {
  return filledRegions.map((fr) => {
    const { cx, cy } = cellCenter(fr.col, fr.row, grid)
    const { ox, oy } = stampOrigin(fr, grid)
    const def = resolveShape(library, fr.shapeId)
    return makeSoftStamp(fr.key, fr.col, fr.row, cx, cy, fr.size, def, ox, oy, cornerRadius, fr.rotation ?? 0)
  })
}

function outlinePolygons(
  regions: FilledRegion[],
  grid: GridConfig,
  library: ShapeDef[],
  cornerRadius: number,
): Polygon[] {
  return regions
    .map((fr) => {
      const { ox, oy } = stampOrigin(fr, grid)
      const def = resolveShape(library, fr.shapeId)
      return toPolygon(shapeOutlineRings(def, ox, oy, fr.size, cornerRadius, fr.rotation ?? 0))
    })
    .filter((p): p is Polygon => p !== null)
}

function ringHoleCutters(
  regions: FilledRegion[],
  grid: GridConfig,
  library: ShapeDef[],
  cornerRadius: number,
) {
  return intentionalHoleCutters(
    regions.map((fr) => {
      const { ox, oy } = stampOrigin(fr, grid)
      const def = resolveShape(library, fr.shapeId)
      return shapeOutlineRings(def, ox, oy, fr.size, cornerRadius, fr.rotation ?? 0)
    }),
  )
}

/**
 * The finished glyph as non-overlapping polygons (outer ring first, then holes).
 * One source for the fused SVG paths and for the OTF outlines.
 */
function baseGlyphPolygons(payload: ExportPayload): MultiPolygon {
  const { grid, library, filledRegions, softness, cornerRadius = 0, brokenJoins, holeMode = 'open' } = payload
  const inkRegions = filledRegions.filter((fr) => fr.mode !== 'cutout')
  const cutoutRegions = filledRegions.filter((fr) => fr.mode === 'cutout')
  const step = stepSize(grid)
  const maxGapArea = step * step * 0.6
  const ringHoles = ringHoleCutters(inkRegions, grid, library, cornerRadius)

  const subject: Polygon[] =
    softness > 0.02
      ? softnessFinishPolygons(stampsFromFills(inkRegions, grid, library, cornerRadius), {
          softness,
          brokenJoins,
          holeMode,
          maxGapArea,
        })
      : filterPolygonHolesPreserving(
          unionPolygons(outlinePolygons(inkRegions, grid, library, cornerRadius)),
          holeMode,
          maxGapArea,
          ringHoles,
        )
  if (!cutoutRegions.length || !subject.length) return subject

  const punched = differencePolygons(subject, outlinePolygons(cutoutRegions, grid, library, cornerRadius))
  return holeMode !== 'open'
    ? filterPolygonHolesPreserving(punched, holeMode, maxGapArea, ringHoles)
    : punched
}

export function glyphPolygons(payload: ExportPayload): MultiPolygon {
 const key=glyphGeometryKey(payload), cached=glyphCache.get(key)
 if(cached)return cached
 const design=payload.fontDesign ?? DEFAULT_FONT_DESIGN
 const visible=payload.filledRegions.filter(r=>r.col<payload.grid.cols && r.row<payload.grid.rows)
 const broken=new Set(payload.brokenJoins)
 for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){
  const a=visible[i],b=visible[j],dx=Math.abs(a.col-b.col),dy=Math.abs(a.row-b.row)
  if(dx>1||dy>1)continue
  if((dx&&dy&&!design.mergeDiagonal)||(dx&&!dy&&!design.mergeHorizontal)||(dy&&!dx&&!design.mergeVertical))broken.add(softEdgeKey(a.col,a.row,b.col,b.row))
 }
 const base=baseGlyphPolygons({...payload,filledRegions:visible,brokenJoins:broken})
 const weighted=weightContours(base,design.thickness,design.outlineOnly)
 const holes=ringHoleCutters(visible.filter(r=>r.mode!=='cutout'),payload.grid,payload.library,payload.cornerRadius??0)
 const result=design.thickness&&holes.length?differencePolygons(weighted,holes):weighted
 rememberGlyphGeometry(key,result)
 return result
}

/** Softness fuse (one outline) or crisp module stamps. */
export function buildGlyphBodyMarkup(payload: ExportPayload, fill: string): string[] {
  const { grid, library, filledRegions, softness, cornerRadius = 0, holeMode = 'open' } = payload
  const inkRegions = filledRegions.filter((fr) => fr.mode !== 'cutout')

  if (payload.fontDesign || inkRegions.length !== filledRegions.length || softness > 0.02 || holeMode !== 'open') {
    try {
      return multiPolygonToPathList(glyphPolygons(payload)).map(
        (d) => `<path d="${d}" fill="${fill}" fill-rule="evenodd"/>`,
      )
    } catch (error) {
      if(payload.fontDesign)throw error
      // Never lose a legacy letter to a geometry edge case: fall back to crisp stamps.
      console.error('Glyph fuse failed; using crisp stamps instead.', error)
    }
  }

  return inkRegions.map((fr) => {
    const def = resolveShape(library, fr.shapeId)
    const { ox, oy } = stampOrigin(fr, grid)
    const rule = moduleShapeFillRule(def)
    const ruleAttr = rule ? ` fill-rule="${rule}"` : ''
    return `<path d="${moduleShapePath(def, ox, oy, fr.size, cornerRadius, fr.rotation ?? 0)}" fill="${fill}"${ruleAttr}/>`
  })
}

/** Conservative stage bounds; never computes finished geometry during dragging. */
export function glyphContentBounds(payload: ExportPayload, pad = 16): {x:number;y:number;width:number;height:number} {
  const {grid}=payload, full=canvasPixelSize(grid)
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
  for(const r of payload.filledRegions.filter(r=>r.col<grid.cols&&r.row<grid.rows)) {
    const {cx:x,cy:y}=cellCenter(r.col,r.row,grid)
    const angle=(r.rotation??0)*Math.PI/180
    const half=r.size/2*(Math.abs(Math.cos(angle))+Math.abs(Math.sin(angle)))
    const reach=half+r.size*.18+(payload.fontDesign?.thickness??0)/2
    minX=Math.min(minX,x-reach);minY=Math.min(minY,y-reach)
    maxX=Math.max(maxX,x+reach);maxY=Math.max(maxY,y+reach)
  }
  return Number.isFinite(minX)?{x:minX-pad,y:minY-pad,width:maxX-minX+pad*2,height:maxY-minY+pad*2}:{x:0,y:0,width:full.width,height:full.height}
}

export function exactGlyphContentBounds(
  payload: ExportPayload,
  pad = 16,
): { x: number; y: number; width: number; height: number } {
  const { width: fullW, height: fullH } = canvasPixelSize(payload.grid)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  // Bounds come from the same finished contours as preview and font export.
  // Stamp-size estimates miss rotated corners and contour offsets.
  for (const polygon of glyphPolygons(payload)) for (const ring of polygon) for (const [x, y] of ring) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  if(!Number.isFinite(minX)) return {x:0,y:0,width:fullW,height:fullH}
  const x = minX - pad
  const y = minY - pad
  const width = maxX + pad - x
  const height = maxY + pad - y
  return { x, y, width: Math.max(1, width), height: Math.max(1, height) }
}

export function buildSvgMarkup(payload: ExportPayload, opts?: { fitContent?: boolean }): string {
  const { grid } = payload
  const { width: fullW, height: fullH } = canvasPixelSize(grid)
  const parts = buildGlyphBodyMarkup(payload, INK)
  const fit = opts?.fitContent !== false
  const content = exactGlyphContentBounds(payload, fit ? 16 : 0)
  const left = Math.min(0, content.x), top = Math.min(0, content.y)
  const box = fit ? content : {x:left,y:top,width:Math.max(fullW,content.x+content.width)-left,height:Math.max(fullH,content.y+content.height)-top}

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(box.width)}" height="${Math.round(box.height)}" viewBox="${box.x} ${box.y} ${box.width} ${box.height}" fill="none">`,
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="${PAPER}"/>`,
    ...parts,
    `</svg>`,
  ].join('\n')
}

/**
 * Rounds coordinates to 0.01px. For previews kept in browser storage (wall,
 * backups): about half the size, so twice as many contributions fit in the
 * storage quota. Downloads keep full precision.
 */
export function compactSvgMarkup(svg: string): string {
  return svg.replace(/-?\d+\.\d{3,}(?:e-?\d+)?/g, (value) => String(Math.round(Number(value) * 100) / 100))
}

export function glyphFileSlug(ch: string) {
  const upper = ch.length === 1 && ch !== ch.toLowerCase()
  return upper ? `upper-${ch}` : `lower-${ch.toLowerCase()}`
}

export function exportSvg(payload: ExportPayload, filename?: string) {
  if (!payload.filledRegions.length) {
    throw new Error('Nothing to export yet — paint a glyph first.')
  }
  const name = filename ?? `grid-workshop-${glyphFileSlug(payload.glyphChar)}.svg`
  downloadBlob(
    new Blob([buildSvgMarkup(payload)], { type: 'image/svg+xml;charset=utf-8' }),
    name,
  )
}

/** One sheet: every painted letter in the session, labeled. */
export function buildSetSvgMarkup(payloads: ExportPayload[]): string {
  if (!payloads.length) {
    throw new Error('Nothing to export yet — paint a glyph first.')
  }
  const cols = Math.min(6, payloads.length)
  const rows = Math.ceil(payloads.length / cols)
  const boxes = payloads.map((p) => glyphContentBounds(p, 10))
  const innerW = Math.max(80, ...boxes.map((b) => b.width))
  const innerH = Math.max(80, ...boxes.map((b) => b.height))
  const labelH = 28
  const cellW = innerW + 24
  const cellH = innerH + 16 + labelH
  const pad = 28
  const width = pad * 2 + cols * cellW
  const height = pad * 2 + 36 + rows * cellH

  const cells: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${width} ${height}" fill="none">`,
    `<rect width="${width}" height="${height}" fill="${PAPER}"/>`,
    `<text x="${pad}" y="${pad + 8}" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="${INK}">grid workshop</text>`,
  ]

  payloads.forEach((payload, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = pad + col * cellW
    const y = pad + 28 + row * cellH
    const box = boxes[i]
    const dx = x + (cellW - box.width) / 2 - box.x
    const dy = y - box.y
    const body = buildGlyphBodyMarkup(payload, INK).join('')
    cells.push(`<g transform="translate(${dx} ${dy})">${body}</g>`)
    cells.push(
      `<text x="${x + cellW / 2}" y="${y + innerH + 22}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="${INK}">${escapeXml(payload.glyphChar)}</text>`,
    )
  })

  cells.push(`</svg>`)
  return cells.join('\n')
}

export function exportGlyphSet(payloads: ExportPayload[]) {
  const painted = payloads.filter((p) => p.filledRegions.length)
  if (!painted.length) {
    throw new Error('Nothing to export yet — paint a glyph first.')
  }
  const encoder = new TextEncoder()
  const files = painted.map((p) => ({
    name: `${glyphFileSlug(p.glyphChar)}.svg`,
    data: encoder.encode(buildSvgMarkup(p)),
  }))
  files.push({
    name: 'specimen.svg',
    data: encoder.encode(buildSetSvgMarkup(painted)),
  })
  downloadBlob(zipStore(files), 'grid-workshop-glyphs.zip')
}

function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

function u16(n: number) {
  return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff)
}

function u32(n: number) {
  return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff)
}

function crc32(buf: Uint8Array) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let b = 0; b < 8; b++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Uncompressed ZIP (no extra dependency). Names are flagged UTF-8 so å, ä and ö survive. */
function zipStore(files: { name: string; data: Uint8Array }[]): Blob {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const dosDate = (Math.max(0, now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const UTF8_NAMES = 0x0800
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const crc = crc32(file.data)
    const local = concatBytes(
      u32(0x04034b50),
      u16(20),
      u16(UTF8_NAMES),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      file.data,
    )
    locals.push(local)
    centrals.push(
      concatBytes(
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(UTF8_NAMES),
        u16(0),
        u16(dosTime),
        u16(dosDate),
        u32(crc),
        u32(file.data.length),
        u32(file.data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ),
    )
    offset += local.length
  }
  const central = concatBytes(...centrals)
  const eocd = concatBytes(
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  )
  const packed = concatBytes(...locals, central, eocd)
  const copy = new ArrayBuffer(packed.byteLength)
  new Uint8Array(copy).set(packed)
  return new Blob([copy], { type: 'application/zip' })
}
