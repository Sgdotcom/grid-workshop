/**
 * Shared festival room for grid-workshop install desks + wall.
 * GET is public; PUT/DELETE require LIVE_WRITE_TOKEN when configured.
 */

export interface LiveCue {
  char: string
  station?: string
  liveSvg: string
  updatedAt: string
}

export interface LiveRoomState {
  updatedAt: string
  contributions: unknown[]
  drafts: unknown[]
  draftSvgs: Record<string, string>
  draftUpdatedAt: Record<string, string>
  liveCue?: LiveCue
}

export interface Env {
  ROOMS: DurableObjectNamespace
  LIVE_WRITE_TOKEN?: string
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function emptyRoom(): LiveRoomState {
  return {
    updatedAt: new Date(0).toISOString(),
    contributions: [],
    drafts: [],
    draftSvgs: {},
    draftUpdatedAt: {},
  }
}

function roomIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/rooms\/([a-zA-Z0-9_-]{1,64})\/?$/)
  return match?.[1] ?? null
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

function mergeRooms(stored: LiveRoomState, incoming: Partial<LiveRoomState>): LiveRoomState {
  const next: LiveRoomState = {
    updatedAt: new Date().toISOString(),
    contributions: [...stored.contributions],
    drafts: [...stored.drafts],
    draftSvgs: { ...stored.draftSvgs },
    draftUpdatedAt: { ...stored.draftUpdatedAt },
    liveCue: stored.liveCue,
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
        byChar.set(ch, draft)
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
        next.draftSvgs[ch] = svg
        next.draftUpdatedAt[ch] = incomingAt
      }
    }
  }

  if (incoming.liveCue && typeof incoming.liveCue === 'object') {
    const cue = incoming.liveCue as LiveCue
    if (
      typeof cue.char === 'string' &&
      typeof cue.liveSvg === 'string' &&
      typeof cue.updatedAt === 'string'
    ) {
      if (!next.liveCue || cue.updatedAt >= next.liveCue.updatedAt) {
        next.liveCue = {
          char: cue.char,
          liveSvg: cue.liveSvg,
          updatedAt: cue.updatedAt,
          ...(typeof cue.station === 'string' ? { station: cue.station } : {}),
        }
      }
    }
  }

  return next
}

export class FestivalRoom implements DurableObject {
  private state: DurableObjectState

  constructor(state: DurableObjectState) {
    this.state = state
  }

  private async load(): Promise<LiveRoomState> {
    return (await this.state.storage.get<LiveRoomState>('room')) ?? emptyRoom()
  }

  private async save(room: LiveRoomState): Promise<void> {
    await this.state.storage.put('room', room)
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return json(await this.load())
    }
    if (request.method === 'DELETE') {
      const cleared = emptyRoom()
      cleared.updatedAt = new Date().toISOString()
      await this.save(cleared)
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
      return json(merged)
    }
    return json({ error: 'Method not allowed' }, 405)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ ok: true, service: 'grid-workshop-live' })
    }

    const room = roomIdFromPath(url.pathname)
    if (!room) return json({ error: 'Not found' }, 404)

    if (request.method !== 'GET' && !authorized(request, env)) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const id = env.ROOMS.idFromName(room.toLowerCase())
    const stub = env.ROOMS.get(id)
    return stub.fetch(request)
  },
}
