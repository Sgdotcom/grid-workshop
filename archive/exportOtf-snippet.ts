/** Archived — not imported. Former exportOtf() body. See archive/README.md */
export async function exportOtf(payload: ExportPayload, filename = 'GridWorkshop-Glyph.otf') {
  if (!payload.filledRegions.length) {
    throw new Error('Nothing to export yet — draw a glyph before building an OTF.')
  }

  const opentype = await import('opentype.js')
  const { grid, library, filledRegions, glyphChar, cornerRadius = 0 } = payload
  const em = 1000
  const margin = 80
  const usable = em - margin * 2
  const { width: pw, height: ph } = canvasPixelSize(grid)
  const aspect = pw / ph
  const drawW = aspect >= 1 ? usable : usable * aspect
  const drawH = aspect >= 1 ? usable / aspect : usable
  const offsetX = (em - drawW) / 2
  const offsetY = (em - drawH) / 2
  const scale = drawW / pw
  const path = new opentype.Path()

  for (const fr of filledRegions) {
    const def = resolveShape(library, fr.shapeId)
    const { x, y } = cellOrigin(fr.col, fr.row, grid)
    const ox = x + (grid.cellSize - fr.size) / 2
    const oy = y + (grid.cellSize - fr.size) / 2
    const fx = offsetX + ox * scale
    const fy = offsetY + (ph - oy - fr.size) * scale
    appendShapeToFontPath(path, def, fx, fy, fr.size * scale, cornerRadius)
  }

  const notdef = new opentype.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: 500,
    path: new opentype.Path(),
  })
  const code = glyphChar.codePointAt(0) ?? 65
  const glyph = new opentype.Glyph({
    name: glyphChar === ' ' ? 'space' : `uni${code.toString(16).toUpperCase()}`,
    unicode: code,
    advanceWidth: em,
    path,
  })
  const font = new opentype.Font({
    familyName: 'GridWorkshop',
    styleName: 'Regular',
    unitsPerEm: em,
    ascender: 880,
    descender: -120,
    glyphs: [notdef, glyph],
  })
  downloadBlob(new Blob([font.toArrayBuffer()], { type: 'font/otf' }), filename)
}
