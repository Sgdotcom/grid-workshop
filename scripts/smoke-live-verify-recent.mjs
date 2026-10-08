/**
 * End-to-end checks for recent live/grid/clear work (≥10 scenarios).
 * Usage: node scripts/smoke-live-verify-recent.mjs [siteBase]
 */
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright-core'

const siteBase = (process.argv[2] || 'http://127.0.0.1:43127/').replace(/\/?$/, '/')
const worker =
  process.env.VITE_LIVE_SESSION_URL || 'https://grid-workshop-live.sgdotcom.workers.dev'
const chrome =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const room = `verify-${Date.now().toString(36)}`
// Public repo: the facilitator password only ever comes from the environment.
const clearPassword = process.env.CLEAR_ROOM_PASSWORD || ''
if (!clearPassword) throw new Error('Set CLEAR_ROOM_PASSWORD to the facilitator password.')

const results = []
function ok(name) {
  results.push({ name, ok: true })
  console.log(`[ok] ${name}`)
}
function fail(name, err) {
  results.push({ name, ok: false, err: String(err) })
  console.error(`[fail] ${name}: ${err}`)
}

const browser = await chromium.launch({
  headless: true,
  executablePath: chrome,
  args: ['--disable-dev-shm-usage', '--no-sandbox'],
})

async function stamp(page, col, row) {
  const canvas = page.locator('svg[aria-label="Shape grid canvas"]')
  await canvas.waitFor({ state: 'visible', timeout: 15000 })
  const position = await canvas.evaluate((svg, cell) => {
    const matrix = svg.getScreenCTM()
    if (!matrix) throw new Error('canvas CTM missing')
    const pt = new DOMPoint(cell.col * 42 + 20, cell.row * 42 + 20).matrixTransform(matrix)
    const bb = svg.getBoundingClientRect()
    return { x: pt.x - bb.left, y: pt.y - bb.top }
  }, { col, row })
  await canvas.click({ position, force: true })
}

async function openDesk(station, letter = 'a') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    window.confirm = () => true
  })
  await page.goto(`${siteBase}?view=studio&station=${station}&room=${encodeURIComponent(room)}`)
  await page.getByTestId('studio-desk').waitFor({ timeout: 25000 })
  await page.getByTestId('studio-options').click()
  const join = page.getByTestId('live-session-join')
  await join.waitFor({ state: 'visible', timeout: 10000 })
  assert.equal(await join.evaluate((el) => el.classList.contains('is-off')), false, 'live must be enabled')
  const joinBtn = page.getByTestId('live-session-join-btn')
  if (await joinBtn.count()) await joinBtn.click().catch(() => {})
  await page.getByLabel('Close options').click().catch(() => {})
  await page.locator('.studio-options').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  if (letter !== 'a') {
    await page.getByTestId(`studio-glyph-${letter}`).click()
    await page.waitForFunction(
      (ch) => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.char === ch,
      letter,
      { timeout: 10000 },
    )
  }
  return { context, page, errors }
}

async function openWall() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.goto(`${siteBase}?view=projection&room=${encodeURIComponent(room)}`)
  await page.getByTestId('festival-projection').waitFor({ timeout: 25000 })
  const joinBtn = page.getByTestId('live-session-join-btn')
  if (await joinBtn.count()) await joinBtn.click().catch(() => {})
  return { context, page }
}

async function openWorkshop() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.addInitScript(() => {
    window.confirm = () => true
  })
  await page.goto(`${siteBase}?view=workshop&room=${encodeURIComponent(room)}`)
  // Dismiss intro if present
  const start = page.getByTestId('intro-start')
  if (await start.count()) await start.click().catch(() => {})
  await page.getByTestId('tab-paint').waitFor({ timeout: 20000 })
  await page.getByTestId('options-gear').click()
  const joinBtn = page.getByTestId('live-session-join-btn')
  if (await joinBtn.count()) await joinBtn.click().catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
  return { context, page }
}

async function waitRoom(pred, label, ms = 25000) {
  const deadline = Date.now() + ms
  let last = null
  while (Date.now() < deadline) {
    const res = await fetch(`${worker}/rooms/${encodeURIComponent(room)}`)
    last = await res.json()
    if (pred(last)) return last
    await sleep(300)
  }
  throw new Error(`timeout ${label}: ${JSON.stringify({ wipeEpoch: last?.wipeEpoch, drafts: Object.keys(last?.draftSvgs || {}), contribs: (last?.contributions || []).length })}`)
}

async function session(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('grid-workshop-festival-v1') || 'null'))
}

async function clearShared(page) {
  await page.getByTestId('studio-options').click()
  await page.getByTestId('clear-room-password').fill(clearPassword)
  await page.getByTestId('clear-shared-room').click()
  await page.getByLabel('Close options').click().catch(() => {})
  await page.locator('.studio-options').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
}

async function DELETE_room() {
  await fetch(`${worker}/rooms/${encodeURIComponent(room)}`, { method: 'DELETE', headers: { 'X-Clear-Password': clearPassword } })
}

let deskA, deskB, wall, workshop

try {
  await DELETE_room()

  // 1. Open dual desks + wall
  try {
    deskA = await openDesk('a')
    deskB = await openDesk('b')
    wall = await openWall()
    assert.equal(deskA.errors.length, 0, deskA.errors.join('; '))
    assert.equal(deskB.errors.length, 0, deskB.errors.join('; '))
    ok('1 open dual desks + projection')
  } catch (e) {
    fail('1 open dual desks + projection', e)
    throw e
  }

  // 2. Stamp on A syncs live cue to Worker + wall
  try {
    await stamp(deskA.page, 1, 1)
    await stamp(deskA.page, 2, 1)
    await deskA.page.waitForFunction(
      () => (JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.filled || []).length >= 2,
      null,
      { timeout: 15000 },
    )
    await waitRoom(
      (r) => !!(r.draftSvgs?.a || Object.values(r.liveCues || {}).some((c) => c?.char === 'a' && c.liveSvg)),
      'A live cue',
    )
    await wall.page.waitForFunction(
      () => document.querySelectorAll('.festival-letter img, .festival-live-pane img').length >= 1,
      null,
      { timeout: 20000 },
    )
    ok('2 stamp syncs to live Worker + projection')
  } catch (e) {
    fail('2 stamp syncs to live Worker + projection', e)
  }

  // 3. Shared letter: B idle on a takes A's newer ink
  try {
    await stamp(deskA.page, 3, 2)
    await deskA.page.waitForFunction(
      () => (JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.filled || []).length >= 3,
      null,
      { timeout: 10000 },
    )
    await waitRoom((r) => (r.drafts || []).some((d) => d.char === 'a' && (d.filled || []).length >= 3), 'A draft ≥3')
    await deskB.page.waitForFunction(
      () => (JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.filled || []).length >= 3,
      null,
      { timeout: 25000 },
    )
    ok('3 shared letter LWW applies peer ink on idle desk')
  } catch (e) {
    fail('3 shared letter LWW applies peer ink on idle desk', e)
  }

  // 4. Tools: softness slider still works
  try {
    await deskA.page.locator('.studio-soft-presets button', { hasText: 'Crisp' }).click()
    await sleep(400)
    let s = await session(deskA.page)
    assert.equal(s?.active?.softness, 0, `softness after Crisp=${s?.active?.softness}`)
    await deskA.page.locator('.studio-soft-presets button', { hasText: 'Melt' }).click()
    await sleep(400)
    s = await session(deskA.page)
    assert.ok(Math.abs((s?.active?.softness ?? -1) - 0.55) < 0.05, `softness after Melt=${s?.active?.softness}`)
    ok('4 softness tool updates session')
  } catch (e) {
    fail('4 softness tool updates session', e)
  }

  // 5. Publish letter
  try {
    await deskA.page.getByTestId('studio-publish').click()
    await deskA.page.waitForFunction(
      () => (JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.contributions || []).length >= 1,
      null,
      { timeout: 15000 },
    )
    await waitRoom((r) => (r.contributions || []).length >= 1, 'published')
    await deskB.page.waitForFunction(
      () => (JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.contributions || []).length >= 1,
      null,
      { timeout: 20000 },
    )
    ok('5 publish syncs contributions to peer')
  } catch (e) {
    fail('5 publish syncs contributions to peer', e)
  }

  // 6. localStorage save persists after reload
  try {
    const before = await session(deskA.page)
    assert.ok((before?.contributions || []).length >= 1, 'pre-reload contrib')
    await deskA.page.reload()
    await deskA.page.getByTestId('studio-desk').waitFor({ timeout: 20000 })
    // re-join
    await deskA.page.getByTestId('studio-options').click()
    const joinBtn = deskA.page.getByTestId('live-session-join-btn')
    if (await joinBtn.count()) await joinBtn.click().catch(() => {})
    await deskA.page.getByLabel('Close options').click().catch(() => {})
    const after = await session(deskA.page)
    assert.ok((after?.contributions || []).length >= 1, 'contrib survived reload')
    ok('6 localStorage save survives reload')
  } catch (e) {
    fail('6 localStorage save survives reload', e)
  }

  // 7. Switch letter keeps published a; paint b
  try {
    await deskA.page.getByTestId('studio-glyph-b').click()
    await deskA.page.waitForFunction(
      () => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.char === 'b',
      null,
      { timeout: 10000 },
    )
    await stamp(deskA.page, 1, 1)
    await stamp(deskA.page, 2, 2)
    await waitRoom(
      (r) => !!(r.draftSvgs?.b || Object.values(r.liveCues || {}).some((c) => c?.char === 'b' && c.liveSvg)),
      'B live',
    )
    const s = await session(deskA.page)
    assert.ok((s?.contributions || []).some((c) => c.draft.char === 'a'), 'published a kept')
    ok('7 letter switch preserves published; paints new letter')
  } catch (e) {
    fail('7 letter switch preserves published; paints new letter', e)
  }

  // 8. Clear shared room wipes glyphs for everyone
  try {
    await clearShared(deskA.page)
    await waitRoom(
      (r) =>
        (r.contributions || []).length === 0 &&
        !Object.keys(r.draftSvgs || {}).length &&
        !(r.liveCues && Object.values(r.liveCues).some((c) => c?.liveSvg)),
      'room empty',
    )
    await deskA.page.waitForFunction(
      () => {
        const s = JSON.parse(localStorage.getItem('grid-workshop-festival-v1') || 'null')
        return (
          (s?.contributions || []).length === 0 &&
          (s?.drafts || []).length === 0 &&
          (s?.active?.filled || []).length === 0
        )
      },
      null,
      { timeout: 15000 },
    )
    await deskB.page.waitForFunction(
      () => {
        const s = JSON.parse(localStorage.getItem('grid-workshop-festival-v1') || 'null')
        return (
          (s?.contributions || []).length === 0 &&
          (s?.drafts || []).length === 0 &&
          (s?.active?.filled || []).length === 0
        )
      },
      null,
      { timeout: 20000 },
    )
    await wall.page.waitForFunction(
      () =>
        document.querySelectorAll('.festival-live-pane img').length === 0 &&
        document.querySelectorAll('.festival-letter img').length === 0,
      null,
      { timeout: 20000 },
    )
    // Alphabet draft markers gone on A
    const draftMarks = await deskA.page.locator('.studio-letter.is-draft, .studio-letter.is-published img').count()
    assert.equal(draftMarks, 0, `alphabet still shows glyphs (${draftMarks})`)
    ok('8 clear shared room wipes glyphs on both desks + wall')
  } catch (e) {
    fail('8 clear shared room wipes glyphs on both desks + wall', e)
  }

  // 9. Post-wipe paint still accepted
  try {
    await stamp(deskA.page, 1, 1)
    await stamp(deskA.page, 2, 1)
    await waitRoom(
      (r) => !!(r.draftSvgs?.a || Object.values(r.liveCues || {}).some((c) => c?.liveSvg)),
      'post-wipe paint',
    )
    ok('9 post-wipe paint syncs')
  } catch (e) {
    fail('9 post-wipe paint syncs', e)
  }

  // 10. Letter clear (not shared) only drops active letter cue
  try {
    // B paints c first so the room stays non-empty after A clears a (A still owns b).
    await deskB.page.getByTestId('studio-glyph-c').click()
    await deskB.page.waitForFunction(
      () => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.char === 'c',
      null,
      { timeout: 10000 },
    )
    await stamp(deskB.page, 4, 4)
    await stamp(deskB.page, 5, 4)
    await deskB.page.waitForFunction(
      () => (JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.filled || []).length >= 2,
      null,
      { timeout: 15000 },
    )
    await waitRoom(
      (r) =>
        !!(r.draftSvgs?.c || Object.values(r.liveCues || {}).some((c) => c?.char === 'c' && c.liveSvg)),
      'B has ink',
    )

    await deskA.page.getByTestId('studio-glyph-a').click()
    await deskA.page.waitForFunction(
      () => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.char === 'a',
      null,
      { timeout: 10000 },
    )
    await stamp(deskA.page, 1, 3)
    await stamp(deskA.page, 2, 3)
    await deskA.page.waitForFunction(
      () => (JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.filled || []).length >= 1,
      null,
      { timeout: 15000 },
    )
    await deskA.page.getByTestId('studio-clear').click({ timeout: 10000 })
    await deskA.page.waitForFunction(
      () => (JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.filled || []).length === 0,
      null,
      { timeout: 10000 },
    )
    await sleep(1000)
    const roomState = await (await fetch(`${worker}/rooms/${encodeURIComponent(room)}`)).json()
    assert.ok(
      !!(roomState.draftSvgs?.c || Object.values(roomState.liveCues || {}).some((c) => c?.char === 'c' && c.liveSvg)),
      'letter clear on A must keep B ink',
    )
    ok('10 letter clear does not wipe entire room')
  } catch (e) {
    fail('10 letter clear does not wipe entire room', e)
  }

  // 11. Workshop grid resize with existing work
  try {
    await DELETE_room()
    workshop = await openWorkshop()
    await workshop.page.getByTestId('tab-paint').click()
    // Desks own a and c; the workshop takes a free letter.
    await workshop.page.getByTestId('paint-glyph-k').click()
    await workshop.page.waitForFunction(
      () => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.char === 'k',
      null,
      { timeout: 10000 },
    )
    // Stamp via canvas
    await stamp(workshop.page, 1, 2)
    await stamp(workshop.page, 2, 2)
    await workshop.page.waitForFunction(
      () => (JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.filled || []).length >= 2,
      null,
      { timeout: 15000 },
    )
    const before = await session(workshop.page)
    const beforeCols = before.active.grid?.cols ?? 7
    await workshop.page.getByTestId('tab-shape').click()
    const detail = workshop.page.getByTestId('grid-detail')
    await detail.waitFor({ state: 'visible', timeout: 10000 })
    await detail.evaluate((el) => {
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      set?.call(el, '2')
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await workshop.page.waitForFunction(
      (prev) => {
        const s = JSON.parse(localStorage.getItem('grid-workshop-festival-v1') || 'null')
        return (s?.active?.grid?.cols ?? prev) !== prev
      },
      beforeCols,
      { timeout: 10000 },
    )
    const after = await session(workshop.page)
    const afterCols = after.active.grid?.cols
    assert.ok(afterCols && afterCols !== beforeCols, `grid cols should change (${beforeCols} → ${afterCols})`)
    assert.ok((after.active.filled || []).length >= 1, 'stamps survived grid remap')
    ok('11 grid detail change allowed with existing work')
  } catch (e) {
    fail('11 grid detail change allowed with existing work', e)
  }

  // 12. Second shared clear after work — no resurrection
  try {
    if (deskA?.page && !deskA.page.isClosed()) {
      await clearShared(deskA.page)
    } else {
      deskA = await openDesk('a')
      await stamp(deskA.page, 1, 1)
      await waitRoom((r) => Object.keys(r.draftSvgs || {}).length > 0 || (r.drafts || []).length > 0, 'ink before clear')
      await clearShared(deskA.page)
    }
    await waitRoom((r) => (r.contributions || []).length === 0 && !Object.keys(r.draftSvgs || {}).length, 'empty again')
    await sleep(2500)
    const after = await (await fetch(`${worker}/rooms/${encodeURIComponent(room)}`)).json()
    assert.equal((after.contributions || []).length, 0, 'no contrib resurrection')
    assert.equal(Object.keys(after.draftSvgs || {}).length, 0, 'no draft resurrection')
    ok('12 clear holds — no silent resurrection')
  } catch (e) {
    fail('12 clear holds — no silent resurrection', e)
  }
} finally {
  await deskA?.context.close().catch(() => {})
  await deskB?.context.close().catch(() => {})
  await wall?.context.close().catch(() => {})
  await workshop?.context.close().catch(() => {})
  await browser.close().catch(() => {})
  await DELETE_room().catch(() => {})
}

const passed = results.filter((r) => r.ok).length
const failed = results.filter((r) => !r.ok)
console.log(`\n[summary] ${passed}/${results.length} passed`)
if (failed.length) {
  for (const f of failed) console.error(`  - ${f.name}: ${f.err}`)
  process.exit(1)
}
console.log('[pass] smoke-live-verify-recent')
