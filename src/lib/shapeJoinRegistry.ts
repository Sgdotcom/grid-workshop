import type { PresetShapeId } from './types'
import type { JoinMethod } from './joinExperiments'

export const SHAPE_JOIN_STORAGE_KEY = 'gridz-shape-join-methods-v2'
export const JOIN_ENGINE_STORAGE_KEY = 'gridz-active-join-engine-mode'
/** Presets that never grow a Softness melt neck (overlap still boolean-unions). */
export const MELT_OFF_STORAGE_KEY = 'gridz-melt-off-presets-v1'

/**
 * Join engine modes:
 * - 'main': The new default! Uses the per-shape optimal methods with circle/ring metaballs locked.
 * - 'fork-weld': The previous pure welding version (Method B across all silhouettes).
 * - 'fork-current': The legacy workshop behavior (Method A).
 */
export type JoinEngineMode = 'main' | 'fork-weld' | 'fork-current'

/** Circle and Ring are locked to metaball welding per project specification. */
export function isShapeLockedMetaball(shapeId: string): boolean {
  return (
    shapeId === 'circle' ||
    shapeId === 'ring' ||
    shapeId === 'preset-circle' ||
    shapeId === 'preset-ring'
  )
}

/**
 * Main Engine default join method mapping per preset shape (based on user's validated preferences).
 * Circle and ring are locked to metaball.
 */
export const DEFAULT_SHAPE_METHODS: Record<PresetShapeId, JoinMethod> = {
  circle: 'metaball',
  ring: 'metaball',
  square: 'weld',
  rect: 'weld',
  capsule: 'weld',
  capsuleV: 'weld',
  octagon: 'metaball',
  diamond: 'metaball',
  triangle: 'current',
  hexagon: 'metaball',
  pentagon: 'metaball',
  star5: 'weld',
  star4: 'current',
  cross: 'weld',
  x: 'weld',
  chevron: 'weld',
  arc: 'weld',
  wedge: 'weld',
  notch: 'weld',
}

/**
 * Direction-specific overrides for the Main Engine.
 */
export const DEFAULT_DIRECTION_OVERRIDES: Partial<Record<PresetShapeId, Partial<Record<string, JoinMethod>>>> = {
  square: {
    horizontal: 'weld',
    vertical: 'weld',
    'diagonal-right': 'weld',
    'diagonal-left': 'weld',
    elbow: 'weld',
    block: 'current',
  },
  diamond: {
    'diagonal-right': 'weld',
    'diagonal-left': 'weld',
  },
  star4: {
    elbow: 'metaball',
    block: 'sdf',
  },
  pentagon: {
    'diagonal-right': 'metaball',
    'diagonal-left': 'metaball',
    elbow: 'metaball',
    block: 'offset',
  },
}

export interface ShapePreference {
  shapeId: PresetShapeId
  defaultMethod: JoinMethod
  directionOverrides?: Partial<Record<string, JoinMethod>>
}

export type ShapePreferencesMap = Partial<Record<PresetShapeId, ShapePreference>>

/** Load preferences from localStorage safely */
export function loadShapePreferences(): ShapePreferencesMap {
  if (typeof window === 'undefined' || !window.localStorage) return {}
  try {
    const raw = window.localStorage.getItem(SHAPE_JOIN_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as ShapePreferencesMap
  } catch {
    return {}
  }
}

/** Save preferences to localStorage safely */
export function saveShapePreferences(prefs: ShapePreferencesMap): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(SHAPE_JOIN_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Active Join Engine Mode:
 * Defaults to 'main'. The previous pure weld version is accessible as 'fork-weld'.
 */
export function getJoinEngineMode(): JoinEngineMode {
  if (typeof window === 'undefined' || !window.localStorage) return 'main'
  try {
    const mode = window.localStorage.getItem(JOIN_ENGINE_STORAGE_KEY)
    if (mode === 'fork-weld' || mode === 'fork-current' || mode === 'main') {
      return mode
    }
    return 'main'
  } catch {
    return 'main'
  }
}

export function setJoinEngineMode(mode: JoinEngineMode): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(JOIN_ENGINE_STORAGE_KEY, mode)
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Get active method for a given shape (and optional direction).
 * Circle and Ring are guaranteed to return 'metaball'.
 */
export function getActiveJoinMethod(shapeId: PresetShapeId, direction?: string): JoinMethod {
  if (isShapeLockedMetaball(shapeId)) {
    return 'metaball'
  }
  const prefs = loadShapePreferences()
  const pref = prefs[shapeId]
  if (pref) {
    if (direction && pref.directionOverrides?.[direction]) {
      return pref.directionOverrides[direction]!
    }
    if (pref.defaultMethod) {
      return pref.defaultMethod
    }
  }
  if (direction && DEFAULT_DIRECTION_OVERRIDES[shapeId]?.[direction]) {
    return DEFAULT_DIRECTION_OVERRIDES[shapeId]![direction]!
  }
  return DEFAULT_SHAPE_METHODS[shapeId] ?? 'current'
}

/**
 * Assign a primary method to a shape across all directions.
 * Ignored for locked metaball shapes.
 */
export function setShapePrimaryMethod(shapeId: PresetShapeId, method: JoinMethod): void {
  if (isShapeLockedMetaball(shapeId)) return
  const prefs = loadShapePreferences()
  prefs[shapeId] = {
    shapeId,
    defaultMethod: method,
    directionOverrides: {},
  }
  saveShapePreferences(prefs)
}

/**
 * Override a single direction for a shape.
 */
export function setShapeDirectionMethod(shapeId: PresetShapeId, direction: string, method: JoinMethod): void {
  if (isShapeLockedMetaball(shapeId)) return
  const prefs = loadShapePreferences()
  const current = prefs[shapeId] ?? {
    shapeId,
    defaultMethod: DEFAULT_SHAPE_METHODS[shapeId] ?? 'current',
    directionOverrides: {},
  }
  current.directionOverrides = {
    ...current.directionOverrides,
    [direction]: method,
  }
  prefs[shapeId] = current
  saveShapePreferences(prefs)
}

/**
 * Mixed-pair join method: lab picks, or `none` = no melt neck
 * (touching/overlapping stamps still boolean-union; Softness does not grow a weld).
 */
export type MixedPairMethod = JoinMethod | 'none'

/**
 * Mixed-preset weld picks from the preview lab (17/18).
 * Keys are sorted `presetA|presetB`. Unlisted mixed pairs keep the legacy blend.
 * Set a pair to `'none'` to disable welding entirely for that combination.
 */
export const MIXED_PAIR_METHODS: Readonly<Record<string, MixedPairMethod>> = {
  'square|triangle': 'weld',
  'diamond|square': 'weld',
  'circle|triangle': 'weld',
  'circle|diamond': 'weld',
  'square|wedge': 'offset',
  'square|star5': 'offset',
  'circle|cross': 'sdf',
  'square|x': 'sdf',
  'chevron|square': 'offset',
  'capsule|square': 'weld',
  'rect|triangle': 'weld',
  'diamond|hexagon': 'weld',
  'circle|pentagon': 'weld',
  'arc|triangle': 'current',
  'ring|square': 'weld',
  'capsule|star4': 'offset',
  'notch|wedge': 'current',
}

export function mixedPairKey(a: PresetShapeId, b: PresetShapeId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** Approved method for this mixed pair, or null to keep legacy mixed blend. */
export function getMixedPairJoinMethod(
  a: PresetShapeId | undefined,
  b: PresetShapeId | undefined,
): MixedPairMethod | null {
  if (!a || !b || a === b) return null
  return MIXED_PAIR_METHODS[mixedPairKey(a, b)] ?? null
}

export function loadMeltOffPresets(): Set<PresetShapeId> {
  if (typeof window === 'undefined' || !window.localStorage) return new Set()
  try {
    const raw = window.localStorage.getItem(MELT_OFF_STORAGE_KEY)
    if (!raw) return new Set()
    const list = JSON.parse(raw) as unknown
    if (!Array.isArray(list)) return new Set()
    return new Set(list.filter((id): id is PresetShapeId => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

export function saveMeltOffPresets(presets: Iterable<PresetShapeId>): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(MELT_OFF_STORAGE_KEY, JSON.stringify([...presets].sort()))
  } catch {
    /* ignore */
  }
}

export function isPresetMeltOff(preset: PresetShapeId | undefined | null): boolean {
  if (!preset) return false
  return loadMeltOffPresets().has(preset)
}

/** Toggle melt for one preset; returns the updated set. */
export function togglePresetMeltOff(preset: PresetShapeId): Set<PresetShapeId> {
  const next = loadMeltOffPresets()
  if (next.has(preset)) next.delete(preset)
  else next.add(preset)
  saveMeltOffPresets(next)
  return next
}
