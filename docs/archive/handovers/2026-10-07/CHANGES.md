# Changes — app pass, 6 October 2026

Scope: the application around the weld engine — layout, tools, state, exports, robustness, speed. **Weld geometry is unchanged**; see "Left alone on purpose".

## Fixed

- **Phone layout.** At 390×844 the paint canvas had zero height: the toolbars, word tester and tool panel consumed the whole column. The canvas now always keeps the screen (355 px tall at 390×844, 208 px at 375×667). Status and notice are one line, the contribute bar is one row, the tool panel is capped at 46 % and scrolls, and dot dilation, sliders and the word tester sit under **Adjust**. Backup, restore, projection and join-lab links are in **Options** on small screens.
- **Mirror mode rotated most shapes wrongly.** Only arc and wedge were correct. An upright triangle mirrored to a sideways one, a horizontal bar to a vertical one, and notch, chevron, pentagon and star were also off. Mirroring now derives the rotation from each shape's symmetry (`mirroredRotation` in `src/lib/skeletons.ts`).
- **Undo ignored joins.** Breaking, restoring and resetting joins, and Clear, are now undoable; history holds cells and joins together.
- **Shortcuts fired at the wrong time.** `⌘/Ctrl+C` toggled punch-out, `⌘R` rotated the brush before reloading, and arrow keys nudged the letter from the Shape and Export screens. Shortcuts are now limited to Paint and ignore modifier combinations.
- **Word tester.** Every letter was drawn with the *active* letter's Softness, corners, joins and grid; saved letters now use their own. Clicking a digit or punctuation mark in the tester made it the active "letter", which produced a session that failed validation on the next load; non-alphabet characters are now ignored.
- **Reload on a fine grid** restored the grid but reset the brush to 42 px and the detail slider to 1×. Both now follow the restored grid.
- **Visited-but-empty letters** were stored as drafts and came back after a reload marked as painted. Only letters with cells are stored.
- **Hole mode** changes alone did not trigger a save.
- **ZIP export** wrote `å/ä/ö` file names without the UTF-8 flag (garbled on extraction). Entries now carry the flag and a real timestamp.
- **Touch:** after erasing a cell by tap, the hover preview stayed on it and looked like a faint leftover stamp. A second finger or a right-click no longer starts a stroke.
- **Downloads** click a link that is attached to the document and revoke the object URL later, the safer pattern across browsers (only Chromium was tested).
- **Join lab** text said "14 shapes"; it is now computed (17).

## Added

- **Erase tool** (`E`), next to Stamp and Break join. Removes ink and punch-outs in a cell; Clear has its own icon.
- **Continuous strokes.** A fast drag interpolates between pointer samples, so no cells are skipped.
- **Starter blueprints and sibling hints for å, ä, ö, Å, Ä, Ö.**
- **Saved tool settings** (`grid-workshop-ui-v1`): brush, size, rotation, guides, invert preview, word tester text and state. Kept apart from the festival session, so restoring a backup never changes them.
- **Next visitor** resets rotation, punch-out, mirror, the active tool and join dots.
- **Recovery.** An error boundary shows a recovery screen with a backup download instead of a blank page. A fuse or punch-out failure on the canvas, in the word tester or in an export falls back to crisp stamps. If the stored session is unreadable, Options offers "Save the unreadable session and start fresh".
- **Save state** is marked with a dot and turns red when saving fails.
- **Wall projection** also refreshes on focus, visibility change and a 4 s poll, shows the letter count from the alphabet, and no longer throws when fullscreen is refused.
- **Tablets** (600–1023 px) get a centred, wider, full-height column; a phone in landscape shows a rotate hint on Paint.
- Larger, grid-scaled join dots with a finger-sized hit area; `Esc` closes Options; visible keyboard focus; reduced-motion support; mobile web-app meta tags.
- `npm run typecheck`, `npm run smoke:improvements` (`scripts/smoke-improvements.mjs`), and shape-aware mirror assertions in `scripts/smoke-beginner-features.mjs`.

## Faster

- **One fuse per change instead of up to three.** The canvas, the autosave preview and the word tester each recomputed the same Softness fuse after every stroke. `softnessFinishPolygons` now memoises its result (32 entries) keyed by everything that affects it: stamp geometry, Softness, broken joins, hole mode, engine mode and join preferences.
- Softness and corner sliders drive the fuse through deferred values, so the thumb stays responsive; the word tester follows the canvas a beat behind.
- Sliders no longer fire each change twice; brush icons and word-tester glyphs are memoised.
- Previews stored for the wall and in backups are rounded to 0.01 px: 32 KB → 16 KB per letter on average in a 20-glyph sample, so roughly twice as many contributions fit in the browser's storage quota. Downloads keep full precision.

## Font export

- Outlines are built from the unioned polygons: no overlapping contours, outer contours counter-clockwise and counters clockwise (the PostScript convention). The previous output was consistently wound, so it filled correctly, but its contours overlapped and ran clockwise.
- The baseline comes from fixed Arial metrics instead of measuring text in a canvas, so the font is identical on every machine (ascender 748, descender −253 on the default grid; by calculation the same values the canvas measurement gives when Arial is installed).
- Standard glyph names (`a`, `aring`, `adieresis`, `odieresis`, …), glyphs sorted by code point, style name `Regular`.

## Left alone on purpose

- **Weld and melt geometry.** `HANDOVER.md` requires new join treatments to be previewed and approved first. Cross/X/chevron joins, stars, notches, ring protection in Fill Gaps and the other pending items there are untouched.
- The visual identity (Arial, black, white, link blue).
- Dependencies and `package-lock.json`.

## How this was verified

- `tsc -b` passes.
- 912 exported glyphs (19 shapes × 6 layouts × 3 Softness values × 2 hole modes, plus punch-out and rotated variants) are **byte-identical** to the previous source.
- The handover's geometry scripts pass: weld alignment (128 cases), arc weld (21 approved frames, 288 cases), arc/flat (32), shape sizing (228), CD features, hole mode, cross/X/chevron, beginner features.
- `scripts/smoke-improvements.mjs` passes 27/27 in headless Chromium at 390×844, 375×667 and 1440×900.
- `scripts/smoke-festival.mjs` passes every assertion up to its mobile screenshot, which times out in the test sandbox on the original build as well.

## Not verified here

The sandbox had no network and only macOS binaries in `node_modules`, so **`vite build`, `npm run lint` (oxlint) and the Vite dev server were not run**. Browser tests ran against an esbuild bundle with Tailwind compiled through its JS API. Run `npm run build` and `npm run lint` once locally. Nothing was tested on a real phone, in Safari or in Firefox.

## Open questions

- **Blueprint metrics vs. the guide.** Starter blueprints put the baseline on row 7 and cap height on row 1; the Arial guide (and therefore the OTF) puts the baseline at the bottom of row 6. Letters started from a blueprint sit about one row below traced letters in the exported font. Either the blueprints or the font baseline should move; that is a design decision.
- The range sliders keep the native 16 px thumb, which is small for fingers.
