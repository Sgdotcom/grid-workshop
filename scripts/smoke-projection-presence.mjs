import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { projectionLiveCues, PRESENCE_TTL_MS } = await server.ssrLoadModule('/src/lib/liveSession.ts')
  const { projectionLetters } = await server.ssrLoadModule('/src/lib/projectionAlphabet.ts')
  const extraLetters = projectionLetters(['a', 'A', '1', '!', '\ue000', '\ue001', '☂', '1'], false, [
    { char: '\ue000', name: 'Keep', updatedAt: '2026-10-09' },
    { char: '\ue001', name: 'Deleted', updatedAt: '2026-10-09', deleted: true },
  ])
  assert.equal(extraLetters.length, 32)
  assert.deepEqual(extraLetters.slice(29), ['1', '!', '\ue000'])
  assert.equal(projectionLetters(['a'], true)[0], 'A')
  const now = Date.now()
  const at = new Date(now).toISOString()
  const older = new Date(now - 1000).toISOString()
  const cue = (station, updatedAt = at) => ({ station, char: 'a', liveSvg: `<svg id="${station}"/>`, updatedAt })
  const desk = { char: 'a', since: at, seenAt: at }
  const room = { updatedAt: at, contributions: [], drafts: [], draftSvgs: {}, draftUpdatedAt: {},
    desks: { a: desk, b: desk, w_test: desk, desk: desk },
    liveCues: { A: cue('A', older), a: cue('a'), b: cue('b'), w_test: cue('w_test'), desk: cue('desk') } }
  assert.deepEqual(projectionLiveCues(room, now).map(c => c.station), ['a', 'b'])
  assert.equal(projectionLiveCues(room, now)[0].updatedAt, at)
  room.desks.a = { ...desk, char: '' }
  assert.deepEqual(projectionLiveCues(room, now).map(c => c.station), ['b'])
  assert.deepEqual(projectionLiveCues(room, now + PRESENCE_TTL_MS + 1), [])
  room.desks.a = { ...desk, char: 'z' }
  assert.deepEqual(projectionLiveCues(room, now).map(c => c.station), ['b'])
  room.desks.a = desk
  delete room.liveCues
  room.liveCue = cue('A')
  assert.deepEqual(projectionLiveCues(room, now).map(c => c.station), ['a'])
  console.log('Projection: two desks only, aliases deduped, release/expiry/change handled, legacy cue supported.')
} finally {
  await server.close()
}
