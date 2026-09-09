import { store } from './store.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Fired when the server rejects the key, so the shell can drop to login. */
const unauthorizedHandlers = new Set();

export function onUnauthorized(handler) {
  unauthorizedHandlers.add(handler);
}

async function request(method, path, body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${store.key}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Tidak bisa menghubungi server. Periksa koneksi.');
  }

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError(response.status, 'Respons server tidak bisa dibaca.');
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      for (const handler of unauthorizedHandlers) handler();
    }
    throw new ApiError(response.status, payload.error ?? `Permintaan gagal (${response.status})`);
  }
  return payload;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
};

// --- Endpoint wrappers ---------------------------------------------------
// Named so a view never builds a URL by hand.

export const endpoints = {
  me: () => api.get('/me'),

  listTenants: () => api.get('/tenants'),
  createTenant: (body) => api.post('/tenants', body),
  getTenant: (id) => api.get(`/tenants/${id}`),
  updateTenant: (id, body) => api.patch(`/tenants/${id}`, body),
  rotateKey: (id) => api.post(`/tenants/${id}/rotate-key`),
  deleteTenant: (id) => api.del(`/tenants/${id}`),

  listDocuments: (id) => api.get(`/tenants/${id}/documents`),
  createDocument: (id, body) => api.post(`/tenants/${id}/documents`, body),
  deleteDocument: (id, documentId) => api.del(`/tenants/${id}/documents/${documentId}`),
  search: (id, query) => api.post(`/tenants/${id}/search`, { query }),

  listConversations: (id, status) =>
    api.get(`/tenants/${id}/conversations${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  listMessages: (id, conversationId) =>
    api.get(`/tenants/${id}/conversations/${conversationId}/messages`),
  takeover: (id, conversationId) =>
    api.post(`/tenants/${id}/conversations/${conversationId}/takeover`),
  release: (id, conversationId) =>
    api.post(`/tenants/${id}/conversations/${conversationId}/release`),
  sendMessage: (id, conversationId, text) =>
    api.post(`/tenants/${id}/conversations/${conversationId}/send`, { text }),

  listLeads: (id) => api.get(`/tenants/${id}/leads`),
  usage: (id) => api.get(`/tenants/${id}/usage`),
};
