import crypto from 'crypto';
import Transaction from '../models/Transaction.js';
import { ingestTransaction } from './ingest.js';

/**
 * Generates a stream of card transactions for 150 accounts. Roughly 6% are injected suspicious patterns,
 * each tagged with a hidden label so the dashboard can report precision and recall against known answers.
 */
const HOME = ['US', 'GB', 'DE', 'IN', 'SG'];
const ABROAD = ['NG', 'RU', 'BR', 'VN', 'RO'];
const MERCHANTS = {
  groceries: ['FreshMart', 'Green Basket', 'Corner Store'],
  fuel: ['QuickFuel', 'Roadside Gas'],
  dining: ['Blue Door Cafe', 'Noodle House', 'Pizza Corner'],
  transport: ['CityRide', 'MetroPass'],
  utilities: ['PowerCo', 'AquaServ'],
  retail: ['HomeGoods', 'TechBay', 'StyleHub'],
  subscriptions: ['StreamBox', 'CloudNotes'],
};
const RISKY = [['crypto', 'CoinHub'], ['gambling', 'LuckySpin'], ['gift_cards', 'GiftMart']];

const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
const round2 = (n) => Math.round(n * 100) / 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randn = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

const accounts = Array.from({ length: 150 }, (_, i) => ({ id: `ACC-${1001 + i}`, home: pick(HOME), avg: 25 + Math.random() * 100 }));
const quarantine = new Map(); // accountId -> timestamp until which we leave it alone, so one incident can't spill into "normal" traffic

let timer = null;
let config = { ratePerSec: 2, anomalyRate: 0.06 };
let sent = 0;

const base = (acc, o = {}) => ({
  externalId: crypto.randomUUID(), accountId: acc.id, currency: 'USD', country: acc.home,
  channel: Math.random() < 0.7 ? 'card_present' : 'online', occurredAt: new Date(),
  simLabel: 'normal', simIncident: null, ...o,
});

function normal(acc) {
  const category = pick(Object.keys(MERCHANTS));
  const bigLegit = Math.random() < 0.01; // an honest large purchase: a realistic source of false alarms
  const amount = round2(Math.max(1, acc.avg * (bigLegit ? 10 : Math.exp(randn() * 0.5))));
  return base(acc, { category, merchant: pick(MERCHANTS[category]), amount });
}

const send = async (payload) => { await ingestTransaction(payload); sent++; };
const incident = () => `INC-${crypto.randomUUID().slice(0, 8)}`;

const scenarios = {
  async spike(acc) {
    await send(base(acc, { category: 'retail', merchant: pick(MERCHANTS.retail), channel: 'online', amount: round2(acc.avg * (15 + Math.random() * 10)), simLabel: 'suspicious', simIncident: incident() }));
  },
  async risky(acc) {
    const [category, merchant] = pick(RISKY);
    await send(base(acc, { category, merchant, channel: 'online', amount: round2(Math.max(1500, acc.avg * 25)), simLabel: 'suspicious', simIncident: incident() }));
  },
  async location(acc) {
    await send(base(acc, { channel: 'card_present', category: 'dining', merchant: pick(MERCHANTS.dining), amount: round2(acc.avg) }));
    await sleep(100);
    await send(base(acc, { channel: 'card_present', country: pick(ABROAD), category: 'retail', merchant: pick(MERCHANTS.retail), amount: round2(acc.avg * 1.2), simLabel: 'suspicious', simIncident: incident() }));
  },
  async burst(acc) {
    const id = incident();
    for (let i = 0; i < 8; i++) {
      await send(base(acc, { channel: 'online', category: 'retail', merchant: 'QuickShop', amount: round2(30 + Math.random() * 90), simLabel: 'suspicious', simIncident: id }));
      await sleep(250);
    }
  },
};
const scenarioWeights = [['spike', 0.3], ['location', 0.25], ['risky', 0.2], ['burst', 0.25]];
const quarantineMs = { spike: 60_000, risky: 60_000, location: 35 * 60_000, burst: 90_000 };

function chooseScenario() {
  let r = Math.random();
  for (const [name, w] of scenarioWeights) { if ((r -= w) < 0) return name; }
  return 'spike';
}

function pickAccount() {
  for (let i = 0; i < 10; i++) {
    const acc = pick(accounts);
    if ((quarantine.get(acc.id) || 0) < Date.now()) return acc;
  }
  return null;
}

async function tick() {
  try {
    const acc = pickAccount();
    if (!acc) return;
    if (Math.random() < config.anomalyRate) {
      const name = chooseScenario();
      quarantine.set(acc.id, Date.now() + quarantineMs[name]);
      scenarios[name](acc).catch((e) => console.error('scenario failed:', e.message)); // don't block the tick
    } else {
      await send(normal(acc));
    }
  } catch (err) {
    console.error('simulator tick failed:', err.message);
  }
}

/** Gives each account some past transactions so the amount rule has history to compare against. */
async function ensureHistory() {
  const counts = new Map((await Transaction.aggregate([{ $group: { _id: '$accountId', n: { $sum: 1 } } }])).map((c) => [c._id, c.n]));
  const docs = [];
  for (const acc of accounts) {
    if ((counts.get(acc.id) || 0) >= 15) continue;
    for (let i = 0; i < 20; i++) {
      const category = pick(Object.keys(MERCHANTS));
      docs.push({
        externalId: `history-${acc.id}-${i}-${Date.now()}`, accountId: acc.id, currency: 'USD', country: acc.home,
        channel: 'card_present', category, merchant: pick(MERCHANTS[category]),
        amount: round2(Math.max(1, acc.avg * Math.exp(randn() * 0.5))),
        occurredAt: new Date(Date.now() - (2 * 3_600_000 + Math.random() * 30 * 86_400_000)),
        status: 'scored', score: 0, flagged: false,
      });
    }
  }
  if (docs.length) await Transaction.insertMany(docs);
}

export const status = () => ({ running: !!timer, ...config, sent });

export async function start(options = {}) {
  if (timer) return status();
  config = { ...config, ...options };
  await ensureHistory();
  timer = setInterval(tick, 1000 / config.ratePerSec);
  return status();
}

export function stop() {
  clearInterval(timer);
  timer = null;
  return status();
}
