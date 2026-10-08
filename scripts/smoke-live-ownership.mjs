/**
 * Festival live smoke (always-fight / LWW):
 *  1. Two desks can share a letter and fight — last draftUpdatedAt wins.
 *  2. Grid change applies to the open letter only.
 *  3. Clear shared room needs the password.
 *  4. `/` is the studio desk; `?view=workshop` is the full workshop.
 *  5. Wall shows Desk A and Desk B panes side by side.
 *
 * Usage: CLEAR_ROOM_PASSWORD=… VITE_LIVE_SESSION_URL=http://127.0.0.1:8788 node scripts/smoke-live-ownership.mjs http://127.0.0.1:43128/
 * The Worker must run with the same CLEAR_ROOM_PASSWORD.
 */
import { chromium } from 'playwright-core'

const siteBase = (process.argv[2] || 'http://127.0.0.1:43128/').replace(/\/?$/, '/')
const worker = process.env.VITE_LIVE_SESSION_URL || 'http://127.0.0.1:8788'
const room = `own-${Date.now().toString(36)}`
const KEY = 'grid-workshop-festival-v1'
// Public repo: the facilitator password only ever comes from the environment.
const PASSWORD = process.env.CLEAR_ROOM_PASSWORD || ''
if (!PASSWORD) throw new Error('Set CLEAR_ROOM_PASSWORD to the facilitator password.')

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function stamp(page, col, row) {
  const point = await page.locator('svg[aria-label="Shape grid canvas"]').evaluate((svg, cell) => {
    const matrix = svg.getScreenCTM()
    const pt = new DOMPoint(cell.col * 42 + 20, cell.row * 42 + 20).matrixTransform(matrix)
    return { x: pt.x, y: pt.y }
  }, { col, row })
  await page.mouse.click(point.x, point.y)
}

async function getRoom() {
  return (await fetch(`${worker}/rooms/${room}`)).json()
}

async function waitRoom(pred, label, ms = 20000) {
  const deadline = Date.now() + ms
  let last
  while (Date.now() < deadline) {
    last = await getRoom()
    if (pred(last)) return last
    await sleep(250)
  }
  throw new Error(`timeout ${label}: ${JSON.stringify({ desks: last?.desks, cues: Object.keys(last?.liveCues || {}) })}`)
}

async function openPage(path) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())
  await page.goto(`${siteBase}${path}`)
  return { context, page, errors }
}

async function session(page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY)
}

try {
  // --- 4. Routing ---
  {
    const root = await openPage(`?room=${room}`)
    await root.page.getByTestId('studio-desk').waitFor({ timeout: 20000 })
    check('/ opens the studio desk', true)
    check('first visit asks which desk', await root.page.getByTestId('studio-station-picker').isVisible())
    await root.page.getByTestId('studio-station-pick-b').click()
    check('picker remembers desk', new URL(root.page.url()).searchParams.get('station') === 'b')
    await root.page.reload()
    await root.page.getByTestId('studio-desk').waitFor()
    check('picker stays closed after reload', (await root.page.getByTestId('studio-station-picker').count()) === 0)
    await root.context.close()

    const shop = await openPage(`?view=workshop&room=${room}`)
    await shop.page.getByTestId('intro-screen').waitFor({ timeout: 20000 })
    check('?view=workshop opens the full workshop', (await shop.page.getByTestId('studio-desk').count()) === 0)
    await shop.page.getByTestId('intro-start').click().catch(() => {})
    await shop.page.waitForTimeout(800)
    const shopMeta = await shop.page.evaluate(() => ({
      tab: sessionStorage.getItem('gridz-workshop-station-tab'),
      saved: localStorage.getItem('gridz-live-station'),
      desks: null,
    }))
    // Presence push may take a beat; read the room after a short wait.
    await sleep(1200)
    const roomAfter = await getRoom()
    const workshopKeys = Object.keys(roomAfter.desks || {}).filter((k) => /^w_/i.test(k))
    check(
      'workshop tab uses a w_ station without overwriting desk storage',
      /^w_/i.test(shopMeta.tab || '') &&
        !/^w_/i.test(shopMeta.saved || '') &&
        workshopKeys.length >= 1,
      JSON.stringify({ tab: shopMeta.tab, saved: shopMeta.saved, desks: Object.keys(roomAfter.desks || {}) }),
    )
    await shop.context.close()
  }

  await fetch(`${worker}/rooms/${room}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ desks: { b: { char: '', since: new Date().toISOString(), seenAt: new Date().toISOString() } } }),
  })

  // --- 1 + 5. Always-fight on the same letter + two-pane wall ---
  const A = await openPage(`?view=studio&station=a&room=${room}`)
  await A.page.getByTestId('studio-desk').waitFor({ timeout: 20000 })
  await waitRoom((r) => r.desks?.a?.char === 'a', 'desk a claims a')
  await sleep(300)
  const B = await openPage(`?view=studio&station=b&room=${room}`)
  await B.page.getByTestId('studio-desk').waitFor({ timeout: 20000 })
  await waitRoom((r) => r.desks?.b?.char === 'a', 'desk b presence')

  check('no lock overlay on desk A', (await A.page.getByTestId('studio-locked').count()) === 0)
  check('no lock overlay on desk B', (await B.page.getByTestId('studio-locked').count()) === 0)
  check('both desks can publish when they have ink', true)

  await stamp(A.page, 1, 2)
  await stamp(A.page, 2, 2)
  await waitRoom((r) => !!r.draftSvgs?.a && r.liveCues?.a?.char === 'a', 'desk A ink on a')
  const afterA = await getRoom()
  const aSvg = afterA.draftSvgs.a
  const aAt = afterA.draftUpdatedAt?.a

  await stamp(B.page, 3, 3)
  await stamp(B.page, 3, 4)
  await waitRoom(
    (r) =>
      !!r.draftSvgs?.a &&
      r.draftSvgs.a !== aSvg &&
      (r.draftUpdatedAt?.a || '') > (aAt || '') &&
      r.liveCues?.a?.char === 'a' &&
      r.liveCues?.b?.char === 'a',
    'desk B LWW overwrites a',
  )
  check('same-letter fight: later desk wins draftSvg (LWW)', true)
  check('both desks keep live cues while drawing a', true)

  // B moves to b so the wall can show two different letters.
  await B.page.getByTestId('studio-glyph-b').click()
  // An empty letter has no cue: the Worker drops cues without ink.
  await waitRoom((r) => r.desks?.b?.char === 'b' && !r.liveCues?.b, 'desk b on b')
  await stamp(B.page, 1, 1)
  await waitRoom((r) => r.liveCues?.a?.char === 'a' && r.liveCues?.b?.char === 'b', 'both desks live')
  check('room has live ink for desk A (a) and desk B (b)', true)

  const wall = await openPage(`?view=projection&room=${room}`)
  await wall.page.getByTestId('festival-projection').waitFor({ timeout: 20000 })
  await wall.page.waitForFunction(
    () =>
      document.querySelector('[data-testid="festival-live-pane-a"]')?.getAttribute('data-drawing') === 'a' &&
      document.querySelector('[data-testid="festival-live-pane-b"]')?.getAttribute('data-drawing') === 'b',
    null,
    { timeout: 15000 },
  )
  check('wall shows Desk A and Desk B drawing at the same time', true)
  await wall.page.screenshot({ path: `scratch/ownership-wall-${room}.png` })

  // Peer can open the letter the other desk is on.
  await B.page.getByTestId('studio-glyph-a').click()
  await B.page.waitForFunction((k) => JSON.parse(localStorage.getItem(k))?.active.char === 'a', KEY, { timeout: 5000 })
  check('peer can open a letter another desk is drawing', true)
  check('owned tile badge gone', (await B.page.getByTestId('studio-glyph-a').getAttribute('data-owner')) == null)

  await A.page.getByTestId('studio-publish').click()
  await waitRoom((r) => (r.contributions || []).length === 1, 'publish adds contribution')
  check('publish still works while peers may share the letter', true)

  // Closing a desk releases its presence.
  await B.context.close()
  await waitRoom((r) => r.desks?.b?.char === '', 'close releases b', 10000)
  check('closing a desk clears its presence', true)

  // --- 3. Clear shared room password ---
  {
    const res = await fetch(`${worker}/rooms/${room}`, { method: 'DELETE' })
    check('Worker rejects DELETE without password', res.status === 403, `status ${res.status}`)
    const before = await getRoom()
    check('room intact after rejected DELETE', (before.contributions || []).length === 1)

    await A.page.getByTestId('studio-options').click()
    await A.page.getByTestId('clear-room-password').fill('wrong')
    await A.page.getByTestId('clear-shared-room').click()
    await A.page.getByTestId('clear-room-message').waitFor()
    const msg = await A.page.getByTestId('clear-room-message').innerText()
    check('wrong password is refused in the UI', /wrong password/i.test(msg), msg)
    check('room intact after wrong password', ((await getRoom()).contributions || []).length === 1)

    await A.page.getByTestId('clear-room-password').fill(PASSWORD)
    await A.page.getByTestId('clear-shared-room').click()
    await waitRoom((r) => (r.contributions || []).length === 0 && (r.wipeEpoch || 0) > (before.wipeEpoch || 0), 'clear with password')
    check('correct password clears the room', true)
    await A.page.getByLabel('Close options').click()
  }

  // --- 2. Grid applies to the open letter only (workshop) ---
  {
    const shop = await openPage(`?view=workshop&station=w&room=${room}`)
    await shop.page.getByTestId('intro-start').click({ timeout: 20000 })
    await shop.page.getByTestId('options-gear').waitFor({ timeout: 10000 })
    await shop.page.waitForFunction((r) => sessionStorage.getItem(`gridz-wipe-epoch:${r}`) === '1', room, { timeout: 10000 })
    const canvas = shop.page.locator('svg[aria-label="Shape grid canvas"]')
    await canvas.waitFor({ timeout: 10000 })
    const s0 = await session(shop.page)
    const firstChar = s0?.active.char ?? 'a'
    await stamp(shop.page, 1, 1)
    await stamp(shop.page, 2, 1)
    await shop.page.waitForFunction((k) => JSON.parse(localStorage.getItem(k))?.active.filled.length >= 2, KEY, { timeout: 5000 })
    const firstGrid = (await session(shop.page)).active.grid

    const other = firstChar === 'z' ? 'y' : 'z'
    await shop.page.getByTestId(`paint-glyph-${other}`).click()
    await shop.page.waitForFunction((args) => JSON.parse(localStorage.getItem(args.k))?.active.char === args.c, { k: KEY, c: other }, { timeout: 5000 }).catch(() => {})
    const onOther = (await session(shop.page))?.active.char === other

    await shop.page.getByTestId('tab-shape').click()
    const detail = shop.page.getByTestId('grid-detail')
    await detail.waitFor({ timeout: 5000 })
    await detail.evaluate((input) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, '2')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await shop.page.waitForTimeout(800)
    const after = await session(shop.page)
    const firstDraft = after.drafts.find((d) => d.char === firstChar)
    check('workshop could switch letters for grid test', onOther, `active=${after.active.char}`)
    check('new grid applied to the open letter', after.active.grid.cols === 14, JSON.stringify(after.active.grid))
    check(
      'other letter keeps its own grid',
      !!firstDraft && firstDraft.grid.cols === firstGrid.cols && firstDraft.grid.cellSize === firstGrid.cellSize,
      JSON.stringify({ firstChar, firstGrid, drafts: after.drafts.map((d) => [d.char, d.grid?.cols]) }),
    )
    await shop.context.close()
  }

  const errs = [...A.errors, ...wall.errors]
  check('no page errors', errs.length === 0, errs.join(' | '))
  await A.context.close()
  await wall.context.close()
} catch (error) {
  check('run completed', false, error instanceof Error ? error.message : String(error))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
