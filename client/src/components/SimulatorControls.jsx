import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function SimulatorControls({ onChange }) {
  const [sim, setSim] = useState({ running: false, ratePerSec: 2 });
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/simulator').then(setSim); }, []);

  async function toggle() {
    setBusy(true);
    try {
      setSim(await api(sim.running ? '/simulator/stop' : '/simulator/start', { method: 'POST', body: { ratePerSec: Number(sim.ratePerSec) } }));
      onChange?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sim">
      <label>Per second
        <select value={sim.ratePerSec} disabled={sim.running} onChange={(e) => setSim({ ...sim, ratePerSec: e.target.value })}>
          {[1, 2, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <button className={sim.running ? 'btn danger' : 'btn primary'} disabled={busy} onClick={toggle}>
        {sim.running ? 'Stop simulator' : 'Start simulator'}
      </button>
    </div>
  );
}
