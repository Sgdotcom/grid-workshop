/**
 * Installation studio desk — canvas + mini alphabet rail.
 * Shares the festival session via localStorage + optional Cloudflare live room.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleDot,
  Columns2,
  Contrast,
  Eraser,
  Eye,
  EyeOff,
  Paintbrush,
  Redo2,
  RotateCw,
  Scissors,
  Settings2,
  Split,
  Trash2,
  Undo2,
  Wand2,
  X,
} from 'lucide-react'
import { ShapeGridCanvas, type PaintTool } from '@/components/Canvas'
import { Button } from '@/components/ui/button'
import { buildSvgMarkup, compactSvgMarkup, type ExportPayload } from '@/lib/export'
import {
  ALPHABET,
  FESTIVAL_KEY,
  latestContributions,
  parseSession,
  readSession,
  svgImage,
  type Contribution,
  type FestivalSession,
} from '@/lib/festival'
import { DEFAULT_BRUSH, DEFAULT_GRID } from '@/lib/gridGeometry'
import { ClearRoomControl } from '@/components/ClearRoomControl'
import { LiveSessionJoin } from '@/components/LiveSessionJoin'
import {
  LIVE_STATION_KEY,
  getLiveConfig,
  letterPreviewSvg,
  letterUnchanged,
  mergeContributions,
  normalizeStation,
  persistLivePrefs,
  planRemoteDeskApply,
  pushLiveRoom,
  type LetterClockBase,
} from '@/lib/liveSession'
import { useLiveSession } from '@/lib/useLiveSession'
import { buildStarterBlueprint, nudgeFilled } from '@/lib/skeletons'
import { moduleShapeFillRule, moduleShapePath, shapeSupportsRounding } from '@/lib/shapes'
import type { BrokenJoins } from '@/lib/softness'
import {
  loadMeltOffPresets,
  togglePresetMeltOff,
} from '@/lib/shapeJoinRegistry'
import type { FilledRegion, GlyphDraft, GridConfig, HoleMode, PresetShapeId, ShapeDef } from '@/lib/types'
import { reconcileLibrary, shapeLabel } from '@/lib/types'
import { cn, downloadBlob } from '@/lib/utils'

const HISTORY_MAX = 60
const LETTERS = ALPHABET

interface Snapshot {
  filled: FilledRegion[]
  brokenJoins: string[]
}

function snapshotFilled(m: Map<string, FilledRegion>) {
  return [...m.values()]
}

function restoreFilled(list: FilledRegion[]) {
  return new Map(list.map((r) => [r.key, { ...r }]))
}

const DESK_STATIONS = ['a', 'b'] as const

/** URL ?station= wins, else the station this computer picked before. */
function stationLabel() {
  const fromUrl = normalizeStation(new URLSearchParams(window.location.search).get('station'))
  if (fromUrl) return fromUrl
  try {
    return normalizeStation(localStorage.getItem(LIVE_STATION_KEY)) || null
  } catch {
    return null
  }
}

function rememberStation(next: string) {
  const previous = normalizeStation(getLiveConfig().station)
  if (previous && previous !== next && getLiveConfig().enabled) {
    const at = new Date().toISOString()
    void pushLiveRoom({ desks: { [previous]: { char: '', since: at, seenAt: at } } }).catch(() => {})
  }
  persistLivePrefs({ station: next })
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('station', next)
    window.history.replaceState({}, '', url.pathname + url.search)
  } catch {
    /* ignore */
  }
}

const TOOLS_WIDTH_KEY = 'gridz-studio-tools-width'
const TOOLS_WIDTH_MIN = 240
const TOOLS_WIDTH_MAX = 560
const TOOLS_WIDTH_DEFAULT = 320

function readToolsWidth() {
  try {
    const n = Number(localStorage.getItem(TOOLS_WIDTH_KEY))
    if (Number.isFinite(n) && n >= TOOLS_WIDTH_MIN && n <= TOOLS_WIDTH_MAX) return Math.round(n)
  } catch {
    /* ignore */
  }
  return TOOLS_WIDTH_DEFAULT
}

function clampToolsWidth(n: number) {
  return Math.round(Math.min(TOOLS_WIDTH_MAX, Math.max(TOOLS_WIDTH_MIN, n)))
}

export function StudioDesk() {
  const [station, setStation] = useState(() => stationLabel())
  const [recovery] = useState(() => {
    try {
      return { session: readSession(), error: '' }
    } catch {
      return {
        session: null,
        error: 'Could not restore the saved session. Download a backup before continuing.',
      }
    }
  })
  const restored = recovery.session

  const [toolsWidth, setToolsWidth] = useState(readToolsWidth)
  const [toolsResizing, setToolsResizing] = useState(false)
  const toolsResizeRef = useRef<{ startX: number; startW: number } | null>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [library] = useState<ShapeDef[]>(() => reconcileLibrary(restored?.library))
  const [shapeId, setShapeId] = useState('preset-circle')
  const [grid, setGrid] = useState<GridConfig>(restored?.active.grid ?? DEFAULT_GRID)
  const [filled, setFilled] = useState<Map<string, FilledRegion>>(() =>
    restoreFilled(restored?.active.filled ?? []),
  )
  const [brushSize, setBrushSize] = useState(() => {
    const cell = restored?.active.grid?.cellSize ?? DEFAULT_GRID.cellSize
    return (DEFAULT_BRUSH * cell) / DEFAULT_GRID.cellSize
  })
  const [cornerRadius, setCornerRadius] = useState(restored?.active.cornerRadius ?? 0)
  const [guideLetter, setGuideLetter] = useState(restored?.active.char.toLowerCase() ?? 'a')
  const [guideUpper, setGuideUpper] = useState(
    !!restored && restored.active.char !== restored.active.char.toLowerCase(),
  )
  const [showLetterGuide, setShowLetterGuide] = useState(true)
  const [showGridGuide, setShowGridGuide] = useState(true)
  const [showJoinDots, setShowJoinDots] = useState(false)
  const [invertPreview, setInvertPreview] = useState(false)
  const [softness, setSoftness] = useState(restored?.active.softness ?? 0.55)
  const [brokenJoins, setBrokenJoins] = useState<BrokenJoins>(
    () => new Set(restored?.active.brokenJoins ?? []),
  )
  const [holeMode, setHoleMode] = useState<HoleMode>(restored?.active.holeMode ?? 'open')
  const [paintTool, setPaintTool] = useState<PaintTool>('stamp')
  const [brushRotation, setBrushRotation] = useState(0)
  const [stampMode, setStampMode] = useState<'ink' | 'cutout'>('ink')
  const [symmetryMode, setSymmetryMode] = useState<'none' | 'horizontal' | 'vertical'>('none')
  const [glyphs, setGlyphs] = useState<Map<string, GlyphDraft>>(
    () =>
      new Map(
        restored?.drafts.filter((d) => d.filled.length).map((d) => [d.char, d]) ?? [],
      ),
  )
  const [contributions, setContributions] = useState<Contribution[]>(
    restored?.contributions ?? [],
  )
  const [saveStatus, setSaveStatus] = useState(recovery.error || 'Ready')
  const [notice, setNotice] = useState('Choose a letter, draw, then add it to the typeface.')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [meltOff, setMeltOff] = useState(() => loadMeltOffPresets())
  const [meltOffRevision, setMeltOffRevision] = useState(0)
  /** False right after publishing: the desk stays on the letter but releases it to peers. */
  const [holding, setHolding] = useState(true)

  const displayGuideLetter = guideUpper ? guideLetter.toUpperCase() : guideLetter
  const activeShape = library.find((s) => s.id === shapeId) ?? library[0]
  const activePreset = activeShape.kind === 'preset' ? activeShape.preset : null
  const activeMeltOff = activePreset ? meltOff.has(activePreset) : false
  const canRound = shapeSupportsRounding(activeShape)
  const fillMin = Math.max(4, Math.round(grid.cellSize * 0.4))
  const fillMax = Math.max(Math.round(grid.cellSize * 1.6), Math.round(grid.cellSize * 2))
  const cornerMax = Math.max(4, Math.round(grid.cellSize * 0.45))

  const settingsRef = useRef({ grid, softness, cornerRadius, holeMode })
  settingsRef.current = { grid, softness, cornerRadius, holeMode }
  const letterRef = useRef(displayGuideLetter)
  letterRef.current = displayGuideLetter
  const filledRef = useRef(filled)
  filledRef.current = filled
  const brokenRef = useRef(brokenJoins)
  brokenRef.current = brokenJoins
  const glyphsRef = useRef(glyphs)
  glyphsRef.current = glyphs
  /** Per-letter draftUpdatedAt we last accepted (local paint or remote apply). */
  const draftTimesRef = useRef<Record<string, string>>({ ...(restored?.draftUpdatedAt ?? {}) })
  /** Open-letter state its clock was last stamped, loaded or adopted with (starts as the restored letter). */
  const clockBaseRef = useRef<LetterClockBase | null>({
    char: displayGuideLetter,
    filled,
    brokenJoins,
    grid,
    softness,
    cornerRadius,
    holeMode,
  })
  const applyingRemoteRef = useRef(false)
  const contributionsRef = useRef(contributions)
  contributionsRef.current = contributions
  const sessionRef = useRef<FestivalSession | null>(restored)
  const past = useRef<Snapshot[]>([])
  const future = useRef<Snapshot[]>([])
  const strokeStarted = useRef(false)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.title = station
      ? `Studio ${station.toUpperCase()} · grid workshop`
      : 'Studio desk · grid workshop'
    document.documentElement.classList.add('install-view')
    document.body.classList.add('install-view')
    return () => {
      document.documentElement.classList.remove('install-view')
      document.body.classList.remove('install-view')
    }
  }, [station])

  const onToolsResizePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    toolsResizeRef.current = { startX: e.clientX, startW: toolsWidth }
    setToolsResizing(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [toolsWidth])

  const onToolsResizePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = toolsResizeRef.current
    if (!drag) return
    // Handle sits on the left edge of the tools rail: drag left → wider.
    setToolsWidth(clampToolsWidth(drag.startW + (drag.startX - e.clientX)))
  }, [])

  const endToolsResize = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!toolsResizeRef.current) return
    toolsResizeRef.current = null
    setToolsResizing(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    setToolsWidth((w) => {
      try {
        localStorage.setItem(TOOLS_WIDTH_KEY, String(w))
      } catch {
        /* ignore */
      }
      return w
    })
  }, [])

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(past.current.length > 0)
    setCanRedo(future.current.length > 0)
  }, [])

  const resetUndo = useCallback(() => {
    past.current = []
    future.current = []
    strokeStarted.current = false
    syncHistoryFlags()
  }, [syncHistoryFlags])

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

  const loadDraft = useCallback(
    (store: Map<string, GlyphDraft>, ch: string) => {
      const slot = store.get(ch)
      const nextFilled: Map<string, FilledRegion> = slot ? restoreFilled(slot.filled) : new Map()
      const nextJoins = new Set(slot?.brokenJoins ?? [])
      setFilled(nextFilled)
      setBrokenJoins(nextJoins)
      // Opening a letter is not an edit: it keeps its clock until this desk changes it.
      clockBaseRef.current = {
        char: ch,
        filled: nextFilled,
        brokenJoins: nextJoins,
        grid: slot?.grid ?? settingsRef.current.grid,
        softness: slot?.softness ?? 0.55,
        cornerRadius: slot?.cornerRadius ?? 0,
        holeMode: slot?.holeMode ?? 'open',
      }
      // Each letter keeps its own lattice; empty letters inherit the desk's current grid.
      const prevCell = settingsRef.current.grid.cellSize
      if (slot?.grid) {
        setGrid(slot.grid)
        if (slot.grid.cellSize !== prevCell) {
          setBrushSize((b) => Math.round(b * (slot.grid!.cellSize / prevCell) * 10) / 10)
        }
      }
      setSoftness(slot?.softness ?? 0.55)
      setCornerRadius(slot?.cornerRadius ?? 0)
      setHoleMode(slot?.holeMode ?? 'open')
      resetUndo()
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
      setHolding(true)
      loadDraft(glyphsRef.current, nextChar)
    },
    [persistCurrent, loadDraft],
  )

  const makePayload = useCallback(
    (char: string, regions: FilledRegion[], joins: Iterable<string>): ExportPayload => ({
      grid: char === displayGuideLetter ? grid : (glyphs.get(char)?.grid ?? grid),
      library,
      filledRegions: regions,
      glyphChar: char,
      softness: char === displayGuideLetter ? softness : (glyphs.get(char)?.softness ?? softness),
      cornerRadius:
        char === displayGuideLetter
          ? cornerRadius
          : (glyphs.get(char)?.cornerRadius ?? cornerRadius),
      brokenJoins: new Set(joins),
      holeMode: char === displayGuideLetter ? holeMode : (glyphs.get(char)?.holeMode ?? holeMode),
    }),
    [grid, library, softness, cornerRadius, holeMode, displayGuideLetter, glyphs],
  )

  const activeDraft: GlyphDraft = {
    char: displayGuideLetter,
    filled: snapshotFilled(filled),
    brokenJoins: [...brokenJoins],
    grid,
    softness,
    cornerRadius,
    holeMode,
  }
  const activeRef = useRef(activeDraft)
  activeRef.current = activeDraft

  const writeSession = useCallback(() => {
    const active = activeRef.current
    const drafts = new Map(glyphsRef.current)
    drafts.set(active.char, active)
    const updatedAt = new Date().toISOString()
    const state: LetterClockBase = {
      char: active.char,
      filled: filledRef.current,
      brokenJoins: brokenRef.current,
      ...settingsRef.current,
    }
    // Remote updates re-render this desk too; only an edit made here may move the letter clock.
    if (!draftTimesRef.current[active.char] || !letterUnchanged(clockBaseRef.current, state)) {
      draftTimesRef.current[active.char] = updatedAt
    }
    clockBaseRef.current = state
    const session: FestivalSession = {
      version: 1,
      updatedAt,
      active,
      drafts: [...drafts.values()].filter((d) => d.filled.length),
      contributions: contributionsRef.current,
      library,
      liveSvg: compactSvgMarkup(
        buildSvgMarkup(
          {
            ...active,
            grid: active.grid!,
            softness: active.softness!,
            library,
            filledRegions: active.filled,
            glyphChar: active.char,
            brokenJoins: new Set(active.brokenJoins),
          },
          { fitContent: false },
        ),
      ),
      draftUpdatedAt: { ...draftTimesRef.current },
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
    activeChar: displayGuideLetter,
    holding,
    getSession: () => {
      const s = sessionRef.current
      if (!s) return null
      // Prefer live refs so empty-room polls do not persist a stale empty canvas.
      return {
        ...s,
        active: activeRef.current,
        contributions: contributionsRef.current,
        drafts: [...glyphsRef.current.values()].filter((d) => d.filled.length),
      }
    },
    painting: () => strokeStarted.current,
    onRemoteSession: (session, liveRoom, meta) => {
      const plan = planRemoteDeskApply({
        session,
        liveRoom,
        meta,
        localContributions: contributionsRef.current,
        localGlyphs: glyphsRef.current,
        draftTimes: draftTimesRef.current,
        activeChar: letterRef.current,
        painting: strokeStarted.current,
        activeFilledCount: filledRef.current.size,
        currentLiveSvg: sessionRef.current?.liveSvg ?? session.liveSvg,
      })

      if (plan.kind === 'wipe') {
        applyingRemoteRef.current = true
        draftTimesRef.current = {}
        const empty = new Map<string, FilledRegion>()
        const noJoins = new Set<string>()
        const noGlyphs = new Map()
        filledRef.current = empty
        brokenRef.current = noJoins
        glyphsRef.current = noGlyphs
        contributionsRef.current = []
        clockBaseRef.current = {
          char: letterRef.current,
          filled: empty,
          brokenJoins: noJoins,
          ...settingsRef.current,
        }
        setFilled(empty)
        setBrokenJoins(noJoins)
        setGlyphs(noGlyphs)
        setContributions([])
        past.current = []
        future.current = []
        syncHistoryFlags()
        activeRef.current = { ...activeRef.current, filled: [], brokenJoins: [] }
        sessionRef.current = {
          ...session,
          active: activeRef.current,
          contributions: [],
          drafts: [],
          liveSvg: '',
          draftUpdatedAt: {},
        }
        try {
          localStorage.setItem(FESTIVAL_KEY, JSON.stringify(sessionRef.current))
        } catch {
          /* ignore */
        }
        return
      }

      draftTimesRef.current = plan.draftTimes
      contributionsRef.current = plan.contributions
      setContributions(plan.contributions)
      glyphsRef.current = plan.glyphs
      setGlyphs(plan.glyphs)

      if (plan.activeChange.type === 'clear') {
        applyingRemoteRef.current = true
        const empty = new Map<string, FilledRegion>()
        const noJoins = new Set<string>()
        filledRef.current = empty
        brokenRef.current = noJoins
        clockBaseRef.current = {
          char: letterRef.current,
          filled: empty,
          brokenJoins: noJoins,
          ...settingsRef.current,
        }
        setFilled(empty)
        setBrokenJoins(noJoins)
        activeRef.current = { ...activeRef.current, filled: [], brokenJoins: [] }
      } else if (plan.activeChange.type === 'apply') {
        applyingRemoteRef.current = true
        const draft = plan.activeChange.draft
        const nextFilled = restoreFilled(draft.filled)
        const nextJoins = new Set(draft.brokenJoins)
        filledRef.current = nextFilled
        brokenRef.current = nextJoins
        const current = settingsRef.current
        clockBaseRef.current = {
          char: letterRef.current,
          filled: nextFilled,
          brokenJoins: nextJoins,
          grid: draft.grid ?? current.grid,
          softness: typeof draft.softness === 'number' ? draft.softness : current.softness,
          cornerRadius:
            typeof draft.cornerRadius === 'number' ? draft.cornerRadius : current.cornerRadius,
          holeMode: draft.holeMode ?? current.holeMode,
        }
        setFilled(nextFilled)
        setBrokenJoins(nextJoins)
        if (draft.grid) setGrid(draft.grid)
        if (typeof draft.softness === 'number') setSoftness(draft.softness)
        if (typeof draft.cornerRadius === 'number') setCornerRadius(draft.cornerRadius)
        if (draft.holeMode) setHoleMode(draft.holeMode)
        past.current = []
        future.current = []
        syncHistoryFlags()
      } else if (plan.applyingRemote) {
        applyingRemoteRef.current = true
      }

      sessionRef.current = {
        ...session,
        active: activeRef.current,
        contributions: plan.contributions,
        drafts: [...plan.glyphs.values()].filter((d) => d.filled.length),
        liveSvg: plan.liveSvg,
        draftUpdatedAt: { ...plan.draftTimes },
      }
      try {
        localStorage.setItem(FESTIVAL_KEY, JSON.stringify(sessionRef.current))
      } catch {
        /* ignore */
      }
    },
  })
  const pushLive = live.pushSession

  useEffect(() => {
    if (recovery.error) return
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false
      return
    }
    const timer = window.setTimeout(() => {
      pushLive(writeSession())
    }, 250)
    return () => {
      window.clearTimeout(timer)
    }
  }, [
    filled,
    brokenJoins,
    grid,
    softness,
    cornerRadius,
    holeMode,
    displayGuideLetter,
    glyphs,
    contributions,
    writeSession,
    pushLive,
    recovery.error,
  ])

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
      setHolding(true)
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
    activeRef.current = { ...activeRef.current, filled: [], brokenJoins: [] }
    // Flush clear immediately so peers + wall drop the letter without debounce lag.
    pushLive(writeSession(), { immediate: true })
  }

  const nudge = useCallback(
    (deltaCol: number, deltaRow: number) => {
      if (filled.size === 0) return
      pushHistory()
      setFilled((prev) => nudgeFilled(prev, deltaCol, deltaRow, grid))
    },
    [filled.size, grid, pushHistory],
  )

  const loadBlueprint = () => {
    const blueprint = buildStarterBlueprint(displayGuideLetter, grid, shapeId, brushSize)
    if (blueprint.size === 0) {
      setNotice(`No starter blueprint for "${displayGuideLetter}".`)
      return
    }
    pushHistory()
    setFilled(blueprint)
    setNotice(`Loaded blueprint for "${displayGuideLetter}".`)
  }

  const publishGlyph = () => {
    if (!filled.size) return
    persistCurrent()
    // Snapshot so Clear letter cannot empty the published entry via a shared object.
    const source = activeRef.current
    const draft: GlyphDraft = {
      ...source,
      filled: source.filled.map((region) => ({ ...region })),
      brokenJoins: [...source.brokenJoins],
      grid: source.grid ? { ...source.grid } : source.grid,
    }
    const contribution: Contribution = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      draft,
      svg: compactSvgMarkup(
        buildSvgMarkup(makePayload(draft.char, draft.filled, draft.brokenJoins), {
          fitContent: false,
        }),
      ),
    }
    const next = [...contributionsRef.current, contribution]
    contributionsRef.current = next
    setContributions(next)
    pushLive(writeSession(), { immediate: true })
    setHolding(false)
    setNotice(`${draft.char} added to our typeface. Choose another letter.`)
  }

  // Alphabet / next letter: include publishes from the shared room (same as the wall).
  const typefaceContributions = mergeContributions(
    contributions,
    live.liveRoom?.contributions ?? [],
  )
  const published = latestContributions(typefaceContributions)

  const nextFreeLetter = () => {
    setPaintTool('stamp')
    setStampMode('ink')
    setBrushRotation(0)
    setSymmetryMode('none')
    const next = LETTERS.find((char) => {
      const shown = guideUpper ? char.toUpperCase() : char
      return !published.has(shown) && char !== guideLetter
    })
    if (next) {
      switchToLetter(next, guideUpper)
      setNotice(
        `Your letter is ${guideUpper ? next.toUpperCase() : next}. Draw it, then add it to the typeface.`,
      )
    } else {
      setNotice('Every letter has a contribution. Choose one to create another version.')
    }
  }

  const backupSession = () => {
    if (recovery.error) {
      downloadBlob(
        new Blob([localStorage.getItem(FESTIVAL_KEY) ?? ''], { type: 'application/json' }),
        'workshop-recovery.json',
      )
      return
    }
    const session = writeSession()
    downloadBlob(
      new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' }),
      `lettermans-typeface-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    )
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

  const saveFailed = !!recovery.error || saveStatus.startsWith('Saving failed')

  return (
    <div className="studio-desk" data-testid="studio-desk">
      <header className="studio-top">
        <div className="studio-brand">
          <p>Studio desk{station ? ` · ${station.toUpperCase()}` : ''}</p>
          <strong>Drawing {displayGuideLetter}</strong>
        </div>
        <p className={cn('studio-notice', saveFailed && 'is-error')} role="status">
          {saveFailed ? saveStatus : notice}
        </p>
        <div className="studio-actions">
          <button
            type="button"
            data-testid="studio-publish"
            disabled={!filled.size}
            onClick={publishGlyph}
          >
            Add {displayGuideLetter} to the typeface
          </button>
          <button type="button" data-testid="studio-next" onClick={nextFreeLetter}>
            Next free letter →
          </button>
          <button
            type="button"
            className="studio-gear"
            data-testid="studio-options"
            aria-label="Facilitator options"
            onClick={() => setOptionsOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div
        className={cn('studio-body', toolsResizing && 'is-resizing')}
        style={{ ['--studio-tools-w' as string]: `${toolsWidth}px` }}
      >
        <section className="studio-canvas-pane" aria-label="Paint canvas">
          <div className="studio-canvas-wrap">
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
              letterScale={1}
              guideOpacity={0.85}
              softness={softness}
              brokenJoins={brokenJoins}
              onBrokenJoinsChange={changeBrokenJoins}
              paintTool={paintTool}
              invertPreview={invertPreview}
              showJoinDots={showJoinDots || paintTool === 'break-join'}
              showGridGuide={showGridGuide}
              gridGuideOpacity={0.7}
              holeMode={holeMode}
              meltOffRevision={meltOffRevision}
            />
          </div>
        </section>

        <aside className="studio-toolbar" data-testid="studio-toolbar" aria-label="Paint tools">
          <div
            className={cn('studio-resize', toolsResizing && 'is-dragging')}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize tools"
            aria-valuemin={TOOLS_WIDTH_MIN}
            aria-valuemax={TOOLS_WIDTH_MAX}
            aria-valuenow={toolsWidth}
            title="Drag to resize"
            onPointerDown={onToolsResizePointerDown}
            onPointerMove={onToolsResizePointerMove}
            onPointerUp={endToolsResize}
            onPointerCancel={endToolsResize}
          />
          <div className="studio-tool-group">
            <p className="studio-tool-label">Draw</p>
            <div className="studio-seg" role="group" aria-label="Paint mode">
              <ToolBtn
                label="Draw"
                active={paintTool === 'stamp'}
                onClick={() => setPaintTool('stamp')}
                icon={<Paintbrush className="h-4 w-4" />}
                caption="Draw"
              />
              <ToolBtn
                label="Erase"
                active={paintTool === 'erase'}
                onClick={() => setPaintTool('erase')}
                icon={<Eraser className="h-4 w-4" />}
                caption="Erase"
              />
              <ToolBtn
                label="Split joins"
                active={paintTool === 'break-join'}
                onClick={() => {
                  setPaintTool('break-join')
                  setShowJoinDots(true)
                }}
                icon={<Split className="h-4 w-4" />}
                caption="Split"
              />
            </div>
            <div className="studio-tool-grid">
              <ToolBtn
                label="Undo"
                testId="studio-undo"
                disabled={!canUndo}
                onClick={undo}
                icon={<Undo2 className="h-4 w-4" />}
                caption="Undo"
              />
              <ToolBtn
                label="Redo"
                disabled={!canRedo}
                onClick={redo}
                icon={<Redo2 className="h-4 w-4" />}
                caption="Redo"
              />
              <ToolBtn
                label="Clear letter"
                testId="studio-clear"
                disabled={!filled.size}
                onClick={clearCanvas}
                icon={<Trash2 className="h-4 w-4" />}
                caption="Clear"
              />
              <ToolBtn
                label="Load starter outline"
                onClick={loadBlueprint}
                icon={<Wand2 className="h-4 w-4" />}
                caption="Starter"
              />
            </div>
          </div>

          <div className="studio-tool-group">
            <p className="studio-tool-label">Show</p>
            <div className="studio-tool-grid">
              <ToolBtn
                label={showLetterGuide ? 'Hide letter guide' : 'Show letter guide'}
                active={showLetterGuide}
                onClick={() => setShowLetterGuide((v) => !v)}
                icon={showLetterGuide ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                caption="Letter"
              />
              <ToolBtn
                label={showGridGuide ? 'Hide grid guide' : 'Show grid guide'}
                active={showGridGuide}
                onClick={() => setShowGridGuide((v) => !v)}
                icon={<CircleDot className="h-4 w-4" />}
                caption="Guide"
              />
              <ToolBtn
                label={invertPreview ? 'Normal preview' : 'Invert preview'}
                active={invertPreview}
                onClick={() => setInvertPreview((v) => !v)}
                icon={<Contrast className="h-4 w-4" />}
                caption="Invert"
              />
              <ToolBtn
                label={showJoinDots ? 'Hide join dots' : 'Show join dots'}
                active={showJoinDots}
                onClick={() => setShowJoinDots((v) => !v)}
                icon={<Split className="h-4 w-4" />}
                caption="Joins"
              />
            </div>
          </div>

          <div className="studio-tool-group">
            <p className="studio-tool-label">Mode</p>
            <div className="studio-tool-grid">
              <ToolBtn
                label={stampMode === 'cutout' ? 'Cut holes' : 'Solid ink'}
                testId="studio-stamp-mode"
                active={stampMode === 'cutout'}
                onClick={() => setStampMode((m) => (m === 'ink' ? 'cutout' : 'ink'))}
                icon={<Scissors className="h-4 w-4" />}
                caption={stampMode === 'cutout' ? 'Cut' : 'Ink'}
              />
              <ToolBtn
                label={`Rotate brush ${brushRotation}°`}
                onClick={() => setBrushRotation((r) => (r + 90) % 360)}
                icon={<RotateCw className="h-4 w-4" />}
                caption={`Turn ${brushRotation}°`}
              />
              <button
                type="button"
                className={cn('studio-chip', symmetryMode !== 'none' && 'is-on')}
                title="Mirror mode"
                onClick={() =>
                  setSymmetryMode((m) =>
                    m === 'none' ? 'horizontal' : m === 'horizontal' ? 'vertical' : 'none',
                  )
                }
              >
                <Columns2 className="h-3.5 w-3.5" />
                Mirror{' '}
                {symmetryMode === 'none' ? 'off' : symmetryMode === 'horizontal' ? 'H' : 'V'}
              </button>
              <button
                type="button"
                className={cn('studio-chip', holeMode !== 'open' && 'is-on')}
                title="Gaps / holes"
                onClick={() =>
                  setHoleMode((m) => (m === 'open' ? 'no-gaps' : m === 'no-gaps' ? 'solid' : 'open'))
                }
              >
                <CircleDot className="h-3.5 w-3.5" />
                Gaps{' '}
                {holeMode === 'open' ? 'open' : holeMode === 'no-gaps' ? 'fill' : 'solid'}
              </button>
              <button
                type="button"
                className={cn('studio-chip', guideUpper && 'is-on')}
                title="Uppercase / lowercase"
                onClick={() => switchToLetter(guideLetter, !guideUpper)}
              >
                {guideUpper ? 'ABC' : 'abc'}
              </button>
              <div className="studio-nudge" role="group" aria-label="Move letter">
                <ToolBtn
                  label="Move left"
                  disabled={!filled.size}
                  onClick={() => nudge(-1, 0)}
                  icon={<ArrowLeft className="h-3.5 w-3.5" />}
                />
                <ToolBtn
                  label="Move right"
                  disabled={!filled.size}
                  onClick={() => nudge(1, 0)}
                  icon={<ArrowRight className="h-3.5 w-3.5" />}
                />
                <ToolBtn
                  label="Move up"
                  disabled={!filled.size}
                  onClick={() => nudge(0, -1)}
                  icon={<ArrowUp className="h-3.5 w-3.5" />}
                />
                <ToolBtn
                  label="Move down"
                  disabled={!filled.size}
                  onClick={() => nudge(0, 1)}
                  icon={<ArrowDown className="h-3.5 w-3.5" />}
                />
              </div>
            </div>
          </div>

          <div className="studio-tool-group">
            <p className="studio-tool-label">Look</p>
            <div className="studio-softness">
              <label>
                Softness · {Math.round(softness * 100)}%
                <input
                  type="range"
                  data-testid="studio-softness"
                  min={0}
                  max={1}
                  step={0.01}
                  value={softness}
                  onChange={(e) => setSoftness(Number(e.target.value))}
                />
              </label>
              <div className="studio-soft-presets">
                {[
                  { label: 'Crisp', val: 0 },
                  { label: 'Melt', val: 0.55 },
                  { label: 'Max', val: 1 },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={cn(Math.abs(softness - p.val) < 0.04 && 'is-on')}
                    onClick={() => setSoftness(p.val)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {activePreset ? (
                <button
                  type="button"
                  className={cn('studio-chip', activeMeltOff && 'is-on')}
                  title={
                    activeMeltOff
                      ? `${shapeLabel(activeShape)} never grows a Softness melt`
                      : `Turn off Softness melt for ${shapeLabel(activeShape)}`
                  }
                  aria-pressed={activeMeltOff}
                  data-testid="studio-melt-off"
                  onClick={() => {
                    const next = togglePresetMeltOff(activePreset)
                    setMeltOff(new Set(next))
                    setMeltOffRevision((n) => n + 1)
                  }}
                >
                  {activeMeltOff
                    ? `No melt · ${shapeLabel(activeShape)}`
                    : `Melt on · ${shapeLabel(activeShape)}`}
                </button>
              ) : null}
              <label className="studio-inline-slider">
                Size · {Math.round(brushSize)}px
                <input
                  type="range"
                  min={fillMin}
                  max={fillMax}
                  step={1}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                />
              </label>
              {canRound ? (
                <label className="studio-inline-slider">
                  Corners · {Math.round(cornerRadius)}
                  <input
                    type="range"
                    min={0}
                    max={cornerMax}
                    step={0.5}
                    value={cornerRadius}
                    onChange={(e) => setCornerRadius(Number(e.target.value))}
                  />
                </label>
              ) : null}
            </div>
          </div>

          <div className="studio-tool-group">
            <p className="studio-tool-label">Shape</p>
            <div className="studio-shapes" aria-label="Brush shapes">
              {library.map((s) => {
                const d = moduleShapePath(
                  s,
                  6,
                  6,
                  28,
                  cornerRadius,
                  s.id === shapeId ? brushRotation : 0,
                )
                const preset = s.kind === 'preset' ? (s.preset as PresetShapeId) : null
                const noMelt = preset ? meltOff.has(preset) : false
                return (
                  <button
                    key={s.id}
                    type="button"
                    title={noMelt ? `${shapeLabel(s)} · melt off` : shapeLabel(s)}
                    aria-label={`Brush ${shapeLabel(s)}${noMelt ? ', melt off' : ''}`}
                    aria-pressed={shapeId === s.id}
                    className={cn(shapeId === s.id && 'is-on', noMelt && 'is-melt-off')}
                    onClick={() => setShapeId(s.id)}
                  >
                    <svg viewBox="0 0 40 40" aria-hidden>
                      <path d={d} fill="currentColor" fillRule={moduleShapeFillRule(s)} />
                    </svg>
                  </button>
                )
              })}
            </div>
          </div>
        </aside>

        <aside className="studio-alphabet" aria-label="Shared alphabet">
          <p className="studio-alphabet-title">Alphabet</p>
          <div className="studio-alphabet-grid">
            {LETTERS.map((base) => {
              const shown = guideUpper ? base.toUpperCase() : base
              const isActive = shown === displayGuideLetter
              const contribution = published.get(shown)
              const draft = glyphs.get(shown)
              const hasDraft = !!(draft && draft.filled.length)
              const preview = letterPreviewSvg(shown, typefaceContributions, live.draftSvgs)
              const previewSvg =
                contribution?.svg ||
                (isActive && filled.size
                  ? null
                  : preview.kind !== 'empty' && preview.kind !== 'published'
                    ? preview.svg
                    : null)
              return (
                <button
                  key={shown}
                  type="button"
                  data-testid={`studio-glyph-${shown}`}
                  className={cn(
                    'studio-letter',
                    isActive && 'is-active',
                    contribution && 'is-published',
                    !contribution && (hasDraft || preview.kind === 'draft' || preview.kind === 'live') && 'is-draft',
                  )}
                  onClick={() => switchToLetter(base, guideUpper)}
                >
                  {contribution ? (
                    <img src={svgImage(contribution.svg)} alt="" />
                  ) : previewSvg ? (
                    <img src={svgImage(previewSvg)} alt="" />
                  ) : hasDraft ? (
                    <span className="studio-letter-dot" aria-hidden />
                  ) : null}
                  <small>{shown}</small>
                </button>
              )
            })}
          </div>
          <p className="studio-alphabet-legend">
            <span className="is-published">Published</span>
            <span className="is-draft">Draft</span>
            <span className="is-active">Active</span>
          </p>
        </aside>
      </div>

      {optionsOpen && (
        <div className="studio-options" role="dialog" aria-label="Facilitator options">
          <div className="studio-options-panel">
            <div className="studio-adjust-head">
              <h2>Facilitator</h2>
              <button type="button" aria-label="Close options" onClick={() => setOptionsOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className={cn('studio-save', saveFailed && 'is-error')}>{saveStatus}</p>
            <div className="studio-desk-pick" role="group" aria-label="This desk">
              <span>This desk</span>
              {DESK_STATIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={cn('studio-chip', station === s && 'is-on')}
                  aria-pressed={station === s}
                  data-testid={`studio-station-${s}`}
                  onClick={() => {
                    rememberStation(s)
                    setStation(s)
                  }}
                >
                  Desk {s.toUpperCase()}
                </button>
              ))}
            </div>
            <LiveSessionJoin
              room={live.room}
              enabled={live.enabled}
              joined={live.joined}
              statusMessage={live.status.message}
              onJoin={live.joinSession}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void live.copyWallLink('projection')}
            >
              Copy projection link
            </Button>
            <a className="studio-link" href="?view=projection&room=boom" target="_blank" rel="noreferrer">
              Projection ↗
            </a>
            <a className="studio-link" href="?view=workshop" target="_blank" rel="noreferrer">
              Full workshop (Shape / Paint / Export) ↗
            </a>
            <Button type="button" variant="outline" className="w-full" onClick={backupSession}>
              Editable backup
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => importRef.current?.click()}
            >
              Restore backup
            </Button>
            <ClearRoomControl
              className="studio-clear-room"
              enabled={live.enabled}
              onClear={live.clearRoom}
            />
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void restoreSession(file)
                e.target.value = ''
              }}
            />
            <p className="studio-options-note">
              {live.enabled
                ? 'Desks and the projection join boom — tap boom to join. Each desk owns its letter until it publishes or moves on.'
                : 'Shared session is not configured on this build.'}
            </p>
          </div>
          <button
            type="button"
            className="studio-options-backdrop"
            aria-label="Dismiss"
            onClick={() => setOptionsOpen(false)}
          />
        </div>
      )}

      {!station && live.enabled && (
        <div className="studio-options" role="dialog" aria-label="Choose desk" data-testid="studio-station-picker">
          <div className="studio-options-panel studio-station-panel">
            <h2>Which desk is this?</h2>
            <p>The wall shows each desk side by side. Pick once; this computer remembers it.</p>
            <div className="studio-station-choices">
              {DESK_STATIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`studio-station-pick-${s}`}
                  onClick={() => {
                    rememberStation(s)
                    setStation(s)
                  }}
                >
                  Desk {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ToolBtn({
  label,
  icon,
  onClick,
  disabled,
  active,
  caption,
  testId,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  active?: boolean
  caption?: string
  testId?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'studio-tool',
        caption && 'has-caption',
        active && 'is-on',
        disabled && 'is-disabled',
      )}
    >
      {icon}
      {caption ? <span>{caption}</span> : null}
    </button>
  )
}
