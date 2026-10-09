import { mergeSymbols, type CustomSymbol, type FontDesign } from './fontDesign'
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
import {
  PRESET_SHAPES,
  type FilledRegion,
  type GlyphDraft,
  type GridConfig,
  type HoleMode,
} from '@/lib/types'

export const LIVE_ROOM_KEY = 'gridz-live-room'
export const LIVE_TOKEN_KEY = 'gridz-live-token'
export const LIVE_STATION_KEY = 'gridz-live-station'
/** Per-tab workshop station (sessionStorage); never written to LIVE_STATION_KEY. */
export const LIVE_WORKSHOP_STATION_KEY = 'gridz-workshop-station-tab'
export const LIVE_JOINED_KEY = 'gridz-live-joined'
/** Festival live room name(s) shown in the join UI. */
export const FESTIVAL_LIVE_ROOMS = ['boom'] as const
export const DEFAULT_LIVE_ROOM = 'boom'

export interface LiveCue {
  char: string
  station?: string
  liveSvg: string
  updatedAt: string
}

/** Which letter a desk is painting. `char: ''` = published / left. */
export interface DeskPresence {
  char: string
  since: string
  /** Heartbeat; Worker / clients drop stale desks after PRESENCE_TTL_MS. */
  seenAt: string
}

/** Stale presence TTL (desk closed / crashed without releasing). */
export const PRESENCE_TTL_MS = 60_000
const PRESENCE_HEARTBEAT_MS = 20_000

/** SHA-256 of the Clear shared room password; the Worker checks the plain value. */
const CLEAR_ROOM_PASSWORD_SHA256 = 'fc64ad09595e7739718c814b23ca6335906ef7916c20372cff02e046bad53d18'

export interface LiveRoomState {
  customSymbols?: CustomSymbol[]
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
  /** Per-desk presence (which letter each station is on). */
  desks?: Record<string, DeskPresence>
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

/** Flags delivered with a room apply (e.g. Clear shared room / restore archive). */
export type LiveRoomApplyMeta = { sharedWipe?: boolean; restore?: boolean }

function trimSlash(url: string) {
  return url.replace(/\/+$/, '')
}

/** Workshop tab stations are ephemeral (`w_….`); studio A/B stay in localStorage. */
export function isEphemeralStation(station: string | null | undefined): boolean {
  return /^w_/i.test(normalizeStation(station))
}

function workshopTabStation(): string {
  try {
    let id = sessionStorage.getItem(LIVE_WORKSHOP_STATION_KEY) || ''
    id = normalizeStation(id)
    if (!isEphemeralStation(id)) {
      id = normalizeStation(`w_${Math.random().toString(36).slice(2, 6)}`) || 'w_tab'
      sessionStorage.setItem(LIVE_WORKSHOP_STATION_KEY, id)
    }
    return id
  } catch {
    return normalizeStation(`w_${Math.random().toString(36).slice(2, 6)}`) || 'w_tab'
  }
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
  const view = params?.get('view') || ''
  const urlStation = params?.get('station')
  // ?station= always wins. Workshop tabs get a per-tab id so they never share Desk A's pane.
  const station = urlStation
    ? urlStation.slice(0, 8)
    : view === 'workshop'
      ? workshopTabStation()
      : (storedStation || '').slice(0, 8)
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

export function wallLink(view: 'projection' | 'studio' = 'projection'): string {
  const { room } = getLiveConfig()
  const url = new URL(window.location.href)
  url.search = ''
  url.searchParams.set('view', view)
  url.searchParams.set('room', room)
  return url.pathname + url.search
}

export function normalizeStation(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 8)
}

export function isPresenceFresh(desk: DeskPresence | undefined, now = Date.now()): boolean {
  if (!desk?.char || !desk.seenAt) return false
  const seen = Date.parse(desk.seenAt)
  return Number.isFinite(seen) && now - seen < PRESENCE_TTL_MS
}

export async function checkClearRoomPassword(password: string): Promise<boolean> {
  const bytes = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex === CLEAR_ROOM_PASSWORD_SHA256
}

async function request(
  method: 'GET' | 'PUT' | 'DELETE',
  config: LiveSessionConfig,
  body?: unknown,
  extraHeaders?: Record<string, string>,
  init?: { keepalive?: boolean },
): Promise<LiveRoomState> {
  if (!config.enabled) throw new Error('Live session URL is not configured')
  const url = new URL(`${config.baseUrl}/rooms/${encodeURIComponent(config.room)}`)
  if (config.token && method !== 'GET') url.searchParams.set('token', config.token)
  const headers: Record<string, string> = { Accept: 'application/json', ...extraHeaders }
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    if (config.token) headers.Authorization = `Bearer ${config.token}`
  }
  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    keepalive: init?.keepalive,
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

export async function clearLiveRoom(
  password: string,
  config = getLiveConfig(),
): Promise<LiveRoomState | null> {
  if (!config.enabled) return null
  return request('DELETE', config, undefined, { 'X-Clear-Password': password })
}

/** Summary of a room snapshot archived on Clear shared room (Cloudflare DO). */
export interface LiveRoomArchiveMeta {
  id: string
  clearedAt: string
  contributionCount: number
  draftCount: number
  letterCount: number
}

export async function listRoomArchives(
  config = getLiveConfig(),
): Promise<LiveRoomArchiveMeta[]> {
  if (!config.enabled) return []
  const url = new URL(`${config.baseUrl}/rooms/${encodeURIComponent(config.room)}/archives`)
  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `List archives failed (${response.status})`)
  }
  const data = (await response.json()) as { archives?: LiveRoomArchiveMeta[] }
  return Array.isArray(data.archives) ? data.archives : []
}

/** Put an archived room back as the live room (password same as clear). */
export async function restoreRoomArchive(
  archiveId: string,
  password: string,
  config = getLiveConfig(),
): Promise<LiveRoomState | null> {
  if (!config.enabled) return null
  const url = new URL(
    `${config.baseUrl}/rooms/${encodeURIComponent(config.room)}/archives/${encodeURIComponent(archiveId)}/restore`,
  )
  if (config.token) url.searchParams.set('token', config.token)
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Clear-Password': password,
  }
  if (config.token) headers.Authorization = `Bearer ${config.token}`
  const response = await fetch(url.toString(), { method: 'POST', headers, body: '{}' })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Restore failed (${response.status})`)
  }
  return (await response.json()) as LiveRoomState
}

/**
 * Push only this desk's active letter + full contribution list.
 * Same-letter peers may fight — Worker LWW on draftUpdatedAt decides.
 * Empty active letter sends a clear (empty draftSvg + empty live cue) so wall/peers drop it.
 * Writes `liveCues[station]` only — Worker still derives legacy `liveCue` for old readers.
 */
export function buildLivePayload(
  session: FestivalSession,
  opts?: {
    station?: string
    wipeEpoch?: number
    presence?: DeskPresence
  },
): Partial<LiveRoomState> {
  const roomAt = session.updatedAt || new Date().toISOString()
  const ch = session.active.char
  const presenceKey = normalizeStation(opts?.station ?? getLiveConfig().station) || 'desk'
  const desks = opts?.presence ? { [presenceKey]: opts.presence } : undefined
  // Per-letter clock only — never fall back to session.updatedAt for LWW.
  const letterAt = session.draftUpdatedAt?.[ch] || roomAt
  const activeDraft =
    session.drafts.find((d) => d.char === ch) ??
    session.active
  const hasInk = !!(activeDraft && activeDraft.filled.length)
  const stationRaw = (opts?.station ?? getLiveConfig().station ?? 'desk').slice(0, 8)
  const station = stationRaw.replace(/[^a-zA-Z0-9_-]/g, '') || 'desk'
  const draftSvgs: Record<string, string> = {}
  const writesLetter = hasInk || !!session.draftUpdatedAt?.[ch]
  const draftUpdatedAt: Record<string, string> = writesLetter ? { [ch]: letterAt } : {}
  if (hasInk && session.liveSvg) {
    draftSvgs[ch] = session.liveSvg
  } else if (!hasInk && writesLetter) {
    // Tombstone: Worker deletes this char's draft preview.
    draftSvgs[ch] = ''
  }
  const payload: Partial<LiveRoomState> = {
    updatedAt: roomAt,
    customSymbols: session.customSymbols,
    wipeEpoch: typeof opts?.wipeEpoch === 'number' ? opts.wipeEpoch : 0,
    contributions: session.contributions,
    drafts: !writesLetter ? [] : hasInk && activeDraft
      ? [activeDraft]
      : [
          {
            char: ch,
            filled: [],
            brokenJoins: [],
            grid: session.active.grid,
            softness: session.active.softness,
            cornerRadius: session.active.cornerRadius,
            fontDesign:session.active.fontDesign,
            holeMode: session.active.holeMode,
          },
        ],
    draftSvgs,
    draftUpdatedAt,
    ...(desks ? { desks } : {}),
  }
  // A quick letter switch must still deliver the departing letter's last edit.
  for (const draft of session.drafts) {
    const at = session.draftUpdatedAt?.[draft.char]
    if (draft.char === ch || !at || (!draft.filled.length&&!draft.fontDesign)) continue
    payload.drafts!.push(draft)
    draftUpdatedAt[draft.char] = at
  }
  // Only tombstone live cues when the letter is actually empty. If we still have
  // ink but liveSvg is briefly missing (unload / race), leave the prior cue alone.
  if (hasInk && session.liveSvg) {
    payload.liveCues = {
      [station]: {
        char: ch,
        liveSvg: session.liveSvg,
        updatedAt: letterAt,
        station,
      },
    }
  } else if (!hasInk) {
    payload.liveCues = {
      [station]: {
        char: ch,
        liveSvg: '',
        updatedAt: letterAt,
        station,
      },
    }
  }
  return payload
}

/** What a push would change in the room: letter clocks, room time and presence excluded. */
export function pushContentKey(payload: Partial<LiveRoomState>): string {
  return JSON.stringify([
    payload.wipeEpoch ?? 0,
    payload.drafts ?? null,
    payload.draftSvgs ?? null,
    (payload.contributions ?? []).map((c) => c.id),
    Object.entries(payload.liveCues ?? {}).map(([station, cue]) => [station, cue.char, cue.liveSvg]),
  ])
}

/** Merge per-letter clocks; newer ISO string wins per char. */
export function mergeDraftUpdatedAt(
  local: Record<string, string> = {},
  remote: Record<string, string> = {},
): Record<string, string> {
  const next = { ...local }
  for (const [ch, remoteAt] of Object.entries(remote)) {
    if (!remoteAt) continue
    const localAt = next[ch] ?? ''
    if (!localAt || remoteAt >= localAt) next[ch] = remoteAt
  }
  return next
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
    if (draft.filled.length || draft.fontDesign) byChar.set(draft.char, draft)
  }
  for (const draft of remote) {
    const remoteAt = remoteTimes[draft.char] ?? ''
    const localAt = localTimes[draft.char] ?? ''
    const existing = byChar.get(draft.char)
    const remoteWins = !existing || !localAt || (remoteAt && remoteAt >= localAt) || (!localAt && remoteAt)
    if (!remoteWins) continue
    // Empty remote draft is a tombstone (clear letter).
    if (!draft.filled.length && !draft.fontDesign) {
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
  room: Pick<LiveRoomState, 'draftSvgs' | 'draftUpdatedAt'> & {drafts?:GlyphDraft[]},
): GlyphDraft[] {
  const times = room.draftUpdatedAt ?? {}
  const svgs = room.draftSvgs ?? {}
  return drafts.filter((draft) => {
    if (draft.fontDesign) return true
    if (!times[draft.char]) return true
    if (svgs[draft.char]) return true
    return false
  })
}

/** True when the room has tombstoned this letter (shared clear). */
export function isLetterClearedInRoom(
  char: string,
  room: Pick<LiveRoomState, 'draftSvgs' | 'draftUpdatedAt'> & {drafts?:GlyphDraft[]},
): boolean {
  return !!(room.draftUpdatedAt?.[char] && !room.draftSvgs?.[char] && !room.drafts?.some(d=>d.char===char&&d.fontDesign))
}

/**
 * Last-write-wins for shared letter drafts.
 * Uses strict `>` so a desk's own echo (same draftUpdatedAt) does not rewrite the canvas.
 */
export function remoteDraftIsNewer(
  char: string,
  room: Pick<LiveRoomState, 'draftUpdatedAt'>,
  localTimes: Record<string, string>,
): boolean {
  const remoteAt = room.draftUpdatedAt?.[char] ?? ''
  if (!remoteAt) return false
  const localAt = localTimes[char] ?? ''
  return !localAt || remoteAt > localAt
}

/**
 * The open letter's state objects when its clock was last stamped, loaded or adopted.
 * Compared by reference, so every local edit must replace at least one of them.
 */
export interface LetterClockBase {
  fontDesign?: FontDesign
  char: string
  filled: ReadonlyMap<string, FilledRegion>
  brokenJoins: ReadonlySet<string>
  grid: GridConfig
  softness: number
  cornerRadius: number
  holeMode: HoleMode
}

/** True when the open letter is exactly as it was at `base`, so its clock must not move. */
export function letterUnchanged(base: LetterClockBase | null, now: LetterClockBase): boolean {
  return (
    !!base &&
    base.char === now.char &&
    base.filled === now.filled &&
    base.brokenJoins === now.brokenJoins &&
    base.grid === now.grid &&
    base.softness === now.softness &&
    base.cornerRadius === now.cornerRadius &&
    base.holeMode === now.holeMode &&
    JSON.stringify(base.fontDesign) === JSON.stringify(now.fontDesign)
  )
}

/** What a desk should do to its open letter when a remote room arrives. */
export type RemoteDeskActiveChange =
  | { type: 'none' }
  | { type: 'clear'; remoteAt: string }
  | { type: 'apply'; draft: GlyphDraft }

/**
 * Pure plan for App / StudioDesk: one place for wipe + LWW + mid-stroke skip.
 * Callers apply the plan to React state / refs.
 */
export type RemoteDeskApplyPlan =
  | { kind: 'wipe' }
  | {
      kind: 'merge'
      contributions: Contribution[]
      glyphs: Map<string, GlyphDraft>
      draftTimes: Record<string, string>
      activeChange: RemoteDeskActiveChange
      applyingRemote: boolean
      liveSvg: string
    }

export function planRemoteDeskApply(input: {
  session: FestivalSession
  liveRoom: LiveRoomState
  meta?: LiveRoomApplyMeta
  localContributions: Contribution[]
  localGlyphs: Map<string, GlyphDraft>
  draftTimes: Record<string, string>
  activeChar: string
  painting: boolean
  activeFilledCount: number
  currentLiveSvg: string
}): RemoteDeskApplyPlan {
  const { session, liveRoom, meta } = input
  const roomEmpty = isEmptyLiveRoom(liveRoom)
  const sessionWiped =
    session.contributions.length === 0 &&
    session.drafts.length === 0 &&
    session.active.filled.length === 0 &&
    !session.liveSvg
  if (meta?.sharedWipe || (roomEmpty && sessionWiped)) {
    return { kind: 'wipe' }
  }

  // Cloud archive restore: replace local typeface/drafts with the archived room.
  if (meta?.restore) {
    const glyphs = new Map<string, GlyphDraft>()
    for (const draft of session.drafts) {
      if (draft.filled.length || draft.fontDesign) glyphs.set(draft.char, draft)
    }
    const draftTimes = mergeDraftUpdatedAt(
      session.draftUpdatedAt ?? {},
      liveRoom.draftUpdatedAt ?? {},
    )
    const active = session.active
    const activeChange: RemoteDeskActiveChange = (active.filled.length || active.fontDesign)
      ? { type: 'apply', draft: active }
      : { type: 'clear', remoteAt: draftTimes[active.char] ?? liveRoom.updatedAt }
    return {
      kind: 'merge',
      contributions: session.contributions,
      glyphs,
      draftTimes,
      activeChange,
      applyingRemote: true,
      liveSvg: session.liveSvg,
    }
  }

  const contributions = mergeContributions(input.localContributions, session.contributions)
  const draftTimes = { ...input.draftTimes }
  const nextGlyphs = new Map(input.localGlyphs)
  const activeChar = input.activeChar
  const painting = input.painting
  let appliedActive: GlyphDraft | null = null

  for (const draft of session.drafts) {
    if (!draft.filled.length && !draft.fontDesign) continue
    if (isLetterClearedInRoom(draft.char, liveRoom)) continue
    // Mid-stroke: keep our ink for the letter we are painting; push wins after.
    if (draft.char === activeChar && painting) continue
    if (!remoteDraftIsNewer(draft.char, liveRoom, draftTimes)) {
      if (!nextGlyphs.has(draft.char) && draft.char !== activeChar) nextGlyphs.set(draft.char, draft)
      continue
    }
    nextGlyphs.set(draft.char, draft)
    const remoteAt = liveRoom.draftUpdatedAt?.[draft.char]
    if (remoteAt) draftTimes[draft.char] = remoteAt
    if (draft.char === activeChar) appliedActive = draft
  }
  for (const ch of [...nextGlyphs.keys()]) {
    if (isLetterClearedInRoom(ch, liveRoom)) nextGlyphs.delete(ch)
  }

  let activeChange: RemoteDeskActiveChange = { type: 'none' }
  let applyingRemote = false
  if (isLetterClearedInRoom(activeChar, liveRoom) && input.activeFilledCount > 0 && !painting) {
    const remoteAt = liveRoom.draftUpdatedAt?.[activeChar] ?? ''
    const localAt = draftTimes[activeChar] ?? ''
    // Strict `>` — same stamp is our echo, not a newer peer clear.
    if (!localAt || remoteAt > localAt) {
      applyingRemote = true
      activeChange = { type: 'clear', remoteAt }
      if (remoteAt) draftTimes[activeChar] = remoteAt
    }
  } else if (appliedActive) {
    applyingRemote = true
    activeChange = { type: 'apply', draft: appliedActive }
  }

  return {
    kind: 'merge',
    contributions,
    glyphs: nextGlyphs,
    draftTimes,
    activeChange,
    applyingRemote,
    liveSvg: isLetterClearedInRoom(activeChar, liveRoom)
      ? ''
      : (input.currentLiveSvg || session.liveSvg),
  }
}

/** True after DELETE / full shared wipe — no publishes, drafts, or live cues. */
export function isEmptyLiveRoom(room: LiveRoomState): boolean {
  const hasDraftInk = (room.drafts ?? []).some((d) => Array.isArray(d.filled) && (d.filled.length > 0 || !!d.fontDesign))
  const hasSvg = Object.keys(room.draftSvgs ?? {}).length > 0
  const hasLive = activeLiveCues(room).length > 0
  return !(room.customSymbols?.length) && (room.contributions?.length ?? 0) === 0 && !hasDraftInk && !hasSvg && !hasLive
}

/** Apply remote room into a FestivalSession for wall/projection display + localStorage. */
export function applyRoomToSession(
  local: FestivalSession | null,
  room: LiveRoomState,
  opts?: { keepLocalActive?: boolean; /** True after DELETE / Clear shared room (wipeEpoch bump). */ sharedWipe?: boolean; restore?: boolean },
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

  if (opts?.restore) {
    const char = local?.active.char ?? room.drafts[0]?.char ?? base.active.char
    const active = room.drafts.find((draft) => draft.char === char) ?? {
      ...base.active, char, filled: [], brokenJoins: [], fontDesign: undefined,
    }
    return {
      ...base, updatedAt: room.updatedAt, customSymbols: room.customSymbols ?? [],
      contributions: room.contributions ?? [], drafts: room.drafts ?? [],
      draftUpdatedAt: room.draftUpdatedAt ?? {}, active, liveSvg: room.draftSvgs[char] ?? '',
    }
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
      customSymbols: opts?.sharedWipe ? room.customSymbols ?? [] : mergeSymbols(base.customSymbols,room.customSymbols),
      updatedAt: room.updatedAt || base.updatedAt,
      contributions,
      // Keep this desk's other unpushed drafts too (only the active letter is ever pushed).
      drafts: sharedWipe
        ? []
        : keepActive
          ? [
              ...local!.drafts.filter((d) => d.filled.length && d.char !== activeChar),
              ...(local!.active.filled.length ? [{ ...local!.active, char: activeChar }] : []),
            ]
          : [],
      active: wipedActive,
      liveSvg: sharedWipe ? '' : keepActive ? local!.liveSvg : '',
      draftUpdatedAt: sharedWipe ? {} : keepActive ? (local?.draftUpdatedAt ?? {}) : {},
      library: base.library.length ? base.library : [...PRESET_SHAPES],
    }
  }

  const localTimes = local?.draftUpdatedAt ?? {}
  const remoteTimes = room.draftUpdatedAt ?? {}
  const contributions = mergeContributions(base.contributions, room.contributions ?? [])
  const merged = mergeDrafts(base.drafts, room.drafts ?? [], remoteTimes, localTimes)
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
      customSymbols: opts?.sharedWipe ? room.customSymbols ?? [] : mergeSymbols(base.customSymbols,room.customSymbols),
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
    draftUpdatedAt: mergeDraftUpdatedAt(localTimes, remoteTimes),
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

/** The public projection has two fixed desks; workshop tabs never add panes. */
export function projectionLiveCues(room: LiveRoomState | null | undefined, now = Date.now()): LiveCue[] {
  if (!room) return []
  const newest = new Map<string, LiveCue>()
  const entries = room.liveCues ? Object.entries(room.liveCues) : []
  if (!entries.length && room.liveCue) entries.push([room.liveCue.station || 'desk', room.liveCue])
  for (const [key, cue] of entries) {
    if (!cue?.liveSvg) continue
    const station = normalizeStation(cue.station || key)
    if (station !== 'a' && station !== 'b') continue
    const presence = Object.entries(room.desks ?? {})
      .filter(([desk]) => normalizeStation(desk) === station)
      .map(([, value]) => value)
      .sort((a, b) => b.seenAt.localeCompare(a.seenAt))[0]
    if (!isPresenceFresh(presence, now) || presence?.char !== cue.char) continue
    const previous = newest.get(station)
    if (!previous || cue.updatedAt > previous.updatedAt) newest.set(station, { ...cue, station })
  }
  return [...newest.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
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
      desks:
        data.desks && typeof data.desks === 'object'
          ? (data.desks as Record<string, DeskPresence>)
          : undefined,
    }
  } catch {
    return null
  }
}

const WIPE_EPOCH_PREFIX = 'gridz-wipe-epoch:'

function readStoredWipeEpoch(room: string): number {
  try {
    const raw = sessionStorage.getItem(`${WIPE_EPOCH_PREFIX}${room}`)
    const n = raw == null ? 0 : Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

function storeWipeEpoch(room: string, epoch: number) {
  try {
    sessionStorage.setItem(`${WIPE_EPOCH_PREFIX}${room}`, String(epoch))
  } catch {
    /* ignore */
  }
}

export function createLiveSyncController(options: {
  onStatus?: (status: LiveSyncStatus) => void
  onRoom?: (room: LiveRoomState, session: FestivalSession, meta?: LiveRoomApplyMeta) => void
  getSession?: () => FestivalSession | null
  painting?: () => boolean
  /** Desk mode: merge room into storage but keep this machine's active canvas letter. */
  keepLocalActive?: boolean
  /** Desk presence for the wall; omit on projection. `char: ''` = released. */
  getPresence?: () => { char: string; since: string } | null
}) {
  let timer: number | null = null
  let pushTimer: number | null = null
  let reconnectTimer: number | null = null
  let pingTimer: number | null = null
  let heartbeatTimer: number | null = null
  let socket: WebSocket | null = null
  let stopped = false
  let lastSeenUpdatedAt = ''
  let lastRoom: LiveRoomState | null = null
  // Persist per room so React remounts / Strict Mode do not re-fire sharedWipe.
  let wipeEpoch = readStoredWipeEpoch(getLiveConfig().room)
  let reconnectAttempt = 0
  let socketLive = false
  /** pushContentKey of the last push the Worker accepted. */
  let lastPushedKey = ''
  let retryTimer: number | null = null
  let retryAttempt = 0

  const setStatus = (status: LiveSyncStatus) => options.onStatus?.(status)

  const currentPresence = (): DeskPresence | undefined => {
    const p = options.getPresence?.()
    if (!p) return undefined
    return { char: p.char, since: p.since, seenAt: new Date().toISOString() }
  }

  const noteRoomMeta = (room: LiveRoomState) => {
    lastSeenUpdatedAt = room.updatedAt
    lastRoom = room
    if (typeof room.wipeEpoch === 'number') {
      wipeEpoch = room.wipeEpoch
      storeWipeEpoch(getLiveConfig().room, wipeEpoch)
    }
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
    const replaced = incomingEpoch > wipeEpoch
    const sharedWipe = isEmptyLiveRoom(room) && replaced
    const restore = replaced && !sharedWipe
    noteRoomMeta(room)
    // Shared wipe: drop any pending push that still holds pre-clear letters.
    if (replaced && pushTimer) {
      window.clearTimeout(pushTimer)
      pushTimer = null
    }
    const local = options.getSession?.() ?? readLocalSessionSafe()
    const painting = options.painting?.() ?? false
    const session = applyRoomToSession(local, room, {
      keepLocalActive: options.keepLocalActive || painting,
      sharedWipe,
      restore,
    })
    // UI owns localStorage — deliver the plan only; desks persist after they apply it.
    options.onRoom?.(room, session, { sharedWipe, restore })
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

  /** Nothing else re-sends a failed push now that idle desks stay quiet. */
  const scheduleRetry = () => {
    if (stopped || retryTimer) return
    const delay = Math.min(15000, 2000 * 2 ** retryAttempt)
    retryAttempt += 1
    retryTimer = window.setTimeout(() => {
      retryTimer = null
      const latest = options.getSession?.()
      if (latest && !stopped) void pushNow(latest)
    }, delay)
  }

  const pushNow = async (session: FestivalSession) => {
    const config = getLiveConfig()
    if (!config.enabled || stopped) return
    // Always push the active letter — peers may fight; Worker LWW decides.
    const payload = buildLivePayload(session, { station: config.station, wipeEpoch, presence: currentPresence() })
    // Every PUT is broadcast and re-renders the other desks; re-sending unchanged
    // content from those re-renders would bounce between desks forever.
    const key = pushContentKey(payload)
    if (key === lastPushedKey) return
    try {
      setStatus({ state: 'syncing', message: `Saving · ${config.room}…` })
      const room = await pushLiveRoom(payload, config)
      if (room) {
        lastPushedKey = key
        retryAttempt = 0
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
      scheduleRetry()
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

  /** Presence-only PUT (heartbeat / release). Never touches letters. */
  const pushPresence = async (override?: { char: string }, keepalive = false) => {
    const config = getLiveConfig()
    if (!config.enabled || !options.getPresence) return
    const presence = currentPresence()
    if (!presence) return
    if (override) presence.char = override.char
    const key = normalizeStation(config.station) || 'desk'
    try {
      const room = await request(
        'PUT',
        config,
        { wipeEpoch, desks: { [key]: presence } },
        undefined,
        { keepalive },
      )
      if (!keepalive) noteRoomMeta(room)
    } catch {
      /* next heartbeat retries */
    }
  }

  const releaseOnHide = () => {
    void pushPresence({ char: '' }, true)
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
    if (options.getPresence) {
      if (heartbeatTimer) window.clearInterval(heartbeatTimer)
      heartbeatTimer = window.setInterval(() => {
        if (!stopped) void pushPresence()
      }, PRESENCE_HEARTBEAT_MS)
      window.addEventListener('pagehide', releaseOnHide)
    }
  }

  const stop = () => {
    if (options.getPresence && !stopped) {
      window.removeEventListener('pagehide', releaseOnHide)
      void pushPresence({ char: '' }, true)
    }
    stopped = true
    socketLive = false
    if (timer) window.clearInterval(timer)
    if (pushTimer) window.clearTimeout(pushTimer)
    if (heartbeatTimer) window.clearInterval(heartbeatTimer)
    if (retryTimer) window.clearTimeout(retryTimer)
    heartbeatTimer = null
    retryTimer = null
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

  return {
    start,
    stop,
    pull,
    push,
    pushPresence: () => pushPresence(),
    getRoom: () => lastRoom,
    getConfig: getLiveConfig,
  }
}
