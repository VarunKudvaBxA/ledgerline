import { useState } from 'react';
import { api } from '../api.js';

const money = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
const ago = (d) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(d)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};

function AlertCard({ alert, user }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const escalated = alert.status === 'escalated';
  const locked = escalated && user.role !== 'admin';

  async function decide(action) {
    setBusy(true);
    setError('');
    try {
      await api(`/alerts/${alert._id}/decision`, { method: 'PATCH', body: { action, note: note || undefined } });
    } catch (err) {
      setError(err.message); // e.g. another analyst got there first
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`alert ${alert.severity}`}>
      <div className="alert-top">
        <div className="score" aria-label={`Risk score ${alert.score}`}>{alert.score}</div>
        <div className="alert-main">
          <div className="alert-title">{money(alert.amount)} at {alert.merchant}</div>
          <div className="meta">{alert.accountId} · {alert.country} · {ago(alert.createdAt)}{escalated ? ` · escalated by ${alert.decidedBy}` : ''}</div>
        </div>
        <span className={`sev ${alert.severity}`}>{alert.severity === 'high' ? 'High risk' : 'Medium risk'}</span>
      </div>
      <p className="why">{alert.explanation}</p>
      <ul className="signals">
        {alert.reasons.map((r) => <li key={r.code}><b>+{r.points}</b> {r.detail}</li>)}
      </ul>
      {locked ? (
        <p className="hint">Waiting for an admin to decide.</p>
      ) : (
        <div className="actions">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" aria-label="Note" maxLength={500} />
          <button className="btn ok" disabled={busy} onClick={() => decide('approve')}>Approve</button>
          <button className="btn danger" disabled={busy} onClick={() => decide('block')}>Block</button>
          {!escalated && <button className="btn" disabled={busy} onClick={() => decide('escalate')}>Escalate</button>}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </article>
  );
}

export default function AlertQueue({ alerts, user }) {
  return (
    <section aria-label="Review queue">
      {alerts.length === 0 ? (
        <p className="empty">Nothing to review. An admin can start the simulator to generate traffic.</p>
      ) : (
        alerts.slice().sort((a, b) => b.score - a.score).map((a) => <AlertCard key={a._id} alert={a} user={user} />)
      )}
    </section>
  );
}
