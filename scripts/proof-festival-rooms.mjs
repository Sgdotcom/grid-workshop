/**
 * Prove boom and bobby are separate live sessions.
 * For each room: two desk agents draw a + b together, wall screenshots,
 * then assert the other room was not polluted.
 *
 * Usage: node scripts/proof-festival-rooms.mjs [siteBase]
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const siteBase = (process.argv[2] || 'https://sgdotcom.github.io/grid-workshop/').replace(/\/?$/, '/')
const worker = process.env.VITE_LIVE_SESSION_URL || 'https://grid-workshop-live.sgdotcom.workers.dev'
const root = process.cwd()
const outRoot = path.join(root, 'scratch', 'festival-room-proof', `run-${Date.now().toString(36)}`)

async function clearRoom(room) {
  const res = await fetch(`${worker}/rooms/${room}`, { method: 'DELETE' })
  assert.equal(res.status, 200, `DELETE ${room} failed`)
}

async function getRoom(room) {
  const res = await fetch(`${worker}/rooms/${room}`)
  assert.equal(res.status, 200, `GET ${room} failed`)
  return res.json()
}

function runDual(room) {
  const proofDir = path.join(outRoot, room)
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(root, 'scripts', 'dual-agent-live-proof.mjs'), siteBase],
      {
        cwd: root,
        env: { ...process.env, ROOM: room, PROOF_DIR: proofDir, VITE_LIVE_SESSION_URL: worker },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let out = ''
    child.stdout.on('data', (d) => {
      out += d
      process.stdout.write(d)
    })
    child.stderr.on('data', (d) => {
      out += d
      process.stderr.write(d)
    })
    child.on('exit', (code) => {
      if (code === 0) resolve({ room, proofDir, out })
      else reject(new Error(`dual-agent failed for ${room} (exit ${code})\n${out}`))
    })
  })
}

function cueFingerprint(roomJson) {
  const cues = roomJson.liveCues || {}
  return Object.fromEntries(
    Object.entries(cues).map(([station, cue]) => [
      station,
      { char: cue.char, svgLen: (cue.liveSvg || '').length, at: cue.updatedAt },
    ]),
  )
}

await mkdir(outRoot, { recursive: true })
console.log(`[proof] site=${siteBase}`)
console.log(`[proof] out=${outRoot}`)

assert.equal((await fetch(`${worker}/health`)).status, 200)

console.log('\n=== Clear boom + bobby ===')
await clearRoom('boom')
await clearRoom('bobby')
assert.equal(Object.keys((await getRoom('boom')).liveCues || {}).length, 0, 'boom should be empty')
assert.equal(Object.keys((await getRoom('bobby')).liveCues || {}).length, 0, 'bobby should be empty')

console.log('\n=== BOBBY: two agents draw ===')
const bobbyRun = await runDual('bobby')
const bobbyAfter = await getRoom('bobby')
const boomDuringBobby = await getRoom('boom')
assert.ok(bobbyAfter.liveCues?.a?.liveSvg, 'bobby missing desk A')
assert.ok(bobbyAfter.liveCues?.b?.liveSvg, 'bobby missing desk B')
assert.equal(
  Object.keys(boomDuringBobby.liveCues || {}).length,
  0,
  'boom must stay empty while bobby draws',
)
assert.ok(!boomDuringBobby.draftSvgs?.a && !boomDuringBobby.draftSvgs?.b, 'boom must not get bobby drafts')
console.log('[ok] bobby synced; boom untouched')

console.log('\n=== BOOM: two agents draw ===')
const boomRun = await runDual('boom')
const boomAfter = await getRoom('boom')
const bobbyAfterBoom = await getRoom('bobby')
assert.ok(boomAfter.liveCues?.a?.liveSvg, 'boom missing desk A')
assert.ok(boomAfter.liveCues?.b?.liveSvg, 'boom missing desk B')
assert.ok(bobbyAfterBoom.liveCues?.a?.liveSvg, 'bobby lost desk A after boom drew')
assert.ok(bobbyAfterBoom.liveCues?.b?.liveSvg, 'bobby lost desk B after boom drew')
assert.notEqual(
  bobbyAfterBoom.liveCues.a.liveSvg,
  boomAfter.liveCues.a.liveSvg,
  'bobby and boom desk-A SVGs must differ (separate rooms)',
)
console.log('[ok] boom synced; bobby still intact and different')

const summary = {
  siteBase,
  worker,
  outRoot,
  bobby: { proofDir: bobbyRun.proofDir, cues: cueFingerprint(bobbyAfterBoom) },
  boom: { proofDir: boomRun.proofDir, cues: cueFingerprint(boomAfter) },
  isolated: true,
  at: new Date().toISOString(),
}
await writeFile(path.join(outRoot, 'summary.json'), JSON.stringify(summary, null, 2))
console.log('\n[pass] festival rooms boom + bobby are separate')
console.log(JSON.stringify(summary, null, 2))
