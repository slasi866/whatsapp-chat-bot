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

/** Builds a ?limit=&offset= suffix, omitting it entirely when unpaged. */
function pageQuery({ limit, offset } = {}, extra = '') {
  const parts = [];
  if (extra) parts.push(extra);
  if (limit) parts.push(`limit=${limit}`);
  if (offset) parts.push(`offset=${offset}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export const endpoints = {
  me: () => api.get('/me'),

  diagnoseLlm: (model) => api.get(`/diagnostics/llm${model ? `?model=${encodeURIComponent(model)}` : ''}`),

  listTenants: (paging) => api.get(`/tenants${pageQuery(paging)}`),
  createTenant: (body) => api.post('/tenants', body),
  getTenant: (id) => api.get(`/tenants/${id}`),
  updateTenant: (id, body) => api.patch(`/tenants/${id}`, body),
  rotateKey: (id) => api.post(`/tenants/${id}/rotate-key`),
  deleteTenant: (id) => api.del(`/tenants/${id}`),

  listDocuments: (id) => api.get(`/tenants/${id}/documents`),
  getDocument: (id, documentId) => api.get(`/tenants/${id}/documents/${documentId}`),
  createDocument: (id, body) => api.post(`/tenants/${id}/documents`, body),
  deleteDocument: (id, documentId) => api.del(`/tenants/${id}/documents/${documentId}`),
  search: (id, query) => api.post(`/tenants/${id}/search`, { query }),

  listConversations: (id, status, paging) =>
    api.get(
      `/tenants/${id}/conversations${pageQuery(paging, status ? `status=${encodeURIComponent(status)}` : '')}`,
    ),
  listMessages: (id, conversationId, paging) =>
    api.get(`/tenants/${id}/conversations/${conversationId}/messages${pageQuery(paging)}`),
  takeover: (id, conversationId) =>
    api.post(`/tenants/${id}/conversations/${conversationId}/takeover`),
  release: (id, conversationId) =>
    api.post(`/tenants/${id}/conversations/${conversationId}/release`),
  sendMessage: (id, conversationId, text) =>
    api.post(`/tenants/${id}/conversations/${conversationId}/send`, { text }),

  listLeads: (id, paging) => api.get(`/tenants/${id}/leads${pageQuery(paging)}`),
  usage: (id) => api.get(`/tenants/${id}/usage`),
};
