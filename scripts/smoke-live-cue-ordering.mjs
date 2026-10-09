/** Offline regression coverage against the actual Worker merge implementation. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const source = fs.readFileSync(new URL('../workers/live-session/src/index.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(`${source}\nexport { mergeRooms, emptyRoom };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText
const { mergeRooms, emptyRoom, FestivalRoom, default: worker } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const older = '2026-10-08T10:00:01.000Z'
const newer = '2026-10-08T10:00:02.000Z'
const cue = (station, at, svg, char = 'b') => ({ station, char, updatedAt: at, liveSvg: svg })
let room = mergeRooms(emptyRoom(), {
  liveCues: { B: cue('B', newer, 'new') },
  desks: { B: { char: 'b', since: newer, seenAt: newer } },
  draftUpdatedAt: { b: newer }, draftSvgs: { b: 'new' },
})
assert.deepEqual(Object.keys(room.liveCues), ['b'])
assert.deepEqual(Object.keys(room.desks), ['b'])
room = mergeRooms(room, { liveCues: { b: cue('b', older, 'old') }, draftUpdatedAt: { b: older }, draftSvgs: { b: 'old' } })
assert.equal(room.liveCues.b.liveSvg, 'new')
assert.equal(room.draftSvgs.b, 'new')
room = mergeRooms(room, { liveCues: { b: cue('b', newer, '') } })
room = mergeRooms(room, { liveCues: { b: cue('b', older, 'stale-other-letter', 'c') } })
assert.equal(room.liveCues.b, undefined, 'station release tombstone blocks older letter preview')
room = mergeRooms(room, { liveCue: cue('B', older, 'legacy-stale', 'c') })
assert.equal(room.liveCues.b, undefined, 'legacy cue follows same ordering')
const aliases = { ...emptyRoom(), liveCues: { B: cue('B', older, 'old'), b: cue('b', newer, 'new') }, desks: { B: { char: 'b', seenAt: newer, since: newer } } }
room = mergeRooms(aliases, {})
assert.deepEqual(Object.keys(room.liveCues), ['b'])
assert.equal(room.liveCues.b.liveSvg, 'new')
assert.deepEqual(Object.keys(room.desks), ['b'])
console.log('smoke-live-cue-ordering: passed canonical keys, stale updates, tombstones, legacy cues, stored aliases')

// Password gate is tested at the public Worker entry point, before any room access.
let roomCalls = 0
const rooms = {
  idFromName: () => 'test-room',
  get: () => ({ fetch: async () => { roomCalls += 1; return new Response('{}') } }),
}
for (const [method, path] of [['DELETE', '/rooms/test'], ['POST', '/rooms/test/archives/archive-id/restore']]) {
  const request = (password) => new Request(`https://local.test${path}`, {
    method, headers: password ? { 'X-Clear-Password': password } : {},
  })
  assert.equal((await worker.fetch(request(), { ROOMS: rooms })).status, 503)
  assert.equal((await worker.fetch(request('anything'), { ROOMS: rooms })).status, 503)
  assert.equal((await worker.fetch(request('wrong'), { ROOMS: rooms, CLEAR_ROOM_PASSWORD: 'test-only-password' })).status, 403)
  assert.equal((await worker.fetch(request('test-only-password'), { ROOMS: rooms, CLEAR_ROOM_PASSWORD: 'test-only-password' })).status, 200)
}
assert.equal(roomCalls, 2, 'only explicitly authorized admin requests reach room storage')
assert.equal((await worker.fetch(new Request('https://local.test/rooms/test', { method: 'PUT' }), { ROOMS: rooms })).status, 200)
assert.equal((await worker.fetch(new Request('https://local.test/rooms/test'), { ROOMS: rooms })).status, 200)
console.log('admin gate: missing password 503, wrong password 403, configured password accepted; painting and reading unchanged')
const symbol={char:'🦋',name:'Butterfly',updatedAt:newer}
let symbolRoom=mergeRooms(emptyRoom(),{customSymbols:[symbol]})
symbolRoom=mergeRooms(symbolRoom,{customSymbols:[{...symbol,name:'Old',updatedAt:older}]})
assert.equal(symbolRoom.customSymbols[0].name,'Butterfly')
symbolRoom=mergeRooms(symbolRoom,{customSymbols:[{...symbol,deleted:true}]})
symbolRoom=mergeRooms(symbolRoom,{customSymbols:[{...symbol,updatedAt:older}]})
assert.equal(symbolRoom.customSymbols[0].deleted,true)
const design={thickness:8,outlineOnly:true,mergeHorizontal:false,mergeVertical:true,mergeDiagonal:true}
symbolRoom=mergeRooms(symbolRoom,{drafts:[{char:'🦋',filled:[],fontDesign:design}],draftUpdatedAt:{'🦋':newer}})
assert.deepEqual(symbolRoom.drafts[0].fontDesign,design)
console.log('Custom metadata clocks, deletion tombstones, and empty-letter settings passed.')

// Restores replace the whole shared room and invalidate pending pre-restore writes.
const archived={...symbolRoom,customSymbols:[symbol],wipeEpoch:1}
const db=new Map([['room',{...symbolRoom,wipeEpoch:4}],['archives',[{id:'saved',room:archived}]]])
const durable=new FestivalRoom({storage:{get:async key=>db.get(key),put:async(key,value)=>db.set(key,value)},getWebSockets:()=>[]})
const restoredResponse=await durable.fetch(new Request('https://local.test/rooms/test/archives/saved/restore',{method:'POST'}))
const restored=await restoredResponse.json()
assert.equal(restored.wipeEpoch,5)
assert.deepEqual(restored.customSymbols,[symbol])
assert.deepEqual(restored.liveCueUpdatedAt,{})
assert.deepEqual(mergeRooms(restored,{wipeEpoch:4,customSymbols:[{...symbol,deleted:true}]}),restored)
const preflight=await worker.fetch(new Request('https://local.test/rooms/test',{method:'OPTIONS'}),{ROOMS:rooms})
assert.ok(preflight.headers.get('Access-Control-Allow-Methods').includes('POST'))
console.log('Archive restore: epoch advances, stale writes rejected, station clocks cleared, cross-origin POST allowed.')
const zoneSymbol={char:'\uE010',name:'A',updatedAt:'2026-10-09T10:00:00+02:00'}
const tieSymbol={...zoneSymbol,name:'Z',updatedAt:'2026-10-09T08:00:00Z'}
const forward=mergeRooms(mergeRooms(emptyRoom(),{customSymbols:[zoneSymbol]}),{customSymbols:[tieSymbol]})
const reverse=mergeRooms(mergeRooms(emptyRoom(),{customSymbols:[tieSymbol]}),{customSymbols:[zoneSymbol]})
assert.deepEqual(forward.customSymbols,reverse.customSymbols,'Equal instants and opposite order must converge')
assert.equal(forward.customSymbols[0].updatedAt,'2026-10-09T08:00:00.000Z')
assert.equal(forward.customSymbols[0].name,'Z')
const deletedTie={...zoneSymbol,deleted:true}
assert.equal(mergeRooms(forward,{customSymbols:[deletedTie]}).customSymbols[0].deleted,true)
assert.equal(mergeRooms(mergeRooms(emptyRoom(),{customSymbols:[deletedTie]}),{customSymbols:[tieSymbol]}).customSymbols[0].deleted,true)
const invalidSymbols=[{...zoneSymbol,char:'\uE011',name:'  '},{...zoneSymbol,char:'\u0903'}, {...zoneSymbol,char:'\uFDD0'}, {...zoneSymbol,char:String.fromCodePoint(0x1fffe)}, {...zoneSymbol,char:'a'}, {...zoneSymbol,char:'\uE012',updatedAt:'not-a-date'}]
assert.deepEqual(mergeRooms(emptyRoom(),{customSymbols:invalidSymbols}).customSymbols,[])
const oldStored={...emptyRoom(),customSymbols:[zoneSymbol]}
assert.equal(mergeRooms(oldStored,{}).customSymbols[0].updatedAt,'2026-10-09T08:00:00.000Z','Stored timestamp normalization is independent of new metadata')
console.log('Worker symbol validation: time zones canonicalized, same-clock updates converge, deletion wins, invalid names/marks/noncharacters rejected.')
