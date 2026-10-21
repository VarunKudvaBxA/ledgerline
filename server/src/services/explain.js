import { env } from '../config/env.js';

const SYSTEM = `You write short notes for a transaction review analyst.
In at most two sentences, explain why this transaction was flagged, using ONLY the facts provided.
Use cautious wording such as "may" or "unusual". Never state that fraud occurred. Do not add facts.`;

/** Plain template used when no model is configured, or when the model call fails. */
const templateText = (txn, reasons) => `Score ${txn.score}/100. ${reasons.map((r) => r.detail).join('. ')}.`;

async function askModel(user) {
  const signal = AbortSignal.timeout(8000);
  if (env.explainProvider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.anthropicModel, max_tokens: 200, system: SYSTEM, messages: [{ role: 'user', content: user }] }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    return (await res.json()).content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  }
  if (env.explainProvider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.openaiKey}` },
      body: JSON.stringify({ model: env.openaiChatModel, max_tokens: 200, temperature: 0, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    return (await res.json()).choices[0].message.content;
  }
  return null;
}

/**
 * The language model only writes the explanation. The decision to flag came from the rules in scorer.js,
 * and a failed or slow model call never blocks an alert: it falls back to the template.
 */
export async function explain(txn, reasons) {
  const fallback = templateText(txn, reasons);
  if (env.explainProvider === 'mock') return fallback;
  try {
    const facts = JSON.stringify({
      amount: txn.amount, currency: txn.currency, merchant: txn.merchant, category: txn.category,
      country: txn.country, channel: txn.channel, score: txn.score, signals: reasons.map((r) => r.detail),
    });
    const text = await askModel(`Transaction facts: ${facts}`);
    return text?.trim() || fallback;
  } catch (err) {
    console.error('explain failed, using template:', err.message);
    return fallback;
  }
}
