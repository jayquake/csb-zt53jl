/**
 * Text normalisation shared by matching, translation and parsing.
 *
 * Lives in its own module because both `criteria` and `translate` need it and
 * they also need each other — importing it from either would create a cycle,
 * which under CommonJS resolves to `undefined` at module-init time rather than
 * failing loudly.
 */

/**
 * Normalizes Hebrew/English text for substring matching: strips niqqud, unifies
 * the several quote characters Hebrew listings use interchangeably (״ ” " and
 * ׳ ’ '), and collapses whitespace. Without this, a criterion of `ממ"ד` fails
 * to match a listing that wrote `ממ״ד`.
 */
export function normalizeText(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '') // niqqud + cantillation
    .replace(/[״“”«»]/g, '"') // gershayim + smart quotes
    .replace(/[׳‘’]/g, "'") // geresh + smart apostrophes
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
