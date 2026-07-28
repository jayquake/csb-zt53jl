/**
 * Parsing helpers shared by the source adapters.
 *
 * These are pure functions on purpose: the scraping layer cannot be exercised
 * without a live browser and a residential IP, but the interpretation of the
 * text it returns is where the bugs actually live, so that part is unit tested
 * against fixtures instead.
 */

import { normalizeText } from '../criteria';

/**
 * Pulls an integer out of a price string. Handles the separators Israeli sites
 * mix freely: "₪ 6,500", "6500 ש\"ח", "6.500".
 * Returns undefined for "call for price" style placeholders.
 */
export function parsePrice(input: string | number | null | undefined): number | undefined {
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? Math.round(input) : undefined;
  if (!input) return undefined;

  const text = String(input);
  // A price is only meaningful if there are digits; "לא צוין מחיר" has none.
  const digits = text.replace(/[^\d.,]/g, '');
  if (!digits) return undefined;

  // Strip thousands separators. Both "," and "." are used for this, and neither
  // is ever a decimal point in a monthly rent figure.
  const cleaned = digits.replace(/[.,]/g, '');
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return undefined;

  // Rents below ~500 are almost certainly a parse artifact (a floor number, a
  // room count) rather than a real monthly price.
  return value < 500 ? undefined : value;
}

/** Rooms can be fractional in Hebrew listings ("3.5 חדרים"). */
export function parseRooms(input: string | number | null | undefined): number | undefined {
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? input : undefined;
  if (!input) return undefined;
  const match = String(input).match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return undefined;
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 && value <= 20 ? value : undefined;
}

export function parseInteger(input: string | number | null | undefined): number | undefined {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input) : undefined;
  if (!input) return undefined;
  const match = String(input).match(/(\d+)/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Floor, including the two special cases Hebrew listings use:
 * "קרקע" (ground) is floor 0, and "מרתף" (basement) is -1.
 */
export function parseFloor(input: string | number | null | undefined): number | undefined {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input) : undefined;
  if (!input) return undefined;
  const text = normalizeText(String(input));
  if (text.includes('קרקע')) return 0;
  if (text.includes('מרתף')) return -1;
  return parseInteger(text);
}

/**
 * Relative Hebrew timestamps, as they appear on listing cards.
 * "לפני 3 שעות", "אתמול", "היום", "לפני יומיים", plus dd/mm/yyyy.
 */
export function parseHebrewDate(input: string | null | undefined, now: Date = new Date()): Date | undefined {
  if (!input) return undefined;
  const text = normalizeText(input);
  if (!text) return undefined;

  if (text.includes('היום') || text.includes('עכשיו')) return now;
  if (text.includes('אתמול')) return new Date(now.getTime() - 86_400_000);
  // "יומיים" is the dual form: exactly two days.
  if (text.includes('יומיים')) return new Date(now.getTime() - 2 * 86_400_000);
  if (text.includes('שעתיים')) return new Date(now.getTime() - 2 * 3_600_000);

  const rel = text.match(/לפני\s*(\d+)\s*(דקות|דקה|שעות|שעה|ימים|יום|שבועות|שבוע|חודשים|חודש)/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2];
    const ms =
      unit.startsWith('דק') ? 60_000
      : unit.startsWith('שע') ? 3_600_000
      : unit.startsWith('יו') || unit.startsWith('ימ') ? 86_400_000
      : unit.startsWith('שב') ? 7 * 86_400_000
      : 30 * 86_400_000;
    return new Date(now.getTime() - n * ms);
  }

  const dmy = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const iso = Date.parse(input);
  return Number.isNaN(iso) ? undefined : new Date(iso);
}

/**
 * Detects amenities from free text. Sources expose these inconsistently — some
 * as structured booleans, most only as words in the description — so the text
 * pass runs for every listing and is OR-ed with whatever structured data exists.
 */
export function detectAmenities(text: string): {
  hasElevator: boolean;
  hasParking: boolean;
  hasBalcony: boolean;
  hasSafeRoom: boolean;
  isFurnished: boolean;
  petsAllowed: boolean;
  isRoommates: boolean;
} {
  const t = normalizeText(text);

  // Negations matter here: "ללא מעלית" (no elevator) must not read as having one.
  const has = (...terms: string[]): boolean =>
    terms.some((term) => {
      const n = normalizeText(term);
      if (!n || !t.includes(n)) return false;
      const idx = t.indexOf(n);
      const before = t.slice(Math.max(0, idx - 12), idx);
      return !/(ללא|אין|בלי|לא)\s*$/.test(before);
    });

  return {
    hasElevator: has('מעלית'),
    hasParking: has('חניה', 'חנייה', 'parking'),
    hasBalcony: has('מרפסת', 'balcony'),
    hasSafeRoom: has('ממ"ד', 'ממד', 'מרחב מוגן'),
    isFurnished: has('מרוהט', 'מרוהטת', 'ריהוט מלא', 'furnished'),
    petsAllowed: has('בעלי חיים', 'חיות מחמד', 'pets'),
    isRoommates: has('שותף', 'שותפה', 'שותפים', 'roommate', 'flatmate'),
  };
}

/** Collapses whitespace and trims, for text pulled out of the DOM. */
export function clean(input: string | null | undefined): string {
  return (input ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Decides whether a listing is posted by an agent or by the owner.
 *
 * This matters more in Israel than the equivalent elsewhere: a broker's fee is
 * typically one month's rent, so filtering agency posts out changes what the
 * apartment actually costs, not just who answers the phone.
 *
 * Returns undefined when the text gives no signal either way — callers must not
 * read that as "private", because most listings simply do not say.
 */
export function detectAgency(text: string): boolean | undefined {
  const t = normalizeText(text);
  if (!t) return undefined;

  // Explicit disclaimers of a fee are the strongest private signal, and they
  // contain the word "תיווך" themselves — so they must be checked first, or
  // the agency patterns below would match them backwards.
  const privateMarkers = [
    'ללא תיווך',
    'בלי תיווך',
    'אין תיווך',
    'ללא דמי תיווך',
    'לא תיווך',
    'מפרטי',
    'מבעל הבית',
    'מהבעלים',
    'ישירות מהבעלים',
    'no agent',
    'no broker',
    'private',
  ];
  if (privateMarkers.some((m) => t.includes(normalizeText(m)))) return false;

  const agencyMarkers = [
    'תיווך',
    'מתווך',
    'מתווכת',
    'בלעדיות',
    'בלעדי',
    'דמי תיווך',
    'סוכנות',
    'נדל"ן בע"מ',
    'realty',
    'real estate',
    'agency',
  ];
  if (agencyMarkers.some((m) => t.includes(normalizeText(m)))) return true;

  return undefined;
}
