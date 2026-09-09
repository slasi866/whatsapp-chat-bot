/**
 * Session and view state. Deliberately a plain object rather than a reactive
 * store: the app re-renders a whole view on navigation, so there is nothing
 * for fine-grained reactivity to buy here.
 */

const STORAGE_KEY = 'pesat.apiKey';

export const store = {
  key: null,
  role: null,
  /** The tenant behind the key when a tenant key is in use, else null. */
  ownTenant: null,
  /** Tenant currently being viewed, which for an admin can be any tenant. */
  tenantId: null,
  tenant: null,
  /** Inbox working state, kept across polls. */
  conversations: [],
  conversationFilter: '',
  conversationQuery: '',
  activeConversationId: null,
};

export function isAdmin() {
  return store.role === 'admin';
}

export function loadStoredKey() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing can throw on access rather than return null.
    return null;
  }
}

export function persistKey(key) {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* Session continues without being remembered. */
  }
}

export function forgetKey() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Nothing to clean up. */
  }
}

export function resetSession() {
  store.key = null;
  store.role = null;
  store.ownTenant = null;
  store.tenantId = null;
  store.tenant = null;
  store.conversations = [];
  store.activeConversationId = null;
  forgetKey();
}
