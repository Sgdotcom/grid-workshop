/**
 * Cross-desk ops: stamp, punch-out (cutout), clear, publish — reflected on
 * the other studio and the wall.
 *
 * Usage: node scripts/smoke-live-studio-ops.mjs [siteBase]
 * Env: VITE_LIVE_SESSION_URL (Worker base)
 */
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const siteBase = (process.argv[2] || 'https://sgdotcom.github.io/grid-workshop/').replace(/\/?$/, '/')
const worker = process.env.VITE_LIVE_SESSION_URL || 'https://grid-workshop-live.sgdotcom.workers.dev'
const room = `ops-${Date.now().toString(36)}`

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})

async function stamp(page, col, row) {
  const point = await page.locator('svg[aria-label="Shape grid canvas"]').evaluate((svg, cell) => {
    const matrix = svg.getScreenCTM()
    const pt = new DOMPoint(cell.col * 42 + 20, cell.row * 42 + 20).matrixTransform(matrix)
    return { x: pt.x, y: pt.y }
  }, { col, row })
  await page.mouse.click(point.x, point.y)
}

async function openDesk(station) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${siteBase}?view=studio&station=${station}&room=${room}`)
  await page.getByTestId('studio-desk').waitFor({ timeout: 20000 })
  // Ensure joined
  const join = page.getByTestId('live-session-join-btn')
  if (await join.count()) {
    await join.click().catch(() => {})
  }
  return { context, page, errors }
}

async function waitRoom(predicate, label, ms = 20000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const res = await fetch(`${worker}/rooms/${room}`)
    const json = await res.json()
    if (predicate(json)) return json
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`timeout: ${label}`)
}

try {
  assert.equal((await fetch(`${worker}/health`)).status, 200, 'worker health')

  const deskA = await openDesk('a')
  const deskB = await openDesk('b')
  const wallCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const wall = await wallCtx.newPage()
  await wall.goto(`${siteBase}?view=wall&room=${room}`)
  await wall.getByTestId('cinematic-wall').waitFor({ timeout: 20000 })
  const wallJoin = wall.getByTestId('live-session-join-btn')
  if (await wallJoin.count()) await wallJoin.click().catch(() => {})

  // --- Desk A: stamp ink ---
  await stamp(deskA.page, 1, 2)
  await stamp(deskA.page, 2, 2)
  await stamp(deskA.page, 3, 2)
  await deskA.page.waitForFunction(
    () => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active.filled.length >= 3,
    null,
    { timeout: 10000 },
  )

  await waitRoom(
    (r) => !!(r.liveCues?.a?.liveSvg || r.liveCue?.liveSvg || (r.draftSvgs && Object.keys(r.draftSvgs).length)),
    'desk A draft/live cue',
  )

  // Wall should show a draft/live preview image
  await wall.waitForFunction(
    () => document.querySelectorAll('.cinematic-ribbon-letter img').length >= 1,
    null,
    { timeout: 20000 },
  )
  console.log('[ok] wall sees desk A draft')

  // Desk B alphabet should get draft SVG for active letter (usually 'a')
  await deskB.page.waitForFunction(
    () => {
      const imgs = document.querySelectorAll('.studio-alphabet img, .studio-letter img')
      return imgs.length >= 1
    },
    null,
    { timeout: 20000 },
  )
  console.log('[ok] desk B alphabet shows remote draft')

  // --- Both desks live at once (A on a, B on b) ---
  await deskB.page.getByTestId('studio-glyph-b').click()
  await deskB.page.waitForFunction(
    () => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.char === 'b',
    null,
    { timeout: 10000 },
  )
  const modeB = deskB.page.getByTestId('studio-stamp-mode')
  if ((await modeB.getAttribute('aria-pressed')) === 'true') {
    await modeB.click()
  }
  await stamp(deskB.page, 1, 1)
  await stamp(deskB.page, 2, 1)
  await stamp(deskB.page, 3, 1)
  await deskB.page.waitForFunction(
    () => {
      const s = JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))
      return s?.active?.char === 'b' && (s.active.filled || []).length >= 2
    },
    null,
    { timeout: 15000 },
  )
  await waitRoom(
    (r) => !!(r.liveCues?.a?.liveSvg && r.liveCues?.b?.liveSvg),
    'both desks have live cues',
  )
  await wall.waitForFunction(
    () => document.querySelectorAll('.cinematic-live-dot').length >= 2,
    null,
    { timeout: 20000 },
  )
  console.log('[ok] wall shows both desks live')

  // --- Desk A: punch-out (cutout) on middle cell ---
  await deskA.page.getByTestId('studio-stamp-mode').click()
  await deskA.page.waitForFunction(
    () => document.querySelector('[data-testid="studio-stamp-mode"]')?.getAttribute('aria-pressed') === 'true',
    null,
    { timeout: 5000 },
  )
  const svgBefore = await waitRoom((r) => !!r.liveCues?.a?.liveSvg, 'live a before cut').then(
    (r) => r.liveCues.a.liveSvg,
  )
  await stamp(deskA.page, 2, 2)
  await deskA.page.waitForFunction(
    () => {
      const filled = JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active.filled || []
      return filled.some((f) => f.mode === 'cutout')
    },
    null,
    { timeout: 10000 },
  )
  await waitRoom(
    (r) => !!r.liveCues?.a?.liveSvg && r.liveCues.a.liveSvg !== svgBefore && !!r.liveCues?.b?.liveSvg,
    'live a changed after cutout; b kept',
  )
  console.log('[ok] cutout changed desk A live cue')

  // --- Desk A: clear letter ---
  await deskA.page.getByTestId('studio-clear').click()
  await deskA.page.waitForFunction(
    () => (JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active.filled || []).length === 0,
    null,
    { timeout: 10000 },
  )
  await waitRoom(
    (r) => !r.liveCues?.a && (!r.draftSvgs || !r.draftSvgs.a) && !!r.liveCues?.b?.liveSvg,
    'clear removed desk A cue; desk B kept',
  )
  console.log('[ok] clear synced (desk A gone, desk B live)')

  // --- Desk B: publish letter b (already stamped above) ---
  const publishBtn = deskB.page.getByTestId('studio-publish')
  await publishBtn.waitFor({ state: 'visible' })
  assert.equal(await publishBtn.isEnabled(), true, 'publish should be enabled with ink on b')
  await publishBtn.click()
  await deskB.page.waitForFunction(
    () => {
      const contribs = JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.contributions || []
      return contribs.some((c) => c.draft?.char === 'b' || c.draft?.char === 'B')
    },
    null,
    { timeout: 15000 },
  )

  await waitRoom(
    (r) => (r.contributions || []).some((c) => c.draft?.char === 'b'),
    'desk B publish in room',
  )

  // Desk A should receive B's contribution
  await deskA.page.waitForFunction(
    () => (JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.contributions || []).some((c) => c.draft.char === 'b'),
    null,
    { timeout: 20000 },
  )
  console.log('[ok] desk A received desk B publish')

  // Wall should show published b
  await wall.waitForFunction(
    () => document.querySelectorAll('.cinematic-ribbon-letter.is-done').length >= 1,
    null,
    { timeout: 20000 },
  )
  console.log('[ok] wall shows published letter')

  assert.equal(deskA.errors.length, 0, deskA.errors.join('\n'))
  assert.equal(deskB.errors.length, 0, deskB.errors.join('\n'))
  console.log(`smoke-live-studio-ops: ok (room=${room})`)
} finally {
  await browser.close()
}
