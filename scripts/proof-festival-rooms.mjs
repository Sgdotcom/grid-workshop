/**
 * Prove the boom festival room dual-desk live sync (projection + desks).
 * Usage: node scripts/proof-festival-rooms.mjs [siteBase]
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const siteBase = (process.argv[2] || 'http://127.0.0.1:43127/').replace(/\/?$/, '/')
const worker = process.env.VITE_LIVE_SESSION_URL || 'https://grid-workshop-live.sgdotcom.workers.dev'
const stamp = Date.now().toString(36)
const proofRoot = path.join(root, 'scratch/festival-room-proof', `run-${stamp}`)

async function clearRoom(room) {
  // Public repo: the facilitator password only ever comes from the environment.
  const password = process.env.CLEAR_ROOM_PASSWORD || ''
  const res = await fetch(`${worker}/rooms/${encodeURIComponent(room)}`, {
    method: 'DELETE',
    headers: password ? { 'X-Clear-Password': password } : {},
  })
  assert.equal(res.status, 200, `DELETE ${room}`)
}

async function getRoom(room) {
  const res = await fetch(`${worker}/rooms/${encodeURIComponent(room)}`)
  assert.equal(res.status, 200, `GET ${room}`)
  return res.json()
}

function runDual(room) {
  const proofDir = path.join(proofRoot, room)
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(root, 'scripts/dual-agent-live-proof.mjs'), siteBase],
      {
        cwd: root,
        env: { ...process.env, ROOM: room, PROOF_DIR: proofDir, VITE_LIVE_SESSION_URL: worker },
        stdio: 'inherit',
      },
    )
    child.on('exit', (code) => {
      if (code === 0) resolve({ proofDir })
      else reject(new Error(`dual-agent failed for ${room} (exit ${code})`))
    })
  })
}

await mkdir(proofRoot, { recursive: true })
console.log('\n=== Clear boom ===')
await clearRoom('boom')
assert.equal(Object.keys((await getRoom('boom')).liveCues || {}).length, 0, 'boom should be empty')

console.log('\n=== Dual desks on boom ===')
const boomRun = await runDual('boom')
const boomSummary = JSON.parse(await readFile(path.join(boomRun.proofDir, 'summary.json'), 'utf8'))
assert.deepEqual(boomSummary.liveStations.sort(), ['a', 'b'], 'boom dual agents both live')
console.log('[ok] boom dual desks synced')

await writeFile(
  path.join(proofRoot, 'summary.json'),
  JSON.stringify({ stamp, boom: { proofDir: boomRun.proofDir, summary: boomSummary } }, null, 2),
)
console.log('\n[pass] festival room boom dual-desk proof')
