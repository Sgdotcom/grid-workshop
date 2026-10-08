/**
 * Unit layer for live adversarial smoke — imports real liveSession.ts (via vite-node).
 * Usage: npx vite-node scripts/smoke-live-adversarial-unit.ts
 */
import assert from 'node:assert/strict'
import {
  applyRoomToSession,
  buildLivePayload,
  isEmptyLiveRoom,
  isLetterClearedInRoom,
  pruneClearedDrafts,
  type LiveRoomState,
} from '../src/lib/liveSession'
import type { FestivalSession } from '../src/lib/festival'
import { DEFAULT_GRID } from '../src/lib/gridGeometry'
import { PRESET_SHAPES } from '../src/lib/types'

function localSession(overrides: Partial<FestivalSession> = {}): FestivalSession {
  return {
    version: 1,
    updatedAt: '2026-10-07T12:00:00.000Z',
    active: {
      char: 'a',
      filled: [
        {
          key: '0:0',
          layer: 'a',
          col: 0,
          row: 0,
          kind: 'shape',
          shapeId: 'circle',
          size: 1,
          mode: 'ink',
        },
      ],
      brokenJoins: [],
      grid: DEFAULT_GRID,
      softness: 0.55,
      cornerRadius: 0,
      holeMode: 'open',
    },
    drafts: [
      {
        char: 'a',
        filled: [
          {
            key: '0:0',
            layer: 'a',
            col: 0,
            row: 0,
            kind: 'shape',
            shapeId: 'circle',
            size: 1,
            mode: 'ink',
          },
        ],
        brokenJoins: [],
        grid: DEFAULT_GRID,
        softness: 0.55,
        cornerRadius: 0,
        holeMode: 'open',
      },
      {
        char: 'b',
        filled: [
          {
            key: '1:1',
            layer: 'a',
            col: 1,
            row: 1,
            kind: 'shape',
            shapeId: 'square',
            size: 1,
            mode: 'ink',
          },
        ],
        brokenJoins: [],
        grid: DEFAULT_GRID,
        softness: 0.55,
        cornerRadius: 0,
        holeMode: 'open',
      },
    ],
    contributions: [
      {
        id: 'local-a',
        createdAt: '2026-10-07T11:00:00.000Z',
        draft: {
          char: 'a',
          filled: [
            {
              key: '0:0',
              layer: 'a',
              col: 0,
              row: 0,
              kind: 'shape',
              shapeId: 'circle',
              size: 1,
              mode: 'ink',
            },
          ],
          brokenJoins: [],
        },
        svg: '<svg id="local-a"/>',
      },
    ],
    library: [...PRESET_SHAPES],
    liveSvg: '<svg id="local-live"/>',
    ...overrides,
  }
}

function emptyRoom(overrides: Partial<LiveRoomState> = {}): LiveRoomState {
  return {
    updatedAt: '2026-10-07T13:00:00.000Z',
    wipeEpoch: 2,
    contributions: [],
    drafts: [],
    draftSvgs: {},
    draftUpdatedAt: {},
    liveCues: {},
    ...overrides,
  }
}

console.log('[unit] applyRoom / wipe / tombstone / payload')

const emptyKeep = applyRoomToSession(localSession(), emptyRoom(), { keepLocalActive: true })
assert.ok(emptyKeep.contributions.some((c) => c.id === 'local-a'), 'empty room without sharedWipe keeps local publishes')
assert.ok(emptyKeep.active.filled.length > 0, 'empty room without sharedWipe keeps canvas while painting')
assert.equal(emptyKeep.active.char, 'a', 'keepLocalActive preserves active letter char')

const wiped = applyRoomToSession(localSession(), emptyRoom(), {
  keepLocalActive: true,
  sharedWipe: true,
})
assert.equal(wiped.contributions.length, 0, 'sharedWipe clears contributions')
assert.equal(wiped.drafts.length, 0, 'sharedWipe clears drafts')
assert.equal(wiped.active.filled.length, 0, 'sharedWipe clears active canvas')
assert.equal(wiped.liveSvg, '', 'sharedWipe clears liveSvg')
assert.equal(isEmptyLiveRoom(emptyRoom()), true, 'isEmptyLiveRoom true for empty')
console.log('[ok] empty room wipe')

const remote: LiveRoomState = {
  updatedAt: '2026-10-07T13:01:00.000Z',
  wipeEpoch: 2,
  contributions: [
    {
      id: 'remote-c',
      createdAt: '2026-10-07T12:30:00.000Z',
      draft: { char: 'c', filled: [], brokenJoins: [] },
      svg: '<svg id="remote-c"/>',
    },
  ],
  drafts: [
    {
      char: 'c',
      filled: [
        {
          key: '2:2',
          layer: 'a',
          col: 2,
          row: 2,
          kind: 'shape',
          shapeId: 'circle',
          size: 1,
          mode: 'ink',
        },
      ],
      brokenJoins: [],
      grid: DEFAULT_GRID,
      softness: 0.5,
      cornerRadius: 0,
      holeMode: 'open',
    },
  ],
  draftSvgs: { c: '<svg id="c-draft"/>' },
  draftUpdatedAt: { c: '2026-10-07T13:01:00.000Z' },
  liveCues: {},
}
const merged = applyRoomToSession(localSession(), remote, { keepLocalActive: true })
assert.ok(
  merged.contributions.some((c) => c.id === 'local-a') &&
    merged.contributions.some((c) => c.id === 'remote-c'),
  'non-empty room unions contributions',
)
assert.ok(merged.active.filled.length > 0, 'keepLocalActive keeps local ink on non-empty room')
assert.equal(isEmptyLiveRoom(remote), false, 'isEmptyLiveRoom false when drafts present')
console.log('[ok] non-empty union')

const tombstoned = {
  draftSvgs: { a: undefined as unknown as string },
  draftUpdatedAt: { a: '2026-10-07T13:02:00.000Z' },
}
// Simulate cleared letter a: no svg key, but updatedAt set
const roomTomb: LiveRoomState = emptyRoom({
  contributions: remote.contributions,
  drafts: [
    {
      char: 'a',
      filled: [
        {
          key: '0:0',
          layer: 'a',
          col: 0,
          row: 0,
          kind: 'shape',
          shapeId: 'circle',
          size: 1,
          mode: 'ink',
        },
      ],
      brokenJoins: [],
      grid: DEFAULT_GRID,
      softness: 0.55,
      cornerRadius: 0,
      holeMode: 'open',
    },
    {
      char: 'b',
      filled: [
        {
          key: '1:1',
          layer: 'a',
          col: 1,
          row: 1,
          kind: 'shape',
          shapeId: 'square',
          size: 1,
          mode: 'ink',
        },
      ],
      brokenJoins: [],
      grid: DEFAULT_GRID,
      softness: 0.55,
      cornerRadius: 0,
      holeMode: 'open',
    },
  ],
  draftSvgs: { b: '<svg id="b"/>' },
  draftUpdatedAt: { a: '2026-10-07T13:02:00.000Z', b: '2026-10-07T13:01:00.000Z' },
})
assert.equal(isLetterClearedInRoom('a', roomTomb), true, 'letter a tombstoned')
assert.equal(isLetterClearedInRoom('b', roomTomb), false, 'letter b not tombstoned')
const pruned = pruneClearedDrafts(roomTomb.drafts, roomTomb)
assert.ok(!pruned.some((d) => d.char === 'a'), 'prune drops cleared a')
assert.ok(pruned.some((d) => d.char === 'b'), 'prune keeps b')
void tombstoned
console.log('[ok] letter tombstone prune')

const emptyActive = localSession({
  active: {
    char: 'a',
    filled: [],
    brokenJoins: [],
    grid: DEFAULT_GRID,
    softness: 0.55,
    cornerRadius: 0,
    holeMode: 'open',
  },
  drafts: [],
  liveSvg: '',
})
const payload = buildLivePayload(emptyActive, { station: 'a', wipeEpoch: 3 })
assert.equal(payload.draftSvgs?.a, '', 'empty active sends draftSvg tombstone')
assert.equal(payload.liveCue?.liveSvg, '', 'empty active sends empty liveCue')
assert.equal(payload.wipeEpoch, 3, 'payload echoes wipeEpoch')
console.log('[ok] buildLivePayload tombstone')

console.log('[pass] smoke-live-adversarial-unit')
