/**
 * WebSocket push smoke against the live-session Worker.
 * Usage: node scripts/smoke-live-ws.mjs [baseUrl]
 */
const base = (process.argv[2] || 'https://grid-workshop-live.sgdotcom.workers.dev').replace(/\/+$/, '')
const room = `ws-smoke-${Date.now().toString(36)}`
const wsUrl = base.replace(/^http/i, 'ws') + `/rooms/${room}/ws`

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function main() {
  console.log(`[smoke-ws] ${wsUrl}`)

  const health = await fetch(`${base}/health`)
  assert(health.ok, 'health failed')
  const healthJson = await health.json()
  assert(healthJson.realtime === true, 'health missing realtime flag')

  const gotUpdate = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for WS broadcast')), 8000)
    const ws = new WebSocket(wsUrl)
    let sawInitial = false

    ws.addEventListener('open', () => {
      console.log('[ok] ws open')
    })

    ws.addEventListener('message', async (event) => {
      const msg = JSON.parse(String(event.data))
      if (msg.type === 'pong') return
      if (!sawInitial) {
        sawInitial = true
        console.log('[ok] initial room snapshot')
        const res = await fetch(`${base}/rooms/${room}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updatedAt: new Date().toISOString(),
            contributions: [
              {
                id: 'ws-1',
                createdAt: new Date().toISOString(),
                draft: { char: 'w', filled: [], brokenJoins: [] },
                svg: '<svg id="w"/>',
              },
            ],
            drafts: [],
            draftSvgs: { w: '<svg id="w-draft"/>' },
            draftUpdatedAt: { w: new Date().toISOString() },
            liveCue: {
              char: 'w',
              liveSvg: '<svg id="live-w"/>',
              updatedAt: new Date().toISOString(),
            },
          }),
        })
        if (!res.ok) {
          clearTimeout(timer)
          reject(new Error(`PUT failed ${res.status}`))
        }
        return
      }
      if ((msg.contributions || []).some((c) => c.id === 'ws-1') && msg.liveCue?.char === 'w') {
        clearTimeout(timer)
        ws.close()
        resolve(true)
      }
    })

    ws.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('WebSocket error'))
    })
  })

  assert(gotUpdate, 'no broadcast')
  console.log('[ok] PUT broadcast received on socket')
  console.log('[pass] live-session websocket smoke')
}

main().catch((err) => {
  console.error('[fail]', err.message || err)
  process.exit(1)
})
