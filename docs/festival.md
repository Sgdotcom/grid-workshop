# Beckmans festival workshop

Run one editor on the visitor computer. Open **Wall projection** from the toolbar in a second window on the same browser profile and move it to the projector. Use the projector as an extended display and click **Full screen**. Keep the exact same address (including host and port) in both windows.

## Views

| Role | URL |
| --- | --- |
| Studio desk (default) | `/` (also `/?view=studio`) |
| Studio desk for a fixed desk | `/?station=a` or `/?station=b` |
| Full workshop (Shape / Paint / Export) | `/?view=workshop` |
| Wall projection | `/?view=projection` (old `?view=wall` links open it too) |

**Studio desk** is a three-column layout: large Paint canvas · **tools rail** (drag the left edge to resize) · mini shared alphabet. Tools are grouped (Draw / Show / Mode / Look / Shape). Softness includes a **Melt on / No melt** toggle for the active brush. With live sync on, the first visit asks **Which desk is this?** (Desk A / Desk B) and remembers the answer; `?station=` overrides it. Facilitator gear: live room, desk switch, copy wall link, clear shared room, backup, restore, link to the full workshop.

**Wall projection** shows the alphabet, what Desk A and Desk B are drawing side by side, and the specimen phrase. Alphabet tiles show the published SVG if any, else the shared draft / live drawing.

## Live session (cross-machine)

When `VITE_LIVE_SESSION_URL` points at the Cloudflare Worker (`workers/live-session/`), both desks and the wall share one **room**:

- Open the site on each computer → **Join session** (same room name, default `boom`).
- No write token for the festival install — anyone in the room can sync.
- Wall page has the same room / Join control.
- Updates push over WebSocket (free Cloudflare Durable Object) so the wall tracks “drawing now” in near-realtime; a slow GET poll is only a fallback.
- Refresh reloads from the shared room.
- Both desks may open the same letter. There is no lock: the newest edit to a letter wins, and the other desk switches to it unless someone there is mid-stroke.
- **Clear shared room** asks for the facilitator password, then wipes the typeface, drafts and canvases on every desk and wall. The Worker saves a copy first; restore it from the full workshop under Options → **Previous sessions** (password again).

| Query | Meaning |
| --- | --- |
| `?room=boom` | Room id (default `boom`) |
| `?station=a` | Desk label (`a` or `b`); otherwise the desk asks on first visit |

Deploy Worker: see [`workers/live-session/README.md`](../workers/live-session/README.md). Set GitHub Pages build env `VITE_LIVE_SESSION_URL`, then redeploy Pages.

Both views also use **localStorage** as a cache / offline fallback. Same-browser two-window still works without the Worker.

The wall shows the Swedish alphabet, the current draft, and a specimen phrase. Blank letters stay visible. Grey specimen letters indicate characters that have not been contributed yet. Uppercase and lowercase have separate collections; the wall follows the active case.

Visitors choose a letter, draw, and press **Add to the typeface**. **Next visitor** selects an uncontributed letter where possible. Drawing over a letter edits a draft; previously published versions stay intact until a new version is submitted. Export offers previous contributions to build on. Every version is kept in the editable backup.

The browser saves drafts and submissions locally after changes, and (when live sync is enabled) debounced-pushes the active letter + contributions to the shared room. The toolbar / Facilitator Options report save and sync status. Download **Editable backup** regularly and at the end of the day. Backups include stamps, grid settings, join settings, versions, and the shape library. **Restore backup** validates the file and downloads the current session before replacement. Clearing browser data removes the local cache; the shared room still holds the last synced state until you **Clear shared room**. Keep one editor per desk; the wall is read-only.

Changing the grid applies to the open letter only: other drafts and published letters keep their own grid, and an empty letter starts with the grid the desk used last. Each glyph also retains its Softness and roundedness. Tracing the Arial letter is optional in Options. Guides and the OTF use the default guide scale of 100%; leave guide size at that value for consistent metrics across contributors.

**Download published typeface (SVG)** exports the latest submitted version of each character. **Download font (OTF)** exports an installable monospaced font named Beckmans Together. Only contributed characters and a space are included; kerning and variable-font axes are not generated. Install and proof the font in the applications that will be used at the event. Missing letters display the font's missing-glyph box.

**Review shape joins** opens a separate experimental comparison page. A is the production join, B is an outline weld, C is a fitted-circle metaball, D is a polynomial smooth-min distance-field blend, and E is expand/union/shrink (geometric closing). D and E use sampled contours at 0.65px spacing; E uses distance fields to approximate polygon offsets rather than a Clipper library. They preserve disconnected components and allow small holes to close naturally at higher Softness. The same Softness value is not an equal visual strength across algorithms. Calculation runs in a cancellable background worker; selection is disabled while previews update. Both diagonal directions, horizontal and vertical pairs, and clusters are shown. Preferences are saved separately from festival work and can be downloaded. Choosing an experiment does not change the workshop algorithm.

Before doors open, test the full alphabet on the actual projector, restart the browser to check recovery, restore a backup in a separate browser profile, export and install the font, and rehearse a visitor handover. This build has browser smoke tests in `scripts/smoke-festival.mjs`; set `CHROME_PATH` if Chrome is installed elsewhere.

On a phone or tablet the editor keeps the canvas on screen: **Adjust** opens the sliders, dot dilation and the word tester, and **Options** (gear) holds the projection link, **Editable backup** and **Restore backup**. The status line turns red if saving fails. Undo and redo include broken joins. **Next visitor** also resets rotation, punch-out, mirror and the active tool. If the saved session cannot be read after a restart, Options offers **Save the unreadable session and start fresh**; if the editor itself fails, a recovery screen offers the saved session as a download before reloading.

The OTF takes its baseline from fixed Arial metrics, not from the fonts installed on the exporting computer, and its outlines are unioned with standard glyph names. Previews stored for the wall are rounded to 0.01px to stay inside browser storage limits; downloaded SVGs keep full precision.
