/**
 * Smoke test for live-session Worker merge + auth behaviour.
 * Usage: node scripts/smoke-live-session.mjs [baseUrl]
 * Default baseUrl: http://127.0.0.1:8787
 */
const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/+$/, '')
const room = `smoke-${Date.now().toString(36)}`
const token = process.env.LIVE_WRITE_TOKEN || ''

function headers(method) {
  const h = { Accept: 'application/json' }
  if (method !== 'GET') {
    h['Content-Type'] = 'application/json'
    if (token) h.Authorization = `Bearer ${token}`
  }
  // Public repo: the facilitator password only ever comes from the environment.
  if (method === 'DELETE' && process.env.CLEAR_ROOM_PASSWORD) {
    h['X-Clear-Password'] = process.env.CLEAR_ROOM_PASSWORD
  }
  return h
}

async function req(method, path, body) {
  const url = new URL(`${base}${path}`)
  if (token && method !== 'GET') url.searchParams.set('token', token)
  const res = await fetch(url, {
    method,
    headers: headers(method),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  return { status: res.status, json }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function main() {
  console.log(`[smoke] base=${base} room=${room}`)

  const health = await req('GET', '/health')
  assert(health.status === 200 && health.json.ok, `health failed: ${health.status}`)
  console.log('[ok] health')

  const empty = await req('GET', `/rooms/${room}`)
  assert(empty.status === 200, `GET empty room failed: ${empty.status}`)
  assert(Array.isArray(empty.json.contributions), 'room missing contributions')
  console.log('[ok] GET empty room')

  const deskA = await req('PUT', `/rooms/${room}`, {
    updatedAt: '2026-10-07T12:00:00.000Z',
    contributions: [
      {
        id: 'pub-a',
        createdAt: '2026-10-07T12:00:00.000Z',
        draft: { char: 'a', filled: [{ key: '1' }], brokenJoins: [] },
        svg: '<svg id="a"/>',
      },
    ],
    drafts: [{ char: 'a', filled: [{ key: '1' }], brokenJoins: [] }],
    draftSvgs: { a: '<svg id="a-draft"/>' },
    draftUpdatedAt: { a: '2026-10-07T12:00:00.000Z' },
    liveCue: {
      char: 'a',
      station: 'a',
      liveSvg: '<svg id="live-a"/>',
      updatedAt: '2026-10-07T12:00:00.000Z',
    },
  })
  assert(deskA.status === 200, `desk A PUT failed: ${deskA.status} ${JSON.stringify(deskA.json)}`)
  assert(deskA.json.contributions.some((c) => c.id === 'pub-a'), 'desk A contribution missing')
  assert(deskA.json.draftSvgs.a === '<svg id="a-draft"/>', 'desk A draftSvg missing')
  assert(deskA.json.liveCue?.char === 'a', 'desk A liveCue missing')
  assert(deskA.json.liveCues?.a?.liveSvg === '<svg id="live-a"/>', 'desk A liveCues.a missing')
  console.log('[ok] desk A PUT')

  const deskB = await req('PUT', `/rooms/${room}`, {
    updatedAt: '2026-10-07T12:00:01.000Z',
    contributions: [
      {
        id: 'pub-b',
        createdAt: '2026-10-07T12:00:01.000Z',
        draft: { char: 'b', filled: [{ key: '2' }], brokenJoins: [] },
        svg: '<svg id="b"/>',
      },
    ],
    drafts: [{ char: 'b', filled: [{ key: '2' }], brokenJoins: [] }],
    draftSvgs: { b: '<svg id="b-draft"/>' },
    draftUpdatedAt: { b: '2026-10-07T12:00:01.000Z' },
    liveCue: {
      char: 'b',
      station: 'b',
      liveSvg: '<svg id="live-b"/>',
      updatedAt: '2026-10-07T12:00:01.000Z',
    },
  })
  assert(deskB.status === 200, `desk B PUT failed: ${deskB.status}`)
  const ids = new Set(deskB.json.contributions.map((c) => c.id))
  assert(ids.has('pub-a') && ids.has('pub-b'), `contribution union failed: ${[...ids]}`)
  assert(deskB.json.draftSvgs.a === '<svg id="a-draft"/>', 'desk A draftSvg lost after B push')
  assert(deskB.json.draftSvgs.b === '<svg id="b-draft"/>', 'desk B draftSvg missing')
  assert(deskB.json.liveCues?.a?.liveSvg === '<svg id="live-a"/>', 'desk A live cue lost after B push')
  assert(deskB.json.liveCues?.b?.liveSvg === '<svg id="live-b"/>', 'desk B live cue missing')
  assert(deskB.json.liveCue?.char === 'b', 'compat liveCue should be newest desk')
  console.log('[ok] desk B merge (union + multi live cues)')

  const staleCue = await req('PUT', `/rooms/${room}`, {
    liveCue: {
      char: 'a',
      station: 'a',
      liveSvg: '<svg id="stale"/>',
      updatedAt: '2026-10-07T11:00:00.000Z',
    },
  })
  assert(staleCue.json.liveCues?.a?.liveSvg === '<svg id="live-a"/>', 'stale liveCue should not overwrite station a')
  assert(staleCue.json.liveCues?.b?.liveSvg === '<svg id="live-b"/>', 'stale update must keep station b')
  assert(staleCue.json.liveCue?.char === 'b', 'compat liveCue should stay newest')
  console.log('[ok] stale liveCue ignored')

  // Desk B also showing letter a — shared clear should drop both stations' a cues.
  await req('PUT', `/rooms/${room}`, {
    liveCue: {
      char: 'a',
      station: 'b',
      liveSvg: '<svg id="live-b-on-a"/>',
      updatedAt: '2026-10-07T12:00:01.500Z',
    },
  })
  const clearA = await req('PUT', `/rooms/${room}`, {
    draftSvgs: { a: '' },
    draftUpdatedAt: { a: '2026-10-07T12:00:02.000Z' },
    drafts: [{ char: 'a', filled: [], brokenJoins: [] }],
    liveCue: {
      char: 'a',
      station: 'a',
      liveSvg: '',
      updatedAt: '2026-10-07T12:00:02.000Z',
    },
  })
  assert(!clearA.json.liveCues?.a, 'empty liveSvg should drop station a')
  assert(!clearA.json.draftSvgs?.a, 'empty draftSvg should drop draft a')
  assert(!clearA.json.liveCues?.b, 'clearing letter a must drop every station cue for a')
  assert(clearA.json.draftSvgs?.b, 'clearing a must keep draft b')
  console.log('[ok] clear letter a drops all live cues for a')

  // Restore desk B on letter b for remaining checks
  await req('PUT', `/rooms/${room}`, {
    liveCue: {
      char: 'b',
      station: 'b',
      liveSvg: '<svg id="live-b"/>',
      updatedAt: '2026-10-07T12:00:03.000Z',
    },
    draftSvgs: { b: '<svg id="b-draft"/>' },
    draftUpdatedAt: { b: '2026-10-07T12:00:03.000Z' },
  })

  const wall = await req('GET', `/rooms/${room}`)
  assert(wall.status === 200, 'wall GET failed')
  assert(wall.json.contributions.length === 2, 'wall should see both publishes')
  assert(!wall.json.draftSvgs?.a, 'wall should not see cleared draft a')
  assert(wall.json.draftSvgs?.b, 'wall should still see draft b')
  assert(wall.json.liveCues?.b?.liveSvg, 'wall should still see desk B live')
  console.log('[ok] wall GET sees full room')

  const cleared = await req('DELETE', `/rooms/${room}`)
  assert(cleared.status === 200, `DELETE failed: ${cleared.status}`)
  assert((cleared.json.contributions || []).length === 0, 'DELETE did not clear contributions')
  const wipeEpoch = cleared.json.wipeEpoch
  assert(typeof wipeEpoch === 'number' && wipeEpoch >= 1, 'DELETE should bump wipeEpoch')
  const after = await req('GET', `/rooms/${room}`)
  assert((after.json.contributions || []).length === 0, 'room not empty after DELETE')
  console.log('[ok] DELETE clears room')

  // Stale pre-clear PUT must not resurrect contributions.
  const stale = await req('PUT', `/rooms/${room}`, {
    wipeEpoch: wipeEpoch - 1,
    contributions: [
      {
        id: 'ghost',
        createdAt: '2026-10-07T12:00:00.000Z',
        draft: { char: 'z', filled: [{ key: '1' }], brokenJoins: [] },
        svg: '<svg id="ghost"/>',
      },
    ],
    draftSvgs: { z: '<svg id="ghost-draft"/>' },
    draftUpdatedAt: { z: '2026-10-07T12:00:00.000Z' },
  })
  assert(stale.status === 200, 'stale PUT should still 200')
  assert((stale.json.contributions || []).length === 0, 'stale PUT must not refill room')
  assert(!stale.json.draftSvgs?.z, 'stale PUT must not restore draftSvg')
  console.log('[ok] stale PUT ignored after wipe')

  // Legacy clients omit wipeEpoch — must still paint after a clear.
  const legacy = await req('PUT', `/rooms/${room}`, {
    contributions: [
      {
        id: 'legacy-post-wipe',
        createdAt: '2026-10-07T12:06:00.000Z',
        draft: { char: 'l', filled: [{ key: '1' }], brokenJoins: [] },
        svg: '<svg id="legacy"/>',
      },
    ],
    draftSvgs: { l: '<svg id="legacy-draft"/>' },
    draftUpdatedAt: { l: '2026-10-07T12:06:00.000Z' },
  })
  assert(
    (legacy.json.contributions || []).some((c) => c.id === 'legacy-post-wipe'),
    'legacy PUT without wipeEpoch should apply after clear',
  )
  console.log('[ok] legacy PUT without wipeEpoch applies')

  const cleared2 = await req('DELETE', `/rooms/${room}`)
  const wipeEpoch2 = cleared2.json.wipeEpoch
  assert(typeof wipeEpoch2 === 'number' && wipeEpoch2 > wipeEpoch, 'second DELETE bumps wipeEpoch')

  const fresh = await req('PUT', `/rooms/${room}`, {
    wipeEpoch: wipeEpoch2,
    contributions: [
      {
        id: 'post-wipe',
        createdAt: '2026-10-07T12:05:00.000Z',
        draft: { char: 'm', filled: [{ key: '1' }], brokenJoins: [] },
        svg: '<svg id="m"/>',
      },
    ],
    drafts: [{ char: 'm', filled: [{ key: '1' }], brokenJoins: [] }],
    draftSvgs: { m: '<svg id="m-draft"/>' },
    draftUpdatedAt: { m: '2026-10-07T12:05:00.000Z' },
  })
  assert(fresh.json.contributions?.some((c) => c.id === 'post-wipe'), 'post-wipe PUT should apply')
  console.log('[ok] post-wipe PUT applies')

  // boom vs roomB must stay isolated Durable Object rooms
  const boom = `boom-iso-${Date.now().toString(36)}`
  const roomB = `room-b-iso-${Date.now().toString(36)}`
  await req('PUT', `/rooms/${boom}`, {
    liveCue: {
      char: 'x',
      station: 'a',
      liveSvg: '<svg id="boom"/>',
      updatedAt: '2026-10-07T13:00:00.000Z',
    },
    draftSvgs: { x: '<svg id="boom-draft"/>' },
    draftUpdatedAt: { x: '2026-10-07T13:00:00.000Z' },
  })
  await req('PUT', `/rooms/${roomB}`, {
    liveCue: {
      char: 'y',
      station: 'a',
      liveSvg: '<svg id="roomB"/>',
      updatedAt: '2026-10-07T13:00:00.000Z',
    },
    draftSvgs: { y: '<svg id="roomB-draft"/>' },
    draftUpdatedAt: { y: '2026-10-07T13:00:00.000Z' },
  })
  const boomGet = await req('GET', `/rooms/${boom}`)
  const roomBGet = await req('GET', `/rooms/${roomB}`)
  assert(boomGet.json.liveCues?.a?.liveSvg === '<svg id="boom"/>', 'boom room own cue')
  assert(roomBGet.json.liveCues?.a?.liveSvg === '<svg id="roomB"/>', 'roomB room own cue')
  assert(!boomGet.json.draftSvgs?.y, 'boom must not see roomB draft')
  assert(!roomBGet.json.draftSvgs?.x, 'roomB must not see boom draft')
  console.log('[ok] two rooms are isolated')

  console.log('[pass] live-session smoke')
}

main().catch((err) => {
  console.error('[fail]', err.message || err)
  process.exit(1)
})
