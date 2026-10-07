import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ headless: true,
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:43127/?view=join-lab')
  await page.locator('.join-lab-matrix[aria-busy="false"]').waitFor({ timeout: 60000 })
  assert.equal(await page.locator('.join-method').count(), 5)
  assert.equal(await page.locator('.join-lab-row section').count(), 30)
  const checks = await page.evaluate(async () => {
    const { compareJoin } = await import('/src/lib/joinExperiments.ts')
    const { PRESET_SHAPES } = await import('/src/lib/types.ts')
    const context = document.createElement('canvas').getContext('2d')
    const results = []
    for (const method of ['sdf', 'offset']) {
      const settings = { size: 24, softness: 0.05, roundedness: 0, radius: 1, neck: 1 }
      const circle = PRESET_SHAPES.find(shape => shape.id === 'preset-circle')
      const separated = compareJoin(circle, [[0, 0], [1, 0]], settings, method)
      const filled = (paths, x, y) => paths.some(path => context.isPointInPath(new Path2D(path), x, y, 'evenodd'))
      results.push([`${method} preserves both components`, filled(separated.paths, 20, 20) && filled(separated.paths, 62, 20) && !filled(separated.paths, 41, 20)])
      const ring = PRESET_SHAPES.find(shape => shape.id === 'preset-ring')
      const rings = compareJoin(ring, [[0, 0], [1, 0]], { ...settings, size: 42 }, method)
      results.push([`${method} preserves ring holes at low softness`, !filled(rings.paths, 20, 20) && !filled(rings.paths, 62, 20) && filled(rings.paths, 20, 1)])
      for (const id of ['preset-square', 'preset-cross', 'preset-capsule', 'preset-capsule-v']) {
        const shape = PRESET_SHAPES.find(preset => preset.id === id)
        const result = compareJoin(shape, [[0, 0], [1, 1]], { ...settings, size: 42, softness: 1, roundedness: 8 }, method)
        results.push([`${method} ${id} finite outlines`, result.paths.length > 0 && result.paths.every(path => !/NaN|Infinity/.test(path))])
      }
      const zero = compareJoin(circle, [[0, 0], [1, 0]], { ...settings, softness: 0 }, method)
      results.push([`${method} zero softness preserves originals`, JSON.stringify(zero.paths) === JSON.stringify(zero.outlines)])
    }
    return results
  })
  for (const [label, passed] of checks) assert.ok(passed, label)
  await page.getByLabel('Softness', { exact: true }).fill('0.8')
  await page.locator('.join-lab-matrix[aria-busy="false"]').waitFor({ timeout: 60000 })
  await page.locator('.join-lab-row').first().getByRole('button').nth(3).click()
  const choices = await page.evaluate(() => JSON.parse(localStorage.getItem('grid-workshop-join-review-v1')))
  assert.equal(choices['preset-square:horizontal'].method, 'sdf')
  assert.equal(choices['preset-square:horizontal'].settings.softness, 0.8)
  await page.screenshot({ path: '/tmp/gridz-five-algorithms.png', fullPage: true })
  assert.deepEqual(errors, [])
  console.log(`PASS: five methods, 30 previews, saved SDF preference, ${checks.length} geometry checks.`)
} finally { await browser.close() }
