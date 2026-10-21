/**
 * Pure scoring function: no database, no network. Takes one transaction and that account's earlier
 * transactions (newest first) and returns a score from 0 to 100 with the reasons behind it.
 * Because it is pure, every rule is covered by fast unit tests.
 */
export const THRESHOLDS = { flag: 50, high: 75 };

const RISKY_CATEGORIES = new Set(['crypto', 'gambling', 'gift_cards', 'wire_transfer']);
const MINUTE = 60_000;

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const stdDev = (xs, m) => Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
const time = (t) => new Date(t.occurredAt).getTime();

export function scoreTransaction(txn, history) {
  const reasons = [];
  const add = (code, points, detail) => reasons.push({ code, points, detail });
  const now = time(txn);

  // 1. Velocity: many transactions on one account within a minute.
  const lastMinute = history.filter((h) => now - time(h) >= 0 && now - time(h) <= MINUTE);
  if (lastMinute.length >= 4) add('VELOCITY', 50, `${lastMinute.length + 1} transactions within 60 seconds`);

  // 2. Amount spike: far above this account's own normal spending (z-score on its last 50 transactions).
  const amounts = history.slice(0, 50).map((h) => h.amount);
  if (amounts.length >= 10) {
    const m = mean(amounts);
    // The floor on the divisor stops very steady accounts from producing huge z-scores for small changes.
    const z = (txn.amount - m) / Math.max(stdDev(amounts, m), m * 0.1, 1);
    if (z >= 3) {
      add('AMOUNT_SPIKE', Math.min(50, Math.round(20 + z * 5)), `Amount ${txn.amount.toFixed(2)} is ${z.toFixed(1)} standard deviations above this account's usual ${m.toFixed(2)}`);
    }
  }

  // 3. Location: card used in two countries too close together in time, or a first-ever country.
  const last = history[0];
  const gap = last ? now - time(last) : Infinity;
  if (last && last.country !== txn.country && txn.channel === 'card_present' && last.channel === 'card_present' && gap >= 0 && gap <= 30 * MINUTE) {
    add('LOCATION_JUMP', 55, `Card used in ${last.country} and ${txn.country} within ${Math.max(1, Math.round(gap / MINUTE))} minutes`);
  } else if (history.length >= 10 && !history.some((h) => h.country === txn.country)) {
    add('NEW_COUNTRY', 15, `First transaction from ${txn.country} on this account`);
  }

  // 4. Merchant category: a large purchase in a category that is often abused.
  if (RISKY_CATEGORIES.has(txn.category) && txn.amount >= 1000) {
    add('RISKY_MERCHANT', 15, `Large ${txn.category.replace('_', ' ')} purchase`);
  }

  // 5. Timing and shape: small signals that only matter in combination.
  const hour = new Date(now).getUTCHours();
  if (hour >= 2 && hour < 5 && txn.amount >= 500) add('ODD_HOUR', 10, `Large purchase at ${String(hour).padStart(2, '0')}:00 UTC`);
  if (txn.amount >= 1000 && txn.amount % 100 === 0) add('ROUND_AMOUNT', 5, 'Large round-number amount');

  const score = Math.min(100, reasons.reduce((s, r) => s + r.points, 0));
  const severity = score >= THRESHOLDS.high ? 'high' : score >= THRESHOLDS.flag ? 'medium' : 'none';
  return { score, severity, flagged: score >= THRESHOLDS.flag, reasons };
}
