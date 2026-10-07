/**
 * Two concurrent “desk agents” stamp different letters at the same time,
 * then capture screenshots as proof that the wall shows both live cues.
 *
 * Usage:
 *   node scripts/dual-agent-live-proof.mjs [siteBase]
 *   ROOM=bobby node scripts/dual-agent-live-proof.mjs
 *
 * Env: VITE_LIVE_SESSION_URL, CHROME_PATH, ROOM, PROOF_DIR
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'

const siteBase = (process.argv.find((a) => a.startsWith('http')) || 'https://sgdotcom.github.io/grid-workshop/').replace(
  /\/?$/,
  '/',
)
const worker = process.env.VITE_LIVE_SESSION_URL || 'https://grid-workshop-live.sgdotcom.workers.dev'
const modeArg = process.argv.find((a) => a.startsWith('--agent=') || a === '--wall')
const mode = modeArg === '--wall' ? 'wall' : modeArg?.startsWith('--agent=') ? modeArg.slice('--agent='.length) : 'orchestrator'
const room = process.env.ROOM || `dual-${Date.now().toString(36)}`
const proofDir = process.env.PROOF_DIR || path.join(process.cwd(), 'scratch', 'dual-agent-proof', room)

const chromePath =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitRoom(predicate, label, ms = 25000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const res = await fetch(`${worker}/rooms/${room}`)
    const json = await res.json()
    if (predicate(json)) return json
    await sleep(250)
  }
  throw new Error(`timeout: ${label}`)
}

async function stamp(page, col, row) {
  const point = await page.locator('svg[aria-label="Shape grid canvas"]').evaluate((svg, cell) => {
    const matrix = svg.getScreenCTM()
    const pt = new DOMPoint(cell.col * 42 + 20, cell.row * 42 + 20).matrixTransform(matrix)
    return { x: pt.x, y: pt.y }
  }, { col, row })
  await page.mouse.click(point.x, point.y)
}

async function joinIfNeeded(page) {
  // URL ?room= already auto-joins; only click if status shows we're not in this room.
  const status = ((await page.getByTestId('live-sync-status').textContent().catch(() => '')) || '').toLowerCase()
  if (status.includes(room.toLowerCase()) && (status.includes('live') || status.includes('connected'))) {
    return
  }
  const roomBtn = page.getByTestId(`live-room-${room}`)
  if (await roomBtn.count()) {
    await roomBtn.click().catch(() => {})
    await sleep(400)
    return
  }
  const join = page.getByTestId('live-session-join-btn')
  if (await join.count()) await join.click().catch(() => {})
}

async function openDesk(browser, station, letter) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto(
    `${siteBase}?view=studio&station=${encodeURIComponent(station)}&room=${encodeURIComponent(room)}`,
  )
  await page.getByTestId('studio-desk').waitFor({ timeout: 25000 })
  // ?room= auto-joins; only click Join if the live UI still says we're offline.
  await sleep(800)
  const status = ((await page.getByTestId('live-sync-status').textContent().catch(() => '')) || '').toLowerCase()
  if (!status.includes(room.toLowerCase())) await joinIfNeeded(page)

  if (letter !== 'a') {
    await page.getByTestId(`studio-glyph-${letter}`).click()
    await page.waitForFunction(
      (ch) => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.char === ch,
      letter,
      { timeout: 10000 },
    )
  }

  const cells =
    station === 'a'
      ? [
          [1, 1],
          [2, 1],
          [3, 1],
          [2, 2],
          [2, 3],
        ]
      : [
          [1, 1],
          [1, 2],
          [1, 3],
          [2, 3],
          [3, 3],
        ]

  for (const [col, row] of cells) {
    await stamp(page, col, row)
    await sleep(100)
  }

  await page.waitForFunction(
    () => (JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.filled || []).length >= 3,
    null,
    { timeout: 15000 },
  )
  await waitRoom((r) => !!r.liveCues?.[station]?.liveSvg, `agent ${station} live cue`)

  await mkdir(proofDir, { recursive: true })
  const shot = path.join(proofDir, `desk-${station}.png`)
  await page.screenshot({ path: shot, fullPage: true })
  const filledCount = await page.evaluate(() => {
    try {
      return (
        JSON.parse(localStorage.getItem('grid-workshop-festival-v1') || '{}')?.active?.filled?.length ?? 0
      )
    } catch {
      return 0
    }
  })
  await writeFile(
    path.join(proofDir, `agent-${station}.json`),
    JSON.stringify({ station, letter, room, filled: filledCount, errors, shot, at: new Date().toISOString() }, null, 2),
  )

  return { station, letter, shot, errors, context, page }
}

async function captureWall(browser) {
  // Snapshot room while both desks are still open and pushing.
  const roomState = await waitRoom(
    (r) => !!(r.liveCues?.a?.liveSvg && r.liveCues?.b?.liveSvg && r.draftSvgs?.a && r.draftSvgs?.b),
    'both desks live + drafts before wall shot',
    40000,
  )

  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await context.newPage()
  // Rely on ?room= auto-join — do not click room pills (avoids remount races).
  await page.goto(`${siteBase}?view=wall&room=${encodeURIComponent(room)}`)
  await page.getByTestId('cinematic-wall').waitFor({ timeout: 25000 })
  await sleep(1200)

  await page
    .waitForFunction(
      () => {
        const dots = document.querySelectorAll('.cinematic-live-dot').length
        const imgs = document.querySelectorAll('.cinematic-ribbon-letter img').length
        return dots >= 2 || imgs >= 2
      },
      null,
      { timeout: 30000 },
    )
    .catch(() => {})
  await sleep(800)

  const wallShot = path.join(proofDir, 'wall.png')
  await page.screenshot({ path: wallShot, fullPage: true })

  await page.goto(`${siteBase}?view=projection&room=${encodeURIComponent(room)}`)
  await page.locator('.festival-wall').waitFor({ timeout: 25000 })
  await sleep(1200)
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="festival-live-stack"] img').length >= 2 ||
        document.querySelectorAll('.festival-live img').length >= 1 ||
        document.querySelectorAll('.festival-letter img').length >= 2,
      null,
      { timeout: 30000 },
    )
    .catch(() => {})
  await sleep(800)
  const projectionShot = path.join(proofDir, 'projection.png')
  await page.screenshot({ path: projectionShot, fullPage: true })

  await writeFile(path.join(proofDir, 'room.json'), JSON.stringify(roomState, null, 2))
  await writeFile(
    path.join(proofDir, 'summary.json'),
    JSON.stringify(
      {
        room,
        siteBase,
        worker,
        liveStations: Object.keys(roomState.liveCues || {}),
        liveChars: Object.values(roomState.liveCues || {}).map((c) => c.char),
        draftChars: Object.keys(roomState.draftSvgs || {}),
        wallShot,
        projectionShot,
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  )

  await context.close()
  return { wallShot, projectionShot, roomState }
}

async function orchestrate() {
  assert.equal((await fetch(`${worker}/health`)).status, 200, 'worker health')
  await mkdir(proofDir, { recursive: true })
  console.log(`[dual-agent] room=${room}`)
  console.log(`[dual-agent] proof=${proofDir}`)
  console.log('[dual-agent] launching Agent A (letter a) + Agent B (letter b) together…')

  const browser = await chromium.launch({ headless: true, executablePath: chromePath })
  try {
    // Keep both desks open while the wall captures — avoids pagehide races clearing cues.
    const [agentA, agentB] = await Promise.all([openDesk(browser, 'a', 'a'), openDesk(browser, 'b', 'b')])
    assert.equal(agentA.errors.length, 0, agentA.errors.join('\n'))
    assert.equal(agentB.errors.length, 0, agentB.errors.join('\n'))
    console.log(`[ok] agent A drew "${agentA.letter}" → ${agentA.shot}`)
    console.log(`[ok] agent B drew "${agentB.letter}" → ${agentB.shot}`)

    const wall = await captureWall(browser)
    const cues = wall.roomState.liveCues || {}
    assert.ok(cues.a?.liveSvg, 'room missing live cue a')
    assert.ok(cues.b?.liveSvg, 'room missing live cue b')
    assert.ok(wall.roomState.draftSvgs?.a, 'room missing draft a')
    assert.ok(wall.roomState.draftSvgs?.b, 'room missing draft b')
    console.log(`[ok] wall proof → ${wall.wallShot}`)
    console.log(`[ok] projection proof → ${wall.projectionShot}`)
    console.log(`[pass] dual-agent live proof (room=${room})`)
    console.log(JSON.stringify({ room, proofDir, liveChars: [cues.a.char, cues.b.char] }))
  } finally {
    await browser.close()
    await sleep(1500)
  }
}

async function runSoloAgent(station) {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath })
  try {
    const agent = await openDesk(browser, station, station)
    assert.equal(agent.errors.length, 0, agent.errors.join('\n'))
    console.log(`[pass] agent ${station}`)
  } finally {
    await browser.close()
  }
}

if (mode === 'a' || mode === 'b') {
  await runSoloAgent(mode)
} else if (mode === 'wall') {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath })
  try {
    await captureWall(browser)
    console.log('[pass] wall proof')
  } finally {
    await browser.close()
  }
} else {
  await orchestrate()
}
