// The access token lives only in memory. The refresh token is an httpOnly cookie the browser sends automatically.
// Set VITE_API_URL (e.g. https://api.example.com) when the API is on a different domain. Empty = same origin / dev proxy.
export const API_URL = import.meta.env.VITE_API_URL || '';
let accessToken = null;
export const getToken = () => accessToken;
export const setToken = (t) => { accessToken = t; };

let refreshing = null;
/**
 * Refresh tokens rotate, so two parallel refresh calls would make the server think a token was replayed.
 * Sharing one in-flight promise prevents that (also covers React StrictMode's double mount).
 */
export function refresh() {
  if (!refreshing) {
    refreshing = (async () => {
      const res = await fetch(`${API_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) { accessToken = null; return null; }
      const data = await res.json();
      accessToken = data.accessToken;
      return data.user;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

function send(path, { method = 'GET', body } = {}) {
  const isForm = body instanceof FormData;
  return fetch(`${API_URL}/api${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
}

export async function api(path, options) {
  let res = await send(path, options);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refresh()) res = await send(path, options);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
