import type { FilledRegion, GridConfig, ShapeDef } from '@/lib/types'
import { regionKey } from '@/lib/types'

export interface SiblingGroup {
  name: string
  tip: string
  siblings: string[]
}

/**
 * Typographic sibling groups: letters that share the same DNA.
 * Beginners learn how consistency works across an alphabet by reusing curves and stems.
 */
export const LETTER_SIBLINGS: Record<string, SiblingGroup> = {
  // Lowercase Arch Group
  n: { name: 'Arch Group', siblings: ['m', 'h', 'u', 'r'], tip: 'The arch of "n" is the benchmark for all lowercase shoulders.' },
  m: { name: 'Arch Group', siblings: ['n', 'h', 'u', 'r'], tip: 'Double arch. Keep each span slightly narrower than "n" to prevent bulkiness.' },
  h: { name: 'Arch Group', siblings: ['n', 'm', 'u', 'b'], tip: 'Ascender stem + the arch of "n".' },
  u: { name: 'Arch Group', siblings: ['n', 'm', 'h', 'a'], tip: 'Inverted "n". The bottom curve should match the arch curve of "n".' },
  r: { name: 'Arch Group', siblings: ['n', 'm', 'h'], tip: 'Stem + truncated arch shoulder.' },

  // Lowercase Bowl Group
  b: { name: 'Bowl Group', siblings: ['d', 'p', 'q'], tip: 'Tall ascender stem on left + round bowl on right.' },
  d: { name: 'Bowl Group', siblings: ['b', 'p', 'q'], tip: 'Round bowl on left + tall ascender stem on right.' },
  p: { name: 'Bowl Group', siblings: ['b', 'd', 'q'], tip: 'Deep descender stem on left + round bowl on right.' },
  q: { name: 'Bowl Group', siblings: ['p', 'd', 'b'], tip: 'Round bowl on left + deep descender stem on right.' },

  // Lowercase Round Group
  o: { name: 'Round Group', siblings: ['c', 'e', 's'], tip: 'Continuous oval. Determines the curve curvature and inner counter for all rounded letters.' },
  c: { name: 'Round Group', siblings: ['o', 'e', 's'], tip: 'Round curve of "o" with an open aperture on the right.' },
  e: { name: 'Round Group', siblings: ['o', 'c'], tip: 'Curve of "c" with a horizontal crossbar at mid x-height.' },
  s: { name: 'Sinuous Group', siblings: ['o', 'c', 'e'], tip: 'Double spine curve. Upper bowl is slightly smaller than lower bowl for optical stability.' },

  // Lowercase Vertical & Stems
  l: { name: 'Vertical Stem', siblings: ['i', 't', 'j'], tip: 'Clean ascender stem. The baseline thickness benchmark.' },
  i: { name: 'Vertical Stem', siblings: ['l', 'j', 't'], tip: 'Short x-height stem + dot (tittle) aligned to cap/ascender height.' },
  j: { name: 'Vertical Stem', siblings: ['i', 'l'], tip: 'Descender stem + dot + leftward terminal hook.' },
  t: { name: 'Crossbar Group', siblings: ['l', 'f', 'i'], tip: 'Ascender stem + crossbar aligned to x-height.' },
  f: { name: 'Crossbar Group', siblings: ['t', 'r'], tip: 'Tall ascender stem with rightward hook + crossbar at x-height.' },

  // Lowercase Diagonals
  v: { name: 'Diagonal Group', siblings: ['w', 'x', 'y', 'k'], tip: 'Two diagonal stems meeting at a central point on the baseline.' },
  w: { name: 'Diagonal Group', siblings: ['v', 'x', 'y'], tip: 'Double "v". Usually slightly narrower than two full "v"s combined.' },
  x: { name: 'Diagonal Group', siblings: ['v', 'w', 'y', 'k'], tip: 'Intersecting diagonals crossing slightly above vertical center.' },
  y: { name: 'Diagonal Group', siblings: ['v', 'u', 'j'], tip: 'Diagonal "v" apex continuing into a descending tail.' },
  k: { name: 'Branching Group', siblings: ['x', 'v'], tip: 'Ascender stem + two diagonal branching legs meeting at mid-height.' },
  z: { name: 'Z-Group', siblings: ['x', 's'], tip: 'Top horizontal bar, diagonal stroke, bottom horizontal foot.' },
  a: { name: 'Arch & Bowl', siblings: ['o', 'u', 'd'], tip: 'Round bowl + right vertical stem.' },
  g: { name: 'Descender Group', siblings: ['q', 'y', 'j'], tip: 'Top bowl at x-height + descending loop or ear below baseline.' },

  // Uppercase Vertical & Crossbar
  H: { name: 'Cap Stems', siblings: ['I', 'E', 'F', 'T', 'L'], tip: 'Two vertical stems + horizontal crossbar. Benchmark for capital width and weight.' },
  I: { name: 'Cap Stems', siblings: ['H', 'T', 'L', 'E'], tip: 'Single vertical stem. The base unit of stroke width.' },
  E: { name: 'Cap Horizontal', siblings: ['F', 'L', 'H'], tip: 'Stem + 3 arms. Middle arm is slightly shorter and slightly above center.' },
  F: { name: 'Cap Horizontal', siblings: ['E', 'T', 'H'], tip: '"E" without the bottom foot arm.' },
  L: { name: 'Cap Horizontal', siblings: ['E', 'H', 'I'], tip: 'Vertical stem + horizontal foot along baseline.' },
  T: { name: 'Cap Horizontal', siblings: ['H', 'I', 'E'], tip: 'Wide top horizontal bar + centered vertical stem.' },

  // Uppercase Round
  O: { name: 'Cap Round', siblings: ['C', 'G', 'Q', 'D'], tip: 'Full cap-height oval. Benchmark for all uppercase curves.' },
  C: { name: 'Cap Round', siblings: ['O', 'G', 'Q'], tip: 'Curve of "O" with right aperture.' },
  G: { name: 'Cap Round', siblings: ['C', 'O', 'Q'], tip: 'Curve of "C" with inward horizontal spur or crossbar at mid-height.' },
  Q: { name: 'Cap Round', siblings: ['O', 'G'], tip: 'Oval of "O" with diagonal or descending tail.' },
  D: { name: 'Cap Round & Stem', siblings: ['O', 'B', 'P', 'R'], tip: 'Left vertical stem + single full-height right curved bowl.' },

  // Uppercase Double-Bowl & Diagonal
  B: { name: 'Cap Double Bowl', siblings: ['P', 'R', 'D'], tip: 'Stem + 2 bowls. Top bowl is slightly smaller than bottom bowl.' },
  P: { name: 'Cap Bowl', siblings: ['B', 'R', 'D'], tip: 'Stem + top bowl. Benchmark for uppercase bowl proportion.' },
  R: { name: 'Cap Bowl & Leg', siblings: ['P', 'B', 'K'], tip: '"P" + diagonal leg extending down to the baseline.' },
  A: { name: 'Cap Apex', siblings: ['V', 'W', 'M', 'H'], tip: 'Apex peak at cap-height, two diagonal legs, crossbar matching "H".' },
  V: { name: 'Cap Apex', siblings: ['A', 'W', 'M', 'Y'], tip: 'Inverted "A" apex meeting at bottom center of baseline.' },
  W: { name: 'Cap Diagonals', siblings: ['V', 'M', 'A'], tip: 'Double "V".' },
  M: { name: 'Cap Diagonals', siblings: ['W', 'N', 'V', 'H'], tip: 'Two vertical or diagonal outer stems + central apex vertex.' },
  N: { name: 'Cap Diagonals', siblings: ['M', 'H', 'I'], tip: 'Two vertical stems connected by a single top-left to bottom-right diagonal.' },
  K: { name: 'Cap Branching', siblings: ['R', 'X', 'Y'], tip: 'Vertical stem + two diagonal branches.' },
  S: { name: 'Cap Sinuous', siblings: ['C', 'O'], tip: 'Continuous spine curve. Balance top and bottom counters.' },
  X: { name: 'Cap Diagonals', siblings: ['K', 'Y', 'Z'], tip: 'Two crossing diagonal strokes.' },
  Y: { name: 'Cap Diagonals', siblings: ['V', 'T', 'X'], tip: 'Upper "V" diagonals meeting central descending vertical stem.' },
  Z: { name: 'Cap Horizontal', siblings: ['X', 'E'], tip: 'Top horizontal, diagonal stroke, bottom horizontal.' },
  // Swedish letters — build them on top of their base letter.
  å: { name: 'Ring Above', siblings: ['a', 'ä', 'o'], tip: 'Draw "a" first, borrow it, then add a small ring above x-height.' },
  ä: { name: 'Two Dots', siblings: ['a', 'å', 'ö'], tip: 'The "a" with two dots. Keep the dots the same weight as the stem.' },
  ö: { name: 'Two Dots', siblings: ['o', 'ä', 'å'], tip: 'The "o" with two dots. Match the dots of "ä".' },
  Å: { name: 'Cap Ring Above', siblings: ['A', 'Ä', 'O'], tip: 'Lower the apex of "A" one step to make room for the ring.' },
  Ä: { name: 'Cap Two Dots', siblings: ['A', 'Å', 'Ö'], tip: 'A slightly shorter "A" with two dots above cap height.' },
  Ö: { name: 'Cap Two Dots', siblings: ['O', 'Ä', 'Å'], tip: 'A slightly shorter "O" with two dots above cap height.' },
}

export function getLetterSiblings(char: string): SiblingGroup {
  return LETTER_SIBLINGS[char] || {
    name: 'Standard Alphabet',
    tip: 'Align strokes to the baseline and cap or x-height guides.',
    siblings: [],
  }
}

/**
 * Modular starter blueprints designed for a 7×9 grid.
 * (col: 0..6, row: 0..8)
 * - Row 1 = Cap Height
 * - Row 3 = X-Height
 * - Row 7 = Baseline
 * - Row 8 = Descender
 */
export const STARTER_BLUEPRINTS: Record<string, Array<[number, number]>> = {
  // Uppercase
  A: [[3, 1], [2, 2], [4, 2], [2, 3], [4, 3], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [1, 5], [5, 5], [1, 6], [5, 6], [1, 7], [5, 7]],
  B: [[1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [5, 2], [1, 3], [5, 3], [1, 4], [2, 4], [3, 4], [4, 4], [1, 5], [5, 5], [1, 6], [5, 6], [1, 7], [2, 7], [3, 7], [4, 7]],
  C: [[2, 1], [3, 1], [4, 1], [5, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [2, 7], [3, 7], [4, 7], [5, 7]],
  D: [[1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [5, 2], [1, 3], [5, 3], [1, 4], [5, 4], [1, 5], [5, 5], [1, 6], [5, 6], [1, 7], [2, 7], [3, 7], [4, 7]],
  E: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [1, 2], [1, 3], [1, 4], [2, 4], [3, 4], [4, 4], [1, 5], [1, 6], [1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  F: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [1, 2], [1, 3], [1, 4], [2, 4], [3, 4], [4, 4], [1, 5], [1, 6], [1, 7]],
  G: [[2, 1], [3, 1], [4, 1], [5, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [5, 5], [5, 6], [3, 5], [4, 5], [2, 7], [3, 7], [4, 7], [5, 7]],
  H: [[1, 1], [5, 1], [1, 2], [5, 2], [1, 3], [5, 3], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [1, 5], [5, 5], [1, 6], [5, 6], [1, 7], [5, 7]],
  I: [[2, 1], [3, 1], [4, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [2, 7], [3, 7], [4, 7]],
  J: [[4, 1], [5, 1], [4, 2], [4, 3], [4, 4], [4, 5], [1, 6], [4, 6], [2, 7], [3, 7]],
  K: [[1, 1], [5, 1], [1, 2], [4, 2], [1, 3], [3, 3], [1, 4], [2, 4], [3, 4], [1, 5], [4, 5], [1, 6], [5, 6], [1, 7], [5, 7]],
  L: [[1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  M: [[1, 1], [5, 1], [1, 2], [2, 2], [4, 2], [5, 2], [1, 3], [3, 3], [5, 3], [1, 4], [5, 4], [1, 5], [5, 5], [1, 6], [5, 6], [1, 7], [5, 7]],
  N: [[1, 1], [5, 1], [1, 2], [2, 2], [5, 2], [1, 3], [3, 3], [5, 3], [1, 4], [4, 4], [5, 4], [1, 5], [5, 5], [1, 6], [5, 6], [1, 7], [5, 7]],
  O: [[2, 1], [3, 1], [4, 1], [1, 2], [5, 2], [1, 3], [5, 3], [1, 4], [5, 4], [1, 5], [5, 5], [1, 6], [5, 6], [2, 7], [3, 7], [4, 7]],
  P: [[1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [5, 2], [1, 3], [5, 3], [1, 4], [2, 4], [3, 4], [4, 4], [1, 5], [1, 6], [1, 7]],
  Q: [[2, 1], [3, 1], [4, 1], [1, 2], [5, 2], [1, 3], [5, 3], [1, 4], [5, 4], [1, 5], [5, 5], [1, 6], [4, 6], [5, 6], [2, 7], [3, 7], [5, 7], [5, 8]],
  R: [[1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [5, 2], [1, 3], [5, 3], [1, 4], [2, 4], [3, 4], [4, 4], [1, 5], [4, 5], [1, 6], [5, 6], [1, 7], [5, 7]],
  S: [[2, 1], [3, 1], [4, 1], [5, 1], [1, 2], [1, 3], [2, 4], [3, 4], [4, 4], [5, 5], [5, 6], [1, 7], [2, 7], [3, 7], [4, 7]],
  T: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [3, 7]],
  U: [[1, 1], [5, 1], [1, 2], [5, 2], [1, 3], [5, 3], [1, 4], [5, 4], [1, 5], [5, 5], [1, 6], [5, 6], [2, 7], [3, 7], [4, 7]],
  V: [[1, 1], [5, 1], [1, 2], [5, 2], [1, 3], [5, 3], [2, 4], [4, 4], [2, 5], [4, 5], [2, 6], [4, 6], [3, 7]],
  W: [[1, 1], [5, 1], [1, 2], [5, 2], [1, 3], [5, 3], [1, 4], [3, 4], [5, 4], [1, 5], [3, 5], [5, 5], [2, 6], [4, 6], [2, 7], [4, 7]],
  X: [[1, 1], [5, 1], [1, 2], [5, 2], [2, 3], [4, 3], [3, 4], [2, 5], [4, 5], [1, 6], [5, 6], [1, 7], [5, 7]],
  Y: [[1, 1], [5, 1], [1, 2], [5, 2], [2, 3], [4, 3], [3, 4], [3, 5], [3, 6], [3, 7]],
  Z: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [5, 2], [4, 3], [3, 4], [2, 5], [1, 6], [1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],

  // Lowercase
  a: [[2, 3], [3, 3], [4, 3], [5, 3], [5, 4], [2, 5], [3, 5], [4, 5], [5, 5], [1, 6], [5, 6], [2, 7], [3, 7], [4, 7], [5, 7]],
  b: [[1, 1], [1, 2], [1, 3], [2, 3], [3, 3], [4, 3], [1, 4], [5, 4], [1, 5], [5, 5], [1, 6], [5, 6], [1, 7], [2, 7], [3, 7], [4, 7]],
  c: [[2, 3], [3, 3], [4, 3], [5, 3], [1, 4], [1, 5], [1, 6], [2, 7], [3, 7], [4, 7], [5, 7]],
  d: [[5, 1], [5, 2], [2, 3], [3, 3], [4, 3], [5, 3], [1, 4], [5, 4], [1, 5], [5, 5], [1, 6], [5, 6], [2, 7], [3, 7], [4, 7], [5, 7]],
  e: [[2, 3], [3, 3], [4, 3], [1, 4], [5, 4], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [1, 6], [2, 7], [3, 7], [4, 7], [5, 7]],
  f: [[3, 1], [4, 1], [2, 2], [2, 3], [1, 3], [3, 3], [2, 4], [2, 5], [2, 6], [2, 7]],
  g: [[2, 3], [3, 3], [4, 3], [1, 4], [5, 4], [1, 5], [5, 5], [2, 6], [3, 6], [4, 6], [5, 6], [5, 7], [2, 8], [3, 8], [4, 8]],
  h: [[1, 1], [1, 2], [1, 3], [2, 3], [3, 3], [4, 3], [1, 4], [5, 4], [1, 5], [5, 5], [1, 6], [5, 6], [1, 7], [5, 7]],
  i: [[3, 1], [3, 3], [3, 4], [3, 5], [3, 6], [3, 7]],
  j: [[4, 1], [4, 3], [4, 4], [4, 5], [4, 6], [4, 7], [1, 8], [2, 8], [3, 8]],
  k: [[1, 1], [1, 2], [1, 3], [4, 3], [1, 4], [3, 4], [1, 5], [2, 5], [1, 6], [3, 6], [1, 7], [4, 7]],
  l: [[3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [3, 7], [4, 7]],
  m: [[1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [1, 4], [3, 4], [5, 4], [1, 5], [3, 5], [5, 5], [1, 6], [3, 6], [5, 6], [1, 7], [3, 7], [5, 7]],
  n: [[1, 3], [2, 3], [3, 3], [4, 3], [1, 4], [5, 4], [1, 5], [5, 5], [1, 6], [5, 6], [1, 7], [5, 7]],
  o: [[2, 3], [3, 3], [4, 3], [1, 4], [5, 4], [1, 5], [5, 5], [1, 6], [5, 6], [2, 7], [3, 7], [4, 7]],
  p: [[1, 3], [2, 3], [3, 3], [4, 3], [1, 4], [5, 4], [1, 5], [5, 5], [1, 6], [5, 6], [1, 7], [2, 7], [3, 7], [4, 7], [1, 8]],
  q: [[2, 3], [3, 3], [4, 3], [5, 3], [1, 4], [5, 4], [1, 5], [5, 5], [1, 6], [5, 6], [2, 7], [3, 7], [4, 7], [5, 7], [5, 8]],
  r: [[2, 3], [3, 3], [4, 3], [5, 3], [2, 4], [2, 5], [2, 6], [2, 7]],
  s: [[2, 3], [3, 3], [4, 3], [5, 3], [1, 4], [2, 5], [3, 5], [4, 5], [5, 6], [1, 7], [2, 7], [3, 7], [4, 7]],
  t: [[2, 1], [2, 2], [1, 3], [2, 3], [3, 3], [4, 3], [2, 4], [2, 5], [2, 6], [3, 7], [4, 7]],
  u: [[1, 3], [5, 3], [1, 4], [5, 4], [1, 5], [5, 5], [1, 6], [5, 6], [2, 7], [3, 7], [4, 7], [5, 7]],
  v: [[1, 3], [5, 3], [1, 4], [5, 4], [2, 5], [4, 5], [2, 6], [4, 6], [3, 7]],
  w: [[1, 3], [5, 3], [1, 4], [5, 4], [1, 5], [3, 5], [5, 5], [2, 6], [4, 6], [2, 7], [4, 7]],
  x: [[1, 3], [5, 3], [2, 4], [4, 4], [3, 5], [2, 6], [4, 6], [1, 7], [5, 7]],
  y: [[1, 3], [5, 3], [1, 4], [5, 4], [2, 5], [4, 5], [3, 6], [2, 7], [1, 8]],
  z: [[1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [4, 4], [3, 5], [2, 6], [1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  // Swedish letters. Row 0 is the space above cap height, so capitals are one row shorter.
  Å: [[3, 0], [3, 2], [2, 3], [4, 3], [1, 4], [5, 4], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [1, 6], [5, 6], [1, 7], [5, 7]],
  Ä: [[2, 0], [4, 0], [3, 2], [2, 3], [4, 3], [1, 4], [5, 4], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [1, 6], [5, 6], [1, 7], [5, 7]],
  Ö: [[2, 0], [4, 0], [2, 2], [3, 2], [4, 2], [1, 3], [5, 3], [1, 4], [5, 4], [1, 5], [5, 5], [1, 6], [5, 6], [2, 7], [3, 7], [4, 7]],
  å: [[3, 1], [2, 3], [3, 3], [4, 3], [5, 3], [5, 4], [2, 5], [3, 5], [4, 5], [5, 5], [1, 6], [5, 6], [2, 7], [3, 7], [4, 7], [5, 7]],
  ä: [[2, 1], [4, 1], [2, 3], [3, 3], [4, 3], [5, 3], [5, 4], [2, 5], [3, 5], [4, 5], [5, 5], [1, 6], [5, 6], [2, 7], [3, 7], [4, 7], [5, 7]],
  ö: [[2, 1], [4, 1], [2, 3], [3, 3], [4, 3], [1, 4], [5, 4], [1, 5], [5, 5], [1, 6], [5, 6], [2, 7], [3, 7], [4, 7]],
}

// Original 5×7 modular drawings, positioned on the same cap/baseline guides.
const EXTRA_STARTERS: Record<string, string[]> = {
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00001','01110'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  '?': ['01110','10001','00001','00010','00100','00000','00100'],
  '.': ['00000','00000','00000','00000','00000','00000','00100'],
  ',': ['00000','00000','00000','00000','00000','00100','01000'],
  ':': ['00000','00000','00100','00000','00000','00100','00000'],
  ';': ['00000','00000','00100','00000','00000','00100','01000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '_': ['00000','00000','00000','00000','00000','00000','11111'],
  '+': ['00000','00100','00100','11111','00100','00100','00000'],
  '=': ['00000','00000','11111','00000','11111','00000','00000'],
  '/': ['00001','00001','00010','00100','01000','10000','10000'],
  '\\': ['10000','10000','01000','00100','00010','00001','00001'],
  '(': ['00010','00100','01000','01000','01000','00100','00010'],
  ')': ['01000','00100','00010','00010','00010','00100','01000'],
  '[': ['01110','01000','01000','01000','01000','01000','01110'],
  ']': ['01110','00010','00010','00010','00010','00010','01110'],
  '{': ['00010','00100','00100','01000','00100','00100','00010'],
  '}': ['01000','00100','00100','00010','00100','00100','01000'],
  '<': ['00000','00010','00100','01000','00100','00010','00000'],
  '>': ['00000','01000','00100','00010','00100','01000','00000'],
  '^': ['00100','01010','10001','00000','00000','00000','00000'],
  '~': ['00000','00000','01001','10110','00000','00000','00000'],
  '|': ['00100','00100','00100','00100','00100','00100','00100'],
  "'": ['00100','00100','00000','00000','00000','00000','00000'],
  '"': ['01010','01010','00000','00000','00000','00000','00000'],
  '`': ['01000','00100','00000','00000','00000','00000','00000'],
  '*': ['00000','10101','01110','11111','01110','10101','00000'],
  '#': ['01010','01010','11111','01010','11111','01010','01010'],
  '$': ['00100','01111','10100','01110','00101','11110','00100'],
  '%': ['11001','11010','00010','00100','01000','01011','10011'],
  '&': ['01100','10010','10100','01000','10101','10010','01101'],
  '@': ['01110','10001','10111','10101','10111','10000','01110'],
}
for (const [char, rows] of Object.entries(EXTRA_STARTERS)) {
  STARTER_BLUEPRINTS[char] = rows.flatMap((line, row) => [...line].flatMap((cell, col): Array<[number, number]> => cell === '1' ? [[col + 1, row + 1]] : []))
}

// Independently authored compact drawings keep counters and punctuation readable at 3×5.
const COMPACT_STARTERS: Record<string, string[]> = {
  A:['010','101','111','101','101'], B:['110','101','110','101','110'],
  C:['011','100','100','100','011'], D:['110','101','101','101','110'],
  E:['111','100','110','100','111'], F:['111','100','110','100','100'],
  G:['011','100','101','101','011'], H:['101','101','111','101','101'],
  I:['111','010','010','010','111'], J:['001','001','001','101','010'],
  K:['101','101','110','101','101'], L:['100','100','100','100','111'],
  M:['101','111','111','101','101'], N:['101','111','111','111','101'],
  O:['010','101','101','101','010'], P:['110','101','110','100','100'],
  Q:['010','101','101','011','001'], R:['110','101','110','101','101'],
  S:['011','100','010','001','110'], T:['111','010','010','010','010'],
  U:['101','101','101','101','111'], V:['101','101','101','101','010'],
  W:['101','101','111','111','101'], X:['101','101','010','101','101'],
  Y:['101','101','010','010','010'], Z:['111','001','010','100','111'],
  '0':['111','101','101','101','111'], '1':['010','110','010','010','111'],
  '2':['110','001','010','100','111'], '3':['110','001','010','001','110'],
  '4':['101','101','111','001','001'], '5':['111','100','110','001','110'],
  '6':['011','100','111','101','111'], '7':['111','001','010','010','010'],
  '8':['111','101','111','101','111'], '9':['111','101','111','001','110'],
  a:['000','010','101','101','011'], b:['100','100','110','101','110'],
  c:['000','000','011','100','011'], d:['001','001','011','101','011'],
  e:['000','010','101','110','011'], f:['011','010','111','010','010'],
  g:['000','011','101','011','110'], h:['100','100','110','101','101'],
  i:['010','000','010','010','010'], j:['001','000','001','001','110'],
  k:['100','100','101','110','101'], l:['010','010','010','010','011'],
  m:['000','000','111','111','101'], n:['000','000','110','101','101'],
  o:['000','000','010','101','010'], p:['000','110','101','110','100'],
  q:['000','011','101','011','001'], r:['000','000','110','100','100'],
  s:['000','000','011','010','110'], t:['010','111','010','010','011'],
  u:['000','000','101','101','011'], v:['000','000','101','101','010'],
  w:['000','000','101','111','111'], x:['000','000','101','010','101'],
  y:['000','101','101','011','110'], z:['000','000','111','010','111'],
  Å:['010','000','010','111','101'], Ä:['101','000','010','111','101'],
  Ö:['101','000','010','101','010'], å:['010','000','110','011','111'],
  ä:['101','000','110','011','111'], ö:['101','000','010','101','010'],
  '?':['110','001','010','000','010'], '!':['010','010','010','000','010'],
  '.':['000','000','000','000','010'], ',':['000','000','000','010','100'],
  ':':['000','010','000','010','000'], ';':['000','010','000','010','100'],
  "'":['010','010','000','000','000'], '"':['101','101','000','000','000'],
}

/**
 * Rasterizes an authored starter into the active grid, preserving its aspect ratio.
 */
export function buildStarterBlueprint(
  char: string,
  grid: GridConfig,
  shapeId: string,
  brushSize: number,
): Map<string, FilledRegion> {
  const result = new Map<string, FilledRegion>()
  const coords = STARTER_BLUEPRINTS[char]
  if (!coords) return result
  if (grid.cols === 3 && grid.rows === 5 && COMPACT_STARTERS[char]) {
    COMPACT_STARTERS[char].forEach((line, row) => [...line].forEach((cell, col) => {
      if (cell !== '1') return
      const key = regionKey(col, row, 'ink')
      result.set(key, {key, layer: 'a', col, row, kind: 'shape', shapeId,
        size: brushSize, rotation: 0, mode: 'ink'})
    }))
    return result
  }

  // Fit the complete reference canvas without stretching letter proportions. Inverse
  // sampling fills expanded strokes instead of scattering scaled source points.
  const scale = Math.min(grid.cols / 7, grid.rows / 9)
  const offsetX = (grid.cols - 7 * scale) / 2
  const offsetY = (grid.rows - 9 * scale) / 2
  const occupied = new Set(coords.map(([col, row]) => `${col}:${row}`))
  const add = (col: number, row: number) => {
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return
    const key = regionKey(col, row, 'ink')
    result.set(key, { key, layer: 'a', col, row, kind: 'shape', shapeId,
      size: brushSize, rotation: 0, mode: 'ink' })
  }
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const sourceCol = Math.floor((col + 0.5 - offsetX) / scale)
      const sourceRow = Math.floor((row + 0.5 - offsetY) / scale)
      if (occupied.has(`${sourceCol}:${sourceRow}`)) add(col, row)
    }
  }
  // Downsampling can miss thin stems or dots. Retain each source cell's centre;
  // duplicate destinations naturally coalesce. Tiny grids necessarily lose detail.
  if (scale < 1) {
    for (const [col, row] of coords) {
      add(Math.floor(offsetX + (col + 0.5) * scale), Math.floor(offsetY + (row + 0.5) * scale))
    }
  }

  return result
}

/**
 * Nudges all filled regions by deltaCol and deltaRow.
 * Drops cells that fall off the boundary, preserving valid shapes.
 */
export function nudgeFilled(
  filled: Map<string, FilledRegion>,
  deltaCol: number,
  deltaRow: number,
  grid: GridConfig,
): Map<string, FilledRegion> {
  const next = new Map<string, FilledRegion>()
  for (const region of filled.values()) {
    const newCol = region.col + deltaCol
    const newRow = region.row + deltaRow
    if (newCol >= 0 && newCol < grid.cols && newRow >= 0 && newRow < grid.rows) {
      const key = regionKey(newCol, newRow, region.mode ?? 'ink')
      next.set(key, {
        ...region,
        key,
        col: newCol,
        row: newRow,
      })
    }
  }
  return next
}

/**
 * How an unrotated shape answers a left-right flip, as the clockwise rotation
 * that reproduces the flipped shape:
 *   0   — symmetric about its own vertical axis (triangle, chevron, bars, …)
 *   270 — quarter shapes hugging the bottom-left corner (arc, wedge)
 *   90  — quarter shapes hugging the top-left corner (notch)
 */
function flipTurn(shape?: ShapeDef): number {
  // Callers that do not say which shape they mean get the original arc behaviour.
  if (!shape) return 270
  if (shape.kind !== 'preset') return 0
  if (shape.preset === 'arc' || shape.preset === 'wedge') return 270
  if (shape.preset === 'notch') return 90
  return 0
}

const turn = (degrees: number) => ((degrees % 360) + 360) % 360

/** Rotation that makes `shape` at `rotation` look mirrored across the given axis. */
export function mirroredRotation(
  rotation: number,
  symmetry: 'horizontal' | 'vertical',
  shape?: ShapeDef,
): number {
  // flip(rotate(S, r)) = rotate(flip(S), -r); a top-bottom flip is a left-right flip turned 180°.
  return turn(flipTurn(shape) - rotation + (symmetry === 'vertical' ? 180 : 0))
}

/**
 * Calculates the mirror counterpart for a coordinate and rotation.
 * Pass the brush shape: the mirrored rotation depends on the shape's own symmetry.
 */
export function getMirroredCoord(
  col: number,
  row: number,
  grid: GridConfig,
  symmetry: 'none' | 'horizontal' | 'vertical',
  rotation = 0,
  shape?: ShapeDef,
): { col: number; row: number; rotation: number } | null {
  if (symmetry === 'none') return null
  const mirrored = mirroredRotation(rotation, symmetry, shape)
  if (symmetry === 'horizontal') return { col: grid.cols - 1 - col, row, rotation: mirrored }
  return { col, row: grid.rows - 1 - row, rotation: mirrored }
}
