/**
 * Light smoke for install studio + cinematic wall views.
 * Requires the Vite dev server (default http://127.0.0.1:43127/).
 *
 * Usage: node scripts/smoke-install-views.mjs
 * Optional: CHROME_PATH=/path/to/chrome node scripts/smoke-install-views.mjs
 */
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const base = process.argv[2] || 'http://127.0.0.1:43127/'
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const errors = []

try {
  const studio = await context.newPage()
  studio.on('pageerror', (error) => errors.push(`studio: ${error.message}`))
  await studio.goto(`${base}?view=studio&station=a`)
  await studio.getByTestId('studio-desk').waitFor({ timeout: 15000 })
  assert.equal(await studio.getByTestId('studio-desk').count(), 1)
  assert.equal(await studio.getByTestId('studio-publish').count(), 1)
  assert.equal(await studio.getByTestId('studio-next').count(), 1)
  assert.ok(await studio.locator('svg[aria-label="Shape grid canvas"]').count())

  // Stamp two cells on the default letter, then publish.
  const stamp = async (col, row) => {
    const point = await studio.locator('svg[aria-label="Shape grid canvas"]').evaluate((svg, cell) => {
      const matrix = svg.getScreenCTM()
      const point = new DOMPoint(cell.col * 42 + 20, cell.row * 42 + 20).matrixTransform(matrix)
      return { x: point.x, y: point.y }
    }, { col, row })
    await studio.mouse.click(point.x, point.y)
  }
  await stamp(1, 2)
  await stamp(2, 2)
  await studio.waitForFunction(
    () => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active.filled.length >= 2,
    null,
    { timeout: 10000 },
  )
  await studio.getByTestId('studio-publish').click()
  await studio.waitForFunction(
    () => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.contributions.length >= 1,
    null,
    { timeout: 10000 },
  )

  const wall = await context.newPage()
  wall.on('pageerror', (error) => errors.push(`wall: ${error.message}`))
  await wall.goto(`${base}?view=wall`)
  await wall.getByTestId('cinematic-wall').waitFor({ timeout: 15000 })
  await wall.waitForFunction(
    () => document.querySelectorAll('.cinematic-ribbon-letter.is-done').length >= 1,
    null,
    { timeout: 10000 },
  )
  assert.ok(await wall.locator('.cinematic-specimen').count())
  assert.ok((await wall.locator('.cinematic-ribbon-letter').count()) >= 26)

  assert.equal(errors.length, 0, errors.join('\n'))
  console.log('smoke-install-views: ok')
} finally {
  await browser.close()
}
