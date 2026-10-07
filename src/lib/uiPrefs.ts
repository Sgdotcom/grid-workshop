/**
 * Tool settings that should survive a reload but are not part of the typeface:
 * brush, guides, preview toggles. Stored apart from the festival session so a
 * restored backup never changes how the editor is set up.
 */
export const UI_PREFS_KEY = 'grid-workshop-ui-v1'

export interface UiPrefs {
  shapeId: string
  brushSize: number
  brushRotation: number
  showLetterGuide: boolean
  guideOpacity: number
  letterScale: number
  showGridGuide: boolean
  gridGuideOpacity: number
  invertPreview: boolean
  wordTesterOpen: boolean
  testString: string
}

export function readUiPrefs(): Partial<UiPrefs> {
  try {
    const raw = window.localStorage.getItem(UI_PREFS_KEY)
    if (!raw) return {}
    const value: unknown = JSON.parse(raw)
    return value && typeof value === 'object' ? (value as Partial<UiPrefs>) : {}
  } catch {
    return {}
  }
}

export function writeUiPrefs(prefs: UiPrefs) {
  try {
    window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Preferences are a convenience; a full or blocked store must not break painting.
  }
}

export function prefNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback
}

export function prefBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}
