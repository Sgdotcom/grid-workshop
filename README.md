# grid workshop

Phone-first **shape-grid** letter tool for the Beckmans festival workshop. Stamp modules on a grid, melt close shapes together with Softness, add each letter to a shared typeface, show it on a wall projection, and export SVG or an installable OTF.

## Run

```bash
npm install
npm run dev
```

Dev server: `http://127.0.0.1:43127`

Install layouts (same session, same browser profile): studio desk `/?view=studio`, cinematic wall `/?view=wall`. See [`docs/festival.md`](docs/festival.md).

**Claude Code / developer handover:** [`CLAUDE.md`](CLAUDE.md) · [`HANDOVER.md`](HANDOVER.md). Older handovers: [`docs/archive/handovers/`](docs/archive/handovers/).

## Flow

**Shape** → brush and grid · **Paint** → stamp, erase, Softness, break joins · **Export** → preview, SVG, ZIP of all letters, OTF.

- **Paint** keeps the canvas on screen at every size. On a phone the secondary controls (sliders, dot dilation, word tester) open under **Adjust** and scroll on their own; backup, restore and the projection link live in **Options** (gear).
- **Stamp / Erase / Break join** are the three tools. Dragging quickly still paints a continuous line.
- **Mirror** follows each shape's own symmetry (a triangle stays upright, an arc turns the corner).
- **Undo / redo** cover cells *and* broken joins.
- Work is saved in the browser after every change. Tool settings (brush, guides, word tester text) are saved separately and survive a reload.
- If rendering ever fails, a recovery screen offers the saved session as a download before reloading.

Festival operation is described in [`docs/festival.md`](docs/festival.md); a short visitor guide is in [`docs/classmate-howto.md`](docs/classmate-howto.md).

## Keyboard (Paint)

| Key | Action |
| --- | --- |
| `R` / `Shift+R` | Rotate brush 90° clockwise / counter-clockwise |
| `C` | Solid ink ↔ punch-out |
| `E` | Erase tool on/off · `B` back to Stamp |
| `M` | Mirror: off → left-right → top-bottom |
| `G` | Letter guide on/off |
| Arrows | Nudge the letter one cell |
| `⌘/Ctrl+Z`, `⇧⌘Z` / `Ctrl+Y` | Undo, redo |
| `Esc` | Close Options |

Shortcuts only act on the Paint screen and never capture browser combinations such as `⌘C` or `⌘R`.

## Checks

```bash
npm run build                 # tsc -b && vite build
npm run typecheck             # tsc -b only
npm run lint                  # oxlint

# Geometry regressions (Node only, no browser)
node scripts/smoke-weld-alignment.mjs
node scripts/smoke-arc-weld.mjs
node scripts/smoke-arc-flat.mjs
node scripts/smoke-shape-sizing.mjs
node scripts/smoke-cd-features.mjs
node scripts/smoke-hole-mode.mjs
node scripts/smoke-beginner-features.mjs

# Browser smokes (dev server running; set CHROME_PATH if Chrome is elsewhere)
npm run smoke:improvements    # layout, tools, mirroring, undo, exports, recovery
npm run smoke:install         # studio + wall routes
node scripts/smoke-festival.mjs
```

## Softness / welding (quick map)

| Concern | Where |
|--------|--------|
| Fuse engine | `src/lib/softness.ts` |
| Same-shape + mixed-pair methods, melt-off | `src/lib/shapeJoinRegistry.ts` |
| Arc ↔ flat | `src/lib/arcFlatBlend.ts` |
| Mixed-pair lab | `/docs/mixed-weld-preview.html` |
| Melt vs no-melt candidates | `/docs/no-weld-candidates.html` |

## Stack

Vite · React 19 · TypeScript · Tailwind 4 · polygon-clipping · opentype.js. No backend: sessions live in `localStorage`.

Archived experiments under `archive/` and `scratch/` are not imported by the app.
