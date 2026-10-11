import { useAuth } from './auth.jsx';
import Dashboard from './components/Dashboard.jsx';
import Login from './components/Login.jsx';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash">Loading…</div>;
  return user ? <Dashboard /> : <Login />;
}
