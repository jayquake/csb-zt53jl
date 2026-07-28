/**
 * Hebrew → English for the parts of a listing you actually read at a glance.
 *
 * The sources are entirely in Hebrew, which makes the feed hard to skim if you
 * do not read it fluently. Translation happens once at ingest and is stored
 * alongside the Hebrew, rather than being done in the browser, for two reasons:
 * the published static page has no server to ask, and the WhatsApp digest needs
 * the same strings.
 *
 * The Hebrew is always kept as well — it is what you will paste into Waze or
 * quote to a landlord, and a transliterated street name is useless for that.
 *
 * These are lookup tables, not machine translation: the vocabulary of an
 * Israeli rental listing is small and closed, so a table is exact, free and
 * offline, where an API would be approximate, paid and another failure mode.
 */

import { normalizeText } from './text';

/** Cities in and around Gush Dan. */
const CITIES: Record<string, string> = {
  'תל אביב יפו': 'Tel Aviv-Yafo',
  'תל אביב': 'Tel Aviv',
  'רמת גן': 'Ramat Gan',
  גבעתיים: 'Givatayim',
  'בני ברק': 'Bnei Brak',
  הרצליה: 'Herzliya',
  'בת ים': 'Bat Yam',
  חולון: 'Holon',
  'ראשון לציון': 'Rishon LeZion',
  'רמת השרון': 'Ramat HaSharon',
  'פתח תקווה': 'Petah Tikva',
  'גבעת שמואל': 'Givat Shmuel',
  'קרית אונו': 'Kiryat Ono',
  'אור יהודה': 'Or Yehuda',
  'כפר סבא': 'Kfar Saba',
  רעננה: 'Ra\'anana',
  ירושלים: 'Jerusalem',
};

/**
 * Tel Aviv neighbourhoods. Transliterated rather than literally translated
 * where that is how people actually refer to them in English — nobody says
 * "Old North" in a WhatsApp message, they say "Tzafon Yashan"; but "Florentin"
 * is simply Florentin.
 */
const NEIGHBORHOODS: Record<string, string> = {
  'לב תל אביב': 'Lev Tel Aviv (City Centre)',
  פלורנטין: 'Florentin',
  'נווה צדק': 'Neve Tzedek',
  'הצפון הישן': 'Old North',
  'הצפון החדש': 'New North',
  'כרם התימנים': 'Kerem HaTeimanim',
  'רמת אביב': 'Ramat Aviv',
  'יד אליהו': 'Yad Eliyahu',
  שפירא: 'Shapira',
  מונטיפיורי: 'Montefiore',
  בבלי: 'Bavli',
  'נחלת יצחק': 'Nahalat Yitzhak',
  התקווה: 'HaTikva',
  'שכונת התקווה': 'HaTikva',
  צהלה: 'Tzahala',
  'נווה שרת': 'Neve Sharett',
  'הדר יוסף': 'Hadar Yosef',
  'נווה עופר': 'Neve Ofer',
  'נווה גולן': 'Neve Golan',
  'נווה חן': 'Neve Chen',
  'רמת החייל': 'Ramat HaHayal',
  'כוכב הצפון': 'Kochav HaTzafon',
  'תל ברוך': 'Tel Baruch',
  המשתלה: 'HaMishtala',
  'דקר יפו': 'Dekel Yafo',
  'עג\'מי': 'Ajami',
  'גבעת עלייה': 'Givat Aliya',
  'קרית שלום': 'Kiryat Shalom',
  'ביצרון': 'Bitzaron',
  'תל גנים': 'Tel Ganim',
  'לב העיר': 'City Centre',
  שינקין: 'Sheinkin',
  בורוכוב: 'Borochov',
  'נווה אביבים': 'Neve Avivim',
  הבילויים: "HaBilu'im",
  נגבה: 'Negba',
  הראשונים: 'HaRishonim',
  "יפו ד'": 'Jaffa D',
  'דרום העיר': 'South City',
  'כיכר המדינה': 'Kikar HaMedina',
  'גבעת רמבם': 'Givat Rambam',
  'תל חיים': 'Tel Haim',
  'ניר אביב': 'Nir Aviv',
  'יד לבנים': 'Yad LaBanim',
  'רמת השקמה': 'Ramat HaShikma',
  'הל"ה': 'HaLamed-Heh',
  'שטח 9': 'Shetach 9',
  'נווה רם': 'Neve Ram',
  'שיכון מזרחי': 'Shikun Mizrahi',
  עגמי: 'Ajami',
  'הרא"ה': "HaRa'aH",
  גפן: 'Gefen',
  'תל יהודה': 'Tel Yehuda',
  חרוזים: 'Haruzim',
  'שיכון הצנחנים': 'Shikun HaTzanhanim',
  הלל: 'Hillel',
  יהלום: 'Yahalom',
  עליות: 'Aliyot',
  'קריית יוסף': 'Kiryat Yosef',
  'רמת ישראל': 'Ramat Yisrael',
  'כפר שלם': 'Kfar Shalem',
  'נוה שאנן': 'Neve Sha\'anan',
};

/**
 * Hebrew → Latin transliteration, used when a name is not in the table above.
 *
 * Tel Aviv has far more neighbourhoods than are worth hand-curating, and most
 * of the long tail are small. An approximate "Sheinkin" beats an untranslated
 * Hebrew string for someone skimming in English, and the exact Hebrew is always
 * shown next to it anyway — so an imperfect transliteration costs nothing and
 * missing coverage costs readability.
 */
const LETTERS: Record<string, string> = {
  א: '', ב: 'b', ג: 'g', ד: 'd', ה: 'h', ו: 'v', ז: 'z', ח: 'ch', ט: 't',
  י: 'y', כ: 'k', ך: 'k', ל: 'l', מ: 'm', ם: 'm', נ: 'n', ן: 'n', ס: 's',
  ע: '', פ: 'p', ף: 'f', צ: 'tz', ץ: 'tz', ק: 'k', ר: 'r', ש: 'sh', ת: 't',
};

export function transliterate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const words = value.split(/\s+/).filter(Boolean);
  const out: string[] = [];

  for (const word of words) {
    let latin = '';
    for (const ch of word) {
      if (LETTERS[ch] !== undefined) latin += LETTERS[ch];
      else if (/[\u0590-\u05FF]/.test(ch)) continue; // punctuation/diacritics
      else latin += ch;
    }
    latin = latin.replace(/([a-z])\1+/g, '$1'); // collapse doubled letters
    if (latin) out.push(latin.charAt(0).toUpperCase() + latin.slice(1));
  }

  return out.length ? out.join(' ') : undefined;
}

/** Amenity and feature vocabulary, including Komo's CSS class names. */
const FEATURES: Record<string, string> = {
  'ממ"ד': 'Safe room',
  ממד: 'Safe room',
  'מרחב מוגן': 'Safe room',
  מעלית: 'Elevator',
  מרפסת: 'Balcony',
  'מרפסת שמש': 'Sun balcony',
  חניה: 'Parking',
  חנייה: 'Parking',
  מזגן: 'Air conditioning',
  מיזוג: 'Air conditioning',
  סורגים: 'Window bars',
  מחסן: 'Storage',
  מרוהט: 'Furnished',
  מרוהטת: 'Furnished',
  ריהוט: 'Furnished',
  'ריהוט חלקי': 'Partly furnished',
  'יחידת דיור': 'Studio unit',
  'מטבח כשר': 'Kosher kitchen',
  משופצת: 'Renovated',
  משופץ: 'Renovated',
  'כניסה מיידית': 'Immediate entry',
  'גישה לנכים': 'Accessible',
  'בעלי חיים': 'Pets allowed',
  תיווך: 'Agent',
  'ללא תיווך': 'No agent fee',
  פרטי: 'Private',
};

function lookup(table: Record<string, string>, value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = normalizeText(value);
  for (const [hebrew, english] of Object.entries(table)) {
    if (normalizeText(hebrew) === normalized) return english;
  }
  return undefined;
}

export function translateCity(value: string | null | undefined): string | undefined {
  return lookup(CITIES, value);
}

export function translateNeighborhood(value: string | null | undefined): string | undefined {
  const exact = lookup(NEIGHBORHOODS, value);
  if (exact) return exact;
  if (!value) return undefined;

  // Komo's titles sometimes carry a qualifier, e.g. "שכונת התקווה, כרמי".
  // Match the longest known name contained in the string so those still
  // resolve rather than falling through untranslated.
  const normalized = normalizeText(value);
  let best: string | undefined;
  let bestLength = 0;
  for (const [hebrew, english] of Object.entries(NEIGHBORHOODS)) {
    const n = normalizeText(hebrew);
    if (n.length > bestLength && normalized.includes(n)) {
      best = english;
      bestLength = n.length;
    }
  }
  // Deliberately no transliteration fallback. Hebrew is an abjad, so a
  // letter-by-letter mapping produces unreadable consonant clusters —
  // "חרוזים" becomes "Chrvzym", which is no more skimmable than the original.
  // An unknown neighbourhood keeps its Hebrew, which the UI shows anyway.
  return best;
}

export function translateFeature(value: string | null | undefined): string | undefined {
  return lookup(FEATURES, value);
}

/**
 * A short English summary of a listing, for people who do not read Hebrew.
 * Returns undefined when nothing could be translated, so callers fall back to
 * the original rather than showing a misleadingly empty string.
 */
export function describeInEnglish(listing: {
  rooms?: number | null;
  sizeSqm?: number | null;
  floor?: number | null;
  city?: string | null;
  neighborhood?: string | null;
}): string | undefined {
  const parts: string[] = [];
  if (listing.rooms != null) parts.push(`${listing.rooms} rooms`);
  if (listing.sizeSqm != null) parts.push(`${listing.sizeSqm}m²`);
  if (listing.floor != null) parts.push(listing.floor === 0 ? 'ground floor' : `floor ${listing.floor}`);

  const place = [translateNeighborhood(listing.neighborhood), translateCity(listing.city)]
    .filter(Boolean)
    .join(', ');
  if (place) parts.push(place);

  return parts.length ? parts.join(' · ') : undefined;
}
