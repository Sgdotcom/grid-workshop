import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Columns2,
  Contrast,
  Copy,
  Download,
  Eraser,
  Eye,
  EyeOff,
  LoaderCircle,
  Paintbrush,
  Redo2,
  RotateCw,
  Scissors,
  Settings2,
  Shapes,
  Share,
  Sliders,
  Trash2,
  Undo2,
  Wand2,
  X,
} from 'lucide-react'
import { ShapeGridCanvas, type PaintTool } from '@/components/Canvas'
import { ExportPreview, GlyphThumb } from '@/components/ExportPreview'
import { GridPreview } from '@/components/GridPreview'
import { WordTester } from '@/components/WordTester'
import { Button } from '@/components/ui/button'
import { applyDotDilation } from '@/lib/permutations'
import {
  buildStarterBlueprint,
  getLetterSiblings,
  nudgeFilled,
} from '@/lib/skeletons'
import { buildSvgMarkup, compactSvgMarkup, exportGlyphSet, exportSvg, type ExportPayload } from '@/lib/export'
import {
  DEFAULT_BRUSH,
  DEFAULT_GRID,
  formatPx,
  gridFromDetail,
} from '@/lib/gridGeometry'
import { moduleShapeFillRule, moduleShapePath, shapeSupportsRounding } from '@/lib/shapes'
import { softnessHint, type BrokenJoins } from '@/lib/softness'
import { loadMeltOffPresets, togglePresetMeltOff } from '@/lib/shapeJoinRegistry'
import type { FilledRegion, GlyphDraft, GridConfig, HoleMode, ShapeDef } from '@/lib/types'
import { reconcileLibrary, shapeLabel } from '@/lib/types'
import { cn } from '@/lib/utils'
import { downloadBlob } from '@/lib/utils'
import { prefBoolean, prefNumber, readUiPrefs, writeUiPrefs } from '@/lib/uiPrefs'
import { ALPHABET, FESTIVAL_KEY, latestContributions, parseSession, readSession, type Contribution, type FestivalSession } from '@/lib/festival'
import { LiveSessionJoin } from '@/components/LiveSessionJoin'
import { mergeContributions } from '@/lib/liveSession'
import { useLiveSession } from '@/lib/useLiveSession'

type Screen = 'shape' | 'paint' | 'export'
type ExportStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'success'; message: string }
  | { state: 'error'; message: string }

const LETTERS = ALPHABET
const HISTORY_MAX = 60

/** One undo step: the cells and the joins that were broken at that moment. */
interface Snapshot {
  filled: FilledRegion[]
  brokenJoins: string[]
}
const DESKTOP_MQ = '(min-width: 1024px)'

function useDesktop() {
  const [desktop, setDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ)
    const apply = () => setDesktop(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return desktop
}

const TABS: { id: Screen; label: string; icon: typeof Paintbrush }[] = [
  { id: 'shape', label: 'Shape', icon: Shapes },
  { id: 'paint', label: 'Paint', icon: Paintbrush },
  { id: 'export', label: 'Export', icon: Share },
]

function snapshotFilled(m: Map<string, FilledRegion>) {
  return [...m.values()]
}

function restoreFilled(list: FilledRegion[]) {
  return new Map(list.map((r) => [r.key, { ...r }]))
}

export default function App() {
  const [recovery] = useState(() => {
    try { return { session: readSession(), error: '' } }
    catch { return { session: null, error: 'Could not restore the saved session. Download a backup before continuing.' } }
  })
  const restored = recovery.session
  const [prefs] = useState(readUiPrefs)
  const [showIntro, setShowIntro] = useState(!restored)
  const [screen, setScreen] = useState<Screen>('paint')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [library] = useState<ShapeDef[]>(() => reconcileLibrary(restored?.library))
  const [shapeId, setShapeId] = useState(() =>
    library.some((shape) => shape.id === prefs.shapeId) ? prefs.shapeId! : 'preset-circle',
  )
  const [grid, setGrid] = useState<GridConfig>(restored?.active.grid ?? DEFAULT_GRID)
  const [gridDetail, setGridDetail] = useState(() => {
    const cell = restored?.active.grid?.cellSize ?? DEFAULT_GRID.cellSize
    return Math.min(3, Math.max(1, Math.round((DEFAULT_GRID.cellSize / cell) * 2) / 2))
  })
  const [filled, setFilled] = useState<Map<string, FilledRegion>>(() => restoreFilled(restored?.active.filled ?? []))
  const [brushSize, setBrushSize] = useState(() => {
    // A restored fine grid needs a matching brush, not the 42px default.
    const cell = restored?.active.grid?.cellSize ?? DEFAULT_GRID.cellSize
    return prefNumber(prefs.brushSize, cell * 0.4, cell * 2.2, (DEFAULT_BRUSH * cell) / DEFAULT_GRID.cellSize)
  })
  const [cornerRadius, setCornerRadius] = useState(restored?.active.cornerRadius ?? 0)
  const [guideLetter, setGuideLetter] = useState(restored?.active.char.toLowerCase() ?? 'a')
  const [guideUpper, setGuideUpper] = useState(!!restored && restored.active.char !== restored.active.char.toLowerCase())
  const [showLetterGuide, setShowLetterGuide] = useState(() => prefBoolean(prefs.showLetterGuide, true))
  const [guideOpacity, setGuideOpacity] = useState(() => prefNumber(prefs.guideOpacity, 0.25, 1, 0.85))
  const [letterScale, setLetterScale] = useState(() => prefNumber(prefs.letterScale, 0.45, 1.35, 1))
  const [showGridGuide, setShowGridGuide] = useState(() => prefBoolean(prefs.showGridGuide, true))
  const [gridGuideOpacity, setGridGuideOpacity] = useState(() => prefNumber(prefs.gridGuideOpacity, 0.25, 1, 0.7))
  const [softness, setSoftness] = useState(restored?.active.softness ?? 0.55)
  const [brokenJoins, setBrokenJoins] = useState<BrokenJoins>(() => new Set(restored?.active.brokenJoins ?? []))
  const [holeMode, setHoleMode] = useState<HoleMode>(restored?.active.holeMode ?? 'open')
  const [meltOff, setMeltOff] = useState(() => loadMeltOffPresets())
  const [meltOffRevision, setMeltOffRevision] = useState(0)
  const [paintTool, setPaintTool] = useState<PaintTool>('stamp')
  const [paintAdjustOpen, setPaintAdjustOpen] = useState(false)
  const desktop = useDesktop()
  const [showJoinDots, setShowJoinDots] = useState(false)
  const [invertPreview, setInvertPreview] = useState(() => prefBoolean(prefs.invertPreview, false))
  const [brushRotation, setBrushRotation] = useState<number>(() => {
    const saved = prefNumber(prefs.brushRotation, 0, 359, 0)
    return saved % 90 === 0 ? saved : 0
  })
  const [wordTesterOpen, setWordTesterOpen] = useState(() => prefBoolean(prefs.wordTesterOpen, window.innerHeight >= 860))
  const [testString, setTestString] = useState(() => (typeof prefs.testString === 'string' ? prefs.testString.slice(0, 40) : 'HOH'))
  const [stampMode, setStampMode] = useState<'ink' | 'cutout'>('ink')
  const [symmetryMode, setSymmetryMode] = useState<'none' | 'horizontal' | 'vertical'>('none')
  const [glyphs, setGlyphs] = useState<Map<string, GlyphDraft>>(() => new Map(restored?.drafts.filter(draft => draft.filled.length).map(draft => [draft.char, draft]) ?? []))
  const [contributions, setContributions] = useState<Contribution[]>(restored?.contributions ?? [])
  const [saveStatus, setSaveStatus] = useState(recovery.error || 'Ready')
  const [notice, setNotice] = useState('Choose a letter, draw, then add it to the typeface.')
  const settingsRef = useRef({ grid, softness, cornerRadius, holeMode })
  settingsRef.current = { grid, softness, cornerRadius, holeMode }
  const sessionRef = useRef<FestivalSession | null>(restored)
  const importRef = useRef<HTMLInputElement>(null)
  const [exportStatus, setExportStatus] = useState<ExportStatus>({ state: 'idle' })
  const nudgeRef = useRef<(dx: number, dy: number) => void>(() => {})

  const keyState = useRef({ screen, showIntro, optionsOpen })
  keyState.current = { screen, showIntro, optionsOpen }
  const undoRef = useRef<() => void>(() => {})
  const redoRef = useRef<() => void>(() => {})

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const state = keyState.current
      if (e.key === 'Escape' && state.optionsOpen) {
        setOptionsOpen(false)
        return
      }
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }
      // Shortcuts belong to the canvas: never repaint a letter from another screen.
      if (state.showIntro || state.optionsOpen || state.screen !== 'paint') return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (mod && !e.altKey && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redoRef.current()
        else undoRef.current()
        return
      }
      if (mod && !e.altKey && key === 'y') {
        e.preventDefault()
        redoRef.current()
        return
      }
      // Leave browser shortcuts (copy, reload, …) alone.
      if (mod || e.altKey) return
      if (key === 'r') {
        setBrushRotation((prev) => (prev + (e.shiftKey ? 270 : 90)) % 360)
      } else if (key === 'c') {
        setStampMode((prev) => (prev === 'ink' ? 'cutout' : 'ink'))
      } else if (key === 'g') {
        setShowLetterGuide((prev) => !prev)
      } else if (key === 'e') {
        setPaintTool((prev) => (prev === 'erase' ? 'stamp' : 'erase'))
      } else if (key === 'b') {
        setPaintTool('stamp')
      } else if (key === 'm') {
        setSymmetryMode((m) => (m === 'none' ? 'horizontal' : m === 'horizontal' ? 'vertical' : 'none'))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        nudgeRef.current(-1, 0)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        nudgeRef.current(1, 0)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        nudgeRef.current(0, -1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        nudgeRef.current(0, 1)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const past = useRef<Snapshot[]>([])
  const future = useRef<Snapshot[]>([])
  const strokeStarted = useRef(false)
  const filledRef = useRef(filled)
  const brokenRef = useRef(brokenJoins)
  const glyphsRef = useRef(glyphs)
  const contributionsRef = useRef(contributions)
  contributionsRef.current = contributions
  const letterRef = useRef('a')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const displayGuideLetter = guideUpper ? guideLetter.toUpperCase() : guideLetter
  filledRef.current = filled
  brokenRef.current = brokenJoins
  glyphsRef.current = glyphs
  letterRef.current = displayGuideLetter
  const activeShape = library.find((s) => s.id === shapeId) ?? library[0]
  const activePreset = activeShape.kind === 'preset' ? activeShape.preset : null
  const activeMeltOff = activePreset ? meltOff.has(activePreset) : false
  const canRound = shapeSupportsRounding(activeShape)
  const fillMin = Math.max(4, Math.round(grid.cellSize * 0.4))
  const fillMax = Math.max(
    Math.round(grid.cellSize * 1.6),
    Math.round(grid.cellSize + grid.gap + (16 * grid.cellSize) / DEFAULT_GRID.cellSize),
  )
  const cornerMax = Math.max(4, Math.round(grid.cellSize * 0.45))

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(past.current.length > 0)
    setCanRedo(future.current.length > 0)
  }, [])

  const persistCurrent = useCallback(() => {
    const ch = letterRef.current
    const store = new Map(glyphsRef.current)
    if (filledRef.current.size) {
      store.set(ch, {
        char: ch,
        filled: snapshotFilled(filledRef.current),
        brokenJoins: [...brokenRef.current],
        ...settingsRef.current,
      })
    } else {
      store.delete(ch)
    }
    glyphsRef.current = store
    setGlyphs(store)
    return store
  }, [])

  const resetUndo = useCallback(() => {
    past.current = []
    future.current = []
    strokeStarted.current = false
    syncHistoryFlags()
  }, [syncHistoryFlags])

  const loadDraft = useCallback(
    (store: Map<string, GlyphDraft>, ch: string) => {
      const slot = store.get(ch)
      setFilled(slot ? restoreFilled(slot.filled) : new Map())
      setBrokenJoins(new Set(slot?.brokenJoins ?? []))
      if (slot?.grid) setGrid(slot.grid)
      setSoftness(slot?.softness ?? 0.55)
      setCornerRadius(slot?.cornerRadius ?? 0)
      setHoleMode(slot?.holeMode ?? 'open')
      resetUndo()
      setExportStatus({ state: 'idle' })
    },
    [resetUndo],
  )

  const switchToLetter = useCallback(
    (base: string, asUpper: boolean) => {
      const nextChar = asUpper ? base.toUpperCase() : base.toLowerCase()
      if (nextChar === letterRef.current) return
      persistCurrent()
      setGuideLetter(base.toLowerCase())
      setGuideUpper(asUpper)
      loadDraft(glyphsRef.current, nextChar)
    },
    [persistCurrent, loadDraft],
  )

  const makePayload = useCallback(
    (char: string, regions: FilledRegion[], joins: Iterable<string>): ExportPayload => ({
      grid: char === displayGuideLetter ? grid : glyphs.get(char)?.grid ?? grid,
      library,
      filledRegions: regions,
      glyphChar: char,
      softness: char === displayGuideLetter ? softness : glyphs.get(char)?.softness ?? softness,
      cornerRadius: char === displayGuideLetter ? cornerRadius : glyphs.get(char)?.cornerRadius ?? cornerRadius,
      brokenJoins: new Set(joins),
      holeMode: char === displayGuideLetter ? holeMode : glyphs.get(char)?.holeMode ?? holeMode,
    }),
    [grid, library, softness, cornerRadius, holeMode, displayGuideLetter, glyphs],
  )

  const sessionDrafts = (() => {
    const store = new Map(glyphs)
    if (filled.size) {
      store.set(displayGuideLetter, {
        char: displayGuideLetter,
        filled: snapshotFilled(filled),
        brokenJoins: [...brokenJoins],
        grid, softness, cornerRadius, holeMode,
      })
    } else {
      store.delete(displayGuideLetter)
    }
    return [...store.values()]
      .filter((g) => g.filled.length)
      .sort((a, b) => a.char.localeCompare(b.char, 'en'))
  })()

  const activeDraft: GlyphDraft = {
    char: displayGuideLetter, filled: snapshotFilled(filled), brokenJoins: [...brokenJoins],
    grid, softness, cornerRadius, holeMode,
  }
  const activeRef = useRef(activeDraft)
  activeRef.current = activeDraft
  const writeSession = useCallback(() => {
    const active = activeRef.current
    const drafts = new Map(glyphsRef.current)
    drafts.set(active.char, active)
    const session: FestivalSession = {
      version: 1, updatedAt: new Date().toISOString(), active,
      // Letters that were only visited are not work: they must not come back as painted.
      drafts: [...drafts.values()].filter((draft) => draft.filled.length),
      contributions: contributionsRef.current, library,
      liveSvg: compactSvgMarkup(buildSvgMarkup({ ...active, grid: active.grid!, softness: active.softness!,
        library, filledRegions: active.filled, glyphChar: active.char,
        brokenJoins: new Set(active.brokenJoins) }, { fitContent: false })),
    }
    sessionRef.current = session
    try {
      localStorage.setItem(FESTIVAL_KEY, JSON.stringify(session))
      setSaveStatus('Saved on this computer')
    } catch {
      setSaveStatus('Saving failed — download an editable backup now.')
    }
    return session
  }, [library])

  const live = useLiveSession({
    getSession: () => sessionRef.current,
    painting: () => strokeStarted.current,
    onRemoteSession: (session, liveRoom) => {
      const merged = mergeContributions(contributionsRef.current, session.contributions)
      setContributions(merged)
      contributionsRef.current = merged
      const activeChar = letterRef.current
      const nextGlyphs = new Map(glyphsRef.current)
      for (const draft of session.drafts) {
        if (!draft.filled.length || draft.char === activeChar) continue
        nextGlyphs.set(draft.char, draft)
      }
      for (const ch of [...nextGlyphs.keys()]) {
        if (ch === activeChar) continue
        if (liveRoom.draftUpdatedAt?.[ch] && !liveRoom.draftSvgs?.[ch]) {
          nextGlyphs.delete(ch)
        }
      }
      glyphsRef.current = nextGlyphs
      setGlyphs(nextGlyphs)
      sessionRef.current = {
        ...session,
        active: activeRef.current,
        contributions: merged,
        drafts: [...nextGlyphs.values()].filter((d) => d.filled.length),
        liveSvg: sessionRef.current?.liveSvg ?? session.liveSvg,
      }
    },
  })
  const pushLive = live.pushSession

  useEffect(() => {
    if (recovery.error) return
    const timer = window.setTimeout(() => {
      pushLive(writeSession())
    }, 250)
    const flush = () => {
      pushLive(writeSession())
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pagehide', flush)
    }
  }, [filled, brokenJoins, grid, softness, cornerRadius, holeMode, displayGuideLetter, glyphs, contributions, writeSession, pushLive, recovery.error])

  useEffect(() => {
    writeUiPrefs({
      shapeId, brushSize, brushRotation, showLetterGuide, guideOpacity, letterScale,
      showGridGuide, gridGuideOpacity, invertPreview, wordTesterOpen, testString,
    })
  }, [shapeId, brushSize, brushRotation, showLetterGuide, guideOpacity, letterScale,
    showGridGuide, gridGuideOpacity, invertPreview, wordTesterOpen, testString])

  const saveFailed = !!recovery.error || saveStatus.startsWith('Saving failed')

  const publishGlyph = () => {
    if (!filled.size) return
    persistCurrent()
    const draft = activeRef.current
    const contribution: Contribution = {
      id: crypto.randomUUID(), createdAt: new Date().toISOString(), draft,
      svg: compactSvgMarkup(buildSvgMarkup(makePayload(draft.char, draft.filled, draft.brokenJoins), { fitContent: false })),
    }
    const next = [...contributionsRef.current, contribution]
    contributionsRef.current = next
    setContributions(next)
    pushLive(writeSession())
    setNotice(`${draft.char} added to our typeface. Choose another letter or try another version.`)
  }

  const backupSession = () => {
    if (recovery.error) {
      downloadBlob(new Blob([localStorage.getItem(FESTIVAL_KEY) ?? ''], { type: 'application/json' }), 'workshop-recovery.json')
      return
    }
    const session = writeSession()
    downloadBlob(new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' }),
      `beckmans-typeface-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  }

  /** Only offered when the saved session could not be read: keep a copy, then begin again. */
  const startFresh = () => {
    if (!window.confirm('Download the unreadable session and start with an empty workshop?')) return
    backupSession()
    try {
      localStorage.removeItem(FESTIVAL_KEY)
    } catch {
      setNotice('Could not clear the saved session. Clear this site\'s data in the browser settings.')
      return
    }
    // Give the download a moment to start before the page goes away.
    window.setTimeout(() => window.location.reload(), 600)
  }

  const restoreSession = async (file: File) => {
    try {
      const session = parseSession(await file.text())
      if (!window.confirm('Restore this backup? The current session will download first.')) return
      backupSession()
      localStorage.setItem(FESTIVAL_KEY, JSON.stringify(session))
      window.location.reload()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not restore backup.')
    }
  }

  const collectionLocked = contributions.length > 0 || glyphs.size > 0 || filled.size > 0

  useEffect(() => {
    if (desktop) setPaintAdjustOpen(true)
  }, [desktop])

  useEffect(() => {
    const endStroke = () => {
      strokeStarted.current = false
    }
    window.addEventListener('pointerup', endStroke)
    window.addEventListener('pointercancel', endStroke)
    return () => {
      window.removeEventListener('pointerup', endStroke)
      window.removeEventListener('pointercancel', endStroke)
    }
  }, [])

  const takeSnapshot = useCallback(
    (): Snapshot => ({
      filled: snapshotFilled(filledRef.current),
      brokenJoins: [...brokenRef.current],
    }),
    [],
  )

  const pushHistory = useCallback(() => {
    past.current.push(takeSnapshot())
    if (past.current.length > HISTORY_MAX) past.current.shift()
    future.current = []
    syncHistoryFlags()
  }, [syncHistoryFlags, takeSnapshot])

  const commitFilled = useCallback(
    (next: Map<string, FilledRegion>) => {
      // One undo step per stroke, recorded before its first cell lands.
      if (!strokeStarted.current) {
        pushHistory()
        strokeStarted.current = true
      }
      filledRef.current = next
      setFilled(next)
    },
    [pushHistory],
  )

  const syncGlyphForActive = useCallback((nextFilled: Map<string, FilledRegion>, nextBroken: Set<string>) => {
    const ch = letterRef.current
    const store = new Map(glyphsRef.current)
    if (nextFilled.size) {
      store.set(ch, {
        char: ch,
        filled: snapshotFilled(nextFilled),
        brokenJoins: [...nextBroken],
        ...settingsRef.current,
      })
    } else {
      store.delete(ch)
    }
    glyphsRef.current = store
    setGlyphs(store)
  }, [])

  const applySnapshot = useCallback(
    (snapshot: Snapshot) => {
      const nextFilled = restoreFilled(snapshot.filled)
      const nextBroken = new Set(snapshot.brokenJoins)
      filledRef.current = nextFilled
      brokenRef.current = nextBroken
      setFilled(nextFilled)
      setBrokenJoins(nextBroken)
      syncGlyphForActive(nextFilled, nextBroken)
      setExportStatus({ state: 'idle' })
    },
    [syncGlyphForActive],
  )

  const undo = useCallback(() => {
    const previous = past.current.pop()
    if (!previous) return
    future.current.push(takeSnapshot())
    applySnapshot(previous)
    syncHistoryFlags()
  }, [applySnapshot, syncHistoryFlags, takeSnapshot])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(takeSnapshot())
    applySnapshot(next)
    syncHistoryFlags()
  }, [applySnapshot, syncHistoryFlags, takeSnapshot])
  undoRef.current = undo
  redoRef.current = redo

  /** Breaking, restoring or resetting joins is undoable like any other edit. */
  const changeBrokenJoins = useCallback(
    (next: BrokenJoins) => {
      pushHistory()
      brokenRef.current = next
      setBrokenJoins(next)
    },
    [pushHistory],
  )

  const clearCanvas = () => {
    if (filled.size === 0) return
    pushHistory()
    const empty = new Map<string, FilledRegion>()
    const noJoins = new Set<string>()
    filledRef.current = empty
    brokenRef.current = noJoins
    setFilled(empty)
    setBrokenJoins(noJoins)
    syncGlyphForActive(empty, noJoins)
    setExportStatus({ state: 'idle' })
  }

  const applyPermutation = useCallback(
    (transform: (curr: Map<string, FilledRegion>) => Map<string, FilledRegion>) => {
      if (filled.size === 0) return
      pushHistory()
      setFilled((prev) => transform(prev))
    },
    [filled, pushHistory],
  )

  const nudge = useCallback(
    (deltaCol: number, deltaRow: number) => {
      if (filled.size === 0) return
      pushHistory()
      setFilled((prev) => nudgeFilled(prev, deltaCol, deltaRow, grid))
    },
    [filled, grid, pushHistory],
  )
  nudgeRef.current = nudge

  const loadBlueprint = useCallback(() => {
    const blueprint = buildStarterBlueprint(displayGuideLetter, grid, shapeId, brushSize)
    if (blueprint.size === 0) {
      setNotice(`No starter blueprint available for "${displayGuideLetter}".`)
      return
    }
    pushHistory()
    setFilled(blueprint)
    setNotice(`Loaded blueprint for "${displayGuideLetter}". Edit or customize anytime!`)
  }, [displayGuideLetter, grid, shapeId, brushSize, filled, pushHistory])

  const borrowFromSibling = useCallback(
    (siblingChar: string) => {
      let draft = glyphs.get(siblingChar)
      if (!draft || !draft.filled.length) {
        const alt = siblingChar === siblingChar.toUpperCase() ? siblingChar.toLowerCase() : siblingChar.toUpperCase()
        draft = glyphs.get(alt)
      }
      if (!draft || !draft.filled.length) {
        const isUpper = siblingChar === siblingChar.toUpperCase() && siblingChar !== siblingChar.toLowerCase()
        switchToLetter(siblingChar.toLowerCase(), isUpper)
        setNotice(`Switched to "${siblingChar}". Draw it to share strokes with its siblings!`)
        return
      }
      pushHistory()
      const imported = restoreFilled(draft.filled)
      setFilled(imported)
      if (draft.brokenJoins) {
        setBrokenJoins(new Set(draft.brokenJoins))
      }
      setNotice(`Copied base shapes from "${draft.char}". Tweak and adapt for "${displayGuideLetter}"!`)
    },
    [glyphs, filled, displayGuideLetter, pushHistory, switchToLetter],
  )

  /** Active brush only — existing cells keep their own shapeIds. */
  const selectBrush = (id: string) => {
    if (id === shapeId) return
    setShapeId(id)
  }

  const runExport = async () => {
    persistCurrent()
    setExportStatus({ state: 'loading' })
    const payload = makePayload(displayGuideLetter, [...filled.values()], brokenJoins)
    await new Promise((r) => setTimeout(r, 40))
    try {
      exportSvg(payload)
      setExportStatus({
        state: 'success',
        message: `SVG saved — ${displayGuideLetter}`,
      })
    } catch (err) {
      setExportStatus({
        state: 'error',
        message: err instanceof Error ? err.message : 'Export failed.',
      })
    }
  }

  const runExportSet = async () => {
    persistCurrent()
    setExportStatus({ state: 'loading' })
    const payloads = [...glyphsRef.current.values()]
      .filter((g) => g.filled.length)
      .sort((a, b) => a.char.localeCompare(b.char, 'en'))
      .map((g) => makePayload(g.char, g.filled, g.brokenJoins))
    await new Promise((r) => setTimeout(r, 40))
    try {
      exportGlyphSet(payloads)
      setExportStatus({
        state: 'success',
        message: `ZIP saved — ${payloads.length} letter${payloads.length === 1 ? '' : 's'} + specimen.`,
      })
    } catch (err) {
      setExportStatus({
        state: 'error',
        message: err instanceof Error ? err.message : 'Export failed.',
      })
    }
  }

  const exportPreviewReady = filled.size > 0
  const sessionReady = sessionDrafts.length > 0

  const applyGridDetail = (detail: number) => {
    if (collectionLocked) {
      setNotice('The festival grid is fixed while the collection contains work.')
      return
    }
    const { grid: next, brushSize: nextBrush } = gridFromDetail(detail)
    setCornerRadius((r) => {
      const scaled = r * (next.cellSize / grid.cellSize)
      const max = Math.max(4, Math.round(next.cellSize * 0.45))
      return Math.min(Math.round(scaled * 10) / 10, max)
    })
    setGridDetail(detail)
    setGrid(next)
    setBrushSize(nextBrush)
  }

  // 19 outlines; only the selected brush, its rotation and the corner radius can change them.
  const brushIconPaths = useMemo(
    () =>
      new Map(
        library.map((s) => [
          s.id,
          moduleShapePath(s, 4, 4, 28, cornerRadius, s.id === shapeId ? brushRotation : 0),
        ]),
      ),
    [library, cornerRadius, shapeId, brushRotation],
  )

  const wordTester = (
    <WordTester
      activeChar={displayGuideLetter}
      activeFilled={filled}
      drafts={glyphs}
      grid={grid}
      library={library}
      softness={softness}
      cornerRadius={cornerRadius}
      brokenJoins={brokenJoins}
      holeMode={holeMode}
      value={testString}
      onValueChange={setTestString}
      collapsed={desktop ? !wordTesterOpen : false}
      onToggleCollapsed={desktop ? () => setWordTesterOpen((open) => !open) : undefined}
      onSelectChar={(ch) => {
        // Only letters of the workshop alphabet are drawable; digits and punctuation are not.
        if (!LETTERS.includes(ch.toLowerCase())) {
          setNotice(`"${ch}" is not part of this alphabet.`)
          return
        }
        const isUpper = ch === ch.toUpperCase() && ch !== ch.toLowerCase()
        switchToLetter(ch.toLowerCase(), isUpper)
      }}
    />
  )

  return (
    <div className="min-h-full bg-night lg:bg-paper">
      <div className="phone-shell relative flex w-full max-w-[430px] flex-col overflow-hidden lg:max-w-[1400px]">
        {showIntro ? (
          <IntroScreen
            onStart={() => {
              setShowIntro(false)
              setScreen('paint')
            }}
          />
        ) : (
          <>
        <header className="safe-pt relative z-50 flex shrink-0 items-center justify-between gap-2 border-b border-ink/10 px-3 pb-2 pt-2 lg:px-5 lg:pb-3 lg:pt-3">
          <div className="min-w-0">
            <p className="specimen-rule mb-0.5">
              grid workshop
            </p>
            <h1 className="truncate font-sans text-[1.35rem] font-bold leading-none text-ink">
              {TABS.find((t) => t.id === screen)?.label}
            </h1>
          </div>
          <button
            type="button"
            data-testid="options-gear"
            aria-label="Options"
            aria-expanded={optionsOpen}
            onClick={() => setOptionsOpen(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[3px] border border-ink/15 bg-paper-deep text-ink active:bg-line"
          >
            <Settings2 className="h-5 w-5 pointer-events-none" />
          </button>
        </header>

        <div className={cn('festival-toolbar', screen === 'paint' && 'is-paint')}>
          <span role="status" className={cn('festival-save', saveFailed && 'is-error')}>{saveStatus}</span>
          <span role="status" className="festival-notice">{notice}</span>
          <span className="festival-links">
            <a
              href={`?view=wall&room=${encodeURIComponent(live.room || 'lettermans')}`}
              target="_blank"
              rel="noreferrer"
            >
              Open wall projection ↗
            </a>
            <a
              href={`?view=studio&station=a&room=${encodeURIComponent(live.room || 'lettermans')}`}
              target="_blank"
              rel="noreferrer"
            >
              Computer A ↗
            </a>
            <a
              href={`?view=studio&station=b&room=${encodeURIComponent(live.room || 'lettermans')}`}
              target="_blank"
              rel="noreferrer"
            >
              Computer B ↗
            </a>
          </span>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={event => {
            const file = event.target.files?.[0]
            if (file) void restoreSession(file)
            event.target.value = ''
          }} />
        </div>

        <main className="relative z-0 min-h-0 flex-1 overflow-hidden overscroll-contain">
          {screen === 'shape' && (
            <ScreenPad className="lg:grid lg:grid-cols-2 lg:gap-x-10 lg:space-y-0">
              <div className="min-w-0">
              <SectionTitle>Brush</SectionTitle>
              <p className="mb-3 text-[12px] leading-relaxed text-ink-muted">
                Active stamp for new cells. Mix shapes in one glyph — each cell keeps what you
                painted; switch brush anytime, then paint over a cell to replace it.
              </p>
              <ShapePicker
                library={library}
                selectedId={shapeId}
                cornerRadius={cornerRadius}
                onSelect={selectBrush}
              />

              <div className="mt-4">
                <Slider
                  label={`Rounded corners · ${formatPx(cornerRadius)}px`}
                  min={0}
                  max={cornerMax}
                  step={0.5}
                  value={cornerRadius}
                  onChange={setCornerRadius}
                  testId="corner-radius"
                />
                {!canRound && (
                  <p className="mt-1 text-[11px] text-ink-muted">
                    Circles stay fully round — switch module to see corner radius.
                  </p>
                )}
              </div>
              </div>

              <div className="min-w-0">
              <SectionTitle className="mt-6 lg:mt-0">Grid</SectionTitle>
              <p className="mb-2 text-[12px] leading-relaxed text-ink-muted">
                Finer lattice: more cells and smaller stamps. 1× is the original 7×9 · 40px
                design. The letter stays about the same size.
              </p>
              <GridPreview grid={grid} />
              <Slider
                label={`Detail · ${formatPx(gridDetail)}× · ${formatPx(grid.cellSize)}px cells`}
                min={1}
                max={3}
                step={0.5}
                value={gridDetail}
                onChange={applyGridDetail}
                testId="grid-detail"
              />
              <div className="mt-3">
                <Slider
                  label={`Columns · ${grid.cols}`}
                  min={4}
                  max={24}
                  value={grid.cols}
                  onChange={(cols) => {
                    if (collectionLocked) { setNotice('The festival grid is fixed while the collection contains work.'); return }
                    setGrid((g) => ({ ...g, cols }))
                  }}
                />
              </div>
              <div className="mt-3">
                <Slider
                  label={`Rows · ${grid.rows}`}
                  min={4}
                  max={28}
                  value={grid.rows}
                  onChange={(rows) => {
                    if (collectionLocked) { setNotice('The festival grid is fixed while the collection contains work.'); return }
                    setGrid((g) => ({ ...g, rows }))
                  }}
                />
              </div>
              <div className="mt-3">
                <Slider
                  label={`Spacing · ${formatPx(grid.gap)}px`}
                  min={-4}
                  max={12}
                  step={0.1}
                  value={grid.gap}
                  onChange={(gap) => {
                    if (collectionLocked) { setNotice('The festival grid is fixed while the collection contains work.'); return }
                    setGrid((g) => ({ ...g, gap }))
                  }}
                />
              </div>

              <Button className="mt-6 w-full lg:mt-8" size="lg" onClick={() => setScreen('paint')}>
                Start painting
              </Button>
              </div>
            </ScreenPad>
          )}

          {screen === 'paint' && (
            <div className="paint-screen relative z-0 flex h-full min-h-0 flex-col overflow-hidden lg:flex-row">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="festival-contribute">
                <p role="status">{notice}</p>
                <button type="button" data-testid="publish-glyph" disabled={!filled.size} onClick={publishGlyph}>Add {displayGuideLetter} to the typeface</button>
                <button type="button" data-testid="next-visitor" onClick={() => {
                  // A new visitor starts with plain tools, whatever the last one left on.
                  setPaintTool('stamp')
                  setStampMode('ink')
                  setBrushRotation(0)
                  setSymmetryMode('none')
                  setShowJoinDots(false)
                  const published = latestContributions(contributions)
                  const next = LETTERS.find(char => !published.has(guideUpper ? char.toUpperCase() : char) && char !== guideLetter)
                  if (next) {
                    switchToLetter(next, guideUpper)
                    setNotice(`Your letter is ${guideUpper ? next.toUpperCase() : next}. Draw it, then add it to the typeface.`)
                  } else setNotice('Every letter has a contribution. Choose one to create another version.')
                }}>Next visitor →</button>
              </div>
              <div className="relative z-20 flex shrink-0 items-center gap-1.5 border-b border-ink/10 px-2 py-1.5 lg:px-4 overflow-x-auto">
                <ToolIcon label="Undo" disabled={!canUndo} onClick={undo} icon={<Undo2 className="h-4 w-4" />} />
                <ToolIcon label="Redo" disabled={!canRedo} onClick={redo} icon={<Redo2 className="h-4 w-4" />} />
                <ToolIcon label="Clear letter" disabled={!filled.size} onClick={clearCanvas} icon={<Trash2 className="h-4 w-4" />} />
                <div className="h-4 w-px bg-line shrink-0" />
                {/* Guide toggle [G] */}
                <ToolIcon
                  label={showLetterGuide ? 'Hide Guide [G]' : 'Show Guide [G]'}
                  onClick={() => setShowLetterGuide((v) => !v)}
                  icon={showLetterGuide ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  active={showLetterGuide}
                />
                {/* Starter Blueprint */}
                <button
                  type="button"
                  title={`Load starter skeleton blueprint for "${displayGuideLetter}"`}
                  onClick={loadBlueprint}
                  className="flex h-8 items-center gap-1 rounded border border-line bg-paper px-2 text-[11px] font-semibold text-ink-muted hover:border-ink/50 hover:text-ink shrink-0"
                >
                  <Wand2 className="h-3.5 w-3.5 text-brass-deep" />
                  <span className="hidden sm:inline">Blueprint</span>
                </button>
                <div className="h-4 w-px bg-line shrink-0" />
                {/* Nudge controls */}
                <div className="flex items-center gap-0.5 rounded border border-line/60 bg-paper-deep/30 p-0.5 shrink-0">
                  <button
                    type="button"
                    title="Nudge Left [Arrow Left]"
                    onClick={() => nudge(-1, 0)}
                    disabled={!filled.size}
                    className="flex h-7 w-7 items-center justify-center rounded hover:bg-paper disabled:opacity-30 text-ink"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Nudge Right [Arrow Right]"
                    onClick={() => nudge(1, 0)}
                    disabled={!filled.size}
                    className="flex h-7 w-7 items-center justify-center rounded hover:bg-paper disabled:opacity-30 text-ink"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Nudge Up [Arrow Up]"
                    onClick={() => nudge(0, -1)}
                    disabled={!filled.size}
                    className="flex h-7 w-7 items-center justify-center rounded hover:bg-paper disabled:opacity-30 text-ink"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Nudge Down [Arrow Down]"
                    onClick={() => nudge(0, 1)}
                    disabled={!filled.size}
                    className="flex h-7 w-7 items-center justify-center rounded hover:bg-paper disabled:opacity-30 text-ink"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="h-4 w-px bg-line shrink-0" />
                {/* Symmetry toggle */}
                <button
                  type="button"
                  title="Symmetry Mirroring Mode"
                  onClick={() =>
                    setSymmetryMode((m) =>
                      m === 'none' ? 'horizontal' : m === 'horizontal' ? 'vertical' : 'none',
                    )
                  }
                  className={cn(
                    'flex h-8 items-center gap-1 rounded border px-2 text-[11px] font-semibold shrink-0 transition-colors',
                    symmetryMode !== 'none'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                      : 'border-line bg-paper text-ink-muted hover:border-ink/50 hover:text-ink',
                  )}
                >
                  <Columns2 className="h-3.5 w-3.5" />
                  <span>
                    {symmetryMode === 'none'
                      ? 'Mirror: Off'
                      : symmetryMode === 'horizontal'
                      ? 'Mirror: H |'
                      : 'Mirror: V –'}
                  </span>
                </button>
                <div className="h-4 w-px bg-line shrink-0" />
                {/* Hole / Gap Seal Mode toggle */}
                <button
                  type="button"
                  title="Holes & Gaps: Toggle open gaps, fill interstitial pinholes, or 100% solid"
                  onClick={() =>
                    setHoleMode((m) =>
                      m === 'open' ? 'no-gaps' : m === 'no-gaps' ? 'solid' : 'open',
                    )
                  }
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded border px-2 text-[11px] font-semibold shrink-0 transition-colors',
                    holeMode !== 'open'
                      ? 'border-brass bg-ink text-paper'
                      : 'border-line bg-paper text-ink-muted hover:border-ink/50 hover:text-ink',
                  )}
                >
                  <CircleDot className="h-3.5 w-3.5" />
                  <span>
                    {holeMode === 'open'
                      ? 'Gaps: Open'
                      : holeMode === 'no-gaps'
                      ? 'Gaps: Filled'
                      : 'Gaps: Solid'}
                  </span>
                </button>
                <div className="h-4 w-px bg-line shrink-0" />
                <ToolIcon
                  label={invertPreview ? 'Positive preview' : 'Invert preview'}
                  onClick={() => setInvertPreview((v) => !v)}
                  icon={<Contrast className="h-4 w-4" />}
                  active={invertPreview}
                />
                <button
                  type="button"
                  data-testid="paint-export"
                  onClick={() => {
                    persistCurrent()
                    setScreen('export')
                  }}
                  className="ml-auto bg-sea px-3 py-2 text-xs font-bold text-paper underline active:bg-brass-deep lg:hidden shrink-0"
                >
                  Export
                </button>
              </div>

              <div className="flex shrink-0 items-center gap-1 border-b border-ink/10 px-2 py-1 lg:px-3">
                <button
                  type="button"
                  data-testid="paint-glyph-case"
                  aria-label={guideUpper ? 'Switch to lowercase' : 'Switch to uppercase'}
                  onClick={() => switchToLetter(guideLetter, !guideUpper)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-ink/15 bg-paper-deep font-sans text-xs font-bold"
                >
                  {guideUpper ? 'A' : 'a'}
                </button>
                <div className="-mx-0.5 min-w-0 flex-1 overflow-x-auto px-0.5 lg:overflow-visible">
                  <div className="flex w-max gap-0.5 lg:w-full lg:flex-wrap lg:justify-start">
                    {LETTERS.map((ch) => {
                      const shown = guideUpper ? ch.toUpperCase() : ch
                      const saved =
                        glyphs.has(shown) || (shown === displayGuideLetter && filled.size > 0)
                      const on = guideLetter === ch
                      return (
                        <button
                          key={ch}
                          type="button"
                          data-testid={`paint-glyph-${shown}`}
                          aria-label={`Letter ${shown}${saved ? ', in session' : ''}`}
                          aria-pressed={on}
                          onClick={() => switchToLetter(ch, guideUpper)}
                          className={cn(
                            'relative flex h-8 w-7 shrink-0 items-center justify-center font-sans text-xs font-bold',
                            on ? 'bg-ink text-paper' : 'text-ink-muted',
                          )}
                        >
                          {shown}
                          {saved && (
                            <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brass" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Typographic Siblings & Stroke Borrowing */}
              {(() => {
                const group = getLetterSiblings(displayGuideLetter)
                if (!group) return null
                return (
                  <div className="paint-siblings flex shrink-0 flex-wrap items-center justify-between gap-1.5 border-b border-ink/10 bg-paper-deep/30 px-3 py-1 text-[11px]">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <span className="font-bold text-ink shrink-0">{group.name}:</span>
                      <span className="truncate text-ink-muted hidden md:inline">{group.tip}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-ink-muted font-medium mr-0.5">Siblings:</span>
                      {group.siblings.map((sib) => {
                        const hasDraft = glyphs.has(sib) || glyphs.has(sib.toUpperCase())
                        return (
                          <button
                            key={sib}
                            type="button"
                            title={
                              hasDraft
                                ? `Copy base strokes from "${sib}" into "${displayGuideLetter}"`
                                : `Switch to draw "${sib}"`
                            }
                            onClick={() => borrowFromSibling(sib)}
                            className={cn(
                              'flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold transition-colors',
                              hasDraft
                                ? 'border-brass bg-brass/10 text-ink hover:bg-brass/25'
                                : 'border-line/70 text-ink-muted hover:border-ink/50 hover:text-ink',
                            )}
                          >
                            <span>{sib}</span>
                            {hasDraft && <Copy className="h-2.5 w-2.5 opacity-60" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 py-1 touch-none lg:px-6 lg:py-4">
                <ShapeGridCanvas
                  grid={grid}
                  library={library}
                  shapeId={shapeId}
                  filled={filled}
                  onChange={commitFilled}
                  brushSize={brushSize}
                  brushRotation={brushRotation}
                  stampMode={stampMode}
                  symmetryMode={symmetryMode}
                  cornerRadius={cornerRadius}
                  guideLetter={displayGuideLetter}
                  showLetterGuide={showLetterGuide}
                  letterScale={letterScale}
                  guideOpacity={guideOpacity}
                  softness={softness}
                  brokenJoins={brokenJoins}
                  onBrokenJoinsChange={changeBrokenJoins}
                  paintTool={paintTool}
                  invertPreview={invertPreview}
                  showJoinDots={showJoinDots}
                  showGridGuide={showGridGuide}
                  gridGuideOpacity={gridGuideOpacity}
                  holeMode={holeMode}
                  meltOffRevision={meltOffRevision}
                />
              </div>

              {/* Live in-context word tester */}
              {desktop && wordTester}
              </div>

              <div data-testid="paint-panel" className="max-h-[46%] shrink-0 space-y-1.5 overflow-y-auto overscroll-contain border-t border-line/50 px-3 py-1.5 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0 lg:px-4 lg:py-3">
                <div className="-mx-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:overflow-visible lg:px-0">
                  <div className="flex w-max gap-1.5 lg:grid lg:w-full lg:grid-cols-4 lg:gap-1.5">
                    {library.map((s) => {
                      const d = brushIconPaths.get(s.id) ?? ''
                      const on = s.id === shapeId
                      return (
                        <button
                          key={s.id}
                          type="button"
                          data-testid={`paint-brush-${s.id}`}
                          aria-label={`Brush ${shapeLabel(s)}`}
                          aria-pressed={on}
                          onClick={() => selectBrush(s.id)}
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-[3px] border lg:h-12 lg:w-full',
              on ? 'border-brass bg-ink text-paper' : 'border-line bg-paper-deep/50',
            )}
                        >
                          <svg viewBox="0 0 36 36" className="h-6 w-6" aria-hidden>
                            <path d={d} fill="currentColor" fillRule={moduleShapeFillRule(s)} />
                          </svg>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Brush Rotation & Stamp Mode Controls */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    data-testid="paint-rotate-brush"
                    title="Rotate brush 90° (shortcut: R)"
                    onClick={() => setBrushRotation((r) => (r + 90) % 360)}
                    className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-[3px] border border-line bg-paper px-2 text-xs font-semibold hover:border-ink/50"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    <span>{brushRotation}°</span>
                    <span className="text-[10px] text-ink-muted">[R]</span>
                  </button>
                  <button
                    type="button"
                    data-testid="paint-stamp-mode"
                    title="Toggle Solid Ink vs Punch-Out Cutout (shortcut: C)"
                    onClick={() => setStampMode((m) => (m === 'ink' ? 'cutout' : 'ink'))}
                    className={cn(
                      'flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-[3px] border px-2 text-xs font-semibold transition-colors',
                      stampMode === 'cutout'
                        ? 'border-red-500 bg-red-950/20 text-red-500 dark:text-red-400 font-bold'
                        : 'border-line bg-paper text-ink hover:border-ink/50',
                    )}
                  >
                    <Scissors className="h-3.5 w-3.5" />
                    <span>{stampMode === 'cutout' ? 'Punch-Out' : 'Solid Ink'}</span>
                    <span className="text-[10px] opacity-60">[C]</span>
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    data-testid="paint-tool-stamp"
                    onClick={() => setPaintTool('stamp')}
                    className={cn(
                      'min-h-10 flex-1 rounded-[3px] border text-xs font-semibold tracking-wide',
                      paintTool === 'stamp' ? 'border-brass bg-ink text-paper' : 'border-line',
                    )}
                  >
                    Stamp
                  </button>
                  <button
                    type="button"
                    data-testid="paint-tool-erase"
                    title="Erase cells (shortcut: E)"
                    aria-pressed={paintTool === 'erase'}
                    onClick={() => setPaintTool('erase')}
                    className={cn(
                      'inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-[3px] border text-xs font-semibold tracking-wide',
                      paintTool === 'erase' ? 'border-brass bg-ink text-paper' : 'border-line',
                    )}
                  >
                    <Eraser className="h-3.5 w-3.5" />
                    Erase
                  </button>
                  <button
                    type="button"
                    data-testid="paint-tool-break-join"
                    onClick={() => {
                      setPaintTool('break-join')
                      setShowJoinDots(true)
                    }}
                    className={cn(
                      'min-h-10 flex-1 rounded-[3px] border text-xs font-semibold tracking-wide',
                      paintTool === 'break-join' ? 'border-brass bg-ink text-paper' : 'border-line',
                    )}
                  >
                    Break join
                  </button>
                  <button
                    type="button"
                    data-testid="paint-toggle-adjust"
                    aria-expanded={paintAdjustOpen}
                    onClick={() => setPaintAdjustOpen((v) => !v)}
                    className={cn(
                      'inline-flex min-h-10 items-center gap-1 rounded-[3px] border px-3 text-xs font-semibold tracking-wide lg:hidden',
                      paintAdjustOpen ? 'border-brass bg-ink text-paper' : 'border-line text-ink-muted',
                    )}
                  >
                    {paintAdjustOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronUp className="h-3.5 w-3.5" />
                    )}
                    {paintAdjustOpen ? 'Hide' : 'Adjust'}
                  </button>
                </div>
                {(paintAdjustOpen || desktop) && (
                  <div className="space-y-2">
                    {/* Dot Dilation */}
                    <div className="rounded-[3px] border border-line/70 bg-paper-deep/30 p-2 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-ink-muted">
                        <span className="flex items-center gap-1">
                          <Sliders className="h-3 w-3" /> Dot Dilation
                        </span>
                        <span className="text-[10px] font-normal opacity-70">Scale modules</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                        <button
                          type="button"
                          title="Dilate modules (+15% size)"
                          onClick={() => applyPermutation((m) => applyDotDilation(m, 1.15, fillMin, fillMax))}
                          className="rounded border border-line bg-paper py-1.5 font-semibold hover:border-ink/50"
                        >
                          Dilate +
                        </button>
                        <button
                          type="button"
                          title="Contract modules (-15% size)"
                          onClick={() => applyPermutation((m) => applyDotDilation(m, 0.85, fillMin, fillMax))}
                          className="rounded border border-line bg-paper py-1.5 font-semibold hover:border-ink/50"
                        >
                          Contract -
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        data-testid="paint-toggle-joins"
                        onClick={() => setShowJoinDots((v) => !v)}
                        className={cn(
                          'min-h-9 flex-1 rounded-[3px] border px-3 text-xs font-semibold tracking-wide',
                          showJoinDots ? 'border-brass bg-ink text-paper' : 'border-line text-ink-muted',
                        )}
                      >
                        {showJoinDots ? 'Hide joins' : 'Show joins'}
                      </button>
                      <button
                        type="button"
                        data-testid="paint-reset-joins"
                        disabled={brokenJoins.size === 0}
                        onClick={() => changeBrokenJoins(new Set())}
                        className="min-h-9 flex-1 rounded-[3px] border border-line px-3 text-xs font-semibold tracking-wide text-ink-muted active:bg-paper-deep disabled:opacity-40"
                      >
                        Reset joins
                      </button>
                    </div>
                    <Slider
                      label={`Fill size · ${formatPx(brushSize)}px`}
                      min={fillMin}
                      max={fillMax}
                      step={0.5}
                      value={brushSize}
                      onChange={setBrushSize}
                    />
                    <Slider
                      label={`Rounded corners · ${formatPx(cornerRadius)}px`}
                      min={0}
                      max={cornerMax}
                      step={0.5}
                      value={cornerRadius}
                      onChange={setCornerRadius}
                      testId="paint-corner-radius"
                    />
                    <div>
                      <Slider
                        label={`Softness · ${Math.round(softness * 100)}% · ${softnessHint(softness)}`}
                        min={0}
                        max={1}
                        step={0.05}
                        value={softness}
                        onChange={setSoftness}
                        testId="paint-softness"
                      />
                      <div className="mt-1 flex gap-1">
                        {[
                          { label: 'Crisp', val: 0 },
                          { label: 'Tight', val: 0.25 },
                          { label: 'Melt', val: 0.55 },
                          { label: 'Tendon', val: 0.85 },
                          { label: 'Liquid', val: 1.0 },
                        ].map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => setSoftness(p.val)}
                            className={cn(
                              'flex-1 rounded-[2px] border py-0.5 text-[10px] font-semibold transition-colors',
                              Math.abs(softness - p.val) < 0.04
                                ? 'border-brass bg-ink text-paper'
                                : 'border-line text-ink-muted hover:border-ink/40',
                            )}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      {activePreset ? (
                        <button
                          type="button"
                          data-testid="paint-melt-off"
                          aria-pressed={activeMeltOff}
                          title={
                            activeMeltOff
                              ? `${shapeLabel(activeShape)} never grows a Softness melt`
                              : `Turn off Softness melt for ${shapeLabel(activeShape)}`
                          }
                          onClick={() => {
                            const next = togglePresetMeltOff(activePreset)
                            setMeltOff(new Set(next))
                            setMeltOffRevision((n) => n + 1)
                          }}
                          className={cn(
                            'mt-1.5 w-full rounded-[2px] border py-1 text-[11px] font-semibold transition-colors',
                            activeMeltOff
                              ? 'border-ink bg-ink text-paper'
                              : 'border-line text-ink-muted hover:border-ink/40',
                          )}
                        >
                          {activeMeltOff
                            ? `No melt · ${shapeLabel(activeShape)}`
                            : `Melt on · ${shapeLabel(activeShape)}`}
                        </button>
                      ) : null}
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs font-medium text-ink-muted mb-1">
                        <span>Holes & Gaps</span>
                      </div>
                      <div className="flex gap-1">
                        {(
                          [
                            { mode: 'open', label: 'Open', desc: 'Keep all gaps & holes' },
                            { mode: 'no-gaps', label: 'Fill Gaps', desc: 'Seal interstitial pinholes between stamps' },
                            { mode: 'solid', label: 'Solid', desc: '100% solid silhouette (no holes)' },
                          ] as const
                        ).map((m) => (
                          <button
                            key={m.mode}
                            type="button"
                            title={m.desc}
                            onClick={() => setHoleMode(m.mode)}
                            className={cn(
                              'flex-1 rounded-[2px] border py-1 text-[10px] font-semibold transition-colors',
                              holeMode === m.mode
                                ? 'border-brass bg-ink text-paper'
                                : 'border-line text-ink-muted hover:border-ink/40',
                            )}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Slider
                      label={`Guide size · ${Math.round(letterScale * 100)}%`}
                      min={0.45}
                      max={1.35}
                      step={0.05}
                      value={letterScale}
                      onChange={setLetterScale}
                      testId="paint-guide-size"
                    />
                    <label className="flex min-h-9 items-center justify-between gap-3 text-xs text-ink-muted">
                      Grid guide
                      <input
                        type="checkbox"
                        data-testid="paint-grid-guide"
                        checked={showGridGuide}
                        onChange={(e) => setShowGridGuide(e.target.checked)}
                        className="h-5 w-5"
                      />
                    </label>
                    {!desktop && <div className="-mx-3">{wordTester}</div>}
                  </div>
                )}
              </div>
            </div>
          )}

          {screen === 'export' && (
            <ScreenPad className="lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.8fr)] lg:items-start lg:gap-8 lg:space-y-0">
              <div>
              <SectionTitle>Finished letter</SectionTitle>
              <p className="mb-3 text-[12px] leading-relaxed text-ink-muted">
                Softness joins from Paint are included. Switch letters on Paint to keep working a
                set, then download this SVG or all of them together.
              </p>

              <div className="mb-4">
                <ExportPreview
                  grid={grid}
                  library={library}
                  filled={filled}
                  softness={softness}
                  cornerRadius={cornerRadius}
                  brokenJoins={brokenJoins}
                  holeMode={holeMode}
                  caption={displayGuideLetter}
                />
              </div>
              </div>

              <div>
              <section className="festival-versions">
                <h2>The festival collection · {latestContributions(contributions).size} letters</h2>
                <p>Every submission is kept. The wall shows the latest version of each letter.</p>
                <Button disabled={!contributions.length} onClick={() => {
                  const payloads = [...latestContributions(contributions).values()].map(({ draft }) => ({
                    grid: draft.grid!, library, filledRegions: draft.filled, glyphChar: draft.char,
                    softness: draft.softness!, cornerRadius: draft.cornerRadius,
                    brokenJoins: new Set(draft.brokenJoins),
                    holeMode: draft.holeMode,
                  }))
                  exportGlyphSet(payloads)
                }}>Download published typeface (SVG)</Button>
                <Button disabled={!contributions.length} onClick={async () => {
                  try {
                    const { exportFestivalFont } = await import('@/lib/fontExport')
                    await exportFestivalFont([...latestContributions(contributions).values()], library)
                    setNotice('Your installable festival font has downloaded.')
                  } catch (error) {
                    setNotice(error instanceof Error ? error.message : 'Font export failed.')
                  }
                }}>Download font (OTF)</Button>
                <label>Build on a previous version
                  <select value="" onChange={event => {
                    const contribution = contributions.find(item => item.id === event.target.value)
                    if (!contribution) return
                    persistCurrent()
                    const draft = contribution.draft
                    const store = new Map(glyphsRef.current)
                    store.set(draft.char, draft)
                    glyphsRef.current = store
                    setGlyphs(store)
                    setGuideLetter(draft.char.toLowerCase())
                    setGuideUpper(draft.char !== draft.char.toLowerCase())
                    loadDraft(store, draft.char)
                    setScreen('paint')
                    setNotice(`Editing a copy of ${draft.char}. Submit to add a new version.`)
                  }}>
                    <option value="">Choose a contribution</option>
                    {contributions.map((item, index) => <option key={item.id} value={item.id}>
                      {item.draft.char} · contribution {index + 1} · {new Date(item.createdAt).toLocaleTimeString()}
                    </option>)}
                  </select>
                </label>
              </section>
              {sessionDrafts.length > 0 && (
                <div className="mb-4">
                  <SectionTitle>
                    In this session · {sessionDrafts.length}
                  </SectionTitle>
                  <div className="-mx-1 overflow-x-auto px-1 pb-1">
                    <div className="flex w-max gap-1.5">
                      {sessionDrafts.map((g) => (
                        <GlyphThumb
                          key={g.char}
                          char={g.char}
                          active={g.char === displayGuideLetter}
                          svg={buildSvgMarkup(
                            makePayload(g.char, g.filled, g.brokenJoins),
                          )}
                          onClick={() => {
                            const lower = g.char.toLowerCase()
                            switchToLetter(lower, g.char !== lower)
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <Button
                variant="accent"
                size="lg"
                className="w-full"
                disabled={exportStatus.state === 'loading' || !exportPreviewReady}
                onClick={() => void runExport()}
              >
                {exportStatus.state === 'loading' ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download SVG
              </Button>
              {sessionDrafts.length > 1 && (
                <Button
                  size="lg"
                  className="mt-2 w-full"
                  data-testid="export-download-set"
                  disabled={exportStatus.state === 'loading' || !sessionReady}
                  onClick={() => void runExportSet()}
                >
                  Download all ({sessionDrafts.length})
                </Button>
              )}

              {exportStatus.state !== 'idle' && (
                <div
                  role="status"
                  className={cn(
                    'mt-3 rounded-[3px] border px-3 py-2.5 text-xs',
                    exportStatus.state === 'loading' && 'border-sea/30 bg-sea-soft text-sea',
                    exportStatus.state === 'success' && 'border-sea/30 bg-sea-soft text-sea',
                    exportStatus.state === 'error' && 'border-ink bg-paper-deep text-ink',
                  )}
                >
                  {exportStatus.state === 'loading' && 'Building SVG…'}
                  {exportStatus.state === 'success' && exportStatus.message}
                  {exportStatus.state === 'error' && exportStatus.message}
                </div>
              )}
              </div>
            </ScreenPad>
          )}
        </main>

        <nav className="safe-pb relative z-50 shrink-0 border-t border-ink/12 px-1 pt-1 lg:absolute lg:left-1/2 lg:top-3 lg:z-[55] lg:-translate-x-1/2 lg:border-0 lg:bg-paper lg:px-0 lg:pt-0 lg:pb-0">
          <div className="grid grid-cols-3 gap-0.5 lg:flex lg:gap-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                data-testid={`tab-${id}`}
                onClick={() => {
                  persistCurrent()
                  setOptionsOpen(false)
                  setScreen(id)
                }}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-none font-sans text-[10px] font-bold lg:min-h-10 lg:flex-row lg:gap-2 lg:px-4 lg:text-xs',
                  screen === id ? 'bg-ink text-paper' : 'text-ink-muted',
                )}
              >
                <Icon className="pointer-events-none h-5 w-5" />
                {label}
              </button>
            ))}
          </div>
        </nav>

        {optionsOpen && (
          <div className="absolute inset-0 z-[60] flex justify-end bg-ink/35" role="dialog" aria-modal="true" aria-label="Options">
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Close options"
              onClick={() => setOptionsOpen(false)}
            />
            <aside className="animate-sheet-in relative z-[61] flex h-full w-[min(100%,320px)] flex-col border-l border-ink/15 bg-paper shadow-[-18px_0_40px_rgba(28,17,12,0.18)] lg:w-[380px]">
              <div className="safe-pt flex items-center justify-between border-b border-line px-4 pb-3 pt-3">
                <h2 className="font-sans text-lg font-bold">Options</h2>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOptionsOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-[3px] border border-ink/10 bg-paper-deep"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 safe-pb">
                <div data-testid="options-workshop">
                  <SectionTitle>Workshop</SectionTitle>
                  <p className={cn('mb-2 text-[11px] leading-relaxed', saveFailed ? 'font-bold text-[#c00000]' : 'text-ink-muted')}>
                    {saveStatus}
                  </p>
                  <LiveSessionJoin
                    className="mb-3"
                    room={live.room}
                    enabled={live.enabled}
                    joined={live.joined}
                    statusMessage={live.status.message}
                    onJoin={live.joinSession}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <a className="options-link" href="?view=wall" target="_blank" rel="noreferrer">Cinematic wall ↗</a>
                    <a className="options-link" href="?view=projection" target="_blank" rel="noreferrer">Wall projection ↗</a>
                    <a className="options-link" href="?view=join-lab" target="_blank" rel="noreferrer">Shape joins ↗</a>
                    <button type="button" className="options-link" onClick={() => void live.copyWallLink('wall')}>Copy wall link</button>
                    <button type="button" className="options-link" onClick={backupSession}>Editable backup</button>
                    <button type="button" className="options-link" onClick={() => importRef.current?.click()}>Restore backup</button>
                    <button
                      type="button"
                      className="options-link col-span-2"
                      disabled={!live.enabled}
                      onClick={() => {
                        if (!window.confirm('Clear the shared room for everyone? Local backups are unchanged.')) return
                        void live.clearRoom()
                      }}
                    >
                      Clear shared room
                    </button>
                    {recovery.error && (
                      <button type="button" data-testid="start-fresh" className="options-link col-span-2" onClick={startFresh}>
                        Save the unreadable session and start fresh
                      </button>
                    )}
                  </div>
                  <p className="mt-2 hidden text-[11px] leading-relaxed text-ink-muted lg:block">
                    Keys: R rotate · C punch-out · E erase · M mirror · G guide · arrows nudge · ⌘/Ctrl+Z undo · ⇧⌘Z redo.
                  </p>
                </div>
                <div>
                  <SectionTitle>Letter guide</SectionTitle>
                  <p className="mb-2 text-[11px] leading-relaxed text-ink-muted">
                    Dim outline to follow while painting your letter.
                  </p>
                  <label className="mb-3 flex min-h-11 items-center justify-between gap-3 text-sm">
                    Show guide
                    <input
                      type="checkbox"
                      checked={showLetterGuide}
                      onChange={(e) => setShowLetterGuide(e.target.checked)}
                      className="h-5 w-5"
                    />
                  </label>
                  <div className="mb-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => switchToLetter(guideLetter, false)}
                      className={cn(
                        'min-h-10 flex-1 rounded-[3px] border text-xs font-semibold tracking-wide',
                        !guideUpper ? 'border-brass bg-ink text-paper' : 'border-line',
                      )}
                    >
                      lowercase
                    </button>
                    <button
                      type="button"
                      onClick={() => switchToLetter(guideLetter, true)}
                      className={cn(
                        'min-h-10 flex-1 rounded-[3px] border text-xs font-semibold tracking-wide',
                        guideUpper ? 'border-brass bg-ink text-paper' : 'border-line',
                      )}
                    >
                      UPPERCASE
                    </button>
                  </div>
                  <div className="mb-3 grid grid-cols-7 gap-1">
                    {LETTERS.map((ch) => {
                      const shown = guideUpper ? ch.toUpperCase() : ch
                      const saved =
                        glyphs.has(shown) || (shown === displayGuideLetter && filled.size > 0)
                      return (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => switchToLetter(ch, guideUpper)}
                          className={cn(
                            'relative flex h-9 items-center justify-center rounded-none font-sans text-sm font-bold',
                            guideLetter === ch
                              ? 'bg-ink text-paper'
                              : 'bg-paper-deep text-ink-muted',
                          )}
                        >
                          {shown}
                          {saved && (
                            <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brass" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <Slider
                    label={`Guide size · ${Math.round(letterScale * 100)}%`}
                    min={0.45}
                    max={1.35}
                    step={0.05}
                    value={letterScale}
                    onChange={setLetterScale}
                    testId="guide-size"
                  />
                  <Slider
                    label={`Guide strength · ${Math.round(guideOpacity * 100)}%`}
                    min={0.25}
                    max={1}
                    step={0.05}
                    value={guideOpacity}
                    onChange={setGuideOpacity}
                  />
                </div>
                <div>
                  <SectionTitle>Grid guide</SectionTitle>
                  <p className="mb-2 text-[11px] leading-relaxed text-ink-muted">
                    Construction lines on the letter: cap, x-height, baseline, descender.
                  </p>
                  <label className="mb-3 flex min-h-11 items-center justify-between gap-3 text-sm">
                    Show grid guide
                    <input
                      type="checkbox"
                      data-testid="grid-guide-toggle"
                      checked={showGridGuide}
                      onChange={(e) => setShowGridGuide(e.target.checked)}
                      className="h-5 w-5"
                    />
                  </label>
                  <Slider
                    label={`Grid strength · ${Math.round(gridGuideOpacity * 100)}%`}
                    min={0.25}
                    max={1}
                    step={0.05}
                    value={gridGuideOpacity}
                    onChange={setGridGuideOpacity}
                  />
                </div>
                <div>
                  <SectionTitle>Corners</SectionTitle>
                  <Slider
                    label={`Rounded corners · ${formatPx(cornerRadius)}px`}
                    min={0}
                    max={cornerMax}
                    step={0.5}
                    value={cornerRadius}
                    onChange={setCornerRadius}
                    testId="corner-radius"
                  />
                  {!canRound && (
                    <p className="mt-1 text-[11px] text-ink-muted">
                      Circles stay fully round — switch module to see corner radius.
                    </p>
                  )}
                </div>
                <div>
                  <SectionTitle>Preview</SectionTitle>
                  <label className="mb-2 flex min-h-11 items-center justify-between gap-3 text-sm">
                    Invert preview
                    <input
                      type="checkbox"
                      data-testid="invert-preview"
                      checked={invertPreview}
                      onChange={(e) => setInvertPreview(e.target.checked)}
                      className="h-5 w-5"
                    />
                  </label>
                  <p className="text-[11px] leading-relaxed text-ink-muted">
                    Design-time only — flips black/white to judge counters. SVG stays positive.
                    Softness and Break join live on Paint.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  )
}

function IntroScreen({ onStart }: { onStart: () => void }) {
  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-paper"
      data-testid="intro-screen"
    >
      <div className="safe-pt relative mx-auto flex min-h-0 flex-1 flex-col px-5 pb-4 pt-8 lg:max-w-2xl lg:justify-center lg:px-10 lg:pt-16">
        <p className="specimen-rule rise">
          grid workshop
        </p>
        <h1 className="rise rise-1 mt-5 font-sans text-[2.1rem] font-bold leading-[1.05] text-ink lg:text-4xl">
          Make your letters.
          <br />
          Soften. Download SVG.
        </h1>
        <p className="rise rise-2 mt-4 max-w-[20rem] text-sm leading-relaxed text-ink-muted lg:max-w-lg lg:text-base">
          Pick a brush, stamp a grid, fuse joins — keep going through the alphabet, then
          download the set.
        </p>
        <ol className="rise rise-3 mt-8 space-y-4 text-sm leading-snug text-ink">
          <li className="flex gap-3">
            <span className="w-7 shrink-0 font-sans text-lg text-sea">01</span>
            <span>
              <strong className="font-semibold">Shape</strong> — pick a brush and see the grid
              preview.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="w-7 shrink-0 font-sans text-lg text-sea">02</span>
            <span>
              <strong className="font-semibold">Paint</strong> — stamp cells; Softness fuses
              close shapes (higher = farther). Break join splits a fuse.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="w-7 shrink-0 font-sans text-lg text-sea">03</span>
            <span>
              <strong className="font-semibold">Export</strong> — preview this letter, or
              download all painted letters together.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="w-7 shrink-0 font-sans text-lg text-sea">·</span>
            <span className="text-ink-muted">
              Mix shapes freely. Softness 0 = crisp. Gear = letter guide, grid guide, corners.
              The Paint letter strip keeps a whole set in one session.
            </span>
          </li>
        </ol>
        <div className="rise rise-4 mt-auto space-y-2 pt-8 safe-pb">
          <Button
            variant="accent"
            size="lg"
            className="w-full lg:max-w-sm"
            data-testid="intro-start"
            onClick={onStart}
          >
            Start workshop
          </Button>
          <p className="text-center font-sans text-[11px] text-ink-muted">
            Takes about a minute to make your first glyph.
          </p>
        </div>
      </div>
    </div>
  )
}

function ShapePicker({
  library,
  selectedId,
  cornerRadius,
  onSelect,
  compact,
}: {
  library: ShapeDef[]
  selectedId: string
  cornerRadius: number
  onSelect: (id: string) => void
  compact?: boolean
}) {
  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-4' : 'grid-cols-4')}>
      {library.map((s) => {
        const d = moduleShapePath(s, 6, 6, 36, cornerRadius)
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 rounded-[3px] border px-1 py-2',
              compact ? 'min-h-14' : 'min-h-[4.5rem]',
              selectedId === s.id
                ? 'border-brass bg-ink text-paper'
                : 'border-line bg-paper-deep/40 text-ink',
            )}
          >
            <svg viewBox="0 0 48 48" className={compact ? 'h-7 w-7' : 'h-9 w-9'} aria-hidden>
              <path d={d} fill="currentColor" fillRule={moduleShapeFillRule(s)} />
            </svg>
            <span
              className={cn(
                'truncate px-0.5 text-center font-semibold leading-tight',
                compact ? 'text-[9px]' : 'text-[10px]',
                selectedId === s.id ? 'text-paper' : 'text-ink',
              )}
            >
              {shapeLabel(s)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ScreenPad({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('h-full space-y-1 overflow-y-auto overscroll-contain px-4 py-4 lg:px-8 lg:py-6', className)}>
      {children}
    </div>
  )
}

function SectionTitle({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <h2 className={cn('mb-2 font-sans text-sm font-bold text-ink', className)}>
      {children}
    </h2>
  )
}

function ToolIcon({
  label,
  icon,
  onClick,
  disabled,
  active,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-[3px] text-ink',
        active ? 'bg-ink text-paper' : 'border border-ink/10 bg-paper-deep',
        disabled && 'opacity-35',
        !disabled && !active && 'active:bg-line',
      )}
    >
      {icon}
    </button>
  )
}

function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  testId,
}: {
  label: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (v: number) => void
  testId?: string
}) {
  return (
    <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
      {label}
      <input
        type="range"
        data-testid={testId}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brass"
      />
    </label>
  )
}
