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
  assert(clearA.json.liveCues?.b?.liveSvg === '<svg id="live-b"/>', 'clearing a must keep station b')
  assert(clearA.json.draftSvgs?.b, 'clearing a must keep draft b')
  assert(clearA.json.liveCue?.char === 'b', 'compat liveCue should fall back to b')
  console.log('[ok] clear station a keeps station b')

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
  const after = await req('GET', `/rooms/${room}`)
  assert((after.json.contributions || []).length === 0, 'room not empty after DELETE')
  console.log('[ok] DELETE clears room')

  // boom vs bobby must stay isolated Durable Object rooms
  const boom = `boom-iso-${Date.now().toString(36)}`
  const bobby = `bobby-iso-${Date.now().toString(36)}`
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
  await req('PUT', `/rooms/${bobby}`, {
    liveCue: {
      char: 'y',
      station: 'a',
      liveSvg: '<svg id="bobby"/>',
      updatedAt: '2026-10-07T13:00:00.000Z',
    },
    draftSvgs: { y: '<svg id="bobby-draft"/>' },
    draftUpdatedAt: { y: '2026-10-07T13:00:00.000Z' },
  })
  const boomGet = await req('GET', `/rooms/${boom}`)
  const bobbyGet = await req('GET', `/rooms/${bobby}`)
  assert(boomGet.json.liveCues?.a?.liveSvg === '<svg id="boom"/>', 'boom room own cue')
  assert(bobbyGet.json.liveCues?.a?.liveSvg === '<svg id="bobby"/>', 'bobby room own cue')
  assert(!boomGet.json.draftSvgs?.y, 'boom must not see bobby draft')
  assert(!bobbyGet.json.draftSvgs?.x, 'bobby must not see boom draft')
  console.log('[ok] boom and bobby rooms are isolated')

  console.log('[pass] live-session smoke')
}

main().catch((err) => {
  console.error('[fail]', err.message || err)
  process.exit(1)
})
