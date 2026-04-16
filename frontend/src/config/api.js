export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function apiFetch(path, opts = {}) {
  const url = path.startsWith('/') ? `${API_URL}${path}` : path;
  const token = import.meta.env.VITE_APP_TOKEN;
  const tokenHeader = token ? { 'X-App-Token': token } : {};
  return fetch(url, {
    ...opts,
    headers: {
      ...tokenHeader,
      ...opts.headers,
    },
  });
}
