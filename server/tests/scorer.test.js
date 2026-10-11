import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreTransaction } from '../src/services/scorer.js';

const NOW = new Date('2026-03-10T14:00:00Z').getTime(); // midday UTC, so the odd-hour rule stays quiet

const txn = (o = {}) => ({ amount: 50, category: 'groceries', country: 'US', channel: 'card_present', occurredAt: new Date(NOW), ...o });
const past = (msAgo, o = {}) => ({ amount: 50, category: 'groceries', country: 'US', channel: 'card_present', occurredAt: new Date(NOW - msAgo), ...o });

// Fifteen ordinary purchases over previous days, newest first. Amounts vary a little around 50.
const steadyHistory = () => Array.from({ length: 15 }, (_, i) => past((i + 1) * 3_600_000 * 5, { amount: 40 + (i % 5) * 5 }));
const codes = (r) => r.reasons.map((x) => x.code);

test('an ordinary purchase scores zero', () => {
  const r = scoreTransaction(txn(), steadyHistory());
  assert.equal(r.score, 0);
  assert.equal(r.flagged, false);
});

test('five transactions in a minute is flagged for velocity', () => {
  const burst = [10_000, 20_000, 30_000, 40_000].map((ms) => past(ms));
  const r = scoreTransaction(txn(), [...burst, ...steadyHistory()]);
  assert.ok(codes(r).includes('VELOCITY'));
  assert.equal(r.flagged, true);
});

test('four transactions in a minute is not enough', () => {
  const burst = [10_000, 20_000, 30_000].map((ms) => past(ms));
  assert.ok(!codes(scoreTransaction(txn(), [...burst, ...steadyHistory()])).includes('VELOCITY'));
});

test('an amount far above the account average is flagged', () => {
  const r = scoreTransaction(txn({ amount: 1500, category: 'retail' }), steadyHistory());
  assert.ok(codes(r).includes('AMOUNT_SPIKE'));
  assert.equal(r.flagged, true);
});

test('amount rule needs at least 10 past transactions', () => {
  const r = scoreTransaction(txn({ amount: 1500 }), steadyHistory().slice(0, 5));
  assert.ok(!codes(r).includes('AMOUNT_SPIKE'));
});

test('card used in two countries 5 minutes apart is flagged', () => {
  const r = scoreTransaction(txn({ country: 'GB' }), [past(5 * 60_000), ...steadyHistory()]);
  assert.ok(codes(r).includes('LOCATION_JUMP'));
  assert.equal(r.flagged, true);
});

test('online purchases do not trigger the location rule', () => {
  const r = scoreTransaction(txn({ country: 'GB', channel: 'online' }), [past(5 * 60_000), ...steadyHistory()]);
  assert.ok(!codes(r).includes('LOCATION_JUMP'));
});

test('a first purchase from a new country is a small signal, not an alert', () => {
  const r = scoreTransaction(txn({ country: 'SG' }), steadyHistory());
  assert.deepEqual(codes(r), ['NEW_COUNTRY']);
  assert.equal(r.flagged, false);
});

test('a risky category alone is not enough to flag', () => {
  const r = scoreTransaction(txn({ amount: 1200, category: 'crypto' }), [...steadyHistory().map((h) => ({ ...h, amount: 1100 + (h.amount % 7) * 30 }))]);
  assert.equal(r.flagged, false);
});

test('score never exceeds 100 and high severity starts at 75', () => {
  const burst = [10_000, 20_000, 30_000, 40_000].map((ms) => past(ms, { country: 'US' }));
  const r = scoreTransaction(txn({ amount: 5000, category: 'crypto', country: 'NG' }), [...burst, ...steadyHistory()]);
  assert.ok(r.score <= 100);
  assert.equal(r.severity, 'high');
});
