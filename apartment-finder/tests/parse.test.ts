import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePrice,
  parseRooms,
  parseFloor,
  parseHebrewDate,
  detectAmenities,
} from '../src/sources/parse';
import { normalizeText } from '../src/criteria';

test('parsePrice handles the separator styles Israeli listings mix', () => {
  assert.equal(parsePrice('₪6,500'), 6500);
  assert.equal(parsePrice('6.500 ש"ח'), 6500);
  assert.equal(parsePrice('  7500  '), 7500);
  assert.equal(parsePrice(8200), 8200);
});

test('parsePrice rejects placeholders and implausible values', () => {
  assert.equal(parsePrice('לא צוין מחיר'), undefined);
  assert.equal(parsePrice(''), undefined);
  assert.equal(parsePrice(null), undefined);
  // A bare "3" is a room count that leaked into the price field, not a rent.
  assert.equal(parsePrice('3'), undefined);
});

test('parseRooms keeps half rooms', () => {
  assert.equal(parseRooms('3.5 חדרים'), 3.5);
  assert.equal(parseRooms('3,5'), 3.5);
  assert.equal(parseRooms('2 חד׳'), 2);
  assert.equal(parseRooms('חדרים'), undefined);
});

test('parseFloor understands ground and basement', () => {
  assert.equal(parseFloor('קומה 3'), 3);
  assert.equal(parseFloor('קרקע'), 0);
  assert.equal(parseFloor('מרתף'), -1);
  assert.equal(parseFloor(2), 2);
});

test('parseHebrewDate resolves relative timestamps', () => {
  const now = new Date('2026-07-28T12:00:00Z');
  const day = 86_400_000;

  assert.equal(parseHebrewDate('היום', now)?.getTime(), now.getTime());
  assert.equal(parseHebrewDate('אתמול', now)?.getTime(), now.getTime() - day);
  // Dual form: exactly two days, not "some days".
  assert.equal(parseHebrewDate('יומיים', now)?.getTime(), now.getTime() - 2 * day);
  assert.equal(parseHebrewDate('לפני 3 ימים', now)?.getTime(), now.getTime() - 3 * day);
  assert.equal(parseHebrewDate('לפני 2 שעות', now)?.getTime(), now.getTime() - 2 * 3_600_000);
  assert.equal(parseHebrewDate('לפני שבוע', now), undefined); // no number, not a match
  assert.equal(parseHebrewDate('15/07/2026', now)?.toISOString().slice(0, 10), '2026-07-15');
});

test('normalizeText unifies the several Hebrew quote characters', () => {
  // The whole point: a criterion written with " must match a listing using ״.
  assert.equal(normalizeText('ממ"ד'), normalizeText('ממ״ד'));
  assert.equal(normalizeText('  שתי   מילים '), 'שתי מילים');
});

test('detectAmenities finds features in free text', () => {
  const found = detectAmenities('דירת 3 חדרים עם מרפסת שמש, מעלית וחניה. יש ממ"ד.');
  assert.equal(found.hasBalcony, true);
  assert.equal(found.hasElevator, true);
  assert.equal(found.hasParking, true);
  assert.equal(found.hasSafeRoom, true);
  assert.equal(found.isFurnished, false);
});

test('detectAmenities respects negations', () => {
  // "ללא מעלית" means no elevator — reading it as having one would surface
  // fourth-floor walk-ups to someone who filtered for an elevator.
  const found = detectAmenities('דירה יפה ללא מעלית, אין חניה');
  assert.equal(found.hasElevator, false);
  assert.equal(found.hasParking, false);
});

test('detectAmenities flags roommate posts', () => {
  assert.equal(detectAmenities('דרושה שותפה לדירת שותפים').isRoommates, true);
  assert.equal(detectAmenities('דירת 3 חדרים להשכרה').isRoommates, false);
});
