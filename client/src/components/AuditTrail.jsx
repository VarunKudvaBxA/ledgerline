import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function AuditTrail() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api('/audit').then(setRows); }, []);
  if (!rows) return <p className="hint">Loading…</p>;
  if (!rows.length) return <p className="empty">No actions recorded yet. Decisions on alerts appear here.</p>;
  return (
    <table className="audit">
      <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Account</th><th>Score</th><th>Note</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r._id}>
            <td>{new Date(r.createdAt).toLocaleString()}</td>
            <td>{r.actorEmail}</td>
            <td>{r.action.replace('alert.', '')} ({r.details?.from} → {r.details?.to})</td>
            <td>{r.details?.accountId}</td>
            <td>{r.details?.score}</td>
            <td>{r.details?.note || '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
