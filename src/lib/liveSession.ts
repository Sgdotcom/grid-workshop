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
export const DEFAULT_LIVE_ROOM = 'lettermans'

export interface LiveCue {
  char: string
  station?: string
  liveSvg: string
  updatedAt: string
}

export interface LiveRoomState {
  updatedAt: string
  contributions: Contribution[]
  drafts: GlyphDraft[]
  draftSvgs: Record<string, string>
  draftUpdatedAt: Record<string, string>
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
  const token = params?.get('token') || storedToken
  const station = (params?.get('station') || storedStation || '').slice(0, 8)
  return {
    enabled: !!envUrl,
    baseUrl: envUrl ? trimSlash(envUrl) : '',
    room: room.replace(/[^a-zA-Z0-9_-]/g, '') || DEFAULT_LIVE_ROOM,
    token,
    station,
  }
}

export function persistLivePrefs(partial: { room?: string; token?: string; station?: string }) {
  try {
    if (partial.room !== undefined) {
      localStorage.setItem(LIVE_ROOM_KEY, partial.room.slice(0, 64) || DEFAULT_LIVE_ROOM)
    }
    if (partial.token !== undefined) {
      if (partial.token) localStorage.setItem(LIVE_TOKEN_KEY, partial.token)
      else localStorage.removeItem(LIVE_TOKEN_KEY)
    }
    if (partial.station !== undefined) {
      if (partial.station) localStorage.setItem(LIVE_STATION_KEY, partial.station.slice(0, 8))
      else localStorage.removeItem(LIVE_STATION_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function wallLink(view: 'wall' | 'projection' | 'studio' = 'wall'): string {
  const { room, token } = getLiveConfig()
  const url = new URL(window.location.href)
  url.search = ''
  url.searchParams.set('view', view)
  url.searchParams.set('room', room)
  if (token) url.searchParams.set('token', token)
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
 */
export function buildLivePayload(
  session: FestivalSession,
  opts?: { station?: string },
): Partial<LiveRoomState> {
  const now = session.updatedAt || new Date().toISOString()
  const ch = session.active.char
  const activeDraft =
    session.drafts.find((d) => d.char === ch) ??
    (session.active.filled.length ? session.active : null)
  const hasInk = !!(activeDraft && activeDraft.filled.length)
  const station = opts?.station ?? getLiveConfig().station
  const draftSvgs: Record<string, string> = {}
  const draftUpdatedAt: Record<string, string> = {}
  if (hasInk && session.liveSvg) {
    draftSvgs[ch] = session.liveSvg
    draftUpdatedAt[ch] = now
  } else if (hasInk) {
    draftUpdatedAt[ch] = now
  }
  return {
    updatedAt: now,
    contributions: session.contributions,
    drafts: hasInk && activeDraft ? [activeDraft] : [],
    draftSvgs,
    draftUpdatedAt,
    liveCue:
      hasInk && session.liveSvg
        ? {
            char: ch,
            liveSvg: session.liveSvg,
            updatedAt: now,
            ...(station ? { station } : {}),
          }
        : undefined,
  }
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
  for (const draft of local) byChar.set(draft.char, draft)
  for (const draft of remote) {
    const remoteAt = remoteTimes[draft.char] ?? ''
    const localAt = localTimes[draft.char] ?? ''
    const existing = byChar.get(draft.char)
    if (!existing || !localAt || (remoteAt && remoteAt >= localAt) || (!localAt && remoteAt)) {
      byChar.set(draft.char, draft)
    }
  }
  return [...byChar.values()]
}

/** Apply remote room into a FestivalSession for wall/projection display + localStorage. */
export function applyRoomToSession(
  local: FestivalSession | null,
  room: LiveRoomState,
  opts?: { keepLocalActive?: boolean },
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

  const contributions = mergeContributions(base.contributions, room.contributions ?? [])
  const drafts = mergeDrafts(base.drafts, room.drafts ?? [], room.draftUpdatedAt ?? {})
  const liveCue = room.liveCue
  const keepActive = !!opts?.keepLocalActive && !!local
  const activeChar = keepActive ? local!.active.char : (liveCue?.char ?? base.active.char)
  const activeDraft = keepActive
    ? local!.active
    : (drafts.find((d) => d.char === activeChar) ?? {
        ...base.active,
        char: activeChar,
      })

  return {
    ...base,
    updatedAt: room.updatedAt || base.updatedAt,
    contributions,
    drafts,
    active: activeDraft,
    liveSvg: keepActive ? local!.liveSvg : (liveCue?.liveSvg ?? base.liveSvg),
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

/** Glyph preview for wall tiles: published wins, else shared draft SVG. */
export function letterPreviewSvg(
  char: string,
  contributions: Contribution[],
  draftSvgs: Record<string, string> | undefined,
  liveCue?: LiveCue,
): { svg: string; kind: 'published' | 'draft' | 'live' | 'empty' } {
  const published = [...contributions].reverse().find((c) => c.draft.char === char)
  if (published) return { svg: published.svg, kind: 'published' }
  if (liveCue?.char === char && liveCue.liveSvg) return { svg: liveCue.liveSvg, kind: 'live' }
  const draft = draftSvgs?.[char]
  if (draft) return { svg: draft, kind: 'draft' }
  return { svg: '', kind: 'empty' }
}

export function createLiveSyncController(options: {
  onStatus?: (status: LiveSyncStatus) => void
  onRoom?: (room: LiveRoomState, session: FestivalSession) => void
  /** When true, skip applying remote liveCue that matches our station (avoid echo). */
  selfStation?: () => string
  getSession?: () => FestivalSession | null
  painting?: () => boolean
  /** Desk mode: merge room into storage but keep this machine's active canvas letter. */
  keepLocalActive?: boolean
}) {
  let timer: number | null = null
  let pushTimer: number | null = null
  let stopped = false
  let lastSeenUpdatedAt = ''

  const setStatus = (status: LiveSyncStatus) => options.onStatus?.(status)

  const pull = async () => {
    const config = getLiveConfig()
    if (!config.enabled || stopped) {
      setStatus({ state: 'off', message: 'Live sync off (no VITE_LIVE_SESSION_URL)' })
      return null
    }
    try {
      setStatus({ state: 'syncing', message: 'Pulling shared room…' })
      const room = await pullLiveRoom(config)
      if (!room || stopped) return null
      if (room.updatedAt === lastSeenUpdatedAt) {
        setStatus({
          state: 'ok',
          message: `Live · room ${config.room}`,
          lastPullAt: new Date().toISOString(),
        })
        return room
      }
      lastSeenUpdatedAt = room.updatedAt
      const local = options.getSession?.() ?? readLocalSessionSafe()
      const painting = options.painting?.() ?? false
      const session = applyRoomToSession(local, room, {
        keepLocalActive: options.keepLocalActive || painting,
      })
      persistSession(session)
      options.onRoom?.(room, session)
      setStatus({
        state: 'ok',
        message: `Live · room ${config.room}`,
        lastPullAt: new Date().toISOString(),
      })
      return room
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Live pull failed',
      })
      return null
    }
  }

  const push = (session: FestivalSession) => {
    const config = getLiveConfig()
    if (!config.enabled || stopped) return
    if (pushTimer) window.clearTimeout(pushTimer)
    pushTimer = window.setTimeout(async () => {
      try {
        setStatus({ state: 'syncing', message: 'Pushing to shared room…' })
        const room = await pushLiveRoom(buildLivePayload(session, { station: config.station }), config)
        if (room) {
          lastSeenUpdatedAt = room.updatedAt
          setStatus({
            state: 'ok',
            message: `Live · room ${config.room}`,
            lastPushAt: new Date().toISOString(),
          })
        }
      } catch (error) {
        setStatus({
          state: 'error',
          message: error instanceof Error ? error.message : 'Live push failed',
        })
      }
    }, 400)
  }

  const start = (pollMs = 1800) => {
    stopped = false
    void pull()
    if (timer) window.clearInterval(timer)
    timer = window.setInterval(() => {
      void pull()
    }, pollMs)
  }

  const stop = () => {
    stopped = true
    if (timer) window.clearInterval(timer)
    if (pushTimer) window.clearTimeout(pushTimer)
    timer = null
    pushTimer = null
  }

  return { start, stop, pull, push, getConfig: getLiveConfig }
}
