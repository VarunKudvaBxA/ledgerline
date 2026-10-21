import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL, api, getToken } from '../api.js';
import { useAuth } from '../auth.jsx';
import AlertQueue from './AlertQueue.jsx';
import AuditTrail from './AuditTrail.jsx';
import LiveFeed from './LiveFeed.jsx';
import SimulatorControls from './SimulatorControls.jsx';
import Stats from './Stats.jsx';

const FEED_SIZE = 40;

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('queue');
  const [feed, setFeed] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [connected, setConnected] = useState(false);

  const loadStats = useCallback(() => api('/stats').then(setStats).catch(() => {}), []);

  useEffect(() => {
    api('/alerts').then(setAlerts);
    api('/transactions?limit=25').then((rows) => setFeed(rows.map((r) => r)));
    loadStats();
    const timer = setInterval(loadStats, 5000);

    const socket = io(API_URL || undefined, { auth: { token: getToken() } });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('txn:scored', (t) => setFeed((f) => [t, ...f].slice(0, FEED_SIZE)));
    socket.on('alert:new', (a) => setAlerts((list) => (list.some((x) => x._id === a._id) ? list : [a, ...list])));
    socket.on('alert:updated', (a) =>
      // Open and escalated alerts stay in the queue; anything closed leaves it.
      setAlerts((list) => (['open', 'escalated'].includes(a.status) ? list.map((x) => (x._id === a._id ? a : x)) : list.filter((x) => x._id !== a._id)))
    );
    return () => { clearInterval(timer); socket.disconnect(); };
  }, [loadStats]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">Ledgerline</div>
        <span className={connected ? 'live on' : 'live'}>{connected ? 'Live' : 'Reconnecting…'}</span>
        <div className="spacer" />
        {user.role === 'admin' && <SimulatorControls onChange={loadStats} />}
        <span className="who">{user.email}{user.role === 'admin' ? ' (admin)' : ''}</span>
        <button className="textlink" onClick={logout}>Sign out</button>
      </header>

      <Stats stats={stats} />

      <nav className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'queue'} onClick={() => setTab('queue')}>Review queue <span className="count">{alerts.length}</span></button>
        {user.role === 'admin' && <button role="tab" aria-selected={tab === 'audit'} onClick={() => setTab('audit')}>Audit trail</button>}
      </nav>

      {tab === 'queue' ? (
        <div className="split">
          <AlertQueue alerts={alerts} user={user} />
          <LiveFeed feed={feed} />
        </div>
      ) : (
        <AuditTrail />
      )}
    </div>
  );
}
