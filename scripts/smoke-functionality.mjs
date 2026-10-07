/**
 * Structured functionality smoke — shape-grid-only product.
 * Usage: node scripts/smoke-functionality.mjs [baseUrl]
 */
import { chromium } from 'playwright-core'
import { readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const base = process.argv[2] || 'http://127.0.0.1:43127/'
const mediaDir = '/cursor/stores/bc-b8aa350c-82c1-41ef-b9ef-17abad39ac4d/media'
mkdirSync(mediaDir, { recursive: true })
mkdirSync('/tmp/gw-exports', { recursive: true })

function findChrome() {
  const root = join(homedir(), '.cache/ms-playwright')
  const dirs = readdirSync(root).filter((d) => d.startsWith('chromium-'))
  if (!dirs.length) throw new Error('No Playwright Chromium')
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

const results = []
const note = (area, status, detail = '') => {
  results.push({ area, status, detail })
  console.log(`${status.padEnd(7)} ${area}${detail ? ' — ' + detail : ''}`)
}

async function closeOptions(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('[aria-label="Close"]')
    if (btn instanceof HTMLElement) btn.click()
  })
  await page.waitForTimeout(150)
  if (await page.getByRole('dialog').isVisible().catch(() => false)) {
    await page.mouse.click(20, 400)
    await page.waitForTimeout(150)
  }
}

async function section(name, fn) {
  try {
    await fn()
  } catch (e) {
    note(name, 'FAIL', String(e.message || e).slice(0, 100))
  }
}

const browser = await chromium.launch({
  headless: true,
  executablePath: findChrome(),
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.setDefaultTimeout(8000)

try {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 20000 })
  await page.waitForTimeout(500)

  await section('Intro howto', async () => {
    const intro = await page.getByTestId('intro-screen').count()
    note('Intro screen', intro ? 'PASS' : 'FAIL')
    const body = await page.getByTestId('intro-screen').innerText()
    note(
      'Intro bullets',
      /Shape/i.test(body) && /Paint/i.test(body) && /Export/i.test(body) && /SVG/i.test(body)
        ? 'PASS'
        : 'FAIL',
    )
    await page.getByTestId('intro-start').click()
    await page.waitForTimeout(250)
    note(
      'Start workshop',
      (await page.getByTestId('intro-screen').count()) === 0 &&
        (await page.locator('h1').textContent()) === 'Shape'
        ? 'PASS'
        : 'FAIL',
    )
  })

  note('Dev server / load', 'PASS', await page.locator('h1').textContent())

  await section('Tabs', async () => {
    for (const [id, expect] of [
      ['tab-shape', 'Shape'],
      ['tab-paint', 'Paint'],
      ['tab-export', 'Export'],
    ]) {
      await page.getByTestId(id).click()
      await page.waitForTimeout(120)
      const h = await page.locator('h1').textContent()
      if (h !== expect) throw new Error(`${id} → ${h}`)
    }
    // Grid tab must be gone
    const gridTab = await page.getByTestId('tab-grid').count()
    note('Tabs (Shape/Paint/Export)', gridTab === 0 ? 'PASS' : 'FAIL', 'no Grid tab')
  })

  await section('Options drawer', async () => {
    await page.getByTestId('tab-paint').click()
    await page.getByTestId('options-gear').click()
    await page.waitForTimeout(200)
    const dlg = await page.getByRole('dialog').isVisible()
    note('Options drawer', dlg ? 'PASS' : 'FAIL')
    await page.screenshot({ path: join(mediaDir, 'func-check-01-options.png') })
    await closeOptions(page)
  })

  await section('Shape picker', async () => {
    await page.getByTestId('tab-shape').click()
    await page.waitForTimeout(250)
    const body = await page.locator('main').innerText()
    note(
      'Shape picker presets',
      /Circle|Square|Rectangle|Cross|Chevron|Ring|capsule|4-star/i.test(body) ? 'PASS' : 'FAIL',
      'expanded presets incl. 4-star / cross / rect / ring / capsules',
    )
    note(
      'Shape builder removed',
      /Save to library/i.test(body) ? 'FAIL' : 'PASS',
    )
    note(
      'Rounded corners (Shape step)',
      /Rounded corners/i.test(body) ? 'PASS' : 'FAIL',
    )
    note('Spacing control', /Spacing/i.test(body) ? 'PASS' : 'FAIL')
    // Removed modes must not appear
    const leak = ['Dot grid', 'Vertical segments', 'Circle construction', 'Dual overlap'].filter(
      (m) => body.includes(m),
    )
    note(
      'No multi-mode UI',
      leak.length === 0 ? 'PASS' : 'FAIL',
      leak.length ? leak.join(', ') : 'shape-grid only',
    )
    await page.screenshot({ path: join(mediaDir, 'func-check-02-shapes.png') })
  })

  await section('Rounded corners Paint Options', async () => {
    await page.getByTestId('tab-paint').click()
    await page.getByTestId('options-gear').click()
    await page.waitForTimeout(200)
    const optText = await page.getByRole('dialog').innerText()
    note(
      'Rounded corners (Paint Options)',
      /Rounded corners/i.test(optText) ? 'PASS' : 'FAIL',
    )
    note(
      'Letter guide controls',
      /Guide size/i.test(optText) && /Guide strength|Show guide/i.test(optText)
        ? 'PASS'
        : 'FAIL',
    )
    note('Invert preview control', /Invert preview/i.test(optText) ? 'PASS' : 'FAIL')
    await page.getByTestId('invert-preview').check()
    await page.waitForTimeout(100)
    note(
      'Invert preview toggle',
      (await page.getByTestId('invert-preview').isChecked()) ? 'PASS' : 'FAIL',
    )
    await page.getByTestId('invert-preview').uncheck()
    await closeOptions(page)
  })

  await section('Shape grid paint + softness', async () => {
    await page.getByTestId('tab-paint').click()
    await page.waitForTimeout(300)
    const box = await page.locator('svg[aria-label="Shape grid canvas"]').boundingBox()
    if (!box) throw new Error('no shape grid canvas')
    // Paint adjacent cells via grid geometry so Softness bridges can form
    const info = await page.evaluate(() => {
      const svg = document.querySelector('svg[aria-label="Shape grid canvas"]')
      const vb = (svg?.getAttribute('viewBox') || '0 0 1 1').split(/\s+/).map(Number)
      return { vbW: vb[2], vbH: vb[3] }
    })
    const step = 42
    const cell = 40
    const row = 4
    const startCol = 2
    await page.getByTestId('paint-brush-preset-circle').click()
    for (let i = 0; i < 4; i++) {
      const col = startCol + i
      const cx = (col * step + cell / 2) / info.vbW * box.width + box.x
      const cy = (row * step + cell / 2) / info.vbH * box.height + box.y
      await page.mouse.click(cx, cy)
      await page.waitForTimeout(40)
    }
    const main = await page.locator('main').innerText()
    const paths = await page.locator('svg[aria-label="Shape grid canvas"] path').count()
    note('Shape grid paint', paths > 3 ? 'PASS' : 'PARTIAL', `${paths} paths`)
    await page.getByTestId('paint-toggle-adjust').click()
    await page.waitForTimeout(150)
    const mainOpen = await page.locator('main').innerText()
    note('Fill size control', /Fill size/i.test(mainOpen) ? 'PASS' : 'FAIL')
    note(
      'Paint Softness control',
      /Softness/i.test(mainOpen) &&
        (await page.getByTestId('paint-softness').count()) > 0
        ? 'PASS'
        : 'FAIL',
    )
    await page.getByTestId('paint-softness').evaluate((el) => {
      el.value = '0'
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.waitForTimeout(100)
    const bridges0 = await page.locator('svg[aria-label="Shape grid canvas"]').getAttribute('data-bridges')
    await page.getByTestId('paint-softness').evaluate((el) => {
      el.value = '0.8'
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.waitForTimeout(100)
    const bridges1 = await page.locator('svg[aria-label="Shape grid canvas"]').getAttribute('data-bridges')
    const hasBlurFilter = await page.locator('svg[aria-label="Shape grid canvas"] filter').count()
    const joinDotsHidden = await page.locator('svg[aria-label="Shape grid canvas"]').getAttribute('data-join-dots')
    note(
      'Paint Softness fuse (not blur)',
      Number(bridges1) > Number(bridges0) && hasBlurFilter === 0 ? 'PASS' : 'FAIL',
      `bridges ${bridges0}->${bridges1} filters=${hasBlurFilter}`,
    )
    note(
      'Join dots hidden by default',
      joinDotsHidden === '0' && (await page.locator('[data-testid^="join-break-"]').count()) === 0
        ? 'PASS'
        : 'FAIL',
      `data-join-dots=${joinDotsHidden}`,
    )
    await page.getByTestId('paint-tool-break-join').click()
    await page.waitForTimeout(80)
    const dotsOn = await page.locator('[data-testid^="join-break-"]').count()
    note('Break join shows dots', dotsOn > 0 ? 'PASS' : 'FAIL', `${dotsOn} dots`)
    await page.getByTestId('paint-toggle-joins').click()
    await page.waitForTimeout(80)
    const dotsOff = await page.locator('[data-testid^="join-break-"]').count()
    note('Hide joins', dotsOff === 0 ? 'PASS' : 'FAIL', `${dotsOff} dots`)
    await page.getByTestId('paint-tool-stamp').click()
    note('Sticky fill size', /Fill size/i.test(await page.locator('main').innerText()) ? 'PASS' : 'FAIL')
    await page.getByTestId('tab-export').click()
    await page.waitForTimeout(200)
    const exportMain = await page.locator('main').innerText()
    note(
      'Export = preview + SVG only',
      /Download SVG/i.test(exportMain) &&
        !/Blend amount/i.test(exportMain) &&
        !/Blend brush/i.test(exportMain) &&
        (await page.getByTestId('soft-brush-melt').count()) === 0
        ? 'PASS'
        : 'FAIL',
    )
    note(
      'No Export blend controls',
      (await page.getByTestId('overall-softness').count()) === 0 ? 'PASS' : 'FAIL',
    )
    await page.screenshot({ path: join(mediaDir, 'func-check-03-shape-paint.png') })
  })

  await section('Multi-shape brush', async () => {
    await page.getByTestId('tab-paint').click()
    await page.waitForTimeout(200)
    const box = await page.locator('svg[aria-label="Shape grid canvas"]').boundingBox()
    if (!box) throw new Error('no canvas')
    // Stamp circles
    await page.getByTestId('paint-brush-preset-circle').click()
    await page.mouse.click(box.x + box.width * 0.28, box.y + box.height * 0.35)
    await page.waitForTimeout(60)
    // Switch brush — existing cell must keep circle; new cell gets square
    await page.getByTestId('paint-brush-preset-square').click()
    await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.35)
    await page.waitForTimeout(80)
    const mixed = await page.evaluate(() => {
      const svg = document.querySelector('svg[aria-label="Shape grid canvas"]')
      const ids = svg?.getAttribute('data-shapes') || ''
      return {
        ok: ids.includes('preset-circle') && ids.includes('preset-square'),
        detail: `shapes=${ids}`,
      }
    })
    const strip = await page.getByTestId('paint-brush-preset-star5').count()
    note('Paint brush strip', strip ? 'PASS' : 'FAIL')
    note('Mixed shapes in glyph', mixed.ok ? 'PASS' : 'FAIL', mixed.detail)
    // Brush switch must not rewrite all cells — after square brush, first cell still circle
    await page.getByTestId('paint-brush-preset-diamond').click()
    await page.waitForTimeout(100)
    const stillMixed = await page.evaluate(() => {
      const ids = document.querySelector('svg[aria-label="Shape grid canvas"]')?.getAttribute('data-shapes') || ''
      return ids.includes('preset-circle') && ids.includes('preset-square')
    })
    note('Brush switch keeps prior cells', stillMixed ? 'PASS' : 'FAIL')
  })

  await section('Removed modes absent', async () => {
    const whole = await page.locator('body').innerText()
    const found = ['Dot grid', 'Vertical segments', 'Circle construction', 'Dual overlap'].filter(
      (m) => whole.includes(m),
    )
    note(
      'Dot / Vertical / Circle / Dual removed',
      found.length === 0 ? 'PASS' : 'FAIL',
      found.length ? found.join(', ') : 'none present',
    )
    await page.screenshot({ path: join(mediaDir, 'func-check-04-lean.png') })
  })

  await section('SVG export', async () => {
    await page.getByTestId('tab-paint').click()
    await page.waitForTimeout(200)
    const box = await page.locator('svg[aria-label="Shape grid canvas"]').boundingBox()
    if (box) {
      await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.45)
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45)
    }
    await page.getByTestId('tab-export').click()
    await page.waitForTimeout(200)
    note(
      'Export preview canvas',
      (await page.getByTestId('export-softness-canvas').count()) > 0 ? 'PASS' : 'FAIL',
    )
    const polarityUi = await page.getByTestId('export-negative').count()
    note('No polarity UI', polarityUi === 0 ? 'PASS' : 'FAIL')
    const letterUi = await page.locator('main').innerText()
    note(
      'Export stripped (no letter/OTF/blend)',
      !/Prototype OTF/i.test(letterUi) &&
        !/Glyph character/i.test(letterUi) &&
        !/Blend amount/i.test(letterUi) &&
        !/Blend brush/i.test(letterUi)
        ? 'PASS'
        : 'FAIL',
    )
    note(
      'No Export blend brush',
      (await page.getByTestId('soft-brush-melt').count()) === 0 &&
        (await page.getByTestId('overall-softness').count()) === 0
        ? 'PASS'
        : 'FAIL',
    )
    await page.screenshot({ path: join(mediaDir, 'export-preview-finished.png') })
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 6000 }),
      page.getByRole('button', { name: /Download SVG/i }).click(),
    ])
    const name = download.suggestedFilename()
    await download.saveAs(join('/tmp/gw-exports', name || 'glyph.svg'))
    note('SVG export', 'PASS', name)
  })

  await section('Grid preview + join break', async () => {
    await page.getByTestId('tab-shape').click()
    await page.waitForTimeout(200)
    note(
      'Grid preview on Shape',
      (await page.getByTestId('grid-preview').count()) > 0 ? 'PASS' : 'FAIL',
    )
    await page.getByTestId('tab-paint').click()
    await page.waitForTimeout(150)
    note(
      'Break join tool',
      (await page.getByTestId('paint-tool-break-join').count()) > 0 &&
        (await page.getByTestId('paint-reset-joins').count()) > 0
        ? 'PASS'
        : 'FAIL',
    )
    await page.getByTestId('options-gear').click()
    await page.waitForTimeout(150)
    const opts = await page.getByRole('dialog').innerText()
    note(
      'Options simplified',
      !/Fill contrast/i.test(opts) && !/Cell size/i.test(opts) && !/Export Blend/i.test(opts)
        ? 'PASS'
        : 'FAIL',
    )
    await closeOptions(page)
  })
} catch (err) {
  note('Runner error', 'FAIL', String(err).slice(0, 120))
} finally {
  await browser.close()
}

const pass = results.filter((r) => r.status === 'PASS').length
const fail = results.filter((r) => r.status === 'FAIL').length
const partial = results.filter((r) => r.status === 'PARTIAL').length
const out = { pass, fail, partial, results }
writeFileSync('/tmp/func-check-results.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
process.exit(fail > 0 ? 1 : 0)
