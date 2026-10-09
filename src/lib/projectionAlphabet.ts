import { ALPHABET } from './festival'
import { DIGITS, PUNCTUATION, type CustomSymbol } from './fontDesign'

/** Only submitted standard characters and registered, undeleted symbols belong on the wall. */
export function projectionLetters(published: Iterable<string>, upper: boolean, symbols: CustomSymbol[] = []) {
  const letters = ALPHABET.map(char => upper ? char.toUpperCase() : char)
  const allowedExtras = new Set([...DIGITS, ...PUNCTUATION, ...symbols.filter(s => !s.deleted).map(s => s.char)])
  return [...letters, ...new Set([...published].filter(char => allowedExtras.has(char))) ]
}
