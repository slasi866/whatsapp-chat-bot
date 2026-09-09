import { byId, h, mount } from './core/dom.js';
import { endpoints, onUnauthorized } from './core/api.js';
import {
  forgetKey,
  isAdmin,
  loadStoredKey,
  persistKey,
  resetSession,
  store,
} from './core/store.js';
import { go, parseRoute, runTeardowns, startRouter, tenantPath } from './core/router.js';
import { toast } from './core/toast.js';
import { transition } from './core/motion.js';
import { buildShell } from './components/shell.js';
import { button } from './components/ui.js';
import { errorCard, skeletonTable } from './components/feedback.js';
import { renderLogin } from './views/login.js';

import * as tenantsView from './views/tenants.js';
import * as tenantNewView from './views/tenant-new.js';
import * as inboxView from './views/inbox.js';
import * as knowledgeView from './views/knowledge.js';
import * as leadsView from './views/leads.js';
import * as usageView from './views/usage.js';
import * as settingsView from './views/settings.js';

const VIEWS = {
  tenants: { module: tenantsView, title: 'Daftar tenant', adminOnly: true },
  'tenant-new': { module: tenantNewView, title: 'Tenant baru', adminOnly: true },
  inbox: { module: inboxView, title: 'Inbox' },
  kb: { module: knowledgeView, title: 'Knowledge base' },
  leads: { module: leadsView, title: 'Lead' },
  usage: { module: usageView, title: 'Pemakaian' },
  settings: { module: settingsView, title: 'Pengaturan' },
};

const root = byId('root');
let shell = null;

// --- Session -------------------------------------------------------------

function defaultRoute() {
  if (isAdmin()) return '#/tenants';
  return tenantPath(store.ownTenant.id, 'inbox');
}

async function signIn(key, remember) {
  store.key = key;
  let me;
  try {
    me = await endpoints.me();
  } catch (error) {
    store.key = null;
    throw error;
  }

  store.role = me.role;
  store.ownTenant = me.tenant;
  if (remember) persistKey(key);
  else forgetKey();

  showShell();
  if (parseRoute()) handleRoute();
  else go(defaultRoute());
}

function signOut(message = null) {
  runTeardowns();
  resetSession();
  shell = null;
  showLogin();
  if (message) toast(message, 'error');
}

function showLogin() {
  mount(root, renderLogin(signIn));
  document.title = 'Masuk · Pesat.ai Console';
}

function showShell() {
  shell = buildShell({ onLogout: () => signOut() });
  mount(root, shell.shell);
}

// A key revoked mid-session drops straight back to login.
onUnauthorized(() => {
  if (store.key) signOut('Key tidak berlaku lagi. Silakan masuk kembali.');
});

// --- Routing -------------------------------------------------------------

async function handleRoute() {
  if (!store.key || !shell) return;

  const route = parseRoute();
  if (!route) {
    go(defaultRoute());
    return;
  }

  const entry = VIEWS[route.name];
  if (!entry) {
    go(defaultRoute());
    return;
  }
  if (entry.adminOnly && !isAdmin()) {
    go(defaultRoute());
    return;
  }
  // A tenant key may only ever address its own tenant.
  if (!isAdmin() && (!route.tenantId || route.tenantId !== store.ownTenant.id)) {
    go(defaultRoute());
    return;
  }
  if (!entry.adminOnly && !route.tenantId) {
    go(defaultRoute());
    return;
  }

  runTeardowns();

  if (route.tenantId !== store.tenantId) {
    store.tenantId = route.tenantId;
    store.tenant = null;
    store.activeConversationId = null;
    store.conversations = [];
  }

  const { content, setNav } = shell;
  content.classList.toggle('flush', Boolean(entry.module.flush));

  const skeleton = entry.module.skeleton ? entry.module.skeleton() : skeletonTable(6, 4);
  mount(content, skeleton);
  setNav(route);

  try {
    if (route.tenantId && !store.tenant) {
      const data = await endpoints.getTenant(route.tenantId);
      store.tenant = data.tenant;
      // The sidebar shows the tenant name, which only just became known.
      setNav(route);
    }

    document.title = store.tenant
      ? `${entry.title} · ${store.tenant.name}`
      : `${entry.title} · Pesat.ai Console`;

    const node = await entry.module.render(route);
    // Cross-fade the skeleton out and the real view in where supported.
    transition(() => mount(content, node));
  } catch (error) {
    mount(
      content,
      errorCard(
        error.message,
        button({ label: 'Coba lagi', iconName: 'refresh', onClick: () => handleRoute() }),
      ),
    );
  }
}

// --- Boot ----------------------------------------------------------------

startRouter(handleRoute);

(async function boot() {
  const stored = loadStoredKey();
  if (!stored) {
    showLogin();
    return;
  }

  // Hold the frame with a neutral shell until the stored key is validated.
  mount(root, h('div', { class: 'content' }, skeletonTable(5, 4)));

  try {
    await signIn(stored, true);
  } catch {
    forgetKey();
    store.key = null;
    showLogin();
  }
})();

