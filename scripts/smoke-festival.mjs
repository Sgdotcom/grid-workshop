import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import opentype from 'opentype.js'

const base = process.argv[2] || 'http://127.0.0.1:43127/'
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('grid-workshop-festival-v1')))
async function waitSaved(predicate) {
  await page.waitForFunction(predicate, null, { timeout: 10000 })
}
async function stamp(col, row) {
  const canvas = page.locator('svg[aria-label="Shape grid canvas"]')
  const position = await canvas.evaluate((svg, cell) => {
    const matrix = svg.getScreenCTM()
    if (!matrix) throw new Error('canvas CTM missing')
    const pt = new DOMPoint(cell.col * 42 + 20, cell.row * 42 + 20).matrixTransform(matrix)
    const bb = svg.getBoundingClientRect()
    return { x: pt.x - bb.left, y: pt.y - bb.top }
  }, { col, row })
  await canvas.click({ position, force: true })
}
async function downloadBytes(button) {
  const pending = page.waitForEvent('download')
  await button.click()
  const download = await pending.catch(async error => {
    throw new Error(`${error.message}\nPage status: ${await page.getByRole('status').allTextContents()}`)
  })
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}
try {
  // Private room — default boom may carry wipe/tombstone state that clears stamps.
  const room = `fest-${Date.now().toString(36)}`
  await page.goto(`${base}?view=workshop&room=${encodeURIComponent(room)}`)
  await page.getByTestId('intro-start').click()
  await page.waitForFunction(
    (r) => sessionStorage.getItem(`gridz-wipe-epoch:${r}`) != null,
    room,
    { timeout: 10000 },
  ).catch(() => {})
  await stamp(1, 2)
  await stamp(2, 2)
  await waitSaved(() => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active.filled.length === 2)
  await page.getByTestId('paint-softness').fill('0.8')
  await page.getByTestId('publish-glyph').click()
  await waitSaved(() => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.contributions.length === 1)
  const first = (await read()).contributions[0]
  const wall = await context.newPage()
  await wall.goto(`${base}?view=projection&room=${encodeURIComponent(room)}`)
  await wall.waitForFunction(() => document.querySelectorAll('.festival-letter img').length >= 1, null, { timeout: 15000 })
  assert.equal(await wall.locator('.festival-letter img').count(), 1)
  await page.getByTestId('paint-glyph-b').click()
  await stamp(3, 3)
  await page.getByTestId('paint-softness').fill('0.2')
  await page.getByTestId('publish-glyph').click()
  await wall.waitForFunction(() => document.querySelectorAll('.festival-letter img').length === 2)
  assert.ok(await wall.evaluate(() => {
    const alphabet = document.querySelector('.festival-alphabet').getBoundingClientRect()
    const last = [...document.querySelectorAll('.festival-letter')].at(-1).getBoundingClientRect()
    const footer = document.querySelector('.festival-phrase').getBoundingClientRect()
    return last.bottom <= alphabet.bottom + 1 && last.bottom <= footer.top
  }))
  const second = await read()
  assert.equal(second.contributions[0].svg, first.svg)
  assert.equal(second.contributions[0].draft.softness, 0.8)
  assert.equal(second.contributions[1].draft.softness, 0.2)
  await page.reload()
  assert.equal(await page.getByTestId('intro-screen').count(), 0)
  await page.getByTestId('paint-glyph-a').click()
  assert.equal(await page.getByTestId('paint-softness').inputValue(), '0.8')
  await waitSaved(() => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active.char === 'a')
  assert.equal((await read()).active.filled.length, 2)
  await page.getByTestId('paint-glyph-å').click()
  await stamp(2, 3)
  await page.screenshot({ path: '/tmp/gridz-festival-editor.png', fullPage: true })
  await wall.screenshot({ path: '/tmp/gridz-festival-wall.png', fullPage: true })
  await page.getByTestId('options-gear').click()
  const backup = JSON.parse((await downloadBytes(page.getByRole('button', { name: 'Editable backup', exact: true }))).toString())
  assert.equal(backup.contributions.length, 2)
  assert.equal(backup.active.char, 'å')
  await page.getByLabel('Close').click().catch(() => page.keyboard.press('Escape'))
  await page.getByTestId('tab-export').click()
  const fontBytes = await downloadBytes(page.getByRole('button', { name: 'Download font (OTF)', exact: true }))
  const font = opentype.parse(fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength))
  assert.equal(font.charToGlyph('a').unicode, 97)
  assert.equal(font.charToGlyph('b').unicode, 98)
  assert.ok(font.charToGlyph('a').path.commands.length > 5)
  await page.getByRole('combobox').selectOption(first.id)
  await page.getByTestId('publish-glyph').click()
  await waitSaved(() => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.contributions.length === 3)
  assert.equal((await read()).contributions[0].id, first.id)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/tmp/gridz-festival-mobile.png', fullPage: true })
  assert.deepEqual(errors, [])
  const lab = await context.newPage()
  await lab.goto(`${base}?view=join-lab`)
  await lab.getByRole('button', { name: /Cross/i }).first().click()
  await lab.getByLabel('Softness', { exact: true }).fill('0.7')
  const prefer = lab.getByRole('button', { name: 'Prefer this', exact: true }).first()
  if (await prefer.count()) await prefer.click()
  await lab.reload()
  await lab.getByRole('button', { name: /Cross/i }).first().click()
  assert.ok(await lab.getByRole('status').first().textContent())
  assert.equal(await lab.locator('[role="alert"]').count(), 0)
  await lab.screenshot({ path: '/tmp/gridz-join-lab.png', fullPage: true })
  console.log('PASS: live projection, per-glyph settings, refresh recovery, Swedish letters, backup, OTF parsing, retained revisions, mobile rendering.')
} finally {
  await browser.close()
}
