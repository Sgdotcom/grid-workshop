/**
 * Adversarial live-sync suite: unit applyRoom + Worker chaos + dual-desk Playwright.
 *
 * Usage: node scripts/smoke-live-adversarial.mjs [siteBase]
 * Env: VITE_LIVE_SESSION_URL (default deployed Worker), CHROME_PATH
 *
 * Expects a Vite (or Pages) build with live session enabled. Default site:
 * http://127.0.0.1:43127/
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright-core'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const siteBase = (process.argv[2] || 'http://127.0.0.1:43127/').replace(/\/?$/, '/')
const worker =
  process.env.VITE_LIVE_SESSION_URL || 'https://grid-workshop-live.sgdotcom.workers.dev'
const chrome =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const stampId = Date.now().toString(36)
// Public repo: the facilitator password only ever comes from the environment.
const clearPassword = process.env.CLEAR_ROOM_PASSWORD || ''
if (!clearPassword) throw new Error('Set CLEAR_ROOM_PASSWORD to the facilitator password.')

function log(msg) {
  console.log(msg)
}

async function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || repoRoot,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => {
      out += d
      process.stdout.write(d)
    })
    child.stderr.on('data', (d) => {
      err += d
      process.stderr.write(d)
    })
    child.on('close', (code) => {
      if (code === 0) resolve({ out, err })
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}\n${err || out}`))
    })
  })
}

async function req(method, roomPath, body) {
  const url = new URL(`${worker}${roomPath}`)
  const res = await fetch(url, {
    method,
    headers: method === 'GET'
      ? { Accept: 'application/json' }
      : {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(method === 'DELETE' ? { 'X-Clear-Password': clearPassword } : {}),
        },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

function contrib(id, char, createdAt) {
  return {
    id,
    createdAt,
    draft: { char, filled: [{ key: '1' }], brokenJoins: [] },
    svg: `<svg id="${id}"/>`,
  }
}

async function layerUnit() {
  log('\n=== Layer 1: unit applyRoom (vite-node) ===')
  await run('npx', ['vite-node', 'scripts/smoke-live-adversarial-unit.ts'])
}

async function layerWorker() {
  log('\n=== Layer 2: Worker HTTP chaos ===')
  const health = await req('GET', '/health')
  assert.equal(health.status, 200, 'worker health')
  assert.ok(health.json.ok, 'worker health.ok')

  const room = `adv-w-${stampId}`
  const boom = `adv-boom-${stampId}`
  const roomB = `adv-room-b-${stampId}`

  // Seed then DELETE + stale epoch
  await req('PUT', `/rooms/${room}`, {
    wipeEpoch: 0,
    contributions: [contrib('seed-a', 'a', '2026-10-07T12:00:00.000Z')],
    drafts: [{ char: 'a', filled: [{ key: '1' }], brokenJoins: [] }],
    draftSvgs: { a: '<svg id="a"/>' },
    draftUpdatedAt: { a: '2026-10-07T12:00:00.000Z' },
    liveCue: {
      char: 'a',
      station: 'a',
      liveSvg: '<svg id="live-a"/>',
      updatedAt: '2026-10-07T12:00:00.000Z',
    },
  })
  const cleared = await req('DELETE', `/rooms/${room}`)
  assert.equal(cleared.status, 200, 'DELETE')
  assert.equal((cleared.json.contributions || []).length, 0, 'DELETE empties contributions')
  const epoch = cleared.json.wipeEpoch
  assert.ok(typeof epoch === 'number' && epoch >= 1, 'wipeEpoch bumped')

  const stale = await req('PUT', `/rooms/${room}`, {
    wipeEpoch: epoch - 1,
    contributions: [contrib('ghost', 'z', '2026-10-07T12:00:00.000Z')],
    draftSvgs: { z: '<svg id="ghost"/>' },
    draftUpdatedAt: { z: '2026-10-07T12:00:00.000Z' },
  })
  assert.equal((stale.json.contributions || []).length, 0, 'stale wipeEpoch-1 must not refill')
  assert.ok(!stale.json.draftSvgs?.z, 'stale PUT must not restore draftSvg')
  log('[ok] stale wipeEpoch PUT rejected')

  // Current epoch + old contribution ids (dirty session after epoch catch-up)
  const dirty = await req('PUT', `/rooms/${room}`, {
    wipeEpoch: epoch,
    contributions: [contrib('pre-wipe-resurrect', 'a', '2026-10-07T11:00:00.000Z')],
    drafts: [{ char: 'a', filled: [{ key: '1' }], brokenJoins: [] }],
    draftSvgs: { a: '<svg id="resurrect"/>' },
    draftUpdatedAt: { a: '2026-10-07T14:00:00.000Z' },
  })
  // Documented behavior: Worker accepts valid-epoch PUTs. Client wipe must prevent this;
  // if it refills, adversarial UI layer catches the real bug. Here we only assert Worker
  // does not crash and wipeEpoch is preserved.
  assert.equal(dirty.status, 200, 'dirty epoch PUT returns 200')
  assert.equal(dirty.json.wipeEpoch, epoch, 'wipeEpoch preserved on dirty PUT')
  if ((dirty.json.contributions || []).some((c) => c.id === 'pre-wipe-resurrect')) {
    log('[warn] Worker accepts post-wipe PUT with old contribs at current epoch (client must wipe first)')
  }
  // Re-clear for remaining tests
  await req('DELETE', `/rooms/${room}`)

  // Rapid dual PUT then DELETE
  const race = `adv-race-${stampId}`
  await Promise.all([
    req('PUT', `/rooms/${race}`, {
      wipeEpoch: 0,
      liveCue: {
        char: 'a',
        station: 'a',
        liveSvg: '<svg id="race-a"/>',
        updatedAt: '2026-10-07T12:00:01.000Z',
      },
      draftSvgs: { a: '<svg id="race-a-d"/>' },
      draftUpdatedAt: { a: '2026-10-07T12:00:01.000Z' },
      contributions: [contrib('race-a', 'a', '2026-10-07T12:00:01.000Z')],
    }),
    req('PUT', `/rooms/${race}`, {
      wipeEpoch: 0,
      liveCue: {
        char: 'b',
        station: 'b',
        liveSvg: '<svg id="race-b"/>',
        updatedAt: '2026-10-07T12:00:02.000Z',
      },
      draftSvgs: { b: '<svg id="race-b-d"/>' },
      draftUpdatedAt: { b: '2026-10-07T12:00:02.000Z' },
      contributions: [contrib('race-b', 'b', '2026-10-07T12:00:02.000Z')],
    }),
  ])
  const raceClear = await req('DELETE', `/rooms/${race}`)
  assert.equal((raceClear.json.contributions || []).length, 0, 'race room empty after DELETE')
  assert.ok(!Object.keys(raceClear.json.draftSvgs || {}).length, 'race draftSvgs empty')
  log('[ok] rapid dual PUT then DELETE empties room')

  // two rooms isolation under DELETE
  await req('PUT', `/rooms/${boom}`, {
    wipeEpoch: 0,
    contributions: [contrib('boom-only', 'x', '2026-10-07T12:00:00.000Z')],
    draftSvgs: { x: '<svg id="boom"/>' },
    draftUpdatedAt: { x: '2026-10-07T12:00:00.000Z' },
    liveCue: {
      char: 'x',
      station: 'a',
      liveSvg: '<svg id="boom-live"/>',
      updatedAt: '2026-10-07T12:00:00.000Z',
    },
  })
  await req('PUT', `/rooms/${roomB}`, {
    wipeEpoch: 0,
    contributions: [contrib('roomB-only', 'y', '2026-10-07T12:00:00.000Z')],
    draftSvgs: { y: '<svg id="roomB"/>' },
    draftUpdatedAt: { y: '2026-10-07T12:00:00.000Z' },
    liveCue: {
      char: 'y',
      station: 'a',
      liveSvg: '<svg id="roomB-live"/>',
      updatedAt: '2026-10-07T12:00:00.000Z',
    },
  })
  await req('DELETE', `/rooms/${boom}`)
  const boomGet = await req('GET', `/rooms/${boom}`)
  const roomBGet = await req('GET', `/rooms/${roomB}`)
  assert.equal((boomGet.json.contributions || []).length, 0, 'boom cleared')
  assert.ok(
    (roomBGet.json.contributions || []).some((c) => c.id === 'roomB-only'),
    'roomB untouched after boom DELETE',
  )
  assert.equal(roomBGet.json.draftSvgs?.y, '<svg id="roomB"/>', 'roomB draft survives')
  log('[ok] DELETE leaves other room intact')
  log('[pass] Worker chaos')
}

async function freeVitePort() {
  if (!siteBase.includes('127.0.0.1:43127') && !siteBase.includes('localhost:43127')) return
  try {
    await run('bash', [
      '-lc',
      "lsof -i :43127 -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $2}' | xargs -n1 kill 2>/dev/null || true",
    ])
  } catch {
    /* ignore */
  }
  await sleep(500)
}

async function ensureSiteUp() {
  // Suite always owns a fresh Vite with VITE_LIVE_SESSION_URL (avoids stale/dead listeners).
  if (siteBase.includes('127.0.0.1:43127') || siteBase.includes('localhost:43127')) {
    await freeVitePort()
  } else {
    try {
      const res = await fetch(siteBase, { signal: AbortSignal.timeout(2000) })
      if (res.ok || res.status === 404) {
        log(`[ok] site already up at ${siteBase}`)
        return null
      }
    } catch {
      throw new Error(`site not reachable: ${siteBase}`)
    }
  }
  log(`[info] starting Vite on ${siteBase} with live Worker…`)
  const child = spawn('npm', ['run', 'dev'], {
    cwd: repoRoot,
    env: { ...process.env, VITE_LIVE_SESSION_URL: worker },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(siteBase, { signal: AbortSignal.timeout(1500) })
      if (res.ok || res.status === 404) {
        log('[ok] Vite ready')
        return child
      }
    } catch {
      /* retry */
    }
    await sleep(400)
  }
  child.kill('SIGTERM')
  throw new Error('Vite failed to start')
}

async function layerPlaywright() {
  log('\n=== Layer 3: Playwright dual-desk scenarios ===')
  const browser = await chromium.launch({ headless: true, executablePath: chrome })

  async function stamp(page, col, row) {
    const canvas = page.locator('svg[aria-label="Shape grid canvas"]')
    await canvas.waitFor({ state: 'visible', timeout: 15000 })
    // Prefer ink stamp (not punch-out)
    const mode = page.getByTestId('studio-stamp-mode')
    if ((await mode.count()) && (await mode.getAttribute('aria-pressed')) === 'true') {
      await mode.click()
    }
    // Element-relative click — page.mouse + CTM is flaky under Vite/headless scaling.
    const position = await canvas.evaluate((svg, cell) => {
      const matrix = svg.getScreenCTM()
      if (!matrix) throw new Error('canvas CTM missing')
      const pt = new DOMPoint(cell.col * 42 + 20, cell.row * 42 + 20).matrixTransform(matrix)
      const bb = svg.getBoundingClientRect()
      return { x: pt.x - bb.left, y: pt.y - bb.top }
    }, { col, row })
    await canvas.click({ position, force: true })
  }

  async function openDesk(room, station, opts = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => {
      window.confirm = () => true
    })
    const url = `${siteBase}?view=studio&station=${encodeURIComponent(station)}&room=${encodeURIComponent(room)}`
    await page.goto(url)
    await page.getByTestId('studio-desk').waitFor({ timeout: 25000 })
    // Join UI lives in facilitator options — open briefly, then fully dismiss.
    await page.getByTestId('studio-options').click()
    const joinRoot = page.getByTestId('live-session-join')
    await joinRoot.waitFor({ state: 'visible', timeout: 10000 })
    const off = await joinRoot.evaluate((el) => el.classList.contains('is-off'))
    assert.equal(off, false, 'live session must be enabled (set VITE_LIVE_SESSION_URL for Vite)')
    if (room === 'boom') {
      await page.getByTestId(`live-room-${room}`).click()
    } else {
      const join = page.getByTestId('live-session-join-btn')
      if (await join.count()) await join.click().catch(() => {})
    }
    await page.getByLabel('Close options').click().catch(() => {})
    await page.locator('.studio-options').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
    await page.locator('svg[aria-label="Shape grid canvas"]').waitFor({ state: 'visible', timeout: 10000 })
    await sleep(300)
    if (opts.letter) {
      await page.getByTestId(`studio-glyph-${opts.letter}`).click()
      await page.waitForFunction(
        (ch) => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.char === ch,
        opts.letter,
        { timeout: 10000 },
      )
    }
    return { context, page, errors }
  }

  async function openWall(room) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await page.goto(`${siteBase}?view=projection&room=${encodeURIComponent(room)}`)
    await page.getByTestId('festival-projection').waitFor({ timeout: 25000 })
    if (room === 'boom') {
      await page.getByTestId(`live-room-${room}`).click().catch(() => {})
    } else {
      const join = page.getByTestId('live-session-join-btn')
      if (await join.count()) await join.click().catch(() => {})
    }
    return { context, page }
  }

  async function waitRoom(room, predicate, label, ms = 25000) {
    const deadline = Date.now() + ms
    let last = null
    while (Date.now() < deadline) {
      const res = await fetch(`${worker}/rooms/${encodeURIComponent(room)}`)
      const json = await res.json()
      last = json
      if (predicate(json)) return json
      await sleep(300)
    }
    const cues = last?.liveCues ? Object.keys(last.liveCues) : []
    const drafts = last?.draftSvgs ? Object.keys(last.draftSvgs) : []
    throw new Error(
      `timeout: ${label} (liveCues=[${cues}] draftSvgs=[${drafts}] wipeEpoch=${last?.wipeEpoch})`,
    )
  }

  async function sessionContribs(page) {
    return page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('grid-workshop-festival-v1') || 'null')
      return s?.contributions || []
    })
  }

  async function clearSharedRoom(page) {
    await page.getByTestId('studio-options').click()
    await page.getByTestId('clear-shared-room').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('clear-room-password').fill(clearPassword)
    await page.getByTestId('clear-shared-room').click()
    await page.getByLabel('Close options').click().catch(async () => {
      await page.keyboard.press('Escape').catch(() => {})
    })
    await page.getByTestId('clear-shared-room').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  }

  try {
    // --- 1. Clear shared room resurrection ---
    {
      const room = `adv-clear-${stampId}`
      log(`\n[scenario] clear shared room resurrection (${room})`)
      const deskA = await openDesk(room, 'a')
      const deskB = await openDesk(room, 'b')
      const wall = await openWall(room)

      log('  …stamping desk A')
      await stamp(deskA.page, 1, 2)
      await stamp(deskA.page, 2, 2)
      await stamp(deskA.page, 3, 2)
      await deskA.page.waitForFunction(
        () => {
          const btn = document.querySelector('[data-testid="studio-publish"]')
          return btn instanceof HTMLButtonElement && !btn.disabled
        },
        null,
        { timeout: 15000 },
      )
      log('  …publishing')
      await deskA.page.getByTestId('studio-publish').click()
      await waitRoom(
        room,
        (r) => (r.contributions || []).length >= 1,
        'A published',
      )
      await deskB.page.waitForFunction(
        () => (JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.contributions || []).length >= 1,
        null,
        { timeout: 20000 },
      )
      await wall.page.waitForFunction(
        () => document.querySelectorAll('.festival-letter img').length >= 1,
        null,
        { timeout: 20000 },
      )

      await clearSharedRoom(deskA.page)
      await waitRoom(
        room,
        (r) =>
          (r.contributions || []).length === 0 &&
          !Object.keys(r.draftSvgs || {}).length &&
          !(r.liveCues && Object.values(r.liveCues).some((c) => c?.liveSvg)),
        'room empty after clear',
      )
      await deskA.page.waitForFunction(
        () => {
          const s = JSON.parse(localStorage.getItem('grid-workshop-festival-v1') || 'null')
          return (s?.contributions || []).length === 0 && (s?.active?.filled || []).length === 0
        },
        null,
        { timeout: 15000 },
      )
      await deskB.page.waitForFunction(
        () => {
          const s = JSON.parse(localStorage.getItem('grid-workshop-festival-v1') || 'null')
          return (s?.contributions || []).length === 0 && (s?.active?.filled || []).length === 0
        },
        null,
        { timeout: 15000 },
      )
      await wall.page.waitForFunction(
        () =>
          document.querySelectorAll('.festival-live-pane img').length === 0 &&
          document.querySelectorAll('.festival-phrase img').length === 0,
        null,
        { timeout: 15000 },
      )
      await sleep(3000)
      const after = await (await fetch(`${worker}/rooms/${encodeURIComponent(room)}`)).json()
      assert.equal((after.contributions || []).length, 0, 'no silent refill after 3s')
      assert.equal((await sessionContribs(deskA.page)).length, 0, 'A still empty')
      assert.equal((await sessionContribs(deskB.page)).length, 0, 'B still empty')
      log('[ok] clear shared room — no resurrection')

      // --- 3. Post-wipe paint (reuse cleared room) ---
      log('[scenario] post-wipe paint')
      await stamp(deskA.page, 1, 1)
      await stamp(deskA.page, 2, 1)
      await deskA.page.waitForFunction(
        () => (JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active.filled || []).length >= 2,
        null,
        { timeout: 10000 },
      )
      await waitRoom(
        room,
        (r) => !!(r.liveCues?.a?.liveSvg || r.draftSvgs?.a),
        'post-wipe live/draft accepted',
      )
      await wall.page.waitForFunction(
        () => document.querySelectorAll('.festival-letter img').length >= 1,
        null,
        { timeout: 20000 },
      )
      log('[ok] post-wipe paint syncs')

      await deskA.context.close()
      await deskB.context.close()
      await wall.context.close()
    }

    // --- 2. Clear while peer debouncing ---
    {
      const room = `adv-debounce-${stampId}`
      log(`\n[scenario] clear while peer debouncing (${room})`)
      const deskA = await openDesk(room, 'a')
      const deskB = await openDesk(room, 'b')

      await stamp(deskA.page, 1, 2)
      await stamp(deskA.page, 2, 2)
      await waitRoom(room, (r) => !!(r.liveCues?.a?.liveSvg || r.draftSvgs?.a), 'A live')

      // B stamps quickly then A clears before B's debounce settles
      await stamp(deskB.page, 1, 1)
      await stamp(deskB.page, 2, 1)
      await stamp(deskB.page, 3, 1)
      await clearSharedRoom(deskA.page)

      await waitRoom(
        room,
        (r) =>
          (r.contributions || []).length === 0 &&
          !Object.keys(r.draftSvgs || {}).length &&
          !(r.liveCues && Object.values(r.liveCues).some((c) => c?.liveSvg)),
        'empty after clear during B debounce',
        20000,
      )
      await sleep(1500)
      const mid = await (await fetch(`${worker}/rooms/${encodeURIComponent(room)}`)).json()
      assert.equal((mid.contributions || []).length, 0, 'still empty after debounce window')
      assert.ok(!Object.keys(mid.draftSvgs || {}).length, 'no draftSvgs after debounce')
      await deskB.page.waitForFunction(
        () => (JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.filled || []).length === 0,
        null,
        { timeout: 15000 },
      )
      log('[ok] clear during peer debounce holds')
      await deskA.context.close()
      await deskB.context.close()
    }

    // --- 4. Letter clear vs shared clear ---
    {
      const room = `adv-letter-${stampId}`
      log(`\n[scenario] letter clear vs shared clear (${room})`)
      const deskA = await openDesk(room, 'a')
      const deskB = await openDesk(room, 'b')
      const bPuts = []
      deskB.page.on('request', (req) => {
        if (req.method() === 'PUT' && req.url().includes('/rooms/')) bPuts.push(req.url())
      })

      await deskA.page.getByTestId('studio-glyph-a').click()
      await stamp(deskA.page, 1, 2)
      await stamp(deskA.page, 2, 2)
      await stamp(deskA.page, 3, 2)
      await deskA.page.waitForFunction(
        () => (JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active.filled || []).length >= 2,
        null,
        { timeout: 15000 },
      )

      await deskB.page.getByTestId('studio-glyph-b').click()
      await deskB.page.waitForFunction(
        () => JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))?.active?.char === 'b',
        null,
        { timeout: 10000 },
      )
      await stamp(deskB.page, 1, 1)
      await stamp(deskB.page, 2, 1)
      await stamp(deskB.page, 3, 1)
      await deskB.page.waitForFunction(
        () => {
          const s = JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))
          return (
            s?.active?.char === 'b' &&
            (s.active.filled || []).length >= 2 &&
            !!(s.liveSvg && s.liveSvg.length > 20)
          )
        },
        null,
        { timeout: 15000 },
      )
      const stationB = await deskB.page.evaluate(() =>
        new URLSearchParams(location.search).get('station'),
      )
      assert.equal(stationB, 'b', 'desk B URL station')
      await deskB.page.getByTestId('studio-options').click()
      const syncB = await deskB.page.getByTestId('live-sync-status').textContent()
      await deskB.page.getByLabel('Close options').click().catch(() => {})
      await deskB.page.locator('.studio-options').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
      log(`  …desk B sync="${syncB}" puts=${bPuts.length}`)
      await sleep(2000)
      try {
        await waitRoom(
          room,
          (r) => !!(r.liveCues?.a?.liveSvg && r.liveCues?.b?.liveSvg),
          'both live',
          30000,
        )
      } catch (err) {
        const snap = await deskB.page.evaluate(() => {
          const s = JSON.parse(localStorage.getItem('grid-workshop-festival-v1') || 'null')
          return {
            char: s?.active?.char,
            filled: s?.active?.filled?.length,
            live: s?.liveSvg?.length,
            station: localStorage.getItem('gridz-live-station'),
            joined: localStorage.getItem('gridz-live-joined'),
            room: localStorage.getItem('gridz-live-room'),
          }
        })
        throw new Error(`${err.message}; B local=${JSON.stringify(snap)}; B puts=${bPuts.length}`)
      }
      assert.equal(deskB.errors.length, 0, `desk B pageerrors: ${deskB.errors.join('; ')}`)

      await deskA.page.getByTestId('studio-clear').click()
      await waitRoom(
        room,
        (r) => !r.liveCues?.a && !!r.liveCues?.b?.liveSvg,
        'letter clear A only',
      )
      log('[ok] letter clear keeps B')

      await clearSharedRoom(deskA.page)
      await waitRoom(
        room,
        (r) =>
          !Object.keys(r.draftSvgs || {}).length &&
          !(r.liveCues && Object.values(r.liveCues).some((c) => c?.liveSvg)),
        'shared clear wipes both',
      )
      log('[ok] shared clear wipes both')
      await deskA.context.close()
      await deskB.context.close()
    }

    // --- 5. Same-station collision ---
    {
      const room = `adv-station-${stampId}`
      log(`\n[scenario] same-station collision (${room})`)
      const deskA = await openDesk(room, 'a', { letter: 'a' })
      const deskB = await openDesk(room, 'a', { letter: 'b' })

      await stamp(deskA.page, 1, 2)
      await stamp(deskA.page, 2, 2)
      await waitRoom(room, (r) => !!r.liveCues?.a?.liveSvg, 'first writer live')
      await stamp(deskB.page, 1, 1)
      await stamp(deskB.page, 2, 1)
      await waitRoom(
        room,
        (r) => !!r.liveCues?.a?.liveSvg && (r.liveCues.a.char === 'a' || r.liveCues.a.char === 'b'),
        'last-writer liveCues.a',
      )
      const snap = await waitRoom(room, (r) => !!r.liveCues?.a, 'cue present')
      assert.ok(snap.liveCues.a.liveSvg, 'liveCues.a has svg (last writer wins)')
      assert.equal(deskA.errors.length, 0, deskA.errors.join('\n'))
      assert.equal(deskB.errors.length, 0, deskB.errors.join('\n'))
      log('[ok] same-station last-writer-wins without crash')
      await deskA.context.close()
      await deskB.context.close()
    }

    // --- 6. Room switch dirty storage ---
    {
      const roomB = `roomB` // festival names — use unique via Worker isolation by also using UUID rooms?
      // Plan: publish in roomB, join empty boom. Use real festival room names with unique
      // prefix isn't possible for boom/roomB buttons — use synthetic rooms via URL for
      // paint, then for boom/roomB isolation we DELETE unique rooms above.
      // For dirty switch: open desk on room adv-room-b-sw, publish, then navigate/join
      // adv-boom-sw via URL (joinSession with custom room through history).
      // LiveSessionJoin only has boom/roomB buttons. joinSession accepts any room string
      // via live-session-join-btn after setting room in URL.
      const fromRoom = `adv-from-${stampId}`
      const toRoom = `adv-to-${stampId}`
      log(`\n[scenario] room switch dirty storage (${fromRoom} → ${toRoom})`)
      // Pre-clear destination
      await req('DELETE', `/rooms/${toRoom}`)

      const desk = await openDesk(fromRoom, 'a')
      await stamp(desk.page, 1, 2)
      await stamp(desk.page, 2, 2)
      await stamp(desk.page, 3, 2)
      await desk.page.getByTestId('studio-publish').click()
      const pub = await waitRoom(
        fromRoom,
        (r) => (r.contributions || []).length >= 1,
        'published in fromRoom',
      )
      const pubIds = (pub.contributions || []).map((c) => c.id)

      // Switch room via URL + rejoin (same localStorage)
      await desk.page.goto(
        `${siteBase}?view=studio&station=a&room=${encodeURIComponent(toRoom)}`,
      )
      await desk.page.getByTestId('studio-desk').waitFor({ timeout: 20000 })
      await desk.page.getByTestId('live-session-join-btn').click().catch(() => {})
      await sleep(2500)

      const dest = await (await fetch(`${worker}/rooms/${encodeURIComponent(toRoom)}`)).json()
      const leaked = (dest.contributions || []).filter((c) => pubIds.includes(c.id))
      assert.equal(
        leaked.length,
        0,
        `destination room must not inherit source contribution ids (leaked ${leaked.map((c) => c.id).join(',')})`,
      )
      log('[ok] room switch does not leak contributions')
      await desk.context.close()
    }

    // --- 7. Desk close / pagehide ---
    {
      const room = `adv-close-${stampId}`
      log(`\n[scenario] desk close keeps peer cue (${room})`)
      const deskA = await openDesk(room, 'a')
      const deskB = await openDesk(room, 'b')
      const wall = await openWall(room)

      await deskA.page.getByTestId('studio-glyph-a').click()
      await stamp(deskA.page, 1, 2)
      await stamp(deskA.page, 2, 2)
      await stamp(deskA.page, 3, 2)
      await deskB.page.getByTestId('studio-glyph-b').click()
      await stamp(deskB.page, 1, 1)
      await stamp(deskB.page, 2, 1)
      await stamp(deskB.page, 3, 1)
      await deskB.page.waitForFunction(
        () => {
          const s = JSON.parse(localStorage.getItem('grid-workshop-festival-v1'))
          return s?.active?.char === 'b' && (s.active.filled || []).length >= 2 && (s.liveSvg || '').length > 20
        },
        null,
        { timeout: 15000 },
      )
      await sleep(1500)
      await waitRoom(
        room,
        (r) => !!(r.liveCues?.a?.liveSvg && r.liveCues?.b?.liveSvg),
        'both cues before close',
        30000,
      )
      await wall.page.waitForFunction(
        () => document.querySelectorAll('.festival-live-pane').length >= 1,
        null,
        { timeout: 20000 },
      )

      await deskA.context.close()
      await sleep(1500)
      const afterClose = await waitRoom(
        room,
        (r) => !!r.liveCues?.b?.liveSvg,
        'B cue survives A close',
      )
      assert.ok(afterClose.liveCues.b.liveSvg, 'B live cue still present')
      await wall.page.waitForFunction(
        () => document.querySelectorAll('.festival-live-pane').length >= 1,
        null,
        { timeout: 15000 },
      )
      log('[ok] closing desk A leaves B visible on wall')
      await deskB.context.close()
      await wall.context.close()
    }

    log('\n[pass] Playwright adversarial scenarios')
  } finally {
    await browser.close()
  }
}

let viteChild = null
try {
  await layerUnit()
  await layerWorker()
  viteChild = await ensureSiteUp()
  await layerPlaywright()
  log('\n[pass] smoke-live-adversarial')
} catch (err) {
  console.error('\n[fail]', err.message || err)
  process.exitCode = 1
} finally {
  if (viteChild) {
    viteChild.kill('SIGTERM')
  }
}
