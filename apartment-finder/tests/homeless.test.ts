/**
 * Homeless detail-page parsing, run against a real block of text and amenity
 * states captured from a live listing (viewad,726976) — the search-results
 * card never carries size or amenity data at all (verified against the local
 * database: every Homeless listing had `sizeSqm`/amenities stuck at `null`),
 * so parseDetailFields is what turns a detail-page visit into real fields.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseDetailFields } from '../src/sources/homeless';

// Captured verbatim (via page.textContent) from a live detail page's
// floor/size/price block, which has no stable container class of its own.
const DETAIL_TEXT =
  'הדירה נמצאת במקום מרכזי מול דיזינגוף סנטר, בקומה התחתונה 2 חדרים גדולים מאד 16 מ"ר וסלון הכולל מטבח קומפלט חדש, ' +
  'מקרר, חדר שרותים ומקלחת, זו דירת 3 שותפים, אחד החדרים מתפנה בראשון לספטמבר והוא חדר להשכרת שותף שלישי. ' +
  'מהסלון יש מדרגות המובילות לגג, על הגג חדר מושכר, וגג מרוצף של 50 מ"ר לרווחת שלושת הדיירים. ' +
  '*מחיר ההשכרה כולל גם את דמי ועד הבנין פירוט הריהוט: ארונות אכסון, מזגן בכל חדר, 2 מקררים ' +
  'מאפייני הנכס לשותפים ריהוט מעלית מזגן: בחדרים ובסלון חניה: אין מרפסת: 2 סורגים ממד מחסן משופצת דוד שמש ' +
  'חיות מחמדקומה: 3 מתוך 3 מ"ר: 102 כניסה: מיידי תשלומים בשנה: 12 ארנונה לחודשיים: 1200 מחיר: 3335 ש"ח ' +
  'הצגת מספר טלפון איש קשר: עוזי גיל, תלמה גיל שתפו את המודעה';

// The .IconOption on/off states for the same listing, keyed by field name as
// fetchDetailFields' page.evaluate already maps them (icon filename -> field).
const AMENITIES = {
  isRoommates: true,
  isFurnished: true,
  hasElevator: false,
  hasParking: false,
  hasBalcony: true,
  hasSafeRoom: false,
  petsAllowed: false,
};

test('reads the structured size, not the sizes mentioned in free text', () => {
  // The description text itself mentions "16 מ"ר" and "50 מ"ר" (room/roof
  // sizes) with no colon — only "מ"ר: 102" (the structured field) has one,
  // which is what the regex must anchor on.
  const fields = parseDetailFields({}, DETAIL_TEXT);
  assert.equal(fields.sizeSqm, 102);
});

test('reads the floor out of "קומה: 3 מתוך 3"', () => {
  const fields = parseDetailFields({}, DETAIL_TEXT);
  assert.equal(fields.floor, 3);
});

test('passes the icon-grid amenities through unchanged, including confirmed false', () => {
  const fields = parseDetailFields(AMENITIES, DETAIL_TEXT);
  assert.equal(fields.hasBalcony, true);
  assert.equal(fields.hasElevator, false);
  assert.equal(fields.hasParking, false);
  assert.equal(fields.hasSafeRoom, false);
  assert.equal(fields.isFurnished, true);
});

test('missing detail text yields no size or floor, not a crash', () => {
  const fields = parseDetailFields({}, '');
  assert.equal(fields.sizeSqm, undefined);
  assert.equal(fields.floor, undefined);
});
