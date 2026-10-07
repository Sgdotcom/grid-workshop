# iOS implementation plan — grid workshop

Scannable plan for taking the web prototype toward a native iOS app.

## 1. How this becomes an iOS app

**Product loop (already decided)**  
Paint glyph → export **SVG** → **Cloudflare** converts to **OTF** → install/use in app. No local draft DB required for MVP.

**Suggested architecture**

| Layer | Role |
|--------|------|
| **SwiftUI shell** | Phone screens: Shape / Grid / Paint / Export, Options sheet, haptics, share |
| **Portable geometry core** | Grid math, region/segment hit-tests, path builders, SVG serializer (TS shared via wasm/package *or* Swift port of the same APIs) |
| **Web prototype** | UX + algorithm reference — not the production runtime |

Prefer extracting `gridGeometry`, region paths, vertical bars, circle guides, and SVG emit into a **shared core** with no React. Softness stays **path bridges** (already iOS-friendly), not SVG filters.

**MVP native slice**  
One construction mode (Vertical segments) + paint + letter guide + SVG upload to Cloudflare. Then Shape grid, then Circle construction.

## 2. Bottlenecks

**Technical**
- Hit-testing under dual grids + fragments (perf + correctness on device)
- Softness → clean closed paths suitable for server OTF (bridges are OK for preview; Cloudflare may need boolean union)
- Consistent glyph box / units / baseline for server metrics
- Touch paint vs scroll (need exclusive canvas gesture, already started on web)
- Shared core vs rewrite: TS→Swift port cost if wasm/shared package is deferred

**Product**
- Three construction modes raise learning cost — ship one default, progressive disclosure
- Shape builder + dual overlap are powerful but secondary for first-time success
- Multi-glyph “font session” needed before the OTF pipeline feels real

## 3. Workload (rough)

| Phase | Scope | Effort |
|--------|--------|--------|
| **A · MVP** | SwiftUI shell mirroring phone tabs; Vertical segments paint; letter guide; SVG export + Cloudflare stub | **M** (~2–4 person-weeks) |
| **B · Shape grid** | Module shapes, single lattice, fill size, path softness; reuse prototype geometry | **M** |
| **C · Dual + builder** | Per-layer shapes, shape builder params, fragment fill | **L** |
| **D · Circle construction** | Metrics + place/resize circles + cell fill | **M** |
| **E · Polish** | Multi-glyph set, share sheet, haptics, undo everywhere, OTF round-trip QA | **M–L** |

**Reuse from prototype:** screen IA, construction mode model, path/SVG builders, Options drawer contents, default Vertical segments onboarding.  
**Rebuild native:** rendering (Canvas/Metal/CoreGraphics), gestures, file/share, Cloudflare auth/upload.

---

## 4. More features that fit

Stay inside modular/geometric glyph building + iOS + SVG→Cloudflare→OTF.

### Must-have later
1. **Multi-glyph session** — build A–Z / a set, batch SVG → one OTF  
2. **Undo/redo everywhere** — all construction modes (not only Shape grid)  
3. **Server OTF round-trip** — upload SVG, show installable font preview in-app  
4. **Snap + metric lock** — snap circles/fills to grid & x-height/baseline (Circle construction)

### Nice
5. **Inspiration presets** — load Ben / circle-grid / vertical alphabet starters  
6. **Stroke weight** — global bar/module weight without leaving the mode  
7. **Share sheet** — SVG (and later OTF) via iOS share  
8. **Haptics** — light tick on stamp/toggle for barcode feel  

### Maybe later
9. **Boolean combine** — union/subtract for Shape grid fragments before export  
10. **Variable softness as export option** — bake bridges vs crisp for Cloudflare  
11. **Per-glyph metrics override** — advance width / side bearings for the server font  

*Drop / avoid:* full vector Bezier editor, photo tracing, social feed, cloud draft sync as a priority — they fight the modular construction focus.
