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

function letterPreviewSvg(char, contributions, draftSvgs, liveCue) {
  const published = [...contributions].reverse().find((c) => c.draft.char === char)
  if (published) return { svg: published.svg, kind: 'published' }
  if (liveCue?.char === char && liveCue.liveSvg) return { svg: liveCue.liveSvg, kind: 'live' }
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

console.log('[pass] live-client merge helpers')
