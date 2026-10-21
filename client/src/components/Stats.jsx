const pct = (x) => (x === null || x === undefined ? '–' : `${(x * 100).toFixed(0)}%`);

export default function Stats({ stats }) {
  if (!stats) return <section className="stats"><p className="hint">Loading numbers…</p></section>;
  const q = stats.quality;
  const items = [
    ['Scored', stats.scored.toLocaleString(), `${stats.perMinute} in the last minute`],
    ['Flagged', stats.flagged.toLocaleString(), stats.scored ? `${((stats.flagged / stats.scored) * 100).toFixed(1)}% of scored` : ''],
    ['Waiting for review', (stats.alerts.open || 0) + (stats.alerts.escalated || 0), `${stats.alerts.escalated || 0} escalated`],
    ['Average time to decision', stats.avgMinutesToDecision === null ? '–' : `${stats.avgMinutesToDecision} min`, `${(stats.alerts.approved || 0) + (stats.alerts.blocked || 0)} decided`],
    ['Flags that were real', pct(q.precision), 'simulated data'],
    ['Incidents caught', pct(q.recall), q.incidents ? `${q.incidentsCaught} of ${q.incidents}` : 'simulated data'],
  ];
  return (
    <section className="stats" aria-label="Summary">
      {items.map(([label, value, note]) => (
        <div key={label} className="stat">
          <div className="stat-value">{value}</div>
          <div className="stat-label">{label}</div>
          <div className="stat-note">{note}</div>
        </div>
      ))}
    </section>
  );
}
