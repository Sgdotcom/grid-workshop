/**
 * Unit-style smoke for client merge helpers (no Worker required).
 * Runs TypeScript via dynamic import of built logic inlined here to mirror src/lib/liveSession.ts.
 */
function mergeContributions(local, remote) {
  const byId = new Map()
  for (const item of local) byId.set(item.id, item)
  for (const item of remote) byId.set(item.id, item)
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function mergeDrafts(local, remote, remoteTimes, localTimes = {}) {
  const byChar = new Map()
  for (const draft of local) {
    if (draft.filled.length) byChar.set(draft.char, draft)
  }
  for (const draft of remote) {
    const remoteAt = remoteTimes[draft.char] ?? ''
    const localAt = localTimes[draft.char] ?? ''
    const existing = byChar.get(draft.char)
    const remoteWins = !existing || !localAt || (remoteAt && remoteAt >= localAt) || (!localAt && remoteAt)
    if (!remoteWins) continue
    if (!draft.filled.length) {
      byChar.delete(draft.char)
      continue
    }
    byChar.set(draft.char, draft)
  }
  return [...byChar.values()]
}

function pruneClearedDrafts(drafts, room) {
  const times = room.draftUpdatedAt ?? {}
  const svgs = room.draftSvgs ?? {}
  return drafts.filter((draft) => {
    if (!times[draft.char]) return true
    if (svgs[draft.char]) return true
    return false
  })
}

function normalizeLiveInput(live) {
  if (!live) return []
  if (Array.isArray(live)) return live.filter((c) => c?.liveSvg)
  if (typeof live === 'object' && 'char' in live && 'liveSvg' in live) {
    return live.liveSvg ? [live] : []
  }
  return Object.values(live).filter((c) => c?.liveSvg)
}

function letterPreviewSvg(char, contributions, draftSvgs, live) {
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

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const contribs = mergeContributions(
  [{ id: '1', createdAt: '2026-01-01T00:00:00.000Z', draft: { char: 'a' }, svg: 'A' }],
  [{ id: '2', createdAt: '2026-01-02T00:00:00.000Z', draft: { char: 'b' }, svg: 'B' }],
)
assert(contribs.length === 2, 'contribution union')

const drafts = mergeDrafts(
  [{ char: 'a', filled: [1] }],
  [{ char: 'a', filled: [2] }, { char: 'b', filled: [3] }],
  { a: '2026-01-02T00:00:00.000Z', b: '2026-01-02T00:00:00.000Z' },
  { a: '2026-01-01T00:00:00.000Z' },
)
assert(drafts.find((d) => d.char === 'a').filled[0] === 2, 'remote newer draft wins')
assert(drafts.find((d) => d.char === 'b'), 'remote-only draft kept')

const pub = letterPreviewSvg(
  'a',
  [{ id: '1', createdAt: 'x', draft: { char: 'a' }, svg: '<pub/>' }],
  { a: '<draft/>' },
  { char: 'a', liveSvg: '<live/>', updatedAt: 'x' },
)
assert(pub.kind === 'published', 'published beats draft/live')

const draft = letterPreviewSvg('c', [], { c: '<draft/>' }, undefined)
assert(draft.kind === 'draft', 'draft when no publish')

const live = letterPreviewSvg(
  'd',
  [],
  {},
  { char: 'd', liveSvg: '<live/>', updatedAt: 'x' },
)
assert(live.kind === 'live', 'live cue when no publish')

const multiA = letterPreviewSvg('a', [], {}, {
  a: { char: 'a', liveSvg: '<a/>', updatedAt: '1', station: 'a' },
  b: { char: 'b', liveSvg: '<b/>', updatedAt: '2', station: 'b' },
})
const multiB = letterPreviewSvg('b', [], {}, {
  a: { char: 'a', liveSvg: '<a/>', updatedAt: '1', station: 'a' },
  b: { char: 'b', liveSvg: '<b/>', updatedAt: '2', station: 'b' },
})
assert(multiA.kind === 'live' && multiA.svg === '<a/>', 'multi map live a')
assert(multiB.kind === 'live' && multiB.svg === '<b/>', 'multi map live b')

const afterClear = mergeDrafts(
  [{ char: 'a', filled: [1] }, { char: 'b', filled: [2] }],
  [{ char: 'a', filled: [] }],
  { a: '2026-01-03T00:00:00.000Z' },
  { a: '2026-01-01T00:00:00.000Z', b: '2026-01-01T00:00:00.000Z' },
)
assert(!afterClear.find((d) => d.char === 'a'), 'empty remote draft clears local a')
assert(afterClear.find((d) => d.char === 'b'), 'clear a keeps b')

const pruned = pruneClearedDrafts(
  [{ char: 'a', filled: [1] }, { char: 'b', filled: [2] }],
  { draftUpdatedAt: { a: 't' }, draftSvgs: { b: '<b/>' } },
)
assert(!pruned.find((d) => d.char === 'a'), 'pruneClearedDrafts drops tombstoned a')
assert(pruned.find((d) => d.char === 'b'), 'pruneClearedDrafts keeps b with svg')

console.log('[pass] live-client merge helpers')
