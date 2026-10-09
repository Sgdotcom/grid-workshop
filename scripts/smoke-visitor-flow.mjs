import assert from 'node:assert/strict'
import { createJiti } from 'jiti'
import { fileURLToPath } from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url))
const j=createJiti(import.meta.url,{alias:{'@':`${root}src`}})
const { nextEmptyLetter }=await j.import('../src/lib/festival.ts')
const { buildLivePayload, applyRoomToSession, planRemoteDeskApply }=await j.import('../src/lib/liveSession.ts')
const cell={key:'0:0',col:0,row:0,layer:'a',kind:'shape',shapeId:'preset-circle',size:42}
const draft=(char,ink=true)=>({char,filled:ink?[cell]:[],brokenJoins:[]})
const contribution={id:'one',createdAt:'2026-10-08T10:00:00Z',draft:draft('a'),svg:'<svg/>'}
assert.equal(nextEmptyLetter('a',false,[contribution],[draft('b')]),'c')
assert.equal(nextEmptyLetter('ö',false,[],[]),'a')
assert.equal(nextEmptyLetter('A',true,[{...contribution,draft:draft('B')}],[]),'c')
assert.equal(nextEmptyLetter('a',false,[],[...'abcdefghijklmnopqrstuvwxyzåäö'].map(c=>draft(c))),undefined)
const session={version:1,updatedAt:'2026-10-08T10:01:00Z',active:draft('b',false),drafts:[draft('a')],contributions:[contribution],library:[],liveSvg:'',draftUpdatedAt:{a:'2026-10-08T10:00:59Z'}}
const payload=buildLivePayload(session,{station:'a'})
assert.deepEqual(payload.drafts.map(d=>d.char),['a'],'Departing letter must still be sent')
assert.equal(payload.draftUpdatedAt.b,undefined,'Visiting empty letter must not create clock')
assert.equal(payload.draftSvgs.b,undefined,'Visiting empty letter must not clear peer')
session.draftUpdatedAt.b='2026-10-08T10:01:00Z'
const cleared=buildLivePayload(session,{station:'a'})
assert.equal(cleared.draftSvgs.b,'','Deliberate clear still sends tombstone')
console.log('Visitor flow: next untouched letter, wrap/case/full alphabet, quick-switch delivery and untouched-empty safety pass.')

const archivedSymbol={char:'\uE000',name:'Archived mark',updatedAt:'2026-10-08T10:00:00Z'}
const design={thickness:7,outlineOnly:true,mergeHorizontal:false,mergeVertical:true,mergeDiagonal:false}
const restoredRoom={updatedAt:'2026-10-09T08:00:00Z',wipeEpoch:5,customSymbols:[archivedSymbol],contributions:[],drafts:[{...draft('b',false),fontDesign:design}],draftSvgs:{},draftUpdatedAt:{b:'2026-10-08T10:00:00Z'}}
const local={...session,customSymbols:[{...archivedSymbol,deleted:true,updatedAt:'2026-10-09T07:59:00Z'}]}
const restoredSession=applyRoomToSession(local,restoredRoom,{keepLocalActive:true,restore:true})
assert.deepEqual(restoredSession.customSymbols,[archivedSymbol],'Restore must replace newer local symbol tombstones')
assert.deepEqual(restoredSession.active.fontDesign,design)
assert.deepEqual(restoredSession.drafts.map(d=>d.char),['b'],'Restore must drop newer non-archived drafts')
const plan=planRemoteDeskApply({session:restoredSession,liveRoom:restoredRoom,meta:{restore:true},localContributions:[],localGlyphs:new Map(),draftTimes:{},activeChar:'b',painting:false,activeFilledCount:0,currentLiveSvg:''})
assert.equal(plan.activeChange.type,'apply','Empty archived letter must restore its settings')
console.log('Client archive restore: exact symbols, draft replacement, empty-letter design settings passed.')
