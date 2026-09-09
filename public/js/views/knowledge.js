import { h, mount } from '../core/dom.js';
import { endpoints } from '../core/api.js';
import { store } from '../core/store.js';
import { toast } from '../core/toast.js';
import { confirmDialog } from '../core/modal.js';
import { pageHead } from '../components/shell.js';
import { dataTable } from '../components/table.js';
import { emptyState, skeletonTable } from '../components/feedback.js';
import { fmtDateTime, fmtNumber } from '../core/format.js';
import {
  badge,
  button,
  card,
  cardBody,
  cardHead,
  field,
  input,
  notice,
  setLoading,
  textarea,
} from '../components/ui.js';

const COLUMNS = [
  { label: 'Judul', wrap: true },
  { label: 'Chunk', align: 'right' },
  { label: 'Ditambahkan' },
  { label: '', actions: true },
];

export function skeleton() {
  return h('div', {}, pageHead('Knowledge base', 'Memuat...'), skeletonTable(5, 4));
}

export async function render() {
  const tenantId = store.tenantId;
  const { documents } = await endpoints.listDocuments(tenantId);

  // --- Add document ------------------------------------------------------

  const titleInput = input({ id: 'd-title', placeholder: 'Daftar Harga 2026', required: true });
  const contentInput = textarea({
    id: 'd-content',
    rows: 9,
    required: true,
    placeholder:
      'Tempel teks harga, FAQ, kebijakan pengembalian, jam operasional, area pengiriman...',
  });
  const addError = h('div', {});
  const addButton = button({ label: 'Simpan dan indeks', variant: 'primary', type: 'submit' });

  const counter = h('span', { class: 'hint', text: '0 karakter' });
  contentInput.addEventListener('input', () => {
    counter.textContent = `${fmtNumber(contentInput.value.length)} karakter`;
  });

  const addForm = h(
    'form',
    {
      onSubmit: async (event) => {
        event.preventDefault();
        addError.replaceChildren();
        setLoading(addButton, true);
        try {
          const result = await endpoints.createDocument(tenantId, {
            title: titleInput.value,
            content: contentInput.value,
          });
          toast(
            result.deduplicated
              ? 'Dokumen identik sudah ada, tidak diindeks ulang.'
              : `Terindeks menjadi ${result.chunkCount} chunk.`,
            'success',
          );

          // The index is eventually consistent, so say so instead of letting
          // the client test retrieval, see nothing, and assume it failed.
          if (result.searchable_after_seconds) {
            addError.replaceChildren(
              notice(
                `Dokumen tersimpan. Butuh sekitar ${result.searchable_after_seconds} detik sebelum bisa ditemukan pencarian, jadi tes retrieval yang dijalankan sekarang mungkin masih kosong.`,
                'info',
              ),
            );
          }

          titleInput.value = '';
          contentInput.value = '';
          counter.textContent = '0 karakter';
          titleInput.focus();

          // Refresh the table in place rather than reloading the page.
          const refreshed = await endpoints.listDocuments(tenantId);
          drawTable(refreshed.documents);
          countHeading.textContent = `${refreshed.documents.length} dokumen terindeks`;
          setLoading(addButton, false);
        } catch (error) {
          addError.replaceChildren(notice(error.message, 'danger'));
          setLoading(addButton, false);
        }
      },
    },
    cardBody(
      h(
        'div',
        { class: 'col', style: { gap: '16px' } },
        field({ label: 'Judul', id: 'd-title', control: titleInput }),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'd-content', text: 'Isi dokumen' }),
          contentInput,
          h(
            'div',
            { class: 'row' },
            h('span', {
              class: 'hint',
              text: 'Teks biasa. PDF dan DOCX harus diubah ke teks lebih dulu.',
            }),
            h('span', { class: 'push' }, counter),
          ),
        ),
        h('div', { class: 'row' }, addButton),
        addError,
      ),
    ),
  );

  // --- Retrieval preview -------------------------------------------------

  const queryInput = input({ id: 'q', placeholder: 'berapa ongkir ke Malang?' });
  const resultSlot = h('div', {});
  const searchButton = button({ label: 'Cari', iconName: 'search', onClick: () => runSearch() });

  async function runSearch() {
    const query = queryInput.value.trim();
    if (!query) return;
    setLoading(searchButton, true);
    mount(resultSlot, h('div', { class: 'skeleton', style: { height: '72px', marginTop: '14px' } }));

    try {
      const { chunks, indexing } = await endpoints.search(tenantId, query);
      if (chunks.length === 0) {
        mount(
          resultSlot,
          h(
            'div',
            { style: { marginTop: '14px' } },
            indexing
              ? notice(
                  'Dokumen terbaru belum selesai diindeks, jadi belum bisa ditemukan. Tunggu sekitar satu menit lalu coba lagi. Ini bukan tanda unggahannya gagal.',
                  'info',
                )
              : notice(
                  'Tidak ada passage yang cocok. Untuk pertanyaan ini bot akan mengaku tidak tahu dan menawarkan agent.',
                  'warn',
                ),
          ),
        );
        return;
      }
      mount(
        resultSlot,
        h(
          'div',
          { class: 'col', style: { gap: '10px', marginTop: '14px' } },
          chunks.map((chunk, index) =>
            h(
              'div',
              { class: 'passage', style: { '--i': index } },
              h(
                'div',
                { class: 'passage-head' },
                h('span', { class: 'strong t-sm', text: chunk.title }),
                h('span', { class: 'push' }, badge(`skor ${chunk.score.toFixed(3)}`, 'brand')),
              ),
              h('div', { class: 'passage-text', text: chunk.text }),
            ),
          ),
        ),
      );
    } catch (error) {
      mount(resultSlot, h('div', { style: { marginTop: '14px' } }, notice(error.message, 'danger')));
    } finally {
      setLoading(searchButton, false);
    }
  }

  queryInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch();
    }
  });

  // --- Document table ----------------------------------------------------

  const tableSlot = h('div', {});
  const countHeading = h('h2', { text: `${documents.length} dokumen terindeks` });

  function drawTable(rows) {
    if (rows.length === 0) {
      mount(
        tableSlot,
        h(
          'div',
          { class: 'card' },
          emptyState({
            iconName: 'book',
            title: 'Knowledge base masih kosong',
            message:
              'Tanpa dokumen, bot tidak punya bahan menjawab dan akan selalu mengaku tidak tahu. Mulai dari daftar harga dan FAQ.',
          }),
        ),
      );
      return;
    }

    mount(
      tableSlot,
      dataTable(COLUMNS, rows, (document_) => [
        h('span', { class: 'strong', text: document_.title }),
        fmtNumber(document_.chunk_count),
        h('span', { class: 't-sm muted', text: fmtDateTime(document_.created_at) }),
        button({
          iconName: 'trash',
          size: 'sm',
          variant: 'danger',
          title: 'Hapus dokumen',
          onClick: async () => {
            const confirmed = await confirmDialog({
              title: 'Hapus dokumen?',
              description: `"${document_.title}" akan dihapus beserta ${document_.chunk_count} chunk dan vektornya. Bot tidak akan bisa menjawab dari dokumen ini lagi.`,
              confirmLabel: 'Hapus',
              danger: true,
            });
            if (!confirmed) return;
            try {
              await endpoints.deleteDocument(tenantId, document_.id);
              toast('Dokumen dihapus.', 'success');
              const remaining = rows.filter((item) => item.id !== document_.id);
              drawTable(remaining);
              countHeading.textContent = `${remaining.length} dokumen terindeks`;
            } catch (error) {
              toast(error.message, 'error');
            }
          },
        }),
      ]),
    );
  }

  drawTable(documents);

  return h(
    'div',
    {},
    pageHead(
      'Knowledge base',
      'Sumber jawaban bot. Bot dilarang menjawab di luar isi dokumen ini.',
    ),
    h(
      'div',
      { class: 'col', style: { gap: '16px', maxWidth: '860px' } },
      card(cardHead('Tambah dokumen'), addForm),
      card(
        cardHead('Tes retrieval'),
        cardBody(
          h(
            'div',
            { class: 'col', style: { gap: '10px' } },
            h('p', {
              class: 'muted t-sm',
              text: 'Lihat passage yang akan dibaca bot untuk sebuah pertanyaan, sebelum customer menanyakannya.',
            }),
            h('div', { class: 'row' }, h('div', { style: { flex: '1' } }, queryInput), searchButton),
            resultSlot,
          ),
        ),
      ),
    ),
    h('div', { class: 'section-title' }, countHeading),
    tableSlot,
  );
}
