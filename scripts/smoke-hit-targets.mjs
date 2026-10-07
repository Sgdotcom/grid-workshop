/**
 * Smoke: Export tab, Paint Export, Options gear are clickable.
 * Usage: node scripts/smoke-hit-targets.mjs [baseUrl]
 * Requires Chromium from Playwright cache (npx playwright install chromium).
 */
import { chromium } from 'playwright-core'
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const base = process.argv[2] || 'http://127.0.0.1:43127/'

function findChrome() {
  const root = join(homedir(), '.cache/ms-playwright')
  const dirs = readdirSync(root).filter((d) => d.startsWith('chromium-'))
  if (!dirs.length) throw new Error('No Playwright Chromium cache — run: npx playwright install chromium')
  dirs.sort()
  const base = join(root, dirs.at(-1))
  const candidates = [
    join(base, 'chrome-linux64/chrome'),
    join(base, 'chrome-linux/chrome'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  throw new Error(`No Chrome binary under ${base}`)
}

const browser = await chromium.launch({
  headless: true,
  executablePath: findChrome(),
  args: ['--no-sandbox'],
})

const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto(base, { waitUntil: 'networkidle' })

const fail = []

// Intro first screen
if (await page.getByTestId('intro-screen').count()) {
  await page.getByTestId('intro-start').click()
  await page.waitForTimeout(200)
}

await page.getByTestId('tab-export').click()
if ((await page.locator('h1').textContent()) !== 'Export') fail.push('tab-export')

await page.getByTestId('tab-paint').click()
await page.getByTestId('paint-export').click()
if ((await page.locator('h1').textContent()) !== 'Export') fail.push('paint-export')

await page.getByTestId('tab-paint').click()
await page.getByTestId('options-gear').click()
if (!(await page.getByRole('dialog').isVisible())) fail.push('options-gear')

// Prove agent-ish coords that miss controls would hit the canvas instead
const miss = await page.evaluate(() => {
  const t = document.elementFromPoint(290, 235)
  return (t?.textContent || t?.tagName || '').slice(0, 60)
})

await browser.close()

if (fail.length) {
  console.error('FAIL', fail)
  process.exit(1)
}
console.log('PASS export tab, paint export, options gear')
console.log('Note: viewport (290,235) hits canvas-ish:', miss.slice(0, 40), '— computerUse often aims here and reports false FAIL')
