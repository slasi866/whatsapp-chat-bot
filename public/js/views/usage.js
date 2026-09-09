import { h } from '../core/dom.js';
import { endpoints } from '../core/api.js';
import { store } from '../core/store.js';
import { fmtNumber } from '../core/format.js';
import { pageHead } from '../components/shell.js';
import { dataTable } from '../components/table.js';
import { badge, notice, statTile } from '../components/ui.js';
import { emptyCard, skeletonCards } from '../components/feedback.js';

const COLUMNS = [
  { label: 'Tanggal' },
  { label: 'Pesan', align: 'right' },
  { label: 'Token input', align: 'right' },
  { label: 'Token output', align: 'right' },
  { label: 'Token/pesan', align: 'right' },
];

export function skeleton() {
  return h('div', {}, pageHead('Pemakaian', 'Memuat...'), skeletonCards(4));
}

export async function render() {
  const usage = await endpoints.usage(store.tenantId);

  const used = Number(usage.this_month.messages ?? 0);
  const quota = Number(usage.monthly_quota ?? 0);
  const percent = quota ? (used / quota) * 100 : 0;
  const state = percent >= 100 ? 'over' : percent >= 80 ? 'warn' : 'ok';

  const totalTokens =
    Number(usage.this_month.input_tokens ?? 0) + Number(usage.this_month.output_tokens ?? 0);
  const perMessage = used ? Math.round(totalTokens / used) : 0;

  const quotaNotice =
    state === 'over'
      ? notice(
          'Kuota bulan ini sudah habis. Bot berhenti menjawab dan mengirim pesan cadangan sampai kuota dinaikkan atau bulan berganti.',
          'danger',
        )
      : state === 'warn'
        ? notice('Kuota bulan ini sudah terpakai di atas 80 persen.', 'warn')
        : null;

  return h(
    'div',
    {},
    pageHead('Pemakaian', `Paket ${usage.plan}. Kuota dihitung per bulan kalender UTC.`, [
      badge(usage.plan, 'brand'),
    ]),
    quotaNotice && h('div', { style: { marginBottom: '16px', maxWidth: '760px' } }, quotaNotice),
    h(
      'div',
      { class: 'grid cols' },
      statTile({
        label: 'Pesan bulan ini',
        value: fmtNumber(used),
        sub: `dari ${fmtNumber(quota)} · sisa ${fmtNumber(usage.remaining)}`,
        meter: { percent, state },
      }),
      statTile({ label: 'Token input', value: fmtNumber(usage.this_month.input_tokens) }),
      statTile({ label: 'Token output', value: fmtNumber(usage.this_month.output_tokens) }),
      statTile({
        label: 'Rata-rata token/pesan',
        value: fmtNumber(perMessage),
        sub: 'dasar perhitungan biaya per balasan',
      }),
    ),
    h('div', { class: 'section-title' }, h('h2', { text: 'Harian, 30 hari terakhir' })),
    usage.daily.length === 0
      ? emptyCard({
          iconName: 'chart',
          title: 'Belum ada pemakaian',
          message: 'Angka muncul setelah bot menjawab pesan pertama.',
        })
      : dataTable(COLUMNS, usage.daily, (day) => {
          const tokens = Number(day.input_tokens ?? 0) + Number(day.output_tokens ?? 0);
          return [
            h('span', { class: 'mono', text: day.day }),
            fmtNumber(day.messages),
            fmtNumber(day.input_tokens),
            fmtNumber(day.output_tokens),
            fmtNumber(day.messages ? Math.round(tokens / day.messages) : 0),
          ];
        }),
    h('p', {
      class: 'muted t-sm',
      style: { marginTop: '12px' },
      text: 'Token di sini adalah angka yang dilaporkan provider, bukan perkiraan, jadi bisa dipakai langsung untuk menghitung biaya per balasan.',
    }),
  );
}
