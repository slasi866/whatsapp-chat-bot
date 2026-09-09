/**
 * Hash router.
 *
 * The hash is used rather than the path so that unmatched URLs still reach the
 * Worker. A path-based router would need an SPA fallback on the asset config,
 * which would swallow /api and /webhook.
 *
 * Shapes: #/tenants, #/tenants/new, #/t/<tenantId>/<view>
 */

let handler = () => {};
/** Cleanups registered by the view currently on screen, run before the next. */
let teardowns = [];

export function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);

  if (parts[0] === 't' && parts[1]) {
    return { name: parts[2] ?? 'inbox', tenantId: parts[1] };
  }
  if (parts[0] === 'tenants') {
    return { name: parts[1] === 'new' ? 'tenant-new' : 'tenants', tenantId: null };
  }
  return null;
}

export function tenantPath(tenantId, view) {
  return `#/t/${tenantId}/${view}`;
}

export function go(hash) {
  if (location.hash === hash) handler();
  else location.hash = hash;
}

/** Views call this to register polling intervals and listeners to unwind. */
export function onTeardown(fn) {
  teardowns.push(fn);
}

export function runTeardowns() {
  for (const fn of teardowns) {
    try {
      fn();
    } catch {
      /* A failing cleanup must not block navigation. */
    }
  }
  teardowns = [];
}

/** Interval that unregisters itself when the view is replaced. */
export function poll(fn, intervalMs) {
  const id = setInterval(fn, intervalMs);
  onTeardown(() => clearInterval(id));
  return id;
}

export function startRouter(onRoute) {
  handler = onRoute;
  window.addEventListener('hashchange', () => handler());
}
