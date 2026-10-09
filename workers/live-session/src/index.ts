/**
 * Shared festival room for grid-workshop install desks + wall.
 * GET/WS public; PUT/DELETE require LIVE_WRITE_TOKEN when configured.
 * DELETE / archive restore require a configured CLEAR_ROOM_PASSWORD (X-Clear-Password header).
 * WebSocket clients receive room broadcasts after each PUT/DELETE.
 */

/** Which letter a desk holds. `char: ''` = holding nothing (published / left). */
export interface DeskPresence {
  char: string
  /** When this desk took the letter — earlier wins a same-letter tie. */
  since: string
  /** Heartbeat; stale entries no longer own anything. */
  seenAt: string
}

export interface LiveCue {
  char: string
  station?: string
  liveSvg: string
  updatedAt: string
}

export interface LiveRoomState {
  customSymbols?: {char:string;name:string;updatedAt:string;deleted?:boolean}[]
  updatedAt: string
  /** Bumps on DELETE so stale pre-clear PUTs are ignored. */
  wipeEpoch?: number
  contributions: unknown[]
  drafts: unknown[]
  draftSvgs: Record<string, string>
  draftUpdatedAt: Record<string, string>
  /** Per-desk live previews keyed by station (a / b). */
  liveCues?: Record<string, LiveCue>
  /** Station clocks survive empty-preview tombstones. */
  liveCueUpdatedAt?: Record<string, string>
  /** Newest cue (compat); prefer liveCues for multi-desk walls. */
  liveCue?: LiveCue
  /** Letter ownership per desk station. */
  desks?: Record<string, DeskPresence>
}

export interface Env {
  ROOMS: DurableObjectNamespace
  LIVE_WRITE_TOKEN?: string
  CLEAR_ROOM_PASSWORD?: string
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Clear-Password',
  'Access-Control-Max-Age': '86400',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function emptyRoom(wipeEpoch = 0): LiveRoomState {
  return {
    updatedAt: new Date(0).toISOString(),
    wipeEpoch,
    contributions: [],
    drafts: [],
    draftSvgs: {},
    draftUpdatedAt: {},
    liveCues: {},
    desks: {},
  }
}

function stationKey(cue: LiveCue): string {
  const raw = typeof cue.station === 'string' && cue.station.trim() ? cue.station : 'desk'
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 8) || 'desk'
}

function newestLiveCue(cues: Record<string, LiveCue>): LiveCue | undefined {
  let best: LiveCue | undefined
  for (const cue of Object.values(cues)) {
    if (!cue.liveSvg) continue
    if (!best || cue.updatedAt >= best.updatedAt) best = cue
  }
  return best
}

const MAX_ARCHIVES = 20

export interface RoomArchiveMeta {
  id: string
  clearedAt: string
  contributionCount: number
  draftCount: number
  letterCount: number
}

export interface RoomArchive extends RoomArchiveMeta {
  room: LiveRoomState
}

/** /rooms/:room[/ws|/archives[/:id[/restore]]] */
function parseRoomPath(pathname: string): {
  room: string
  ws: boolean
  archives: boolean
  archiveId: string | null
  restore: boolean
} | null {
  const match = pathname.match(
    /^\/rooms\/([a-zA-Z0-9_-]{1,64})(?:\/(ws)|\/archives(?:\/([a-zA-Z0-9_-]{1,64})(\/restore)?)?)?\/?$/,
  )
  if (!match) return null
  return {
    room: match[1],
    ws: match[2] === 'ws',
    archives: pathname.includes('/archives'),
    archiveId: match[3] ?? null,
    restore: match[4] === '/restore',
  }
}

function roomHasWork(room: LiveRoomState): boolean {
  if ((room.contributions?.length ?? 0) > 0) return true
  if ((room.drafts ?? []).some((d) => {
    const filled = asRecord(d)?.filled
    return Array.isArray(filled) && filled.length > 0
  }))
    return true
  if (Object.keys(room.draftSvgs ?? {}).length > 0) return true
  return Object.values(room.liveCues ?? {}).some((c) => !!c?.liveSvg)
}

function archiveMetaFromRoom(room: LiveRoomState, clearedAt: string, id: string): RoomArchiveMeta {
  const letters = new Set<string>()
  for (const item of room.contributions ?? []) {
    const draft = asRecord(item)?.draft
    const ch = asRecord(draft)?.char
    if (typeof ch === 'string') letters.add(ch)
  }
  for (const draft of room.drafts ?? []) {
    const ch = draftChar(draft)
    if (ch) letters.add(ch)
  }
  return {
    id,
    clearedAt,
    contributionCount: room.contributions?.length ?? 0,
    draftCount: (room.drafts ?? []).filter((d) => {
      const filled = asRecord(d)?.filled
      return Array.isArray(filled) && filled.length > 0
    }).length,
    letterCount: letters.size,
  }
}

function authorized(request: Request, env: Env): boolean {
  const expected = env.LIVE_WRITE_TOKEN
  if (!expected) return true
  const header = request.headers.get('Authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  const url = new URL(request.url)
  const query = url.searchParams.get('token') ?? ''
  return bearer === expected || query === expected
}

function clearAllowed(request: Request, env: Env): boolean {
  const expected = env.CLEAR_ROOM_PASSWORD
  if (!expected) return false
  return (request.headers.get('X-Clear-Password') ?? '') === expected
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function draftChar(draft: unknown): string | null {
  const obj = asRecord(draft)
  return obj && typeof obj.char === 'string' ? obj.char : null
}

function contributionId(item: unknown): string | null {
  const obj = asRecord(item)
  return obj && typeof obj.id === 'string' ? obj.id : null
}

/** Keep symbol ordering identical to the client without depending on its UI modules. */
function mergeCustomSymbols(a: NonNullable<LiveRoomState['customSymbols']>, b: NonNullable<LiveRoomState['customSymbols']>) {
  const standard = 'abcdefghijklmnopqrstuvwxyzåäöABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ0123456789!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'
  const symbols = new Map<string, NonNullable<LiveRoomState['customSymbols']>[number]>()
  for (const symbol of [...a, ...b]) {
    if (!symbol || typeof symbol.char !== 'string' || [...symbol.char].length !== 1 ||
        /[\p{Cc}\p{Cf}\p{Cs}\p{M}\s]/u.test(symbol.char) || /[\uFDD0-\uFDEF]/u.test(symbol.char) ||
        (symbol.char.codePointAt(0)! & 0xffff) >= 0xfffe || standard.includes(symbol.char) ||
        typeof symbol.name !== 'string' || !symbol.name.trim() || symbol.name.length > 40 ||
        typeof symbol.updatedAt !== 'string' || !Number.isFinite(Date.parse(symbol.updatedAt)) ||
        (symbol.deleted !== undefined && typeof symbol.deleted !== 'boolean')) continue
    const old = symbols.get(symbol.char)
    const time = Date.parse(symbol.updatedAt), oldTime = old ? Date.parse(old.updatedAt) : -Infinity
    if (!old || time > oldTime || (time === oldTime && (
      symbol.deleted && !old.deleted || !!symbol.deleted === !!old.deleted && symbol.name > old.name
    ))) symbols.set(symbol.char, { ...symbol, updatedAt: new Date(time).toISOString() })
  }
  return [...symbols.values()].sort((x, y) => x.char.codePointAt(0)! - y.char.codePointAt(0)!)
}

function mergeRooms(stored: LiveRoomState, incoming: Partial<LiveRoomState>): LiveRoomState {
  const storedEpoch = typeof stored.wipeEpoch === 'number' ? stored.wipeEpoch : 0
  // Legacy clients omit wipeEpoch — treat as current epoch so post-clear painting still works.
  // Explicit older epochs (stale pre-clear payloads) are still rejected.
  const incomingEpoch =
    typeof incoming.wipeEpoch === 'number' ? incoming.wipeEpoch : storedEpoch
  // Stale desk that never saw Clear shared room — do not refill wiped rooms.
  if (incomingEpoch < storedEpoch) {
    return stored
  }

  const liveCues: Record<string, LiveCue> = {}
  // Canonical station keys also repair rooms written by older clients.
  for (const [rawKey, cue] of Object.entries(stored.liveCues ?? {})) {
    const key = stationKey({ ...cue, station: rawKey })
    if (!liveCues[key] || cue.updatedAt >= liveCues[key].updatedAt) {
      liveCues[key] = { ...cue, station: key }
    }
  }
  const liveCueUpdatedAt: Record<string, string> = {}
  for (const [rawKey, at] of Object.entries(stored.liveCueUpdatedAt ?? {})) {
    const key = stationKey({ station: rawKey } as LiveCue)
    if (!liveCueUpdatedAt[key] || at >= liveCueUpdatedAt[key]) liveCueUpdatedAt[key] = at
  }
  for (const [key, cue] of Object.entries(liveCues)) {
    if (!liveCueUpdatedAt[key] || cue.updatedAt >= liveCueUpdatedAt[key]) liveCueUpdatedAt[key] = cue.updatedAt
  }
  const desks: Record<string, DeskPresence> = {}
  for (const [rawKey, presence] of Object.entries(stored.desks ?? {})) {
    const key = stationKey({ station: rawKey } as LiveCue)
    if (!desks[key] || presence.seenAt >= desks[key].seenAt) desks[key] = presence
  }
  // Migrate legacy single cue into the map once.
  if (stored.liveCue?.liveSvg) {
    const key = stationKey(stored.liveCue)
    if (!liveCues[key]) liveCues[key] = stored.liveCue
  }
  const next: LiveRoomState = {
    updatedAt: new Date().toISOString(),
    wipeEpoch: storedEpoch,
    customSymbols: [...(stored.customSymbols ?? [])],
    contributions: [...stored.contributions],
    drafts: [...stored.drafts],
    draftSvgs: { ...stored.draftSvgs },
    draftUpdatedAt: { ...stored.draftUpdatedAt },
    liveCues,
    liveCueUpdatedAt,
    liveCue: stored.liveCue,
    desks,
  }

  const symbolMerge = mergeCustomSymbols(next.customSymbols ?? [], Array.isArray(incoming.customSymbols) ? incoming.customSymbols : [])
  if (symbolMerge.length <= 512 && symbolMerge.filter(symbol => !symbol.deleted).length <= 256) {
    next.customSymbols = symbolMerge
  }


  if (incoming.desks && typeof incoming.desks === 'object') {
    for (const [rawKey, value] of Object.entries(incoming.desks)) {
      const desk = asRecord(value)
      if (!desk || typeof desk.char !== 'string' || typeof desk.seenAt !== 'string') continue
      const key = rawKey.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 8)
      if (!key) continue
      const existing = next.desks![key]
      if (existing && existing.seenAt > desk.seenAt) continue
      next.desks![key] = {
        char: desk.char.slice(0, 4),
        since: typeof desk.since === 'string' ? desk.since : desk.seenAt,
        seenAt: desk.seenAt,
      }
    }
  }

  if (Array.isArray(incoming.contributions)) {
    const byId = new Map<string, unknown>()
    for (const item of next.contributions) {
      const id = contributionId(item)
      if (id) byId.set(id, item)
    }
    for (const item of incoming.contributions) {
      const id = contributionId(item)
      if (id) byId.set(id, item)
    }
    next.contributions = [...byId.values()]
  }

  if (Array.isArray(incoming.drafts)) {
    const byChar = new Map<string, unknown>()
    for (const draft of next.drafts) {
      const ch = draftChar(draft)
      if (ch) byChar.set(ch, draft)
    }
    const incomingTimes = incoming.draftUpdatedAt ?? {}
    for (const draft of incoming.drafts) {
      const ch = draftChar(draft)
      if (!ch) continue
      const incomingAt = typeof incomingTimes[ch] === 'string' ? incomingTimes[ch] : incoming.updatedAt
      const storedAt = next.draftUpdatedAt[ch] ?? ''
      if (!storedAt || !incomingAt || incomingAt >= storedAt) {
        const filled = asRecord(draft)?.filled
        const empty = Array.isArray(filled) && filled.length === 0
        if (empty) {
          if(asRecord(draft)?.fontDesign)byChar.set(ch,draft);else byChar.delete(ch)
          delete next.draftSvgs[ch]
        } else {
          byChar.set(ch, draft)
        }
        if (incomingAt) next.draftUpdatedAt[ch] = incomingAt
      }
    }
    next.drafts = [...byChar.values()]
  }

  if (incoming.draftSvgs && typeof incoming.draftSvgs === 'object') {
    for (const [ch, svg] of Object.entries(incoming.draftSvgs)) {
      if (typeof svg !== 'string') continue
      const incomingAt = incoming.draftUpdatedAt?.[ch] ?? incoming.updatedAt ?? next.updatedAt
      const storedAt = next.draftUpdatedAt[ch] ?? ''
      if (!storedAt || incomingAt >= storedAt) {
        if (svg === '') {
          delete next.draftSvgs[ch]
          // Shared clear: drop every desk's live cue for this letter.
          for (const [key, cue] of Object.entries(next.liveCues ?? {})) {
            if (cue?.char === ch) delete next.liveCues![key]
          }
        } else {
          next.draftSvgs[ch] = svg
        }
        next.draftUpdatedAt[ch] = incomingAt
      }
    }
  }

  if (incoming.liveCues && typeof incoming.liveCues === 'object') {
    for (const [rawKey, cue] of Object.entries(incoming.liveCues)) {
      if (!cue || typeof cue !== 'object') continue
      const typed = cue as LiveCue
      if (typeof typed.char !== 'string' || typeof typed.updatedAt !== 'string' ||
          typeof typed.liveSvg !== 'string') continue
      const key = stationKey({ ...typed, station: rawKey })
      const existing = next.liveCues![key]
      // Preview and letter geometry must follow the same clock. In particular a
      // delayed pre-clear preview must not resurrect a cleared letter.
      const letterAt = next.draftUpdatedAt[typed.char] ?? ''
      if ((existing && typed.updatedAt < existing.updatedAt) ||
          typed.updatedAt < (liveCueUpdatedAt[key] ?? '') || typed.updatedAt < letterAt) continue
      liveCueUpdatedAt[key] = typed.updatedAt
      if (!typed.liveSvg) delete next.liveCues![key]
      else next.liveCues![key] = { ...typed, station: key }
    }
  }

  if (incoming.liveCue && typeof incoming.liveCue === 'object') {
    const cue = incoming.liveCue as LiveCue
    if (
      typeof cue.char === 'string' &&
      typeof cue.liveSvg === 'string' &&
      typeof cue.updatedAt === 'string'
    ) {
      const key = stationKey(cue)
      const existing = next.liveCues![key]
      if ((!existing || cue.updatedAt >= existing.updatedAt) &&
          cue.updatedAt >= (liveCueUpdatedAt[key] ?? '') &&
          cue.updatedAt >= (next.draftUpdatedAt[cue.char] ?? '')) {
        liveCueUpdatedAt[key] = cue.updatedAt
        if (!cue.liveSvg) delete next.liveCues![key]
        else next.liveCues![key] = {
          char: cue.char,
          liveSvg: cue.liveSvg,
          updatedAt: cue.updatedAt,
          station: key,
        }
      }
    }
  }

  next.liveCue = newestLiveCue(next.liveCues ?? {})
  return next
}

function roomMessage(room: LiveRoomState): string {
  return JSON.stringify({ type: 'room', ...room })
}

export class FestivalRoom implements DurableObject {
  private ctx: DurableObjectState

  constructor(state: DurableObjectState) {
    this.ctx = state
  }

  private async load(): Promise<LiveRoomState> {
    return (await this.ctx.storage.get<LiveRoomState>('room')) ?? emptyRoom()
  }

  private async save(room: LiveRoomState): Promise<void> {
    await this.ctx.storage.put('room', room)
  }

  private async loadArchives(): Promise<RoomArchive[]> {
    const raw = await this.ctx.storage.get<RoomArchive[]>('archives')
    return Array.isArray(raw) ? raw : []
  }

  private async saveArchives(archives: RoomArchive[]): Promise<void> {
    await this.ctx.storage.put('archives', archives.slice(0, MAX_ARCHIVES))
  }

  private broadcast(room: LiveRoomState) {
    const payload = roomMessage(room)
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload)
      } catch {
        /* socket may already be closing */
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const parsed = parseRoomPath(url.pathname)
    const isWs =
      (parsed?.ws ?? false) || url.pathname.endsWith('/ws') || url.searchParams.get('ws') === '1'

    if (request.method === 'GET' && isWs) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return json({ error: 'Expected WebSocket upgrade' }, 426)
      }
      const pair = new WebSocketPair()
      const client = pair[0]
      const server = pair[1]
      this.ctx.acceptWebSocket(server)
      const room = await this.load()
      try {
        server.send(roomMessage(room))
      } catch {
        /* ignore */
      }
      return new Response(null, { status: 101, webSocket: client })
    }

    // Cloud archives of cleared sessions (not browser localStorage).
    if (parsed?.archives) {
      if (request.method === 'GET' && !parsed.archiveId) {
        const archives = await this.loadArchives()
        const list = archives.map(({ room: _room, ...meta }) => meta)
        return json({ archives: list })
      }
      if (request.method === 'GET' && parsed.archiveId && !parsed.restore) {
        const archives = await this.loadArchives()
        const hit = archives.find((a) => a.id === parsed.archiveId)
        if (!hit) return json({ error: 'Archive not found' }, 404)
        return json(hit)
      }
      if (request.method === 'POST' && parsed.archiveId && parsed.restore) {
        const archives = await this.loadArchives()
        const hit = archives.find((a) => a.id === parsed.archiveId)
        if (!hit) return json({ error: 'Archive not found' }, 404)
        const current = await this.load()
        const wipeEpoch = typeof current.wipeEpoch === 'number' ? current.wipeEpoch : 0
        const restored: LiveRoomState = {
          ...hit.room,
          wipeEpoch: wipeEpoch + 1,
          updatedAt: new Date().toISOString(),
          liveCues: {},
          liveCueUpdatedAt: {},
          liveCue: undefined,
          desks: {},
        }
        await this.save(restored)
        this.broadcast(restored)
        return json(restored)
      }
      return json({ error: 'Method not allowed' }, 405)
    }

    if (request.method === 'GET') {
      return json(await this.load())
    }
    if (request.method === 'DELETE') {
      const prev = await this.load()
      if (roomHasWork(prev)) {
        const clearedAt = new Date().toISOString()
        const id = `arch-${Date.now().toString(36)}`
        const entry: RoomArchive = {
          ...archiveMetaFromRoom(prev, clearedAt, id),
          room: {
            ...prev,
            liveCues: prev.liveCues ?? {},
            desks: {},
          },
        }
        const archives = await this.loadArchives()
        archives.unshift(entry)
        await this.saveArchives(archives)
      }
      const prevEpoch = typeof prev.wipeEpoch === 'number' ? prev.wipeEpoch : 0
      const cleared = emptyRoom(prevEpoch + 1)
      cleared.updatedAt = new Date().toISOString()
      await this.save(cleared)
      this.broadcast(cleared)
      return json(cleared)
    }
    if (request.method === 'PUT') {
      let body: Partial<LiveRoomState>
      try {
        body = (await request.json()) as Partial<LiveRoomState>
      } catch {
        return json({ error: 'Invalid JSON' }, 400)
      }
      const stored = await this.load()
      const merged = mergeRooms(stored, body)
      await this.save(merged)
      this.broadcast(merged)
      return json(merged)
    }
    return json({ error: 'Method not allowed' }, 405)
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // Clients may ping with "ping"; reply pong. Ignore other payloads.
    if (typeof message === 'string' && message === 'ping') {
      try {
        ws.send(JSON.stringify({ type: 'pong' }))
      } catch {
        /* ignore */
      }
    }
  }

  async webSocketClose() {
    /* hibernation cleans up */
  }

  async webSocketError() {
    /* hibernation cleans up */
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ ok: true, service: 'grid-workshop-live', realtime: true })
    }

    const parsed = parseRoomPath(url.pathname)
    if (!parsed) return json({ error: 'Not found' }, 404)

    if (request.method !== 'GET' && !authorized(request, env)) {
      return json({ error: 'Unauthorized' }, 401)
    }
    // Clear and restore both rewrite the live room — same password gate.
    const needsClearPassword =
      request.method === 'DELETE' || (request.method === 'POST' && parsed.restore)
    if (needsClearPassword && !env.CLEAR_ROOM_PASSWORD) {
      return json({ error: 'Shared room administration is not configured' }, 503)
    }
    if (needsClearPassword && !clearAllowed(request, env)) {
      return json({ error: 'Wrong password' }, 403)
    }

    const id = env.ROOMS.idFromName(parsed.room.toLowerCase())
    const stub = env.ROOMS.get(id)
    // Preserve path (/ws, /archives/…) for the DO handler.
    return stub.fetch(request)
  },
}
