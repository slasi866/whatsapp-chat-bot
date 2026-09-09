import { h, mount } from '../core/dom.js';
import { endpoints } from '../core/api.js';
import { fmtDateTime, fmtNumber } from '../core/format.js';
import { pageHead } from '../components/shell.js';
import { avatar } from '../components/avatar.js';
import { dataTable } from '../components/table.js';
import { badge, button, searchInput, statTile } from '../components/ui.js';
import { emptyCard, emptyState, skeletonCards, skeletonTable } from '../components/feedback.js';
import { tenantPath } from '../core/router.js';

const COLUMNS = [
  { label: 'Company', wrap: true },
  { label: 'Paket' },
  { label: 'Kuota/bulan', align: 'right' },
  { label: 'WhatsApp' },
  { label: 'Status' },
  { label: 'Dibuat' },
  { label: '', actions: true },
];

export function skeleton() {
  return h('div', {}, pageHead('Daftar tenant', 'Memuat...'), skeletonCards(4), h('div', { style: { height: '16px' } }), skeletonTable(6, 5));
}

export async function render() {
  const { tenants } = await endpoints.listTenants();

  const newButton = h(
    'a',
    { class: 'btn btn--primary', href: '#/tenants/new' },
    h('span', { class: 'btn-label', text: '+ Tenant baru' }),
  );

  if (tenants.length === 0) {
    return h(
      'div',
      {},
      pageHead('Daftar tenant', 'Belum ada company yang dilayani.'),
      emptyCard({
        iconName: 'building',
        title: 'Belum ada tenant',
        message:
          'Buat tenant pertama, sambungkan nomor WhatsApp Business-nya, lalu isi knowledge base agar bot punya bahan menjawab.',
        action: newButton,
      }),
    );
  }

  const active = tenants.filter((tenant) => tenant.status === 'active').length;
  const connected = tenants.filter((tenant) => tenant.wa_phone_number_id).length;
  const quota = tenants.reduce((total, tenant) => total + Number(tenant.monthly_quota ?? 0), 0);

  const tableSlot = h('div', {});

  const draw = (query) => {
    const term = query.trim().toLowerCase();
    const visible = term
      ? tenants.filter(
          (tenant) =>
            tenant.name.toLowerCase().includes(term) || tenant.slug.toLowerCase().includes(term),
        )
      : tenants;

    if (visible.length === 0) {
      mount(
        tableSlot,
        h(
          'div',
          { class: 'card' },
          emptyState({
            iconName: 'search',
            title: 'Tidak ada yang cocok',
            message: `Tidak ada tenant dengan nama atau slug "${query.trim()}".`,
          }),
        ),
      );
      return;
    }

    mount(
      tableSlot,
      dataTable(COLUMNS, visible, (tenant) => [
        h(
          'div',
          { class: 'row' },
          avatar(tenant.name, tenant.id),
          h(
            'div',
            { class: 'truncate' },
            h('div', { class: 'strong truncate', text: tenant.name }),
            h('div', { class: 't-sm faint truncate', text: tenant.slug }),
          ),
        ),
        badge(tenant.plan),
        fmtNumber(tenant.monthly_quota),
        tenant.wa_phone_number_id
          ? badge('tersambung', 'success', true)
          : badge('belum diisi', 'warn', true),
        tenant.status === 'active' ? badge('aktif', 'success') : badge('suspend', 'danger'),
        h('span', { class: 't-sm muted', text: fmtDateTime(tenant.created_at) }),
        h(
          'a',
          { class: 'btn btn--sm', href: tenantPath(tenant.id, 'inbox') },
          h('span', { class: 'btn-label', text: 'Buka' }),
        ),
      ]),
    );
  };

  draw('');

  return h(
    'div',
    {},
    pageHead(
      'Daftar tenant',
      `${tenants.length} company terdaftar di platform ini.`,
      [newButton],
    ),
    h(
      'div',
      { class: 'grid cols', style: { marginBottom: '20px' } },
      statTile({ label: 'Total tenant', value: fmtNumber(tenants.length) }),
      statTile({ label: 'Aktif', value: fmtNumber(active), sub: `${tenants.length - active} suspend` }),
      statTile({
        label: 'WhatsApp tersambung',
        value: fmtNumber(connected),
        sub: `${tenants.length - connected} belum diisi`,
      }),
      statTile({ label: 'Total kuota/bulan', value: fmtNumber(quota), sub: 'gabungan semua paket' }),
    ),
    h(
      'div',
      { style: { maxWidth: '340px', marginBottom: '14px' } },
      searchInput({
        placeholder: 'Cari nama atau slug...',
        onInput: (event) => draw(event.target.value),
      }),
    ),
    tableSlot,
  );
}
