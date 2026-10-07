/**
 * Regression smoke for the October 2026 app pass: phone layout, continuous
 * strokes, erase tool, shape-aware mirroring, undoable joins, shortcuts,
 * Swedish blueprints, word tester, OTF and ZIP export, reload recovery.
 *
 * Usage: npm run dev            (in another terminal)
 *        node scripts/smoke-improvements.mjs [baseUrl]
 * Set CHROME_PATH if Chrome is installed elsewhere.
 */
import { chromium } from 'playwright-core'
import opentype from 'opentype.js'

const base = process.argv[2] || 'http://127.0.0.1:43127/'
const KEY = 'grid-workshop-festival-v1'
const results = []
const errors = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
const settle = (page) => page.waitForTimeout(450)
const canvas = (page) => page.locator('svg[aria-label="Shape grid canvas"]')
const cells = async (page) => Number(await canvas(page).getAttribute('data-cells'))
const session = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), KEY)
const point = (page, col, row) =>
  canvas(page).evaluate((svg, cell) => {
    const p = new DOMPoint(cell.col * 42 + 20, cell.row * 42 + 20).matrixTransform(svg.getScreenCTM())
    return { x: p.x, y: p.y }
  }, { col, row })
const tap = async (page, col, row) => {
  const p = await point(page, col, row)
  await page.mouse.click(p.x, p.y)
}
const gridHeight = (page) =>
  canvas(page).evaluate((svg) => svg.viewBox.baseVal.height * svg.getScreenCTM().d)
const watch = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`))
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})
try {
  // ---- phone: the canvas must own the screen
  for (const [width, height, minimum] of [[390, 844, 320], [375, 667, 180]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true })
    const page = await context.newPage()
    watch(page, `phone-${height}`)
    await page.goto(base, { waitUntil: 'networkidle' })
    await page.getByTestId('intro-start').click()
    await settle(page)
    const drawn = await gridHeight(page)
    check(`phone ${width}×${height}: canvas visible`, drawn >= minimum, `${Math.round(drawn)}px tall`)
    await tap(page, 1, 1); await tap(page, 2, 1); await tap(page, 3, 1)
    const from = await point(page, 5, 1)
    const to = await point(page, 5, 7)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 1 })
    await page.mouse.up()
    check(`phone ${width}×${height}: a fast drag leaves no gaps`, (await cells(page)) === 10, `cells=${await cells(page)}`)
    if (height === 844) {
      await page.getByTestId('paint-toggle-adjust').click()
      await settle(page)
      check('phone: canvas survives Adjust', (await gridHeight(page)) >= 150)
      check('phone: word tester lives in Adjust', (await page.getByTestId('word-tester').count()) === 1)
      await page.getByTestId('paint-toggle-adjust').click()
      await page.getByTestId('paint-tool-erase').click()
      await tap(page, 5, 4)
      check('phone: erase tool removes a cell', (await cells(page)) === 9)
      await page.getByTestId('options-gear').click()
      await settle(page)
      check('phone: backup and projection reachable from Options', await page.getByTestId('options-workshop').isVisible())
      await page.keyboard.press('Escape')
      await settle(page)
      check('Escape closes Options', (await page.getByRole('dialog').count()) === 0)
    }
    await context.close()
  }

  // ---- desktop
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const page = await context.newPage()
  watch(page, 'desktop')
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.getByTestId('intro-start').click()
  await settle(page)

  const mirror = page.getByTitle('Symmetry Mirroring Mode')
  await mirror.click()
  for (const [brush, turns, want, row] of [
    ['triangle', 0, 0, 0], ['triangle', 1, 270, 1], ['rect', 0, 0, 2],
    ['notch', 0, 90, 3], ['arc', 0, 270, 4], ['chevron', 2, 180, 5],
  ]) {
    await page.getByTestId(`paint-brush-preset-${brush}`).click()
    for (let i = 0; i < turns; i++) await page.keyboard.press('r')
    await tap(page, 1, row)
    await settle(page)
    const twin = (await session(page)).active.filled.find((cell) => cell.col === 5 && cell.row === row)
    for (let i = 0; i < (4 - turns) % 4; i++) await page.keyboard.press('r')
    check(`mirror: ${brush} at ${turns * 90}°`, twin?.rotation === want, `twin rotation ${twin?.rotation}, expected ${want}`)
  }
  await mirror.click(); await mirror.click()

  const stampMode = () => page.getByTestId('paint-stamp-mode').innerText()
  const before = await stampMode()
  await page.keyboard.press('Control+c')
  check('Ctrl+C is left to the browser', (await stampMode()) === before)

  await page.getByTestId('paint-glyph-b').click()
  await settle(page)
  await page.getByTestId('paint-brush-preset-circle').click()
  await tap(page, 2, 3); await tap(page, 3, 3)
  await settle(page)
  await page.getByTestId('paint-tool-break-join').click()
  await settle(page)
  await page.locator('[data-testid^="join-break-"]').first().dispatchEvent('pointerdown')
  await settle(page)
  const broken = () => canvas(page).getAttribute('data-broken')
  const afterBreak = await broken()
  await page.keyboard.press('Control+z'); await settle(page)
  const afterUndo = await broken()
  await page.keyboard.press('Control+Shift+z'); await settle(page)
  check('break join → undo → redo', afterBreak === '1' && afterUndo === '0' && (await broken()) === '1')
  await page.keyboard.press('Control+z')
  await page.getByTestId('paint-tool-stamp').click()

  await page.getByTestId('paint-glyph-å').click()
  await settle(page)
  await page.getByTitle(/starter skeleton blueprint/).click()
  await settle(page)
  check('blueprint for å', (await cells(page)) > 10)
  await page.getByTestId('publish-glyph').click()
  await settle(page)
  await page.getByTestId('paint-glyph-o').click()
  await settle(page)
  await page.getByTestId('paint-brush-preset-ring').click()
  await page.getByTitle(/starter skeleton blueprint/).click()
  await page.getByText('Crisp', { exact: true }).click()
  await settle(page)
  await page.getByTestId('publish-glyph').click()
  await settle(page)
  check('letters published', (await session(page)).contributions.length === 2)

  const tester = page.getByTestId('word-tester')
  if (!(await tester.locator('input').count())) await page.getByTestId('word-tester-toggle').click()
  await tester.locator('input').fill('å1o')
  await settle(page)
  await tester.getByTitle('Edit "1"').click()
  await settle(page)
  check('word tester never selects a non-alphabet letter', (await session(page)).active.char === 'o')

  await page.getByTestId('tab-export').click()
  await settle(page)
  const save = async (name) => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()])
    const chunks = []
    for await (const chunk of await download.createReadStream()) chunks.push(chunk)
    return Buffer.concat(chunks)
  }
  const otf = await save('Download font (OTF)')
  const font = opentype.parse(otf.buffer.slice(otf.byteOffset, otf.byteOffset + otf.byteLength))
  const names = Array.from({ length: font.glyphs.length }, (_, index) => font.glyphs.get(index).name)
  check('OTF glyph names', names.join(',') === '.notdef,space,o,aring', names.join(','))
  const areas = []
  let contour = []
  for (const command of font.charToGlyph('o').path.commands) {
    if (command.type === 'M') contour = [command]
    else if (command.type !== 'Z') contour.push(command)
    else areas.push(contour.reduce((sum, p, i) => {
      const q = contour[(i + 1) % contour.length]
      return sum + p.x * q.y - q.x * p.y
    }, 0))
  }
  check('OTF outlines: outer counter-clockwise, counters clockwise', areas.some((a) => a > 0) && areas.some((a) => a < 0))
  check('OTF metrics do not depend on installed fonts', font.ascender === 748 && font.descender === -253, `${font.ascender} / ${font.descender}`)

  const zip = await save('Download published typeface (SVG)')
  const entries = []
  for (let i = 0; i + 30 < zip.length; i++) {
    if (zip.readUInt32LE(i) !== 0x04034b50) continue
    const length = zip.readUInt16LE(i + 26)
    entries.push({ flags: zip.readUInt16LE(i + 6), name: zip.subarray(i + 30, i + 30 + length).toString('utf8') })
  }
  check('ZIP names are UTF-8', entries.every((e) => e.flags & 0x800) && entries.some((e) => e.name === 'lower-å.svg'), entries.map((e) => e.name).join(' '))

  await page.reload({ waitUntil: 'networkidle' })
  await settle(page)
  check('reload restores the session and the brush',
    (await page.getByTestId('intro-screen').count()) === 0 &&
    (await page.getByTestId('paint-brush-preset-ring').getAttribute('aria-pressed')) === 'true' &&
    (await cells(page)) > 5)

  const wall = await context.newPage()
  watch(wall, 'wall')
  await wall.goto(`${base}?view=projection`, { waitUntil: 'networkidle' })
  await settle(wall)
  check('wall shows the published letters', (await wall.locator('.festival-letter img').count()) === 2)
  await context.close()
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
