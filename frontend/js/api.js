// Thin fetch wrapper around the Checkpoint backend API.
// Automatically attaches the signed-in user's session token, if any —
// see auth.js for getToken(). Requests work fine with no token; the
// backend simply rejects the ones that require an account (401).
const API_BASE = '/api';

function authHeaders() {
  const token = (typeof getToken === 'function') ? getToken() : null;
  return token ? { Authorization: 'Bearer ' + token } : {};
}

async function requestApi(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(API_BASE + path, {
      ...options,
      signal: controller.signal,
      headers: { ...authHeaders(), ...(options.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw {
        ...data,
        status: res.status,
        error: data.error || `Request failed (${res.status})`,
        message: data.message || data.error || `Request failed (${res.status})`,
      };
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw { error: 'The request took too long. Check your connection and try again.', message: 'The request timed out.' };
    }
    if (error instanceof TypeError) {
      throw { error: 'Unable to reach Checkpoint. Please try again.', message: 'Network request failed.' };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function apiGet(path) {
  return requestApi(path);
}

async function apiPost(path, body) {
  return requestApi(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

async function apiPatch(path, body) {
  return requestApi(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}


async function apiDelete(path) {
  return requestApi(path, {
    method: 'DELETE',
    headers: {},
  });
}
