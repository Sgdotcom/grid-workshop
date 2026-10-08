/**
 * Cloudflare Worker live room — shared drafts, contributions, and wall cue.
 * When VITE_LIVE_SESSION_URL is unset, all helpers no-op (local-only).
 */
import { DEFAULT_GRID } from '@/lib/gridGeometry'
import {
  FESTIVAL_KEY,
  type Contribution,
  type FestivalSession,
  parseSession,
  readSession,
} from '@/lib/festival'
import { PRESET_SHAPES, type GlyphDraft } from '@/lib/types'

export const LIVE_ROOM_KEY = 'gridz-live-room'
export const LIVE_TOKEN_KEY = 'gridz-live-token'
export const LIVE_STATION_KEY = 'gridz-live-station'
export const LIVE_JOINED_KEY = 'gridz-live-joined'
/** Two independent festival sessions — each has its own Worker Durable Object. */
export const FESTIVAL_LIVE_ROOMS = ['boom', 'bobby'] as const
export const DEFAULT_LIVE_ROOM = 'boom'

export interface LiveCue {
  char: string
  station?: string
  liveSvg: string
  updatedAt: string
}

export interface LiveRoomState {
  updatedAt: string
  /** Bumps on DELETE; clients echo this so stale pre-clear PUTs are ignored. */
  wipeEpoch?: number
  contributions: Contribution[]
  drafts: GlyphDraft[]
  draftSvgs: Record<string, string>
  draftUpdatedAt: Record<string, string>
  /** Per-desk live previews keyed by station (a / b). */
  liveCues?: Record<string, LiveCue>
  /** Newest cue (compat); prefer liveCues on the wall. */
  liveCue?: LiveCue
}

export interface LiveSessionConfig {
  enabled: boolean
  baseUrl: string
  room: string
  token: string
  station: string
}

export type LiveSyncStatus = {
  state: 'off' | 'idle' | 'syncing' | 'ok' | 'error'
  message: string
  lastPullAt?: string
  lastPushAt?: string
}

function trimSlash(url: string) {
  return url.replace(/\/+$/, '')
}

export function getLiveConfig(): LiveSessionConfig {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const envUrl =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_LIVE_SESSION_URL
      ? String(import.meta.env.VITE_LIVE_SESSION_URL).trim()
      : ''
  // Optional baked token for locked rooms; festival install leaves Worker open (no secret).
  const envToken =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_LIVE_WRITE_TOKEN
      ? String(import.meta.env.VITE_LIVE_WRITE_TOKEN).trim()
      : ''
  let storedRoom = DEFAULT_LIVE_ROOM
  let storedToken = ''
  let storedStation = ''
  try {
    storedRoom = localStorage.getItem(LIVE_ROOM_KEY) || DEFAULT_LIVE_ROOM
    storedToken = localStorage.getItem(LIVE_TOKEN_KEY) || ''
    storedStation = localStorage.getItem(LIVE_STATION_KEY) || ''
  } catch {
    /* ignore */
  }
  const room = (params?.get('room') || storedRoom || DEFAULT_LIVE_ROOM).slice(0, 64)
  const token = params?.get('token') || storedToken || envToken
  const station = (params?.get('station') || storedStation || '').slice(0, 8)
  return {
    enabled: !!envUrl,
    baseUrl: envUrl ? trimSlash(envUrl) : '',
    room: room.replace(/[^a-zA-Z0-9_-]/g, '') || DEFAULT_LIVE_ROOM,
    token,
    station,
  }
}

/** Festival default: auto-join when live URL is configured (or ?room= is present). */
export function isLiveJoined(): boolean {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  if (params?.has('room')) return true
  try {
    const raw = localStorage.getItem(LIVE_JOINED_KEY)
    if (raw === '0' || raw === 'false') return false
    if (raw === '1' || raw === 'true') return true
  } catch {
    /* ignore */
  }
  return getLiveConfig().enabled
}

export function persistLivePrefs(partial: {
  room?: string
  token?: string
  station?: string
  joined?: boolean
}) {
  try {
    if (partial.room !== undefined) {
      const clean = partial.room.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || DEFAULT_LIVE_ROOM
      localStorage.setItem(LIVE_ROOM_KEY, clean)
    }
    if (partial.token !== undefined) {
      if (partial.token) localStorage.setItem(LIVE_TOKEN_KEY, partial.token)
      else localStorage.removeItem(LIVE_TOKEN_KEY)
    }
    if (partial.station !== undefined) {
      if (partial.station) localStorage.setItem(LIVE_STATION_KEY, partial.station.slice(0, 8))
      else localStorage.removeItem(LIVE_STATION_KEY)
    }
    if (partial.joined !== undefined) {
      localStorage.setItem(LIVE_JOINED_KEY, partial.joined ? '1' : '0')
    }
  } catch {
    /* ignore */
  }
}

export function wallLink(view: 'wall' | 'projection' | 'studio' = 'wall'): string {
  const { room } = getLiveConfig()
  const url = new URL(window.location.href)
  url.search = ''
  url.searchParams.set('view', view)
  url.searchParams.set('room', room)
  return url.pathname + url.search
}

async function request(
  method: 'GET' | 'PUT' | 'DELETE',
  config: LiveSessionConfig,
  body?: unknown,
): Promise<LiveRoomState> {
  if (!config.enabled) throw new Error('Live session URL is not configured')
  const url = new URL(`${config.baseUrl}/rooms/${encodeURIComponent(config.room)}`)
  if (config.token && method !== 'GET') url.searchParams.set('token', config.token)
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    if (config.token) headers.Authorization = `Bearer ${config.token}`
  }
  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Live session ${method} failed (${response.status})`)
  }
  return (await response.json()) as LiveRoomState
}

export async function pullLiveRoom(config = getLiveConfig()): Promise<LiveRoomState | null> {
  if (!config.enabled) return null
  return request('GET', config)
}

export async function pushLiveRoom(
  payload: Partial<LiveRoomState>,
  config = getLiveConfig(),
): Promise<LiveRoomState | null> {
  if (!config.enabled) return null
  return request('PUT', config, payload)
}

export async function clearLiveRoom(config = getLiveConfig()): Promise<LiveRoomState | null> {
  if (!config.enabled) return null
  return request('DELETE', config)
}

/**
 * Push only this desk's active letter + full contribution list.
 * Avoids last-writer stomping the other desk's drafts for letters they own.
 * Empty active letter sends a clear (empty draftSvg + empty liveCue) so wall/peers drop it.
 */
export function buildLivePayload(
  session: FestivalSession,
  opts?: { station?: string; wipeEpoch?: number },
): Partial<LiveRoomState> {
  const now = session.updatedAt || new Date().toISOString()
  const ch = session.active.char
  const activeDraft =
    session.drafts.find((d) => d.char === ch) ??
    (session.active.filled.length ? session.active : null)
  const hasInk = !!(activeDraft && activeDraft.filled.length)
  const stationRaw = (opts?.station ?? getLiveConfig().station ?? 'desk').slice(0, 8)
  const station = stationRaw.replace(/[^a-zA-Z0-9_-]/g, '') || 'desk'
  const draftSvgs: Record<string, string> = {}
  const draftUpdatedAt: Record<string, string> = { [ch]: now }
  if (hasInk && session.liveSvg) {
    draftSvgs[ch] = session.liveSvg
  } else if (!hasInk) {
    // Tombstone: Worker deletes this char's draft preview.
    draftSvgs[ch] = ''
  }
  const payload: Partial<LiveRoomState> = {
    updatedAt: now,
    wipeEpoch: typeof opts?.wipeEpoch === 'number' ? opts.wipeEpoch : 0,
    contributions: session.contributions,
    drafts: hasInk && activeDraft
      ? [activeDraft]
      : [
          {
            char: ch,
            filled: [],
            brokenJoins: [],
            grid: session.active.grid,
            softness: session.active.softness,
            cornerRadius: session.active.cornerRadius,
            holeMode: session.active.holeMode,
          },
        ],
    draftSvgs,
    draftUpdatedAt,
  }
  // Only tombstone live cues when the letter is actually empty. If we still have
  // ink but liveSvg is briefly missing (unload / race), leave the prior cue alone.
  if (hasInk && session.liveSvg) {
    const liveCue: LiveCue = {
      char: ch,
      liveSvg: session.liveSvg,
      updatedAt: now,
      station,
    }
    payload.liveCue = liveCue
    payload.liveCues = { [station]: liveCue }
  } else if (!hasInk) {
    const liveCue: LiveCue = {
      char: ch,
      liveSvg: '',
      updatedAt: now,
      station,
    }
    payload.liveCue = liveCue
    payload.liveCues = { [station]: liveCue }
  }
  return payload
}

export function mergeContributions(local: Contribution[], remote: Contribution[]): Contribution[] {
  const byId = new Map<string, Contribution>()
  for (const item of local) byId.set(item.id, item)
  for (const item of remote) byId.set(item.id, item)
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function mergeDrafts(
  local: GlyphDraft[],
  remote: GlyphDraft[],
  remoteTimes: Record<string, string>,
  localTimes: Record<string, string> = {},
): GlyphDraft[] {
  const byChar = new Map<string, GlyphDraft>()
  for (const draft of local) {
    if (draft.filled.length) byChar.set(draft.char, draft)
  }
  for (const draft of remote) {
    const remoteAt = remoteTimes[draft.char] ?? ''
    const localAt = localTimes[draft.char] ?? ''
    const existing = byChar.get(draft.char)
    const remoteWins = !existing || !localAt || (remoteAt && remoteAt >= localAt) || (!localAt && remoteAt)
    if (!remoteWins) continue
    // Empty remote draft is a tombstone (clear letter).
    if (!draft.filled.length) {
      byChar.delete(draft.char)
      continue
    }
    byChar.set(draft.char, draft)
  }
  return [...byChar.values()]
}

/** Drop local drafts the room has cleared (no draftSvg, but draftUpdatedAt set). */
export function pruneClearedDrafts(
  drafts: GlyphDraft[],
  room: Pick<LiveRoomState, 'draftSvgs' | 'draftUpdatedAt'>,
): GlyphDraft[] {
  const times = room.draftUpdatedAt ?? {}
  const svgs = room.draftSvgs ?? {}
  return drafts.filter((draft) => {
    if (!times[draft.char]) return true
    if (svgs[draft.char]) return true
    return false
  })
}

/** True when the room has tombstoned this letter (shared clear). */
export function isLetterClearedInRoom(
  char: string,
  room: Pick<LiveRoomState, 'draftSvgs' | 'draftUpdatedAt'>,
): boolean {
  return !!(room.draftUpdatedAt?.[char] && !room.draftSvgs?.[char])
}

/** True after DELETE / full shared wipe — no publishes, drafts, or live cues. */
export function isEmptyLiveRoom(room: LiveRoomState): boolean {
  const hasDraftInk = (room.drafts ?? []).some((d) => Array.isArray(d.filled) && d.filled.length > 0)
  const hasSvg = Object.keys(room.draftSvgs ?? {}).length > 0
  const hasLive = activeLiveCues(room).length > 0
  return (room.contributions?.length ?? 0) === 0 && !hasDraftInk && !hasSvg && !hasLive
}

/** Apply remote room into a FestivalSession for wall/projection display + localStorage. */
export function applyRoomToSession(
  local: FestivalSession | null,
  room: LiveRoomState,
  opts?: { keepLocalActive?: boolean; /** True after DELETE / Clear shared room (wipeEpoch bump). */ sharedWipe?: boolean },
): FestivalSession {
  const base: FestivalSession = local ?? {
    version: 1,
    updatedAt: room.updatedAt,
    active: {
      char: room.liveCue?.char ?? 'a',
      filled: [],
      brokenJoins: [],
      grid: DEFAULT_GRID,
      softness: 0.55,
      cornerRadius: 0,
      holeMode: 'open',
    },
    drafts: [],
    contributions: [],
    library: [...PRESET_SHAPES],
    liveSvg: '',
  }

  const keepActive = !!opts?.keepLocalActive && !!local
  const liveCue = room.liveCue
  const activeChar = keepActive ? local!.active.char : (liveCue?.char ?? base.active.char)

  // Empty shared room: never union leftover publishes back in.
  // Full canvas wipe only on sharedWipe (DELETE / Clear shared room) — otherwise a desk
  // painting into a still-empty room would lose stamps on every poll/WS snapshot.
  if (isEmptyLiveRoom(room)) {
    const sharedWipe = !!opts?.sharedWipe
    const wipedActive = sharedWipe
      ? {
          ...(keepActive ? local!.active : base.active),
          char: activeChar,
          filled: [] as FestivalSession['active']['filled'],
          brokenJoins: [] as string[],
        }
      : keepActive
        ? local!.active
        : {
            ...base.active,
            char: activeChar,
            filled: [],
            brokenJoins: [],
          }
    // Desks painting/publishing into an empty room must keep local contributions until
    // the Worker catches up — only sharedWipe (DELETE) drops them.
    const contributions = sharedWipe ? [] : keepActive ? (local?.contributions ?? []) : []
    return {
      ...base,
      updatedAt: room.updatedAt || base.updatedAt,
      contributions,
      drafts: sharedWipe
        ? []
        : keepActive && local!.active.filled.length
          ? [
              {
                ...local!.active,
                char: activeChar,
              },
            ]
          : [],
      active: wipedActive,
      liveSvg: sharedWipe ? '' : keepActive ? local!.liveSvg : '',
      library: base.library.length ? base.library : [...PRESET_SHAPES],
    }
  }

  const contributions = mergeContributions(base.contributions, room.contributions ?? [])
  const merged = mergeDrafts(base.drafts, room.drafts ?? [], room.draftUpdatedAt ?? {})
  // Shared clear tombstones win even for the desk's active letter.
  const drafts = pruneClearedDrafts(merged, room)
  const remoteClearedActive = keepActive && isLetterClearedInRoom(activeChar, room)
  const activeDraft =
    keepActive && !remoteClearedActive
      ? local!.active
      : (drafts.find((d) => d.char === activeChar) ?? {
          ...base.active,
          char: activeChar,
          filled: [],
          brokenJoins: [],
        })

  return {
    ...base,
    updatedAt: room.updatedAt || base.updatedAt,
    contributions,
    drafts,
    active: activeDraft,
    liveSvg:
      keepActive && !remoteClearedActive
        ? local!.liveSvg
        : remoteClearedActive
          ? ''
          : (liveCue?.liveSvg ?? base.liveSvg),
    library: base.library.length ? base.library : [...PRESET_SHAPES],
  }
}

export function persistSession(session: FestivalSession) {
  localStorage.setItem(FESTIVAL_KEY, JSON.stringify(session))
}

export function readLocalSessionSafe(): FestivalSession | null {
  try {
    return readSession()
  } catch {
    try {
      const raw = localStorage.getItem(FESTIVAL_KEY)
      return raw ? parseSession(raw) : null
    } catch {
      return null
    }
  }
}

/** Active live previews from a room (multi-desk). */
export function activeLiveCues(room: Pick<LiveRoomState, 'liveCues' | 'liveCue'> | null | undefined): LiveCue[] {
  if (!room) return []
  const fromMap = room.liveCues ? Object.values(room.liveCues).filter((c) => c?.liveSvg) : []
  if (fromMap.length) return fromMap.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
  return room.liveCue?.liveSvg ? [room.liveCue] : []
}

function normalizeLiveInput(
  live?: LiveCue | LiveCue[] | Record<string, LiveCue> | null,
): LiveCue[] {
  if (!live) return []
  if (Array.isArray(live)) return live.filter((c) => c?.liveSvg)
  if (typeof live === 'object' && 'char' in live && 'liveSvg' in live) {
    return (live as LiveCue).liveSvg ? [live as LiveCue] : []
  }
  return Object.values(live as Record<string, LiveCue>).filter((c) => c?.liveSvg)
}

/** Glyph preview for wall tiles: published wins, else live cue, else draft SVG. */
export function letterPreviewSvg(
  char: string,
  contributions: Contribution[],
  draftSvgs: Record<string, string> | undefined,
  live?: LiveCue | LiveCue[] | Record<string, LiveCue> | null,
): { svg: string; kind: 'published' | 'draft' | 'live' | 'empty' } {
  const published = [...contributions].reverse().find((c) => c.draft.char === char)
  if (published) return { svg: published.svg, kind: 'published' }
  const liveHit = normalizeLiveInput(live)
    .filter((c) => c.char === char && c.liveSvg)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  if (liveHit) return { svg: liveHit.liveSvg, kind: 'live' }
  const draft = draftSvgs?.[char]
  if (draft) return { svg: draft, kind: 'draft' }
  return { svg: '', kind: 'empty' }
}

function roomWsUrl(config: LiveSessionConfig): string {
  const base = config.baseUrl.replace(/^http/i, 'ws')
  return `${base}/rooms/${encodeURIComponent(config.room)}/ws`
}

function parseRoomMessage(raw: string): LiveRoomState | null {
  try {
    const data = JSON.parse(raw) as LiveRoomState & { type?: string }
    if (data?.type === 'pong') return null
    if (typeof data?.updatedAt !== 'string') return null
    return {
      updatedAt: data.updatedAt,
      wipeEpoch: typeof data.wipeEpoch === 'number' ? data.wipeEpoch : 0,
      contributions: Array.isArray(data.contributions) ? data.contributions : [],
      drafts: Array.isArray(data.drafts) ? data.drafts : [],
      draftSvgs: data.draftSvgs && typeof data.draftSvgs === 'object' ? data.draftSvgs : {},
      draftUpdatedAt:
        data.draftUpdatedAt && typeof data.draftUpdatedAt === 'object' ? data.draftUpdatedAt : {},
      liveCue: data.liveCue,
      liveCues:
        data.liveCues && typeof data.liveCues === 'object'
          ? (data.liveCues as Record<string, LiveCue>)
          : undefined,
    }
  } catch {
    return null
  }
}

export function createLiveSyncController(options: {
  onStatus?: (status: LiveSyncStatus) => void
  onRoom?: (room: LiveRoomState, session: FestivalSession) => void
  getSession?: () => FestivalSession | null
  painting?: () => boolean
  /** Desk mode: merge room into storage but keep this machine's active canvas letter. */
  keepLocalActive?: boolean
}) {
  let timer: number | null = null
  let pushTimer: number | null = null
  let reconnectTimer: number | null = null
  let pingTimer: number | null = null
  let socket: WebSocket | null = null
  let stopped = false
  let lastSeenUpdatedAt = ''
  let wipeEpoch = 0
  let reconnectAttempt = 0
  let socketLive = false

  const setStatus = (status: LiveSyncStatus) => options.onStatus?.(status)

  const noteRoomMeta = (room: LiveRoomState) => {
    lastSeenUpdatedAt = room.updatedAt
    if (typeof room.wipeEpoch === 'number') wipeEpoch = room.wipeEpoch
  }

  const applyRoom = (room: LiveRoomState, source: 'ws' | 'poll') => {
    if (room.updatedAt === lastSeenUpdatedAt) {
      setStatus({
        state: 'ok',
        message: socketLive ? `Live · ${getLiveConfig().room}` : `Connected · ${getLiveConfig().room}`,
        lastPullAt: new Date().toISOString(),
      })
      return
    }
    const incomingEpoch = typeof room.wipeEpoch === 'number' ? room.wipeEpoch : 0
    const sharedWipe = isEmptyLiveRoom(room) && incomingEpoch > wipeEpoch
    noteRoomMeta(room)
    // Shared wipe: drop any pending push that still holds pre-clear letters.
    if (sharedWipe && pushTimer) {
      window.clearTimeout(pushTimer)
      pushTimer = null
    }
    // Desks: ignore empty non-wipe snapshots. Polling an empty room while painting would
    // otherwise persist a stale session snapshot and fight the live canvas / publish button.
    if (isEmptyLiveRoom(room) && !sharedWipe && options.keepLocalActive) {
      setStatus({
        state: 'ok',
        message: source === 'ws' ? `Live · ${getLiveConfig().room}` : `Connected · ${getLiveConfig().room}`,
        lastPullAt: new Date().toISOString(),
      })
      return
    }
    const local = options.getSession?.() ?? readLocalSessionSafe()
    const painting = options.painting?.() ?? false
    const session = applyRoomToSession(local, room, {
      keepLocalActive: options.keepLocalActive || painting,
      sharedWipe,
    })
    persistSession(session)
    options.onRoom?.(room, session)
    setStatus({
      state: 'ok',
      message: source === 'ws' ? `Live · ${getLiveConfig().room}` : `Connected · ${getLiveConfig().room}`,
      lastPullAt: new Date().toISOString(),
    })
  }

  const pull = async () => {
    const config = getLiveConfig()
    if (!config.enabled || stopped) {
      setStatus({ state: 'off', message: 'Shared session not configured' })
      return null
    }
    try {
      if (!socketLive) setStatus({ state: 'syncing', message: `Connecting · ${config.room}…` })
      const room = await pullLiveRoom(config)
      if (!room || stopped) return null
      applyRoom(room, 'poll')
      return room
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Live pull failed',
      })
      return null
    }
  }

  const clearSocketTimers = () => {
    if (pingTimer) window.clearInterval(pingTimer)
    if (reconnectTimer) window.clearTimeout(reconnectTimer)
    pingTimer = null
    reconnectTimer = null
  }

  const connectSocket = () => {
    const config = getLiveConfig()
    if (!config.enabled || stopped) return
    clearSocketTimers()
    try {
      socket?.close()
    } catch {
      /* ignore */
    }
    socket = null
    socketLive = false

    let ws: WebSocket
    try {
      ws = new WebSocket(roomWsUrl(config))
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'WebSocket failed',
      })
      scheduleReconnect()
      return
    }
    socket = ws

    ws.onopen = () => {
      if (stopped || socket !== ws) return
      socketLive = true
      reconnectAttempt = 0
      setStatus({ state: 'ok', message: `Live · ${config.room}` })
      pingTimer = window.setInterval(() => {
        if (socket === ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send('ping')
          } catch {
            /* ignore */
          }
        }
      }, 25000)
    }

    ws.onmessage = (event) => {
      if (stopped || socket !== ws) return
      const room = parseRoomMessage(String(event.data))
      if (room) applyRoom(room, 'ws')
    }

    ws.onerror = () => {
      /* onclose handles reconnect */
    }

    ws.onclose = () => {
      if (socket !== ws) return
      socketLive = false
      socket = null
      clearSocketTimers()
      if (!stopped) scheduleReconnect()
    }
  }

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return
    const delay = Math.min(10000, 500 * 2 ** reconnectAttempt)
    reconnectAttempt += 1
    setStatus({
      state: 'syncing',
      message: `Reconnecting · ${getLiveConfig().room}…`,
    })
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      connectSocket()
    }, delay)
  }

  const pushNow = async (session: FestivalSession) => {
    const config = getLiveConfig()
    if (!config.enabled || stopped) return
    try {
      setStatus({ state: 'syncing', message: `Saving · ${config.room}…` })
      const room = await pushLiveRoom(
        buildLivePayload(session, { station: config.station, wipeEpoch }),
        config,
      )
      if (room) {
        noteRoomMeta(room)
        setStatus({
          state: 'ok',
          message: socketLive ? `Live · ${config.room}` : `Connected · ${config.room}`,
          lastPushAt: new Date().toISOString(),
        })
      }
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Live push failed',
      })
    }
  }

  const push = (session: FestivalSession, opts?: { immediate?: boolean }) => {
    const config = getLiveConfig()
    if (!config.enabled || stopped) return
    if (pushTimer) window.clearTimeout(pushTimer)
    if (opts?.immediate) {
      pushTimer = null
      void pushNow(session)
      return
    }
    pushTimer = window.setTimeout(() => {
      void pushNow(session)
    }, 400)
  }

  /** pollMs is fallback GET interval; WebSocket is primary. */
  const start = (pollMs = 10000) => {
    stopped = false
    reconnectAttempt = 0
    void pull()
    connectSocket()
    if (timer) window.clearInterval(timer)
    timer = window.setInterval(() => {
      void pull()
    }, pollMs)
  }

  const stop = () => {
    stopped = true
    socketLive = false
    if (timer) window.clearInterval(timer)
    if (pushTimer) window.clearTimeout(pushTimer)
    clearSocketTimers()
    timer = null
    pushTimer = null
    try {
      socket?.close()
    } catch {
      /* ignore */
    }
    socket = null
  }

  return { start, stop, pull, push, getConfig: getLiveConfig }
}
