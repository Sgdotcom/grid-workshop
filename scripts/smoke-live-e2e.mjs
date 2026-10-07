/**
 * Cross-desk live room smoke (Playwright).
 * Requires:
 *   - Worker on http://127.0.0.1:8787 with LIVE_WRITE_TOKEN=test-secret (.dev.vars)
 *   - Vite with VITE_LIVE_SESSION_URL=http://127.0.0.1:8787
 *
 * Usage: node scripts/smoke-live-e2e.mjs [viteBase]
 */
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const viteBase = (process.argv[2] || 'http://127.0.0.1:43127/').replace(/\/?$/, '/')
const worker = process.env.VITE_LIVE_SESSION_URL || 'http://127.0.0.1:8787'
const token = process.env.LIVE_WRITE_TOKEN || 'test-secret'
const room = `e2e-${Date.now().toString(36)}`

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
  const url = `${viteBase}?view=studio&station=${station}&room=${room}&token=${encodeURIComponent(token)}`
  await page.goto(url)
  await page.getByTestId('studio-desk').waitFor({ timeout: 20000 })
  return { context, page, errors }
}

try {
  // Sanity: worker reachable
  const health = await fetch(`${worker}/health`)
  assert.equal(health.status, 200, 'worker health')

  const deskA = await openDesk('a')
  const deskB = await openDesk('b')
  const wallCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const wall = await wallCtx.newPage()
  await wall.goto(`${viteBase}?view=wall&room=${room}`)
  await wall.getByTestId('cinematic-wall').waitFor({ timeout: 20000 })

  await stamp(deskA.page, 1, 2)
  await stamp(deskA.page, 2, 2)
  await deskA.page.waitForFunction(
    () => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active.filled.length >= 2,
    null,
    { timeout: 10000 },
  )
  await deskA.page.getByTestId('studio-publish').click()
  await deskA.page.waitForFunction(
    () => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.contributions.length >= 1,
    null,
    { timeout: 10000 },
  )

  // Wait for room to contain the publish (server truth).
  await assert.doesNotReject(async () => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      const res = await fetch(`${worker}/rooms/${room}`)
      const json = await res.json()
      if ((json.contributions || []).length >= 1 && json.draftSvgs && Object.keys(json.draftSvgs).length) {
        return
      }
      await new Promise((r) => setTimeout(r, 400))
    }
    throw new Error('room never received publish/draft from desk A')
  })

  // Desk B should hydrate the other desk's contribution via poll.
  await deskB.page.waitForFunction(
    () => (JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.contributions || []).length >= 1,
    null,
    { timeout: 20000 },
  )

  // Wall alphabet should show published (is-done) or at least a draft tile with an img.
  await wall.waitForFunction(
    () =>
      document.querySelectorAll('.cinematic-ribbon-letter.is-done').length >= 1 ||
      document.querySelectorAll('.cinematic-ribbon-letter img').length >= 1,
    null,
    { timeout: 20000 },
  )

  assert.equal(deskA.errors.length, 0, deskA.errors.join('\n'))
  assert.equal(deskB.errors.length, 0, deskB.errors.join('\n'))
  console.log(`smoke-live-e2e: ok (room=${room})`)
} finally {
  await browser.close()
}
