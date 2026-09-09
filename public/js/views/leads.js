import { h, mount } from '../core/dom.js';
import { endpoints } from '../core/api.js';
import { store } from '../core/store.js';
import { fmtDateTime } from '../core/format.js';
import { pageHead } from '../components/shell.js';
import { toast } from '../core/toast.js';
import { dataTable } from '../components/table.js';
import { avatar } from '../components/avatar.js';
import { button, searchInput, setLoading } from '../components/ui.js';
import { emptyCard, emptyState, skeletonTable } from '../components/feedback.js';

const COLUMNS = [
  { label: 'Nama' },
  { label: 'WhatsApp' },
  { label: 'Email' },
  { label: 'Minat', wrap: true },
  { label: 'Catatan', wrap: true },
  { label: 'Waktu' },
];

export function skeleton() {
  return h('div', {}, pageHead('Lead', 'Memuat...'), skeletonTable(6, 5));
}

const PAGE_SIZE = 50;

export async function render() {
  const first = await endpoints.listLeads(store.tenantId, { limit: PAGE_SIZE });
  const leads = first.leads;
  let nextOffset = first.next_offset;
  let hasMore = first.has_more;

  if (leads.length === 0) {
    return h(
      'div',
      {},
      pageHead('Lead', 'Kontak yang dikumpulkan bot dari percakapan.'),
      emptyCard({
        iconName: 'target',
        title: 'Belum ada lead',
        message:
          'Bot menyimpan lead begitu customer menyebut namanya bersama kontak atau minat pada produk tertentu.',
      }),
    );
  }

  const tableSlot = h('div', {});

  const draw = (query) => {
    const term = query.trim().toLowerCase();
    const visible = term
      ? leads.filter((lead) =>
          [lead.name, lead.phone, lead.email, lead.interest]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term)),
        )
      : leads;

    if (visible.length === 0) {
      mount(
        tableSlot,
        h(
          'div',
          { class: 'card' },
          emptyState({ iconName: 'search', title: 'Tidak ada lead yang cocok' }),
        ),
      );
      return;
    }

    mount(
      tableSlot,
      dataTable(COLUMNS, visible, (lead) => [
        h(
          'div',
          { class: 'row' },
          avatar(lead.name || lead.phone, lead.phone, true),
          h('span', { class: 'strong', text: lead.name || '-' }),
        ),
        h('span', { class: 'mono', text: lead.phone ?? '-' }),
        lead.email ? h('a', { href: `mailto:${lead.email}`, text: lead.email }) : '-',
        lead.interest || '-',
        h('span', { class: 'muted', text: lead.notes || '-' }),
        h('span', { class: 't-sm muted', text: fmtDateTime(lead.created_at) }),
      ]),
    );
  };

  let filter = '';
  draw('');

  const heading = h('p', { text: `${leads.length} lead terkumpul dari percakapan bot.` });

  const moreButton = button({
    label: 'Muat lebih banyak',
    variant: 'ghost',
    onClick: async () => {
      setLoading(moreButton, true);
      try {
        const next = await endpoints.listLeads(store.tenantId, {
          limit: PAGE_SIZE,
          offset: nextOffset,
        });
        leads.push(...next.leads);
        nextOffset = next.next_offset;
        hasMore = next.has_more;
        heading.textContent = `${leads.length} lead dimuat.`;
        draw(filter);
        if (!hasMore) moreButton.remove();
      } catch (error) {
        toast(error.message, 'error');
      } finally {
        setLoading(moreButton, false);
      }
    },
  });

  return h(
    'div',
    {},
    h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: 'Lead' }), heading)),
    h(
      'div',
      { style: { maxWidth: '340px', marginBottom: '14px' } },
      searchInput({
        placeholder: 'Cari nama, nomor, email...',
        onInput: (event) => {
          filter = event.target.value;
          draw(filter);
        },
      }),
    ),
    tableSlot,
    hasMore ? h('div', { style: { marginTop: '14px' } }, moreButton) : null,
  );
}
