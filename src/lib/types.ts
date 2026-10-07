export type OverlapLayer = 'a'

export type PresetShapeId =
  | 'square'
  | 'circle'
  | 'octagon'
  | 'diamond'
  | 'triangle'
  | 'hexagon'
  | 'pentagon'
  | 'star5'
  | 'star4'
  | 'cross'
  | 'x'
  | 'rect'
  | 'capsule'
  | 'capsuleV'
  | 'ring'
  | 'chevron'
  | 'arc'
  | 'wedge'
  | 'notch'

export type ShapeDef =
  | { id: string; kind: 'preset'; preset: PresetShapeId; label: string }
  | {
      id: string
      kind: 'polygon'
      sides: number
      cornerRadius: number
      label: string
    }
  | {
      id: string
      kind: 'star'
      points: number
      innerRatio: number
      cornerRadius: number
      label: string
    }

export interface GridConfig {
  cols: number
  rows: number
  cellSize: number
  gap: number
}

/** One filled cell on the shape grid. */
export interface FilledRegion {
  key: string
  layer: OverlapLayer
  col: number
  row: number
  kind: 'shape'
  shapeId: string
  size: number
  rotation?: number
  mode?: 'ink' | 'cutout'
}

export type HoleMode = 'open' | 'no-gaps' | 'solid'

/** One letter in a multi-glyph workshop session. */
export interface GlyphDraft {
  char: string
  filled: FilledRegion[]
  brokenJoins: string[]
  grid?: GridConfig
  softness?: number
  cornerRadius?: number
  holeMode?: HoleMode
}

export const PRESET_SHAPES: ShapeDef[] = [
  { id: 'preset-circle', kind: 'preset', preset: 'circle', label: 'Circle' },
  { id: 'preset-square', kind: 'preset', preset: 'square', label: 'Square' },
  { id: 'preset-rect', kind: 'preset', preset: 'rect', label: 'Rectangle' },
  { id: 'preset-arc', kind: 'preset', preset: 'arc', label: 'Arc' },
  { id: 'preset-wedge', kind: 'preset', preset: 'wedge', label: 'Wedge' },
  { id: 'preset-notch', kind: 'preset', preset: 'notch', label: 'Notch' },
  { id: 'preset-capsule', kind: 'preset', preset: 'capsule', label: 'H capsule' },
  { id: 'preset-capsule-v', kind: 'preset', preset: 'capsuleV', label: 'V capsule' },
  { id: 'preset-octagon', kind: 'preset', preset: 'octagon', label: 'Octagon' },
  { id: 'preset-diamond', kind: 'preset', preset: 'diamond', label: 'Diamond' },
  { id: 'preset-triangle', kind: 'preset', preset: 'triangle', label: 'Triangle' },
  { id: 'preset-hexagon', kind: 'preset', preset: 'hexagon', label: 'Hexagon' },
  { id: 'preset-pentagon', kind: 'preset', preset: 'pentagon', label: 'Pentagon' },
  { id: 'preset-star5', kind: 'preset', preset: 'star5', label: 'Star' },
  { id: 'preset-star4', kind: 'preset', preset: 'star4', label: '4-star' },
  { id: 'preset-cross', kind: 'preset', preset: 'cross', label: 'Cross' },
  { id: 'preset-x', kind: 'preset', preset: 'x', label: 'X' },
  { id: 'preset-chevron', kind: 'preset', preset: 'chevron', label: 'Chevron' },
  { id: 'preset-ring', kind: 'preset', preset: 'ring', label: 'Ring' },
]

export function reconcileLibrary(saved?: ShapeDef[]): ShapeDef[] {
  if (!saved || !saved.length) return [...PRESET_SHAPES]
  const savedMap = new Map(saved.map((s) => [s.id, s]))
  // Guarantee all PRESET_SHAPES are present
  const result: ShapeDef[] = PRESET_SHAPES.map((preset) => savedMap.get(preset.id) ?? preset)
  // Append any custom user-created shapes
  for (const s of saved) {
    if (!result.some((r) => r.id === s.id)) {
      result.push(s)
    }
  }
  return result
}

export function regionKey(col: number, row: number, mode: 'ink' | 'cutout' = 'ink') {
  return mode === 'cutout' ? `a:${col}:${row}:cutout` : `a:${col}:${row}:shape`
}

export function newShapeId() {
  return `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function shapeLabel(def: ShapeDef): string {
  if (def.kind === 'preset') return def.label
  if (def.kind === 'polygon') {
    return def.cornerRadius > 0
      ? `${def.sides}-gon · r${Math.round(def.cornerRadius)}`
      : `${def.sides}-gon`
  }
  return `★${def.points} · ${Math.round(def.innerRatio * 100)}%`
}
