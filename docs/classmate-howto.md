# Classmate howto — grid workshop

Super short. Build a modular letter, fuse close shapes, download SVG.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:43127` (or the port Vite prints).

## Steps

1. **Start workshop** on the intro screen.
2. **Shape** — pick a brush; watch the **grid preview** while setting columns / rows / spacing.
3. **Paint** — tap or drag cells. Mix brushes anytime. The **letter strip** under Undo switches letters without losing work (dots mark painted ones). **Adjust** opens fill size, corners, Softness, guide size, and grid guide. Gear also has letter guide, construction grid (cap / x-height / baseline / descender), and corners. **Softness** fuses close shapes so they blob into each other (higher = farther reach; 0 = crisp). **Break join** splits a fuse. **Hide joins** clears the teal dots. On a computer the workshop uses the full window: bigger canvas, tools on the right.
4. **Export** — preview the current letter → **Download SVG**, or **Download all** for a ZIP of every painted letter plus a specimen sheet.

## Softness

Shapes keep their silhouette (a star stays a star). Close modules blob into each other with a concave neck; the slider sets how far “close” is. Softness 0 = crisp. Join dots stay hidden until Show joins or Break join.

## Don’t worry about

- Shape grid only.
- Invert preview is design-time only; SVG stays positive.
- No Export blend / blur brush.
- Production font path is SVG → Cloudflare → OTF.

## Handy

- **Erase** removes cells; **Stamp** paints; **Break join** splits a fuse. Undo covers all three.
- Keys on a computer: `R` rotate, `C` punch-out, `E` erase, `M` mirror, `G` guide, arrows nudge, `⌘/Ctrl+Z` undo.
- On a phone, **Adjust** opens sliders and the word tester; the gear has backup and the wall projection.
