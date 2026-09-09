import { h } from '../core/dom.js';
import { icon } from './icon.js';
import { avatar } from './avatar.js';
import { button, badge } from './ui.js';
import { isAdmin, store } from '../core/store.js';
import { tenantPath } from '../core/router.js';

const TENANT_NAV = [
  { view: 'inbox', label: 'Inbox', iconName: 'inbox' },
  { view: 'kb', label: 'Knowledge base', iconName: 'book' },
  { view: 'leads', label: 'Lead', iconName: 'target' },
  { view: 'usage', label: 'Pemakaian', iconName: 'chart' },
  { view: 'settings', label: 'Pengaturan', iconName: 'settings' },
];

function navItem({ href, label, iconName, current }) {
  return h(
    'a',
    { class: 'nav-item', href, 'aria-current': current ? 'page' : null },
    icon(iconName),
    h('span', { class: 'truncate', text: label }),
  );
}

/**
 * Builds the persistent application frame once. Views only ever replace the
 * content column, so the sidebar keeps its scroll position across navigation.
 */
export function buildShell({ onLogout }) {
  const sidebar = h('nav', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Navigasi utama' });
  const content = h('div', { class: 'content', id: 'content' });
  let overlay = null;

  const closeDrawer = () => {
    sidebar.classList.remove('open');
    overlay?.remove();
    overlay = null;
  };

  const menuButton = button({
    iconName: 'menu',
    variant: 'ghost',
    title: 'Buka navigasi',
    onClick: () => {
      const opening = !sidebar.classList.contains('open');
      if (!opening) {
        closeDrawer();
        return;
      }
      sidebar.classList.add('open');
      overlay = h('div', { class: 'overlay', onClick: closeDrawer });
      document.body.appendChild(overlay);
    },
  });
  menuButton.classList.add('menu-btn');

  const topbar = h(
    'header',
    { class: 'topbar' },
    menuButton,
    h(
      'div',
      { class: 'logo' },
      h('span', { class: 'logo-mark', text: 'P' }),
      h('span', { class: 'logo-text', text: 'Pesat.ai Console' }),
    ),
    h(
      'div',
      { class: 'row push' },
      badge(isAdmin() ? 'Admin platform' : 'Tenant', isAdmin() ? 'brand' : null),
      button({ label: 'Keluar', iconName: 'logout', variant: 'ghost', onClick: onLogout }),
    ),
  );

  const shell = h('div', { class: 'shell' }, topbar, sidebar, content);

  /** Redraws navigation for the current route. */
  function setNav(route) {
    const groups = [];

    if (isAdmin()) {
      groups.push(
        h(
          'div',
          { class: 'nav-group' },
          h('div', { class: 'nav-label', text: 'Platform' }),
          navItem({
            href: '#/tenants',
            label: 'Daftar tenant',
            iconName: 'building',
            current: route.name === 'tenants' || route.name === 'tenant-new',
          }),
        ),
      );
    }

    if (route.tenantId && store.tenant) {
      groups.push(
        h(
          'div',
          { class: 'nav-group' },
          h('div', { class: 'nav-label', text: 'Company' }),
          h(
            'div',
            { class: 'nav-tenant' },
            avatar(store.tenant.name, store.tenant.id, true),
            h(
              'div',
              { class: 'truncate' },
              h('div', { class: 'truncate strong t-sm', text: store.tenant.name }),
              h('div', { class: 'truncate t-xs faint', text: store.tenant.slug }),
            ),
          ),
          TENANT_NAV.map((item) =>
            navItem({
              href: tenantPath(route.tenantId, item.view),
              label: item.label,
              iconName: item.iconName,
              current: route.name === item.view,
            }),
          ),
        ),
      );
    }

    sidebar.replaceChildren(...groups);
    closeDrawer();
  }

  return { shell, content, setNav, closeDrawer };
}

/** Standard page header with a title, optional subtitle, and action buttons. */
export function pageHead(title, subtitle = null, actions = []) {
  return h(
    'div',
    { class: 'page-head' },
    h('div', {}, h('h1', { text: title }), subtitle && h('p', { text: subtitle })),
    actions.length ? h('div', { class: 'actions' }, actions) : null,
  );
}
