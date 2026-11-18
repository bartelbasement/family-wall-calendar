import { API_URL } from './config.js?v=__V__';

const KEY_STORE = 'wall-key';

/** Reads ?key= from the URL once, saves it, and strips it from the address bar. */
export function getKey() {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get('key');
  if (fromUrl) {
    try { localStorage.setItem(KEY_STORE, fromUrl); } catch (e) { /* storage blocked */ }
    // &install=1 keeps the key in the address so "Add to Home Screen" captures it
    // (home-screen apps on iOS have their own storage, separate from Safari's).
    if (!url.searchParams.has('install')) {
      url.searchParams.delete('key');
      history.replaceState(null, '', url);
    }
    return fromUrl;
  }
  try { return localStorage.getItem(KEY_STORE); } catch (e) { return null; }
}

export async function apiGet(action, params = {}) {
  const key = getKey();
  if (!key) throw new Error('missing_key');
  const qs = new URLSearchParams({ ...params, action, key });
  const res = await fetch(`${API_URL}?${qs}`, { redirect: 'follow' });
  if (!res.ok) throw new Error(`http_${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.message || data.error || 'api_error');
  return data;
}

export async function apiPost(action, body = {}) {
  const key = getKey();
  if (!key) throw new Error('missing_key');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    // A caller-supplied requestId makes retries idempotent on the server.
    body: JSON.stringify({ ...body, action, key, requestId: body.requestId || crypto.randomUUID() }),
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.message || data.error || 'api_error');
  return data;
}
