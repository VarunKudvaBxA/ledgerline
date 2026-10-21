export default function LiveFeed({ feed }) {
  return (
    <section className="panel feed" aria-label="Live transactions">
      <h2>Live transactions</h2>
      {feed.length === 0 ? (
        <p className="empty">Waiting for transactions.</p>
      ) : (
        <ul>
          {feed.map((t) => (
            <li key={t._id} className={t.flagged ? 'flagged' : ''}>
              <span className="f-score">{t.score}</span>
              <span className="f-main">{t.merchant}<small>{t.accountId} · {t.country}</small></span>
              <span className="f-amt">{t.amount.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
