/**
 * Light smoke for install studio + projection views.
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
  const room = `install-${Date.now().toString(36)}`
  await studio.goto(`${base}?view=studio&station=a&room=${encodeURIComponent(room)}`)
  await studio.getByTestId('studio-desk').waitFor({ timeout: 15000 })
  await studio.waitForFunction(
    (r) => sessionStorage.getItem(`gridz-wipe-epoch:${r}`) != null,
    room,
    { timeout: 10000 },
  ).catch(() => {})
  assert.equal(await studio.getByTestId('studio-desk').count(), 1)
  assert.equal(await studio.getByTestId('studio-publish').count(), 1)
  assert.equal(await studio.getByTestId('studio-next').count(), 1)
  assert.ok(await studio.locator('svg[aria-label="Shape grid canvas"]').count())

  // Stamp two cells on the default letter, then publish.
  const stamp = async (col, row) => {
    const canvas = studio.locator('svg[aria-label="Shape grid canvas"]')
    const position = await canvas.evaluate((svg, cell) => {
      const matrix = svg.getScreenCTM()
      if (!matrix) throw new Error('canvas CTM missing')
      const pt = new DOMPoint(cell.col * 42 + 20, cell.row * 42 + 20).matrixTransform(matrix)
      const bb = svg.getBoundingClientRect()
      return { x: pt.x - bb.left, y: pt.y - bb.top }
    }, { col, row })
    await canvas.click({ position, force: true })
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

  const projection = await context.newPage()
  projection.on('pageerror', (error) => errors.push(`projection: ${error.message}`))
  await projection.goto(`${base}?view=projection&room=${encodeURIComponent(room)}`)
  await projection.getByTestId('festival-projection').waitFor({ timeout: 15000 })
  await projection.waitForFunction(
    () => document.querySelectorAll('.festival-letter img').length >= 1,
    null,
    { timeout: 15000 },
  )
  assert.ok(await projection.locator('.festival-phrase').count())
  assert.ok((await projection.locator('.festival-letter').count()) >= 26)

  assert.equal(errors.length, 0, errors.join('\n'))
  console.log('smoke-install-views: ok')
} finally {
  await browser.close()
}
