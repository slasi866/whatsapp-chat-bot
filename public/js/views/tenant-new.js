import { h } from '../core/dom.js';
import { endpoints } from '../core/api.js';
import { pageHead } from '../components/shell.js';
import {
  button,
  card,
  cardBody,
  cardHead,
  copyField,
  field,
  input,
  notice,
  select,
  setLoading,
  textarea,
} from '../components/ui.js';
import { infoDialog } from '../core/modal.js';
import { go, tenantPath } from '../core/router.js';
import { toast } from '../core/toast.js';

const PLANS = [
  { value: 'starter', label: 'starter - 1.000 pesan/bulan' },
  { value: 'growth', label: 'growth - 5.000 pesan/bulan' },
  { value: 'scale', label: 'scale - 25.000 pesan/bulan' },
];

const LANGUAGES = [
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'en', label: 'English' },
  { value: 'ms', label: 'Bahasa Melayu' },
  { value: 'jv', label: 'Basa Jawa' },
];

/** Turns a company name into a usable slug so the field is rarely typed. */
function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export async function render() {
  const fields = {
    name: input({ id: 'f-name', placeholder: 'Toko Sinar Jaya', required: true }),
    slug: input({ id: 'f-slug', placeholder: 'sinar-jaya', required: true, pattern: '[a-z0-9-]+' }),
    plan: select({ id: 'f-plan', value: 'growth', options: PLANS }),
    language: select({ id: 'f-lang', value: 'id', options: LANGUAGES }),
    phone: input({ id: 'f-phone', placeholder: '123456789012345' }),
    escalation: input({ id: 'f-esc', placeholder: '628123456789' }),
    token: input({ id: 'f-token', type: 'password', placeholder: 'EAAG...' }),
    persona: textarea({
      id: 'f-persona',
      rows: 5,
      placeholder:
        'Toko elektronik di Surabaya. Buka 09.00-17.00 WIB. Melayani pengiriman se-Jawa Timur. Garansi resmi 1 tahun.',
    }),
    greeting: input({ id: 'f-greeting', placeholder: 'Halo! Ada yang bisa kami bantu?' }),
  };

  // Slug follows the name until the user edits it directly.
  let slugTouched = false;
  fields.slug.addEventListener('input', () => {
    slugTouched = true;
  });
  fields.name.addEventListener('input', () => {
    if (!slugTouched) fields.slug.value = slugify(fields.name.value);
  });

  const errorSlot = h('div', {});
  const submit = button({ label: 'Buat tenant', variant: 'primary', type: 'submit' });

  const form = h(
    'form',
    {
      onSubmit: async (event) => {
        event.preventDefault();
        errorSlot.replaceChildren();
        setLoading(submit, true);

        try {
          const result = await endpoints.createTenant({
            name: fields.name.value,
            slug: fields.slug.value,
            plan: fields.plan.value,
            language: fields.language.value,
            wa_phone_number_id: fields.phone.value,
            escalation_number: fields.escalation.value,
            wa_access_token: fields.token.value,
            persona: fields.persona.value,
            greeting: fields.greeting.value,
          });

          toast('Tenant dibuat.', 'success');

          // The key is unrecoverable afterwards, so it gets a blocking dialog
          // rather than a panel the user can scroll past.
          await infoDialog({
            title: 'API key tenant',
            description:
              'Hanya ditampilkan sekali dan tidak bisa dilihat lagi. Simpan sekarang, lalu berikan ke client.',
            closeLabel: 'Sudah saya simpan',
            content: h(
              'div',
              { class: 'col', style: { gap: '14px' } },
              copyField(result.api_key),
              notice(
                'Key ini hanya bisa mengakses data tenant tersebut, jadi aman diberikan ke client.',
                'info',
              ),
            ),
          });

          go(tenantPath(result.tenant.id, 'kb'));
        } catch (error) {
          errorSlot.replaceChildren(notice(error.message, 'danger'));
        } finally {
          setLoading(submit, false);
        }
      },
    },
    card(
      cardHead('Identitas company'),
      cardBody(
        h(
          'div',
          { class: 'grid form' },
          field({ label: 'Nama company', id: 'f-name', control: fields.name }),
          field({
            label: 'Slug',
            id: 'f-slug',
            control: fields.slug,
            hint: 'Huruf kecil, angka, dan tanda hubung.',
          }),
          field({ label: 'Paket', id: 'f-plan', control: fields.plan }),
          field({ label: 'Bahasa bot', id: 'f-lang', control: fields.language }),
        ),
      ),
    ),
    h('div', { style: { height: '16px' } }),
    card(
      cardHead('Sambungan WhatsApp'),
      cardBody(
        h(
          'div',
          { class: 'col', style: { gap: '16px' } },
          notice(
            'Ambil kedua nilai ini dari Meta App Dashboard, bagian WhatsApp. Token dienkripsi sebelum disimpan dan tidak bisa dibaca kembali.',
            'info',
          ),
          h(
            'div',
            { class: 'grid form' },
            field({
              label: 'Phone number ID',
              id: 'f-phone',
              control: fields.phone,
              hint: 'Penentu tenant mana yang menerima pesan masuk.',
            }),
            field({
              label: 'Meta access token',
              id: 'f-token',
              control: fields.token,
            }),
            field({
              label: 'Nomor agent untuk eskalasi',
              id: 'f-esc',
              control: fields.escalation,
              hint: 'Dikirimi notifikasi saat bot menyerahkan percakapan.',
            }),
          ),
        ),
      ),
    ),
    h('div', { style: { height: '16px' } }),
    card(
      cardHead('Perilaku bot'),
      cardBody(
        h(
          'div',
          { class: 'col', style: { gap: '16px' } },
          field({
            label: 'Tentang bisnis (persona)',
            id: 'f-persona',
            control: fields.persona,
            hint: 'Konteks tetap yang selalu dibaca bot. Fakta yang berubah sebaiknya masuk knowledge base.',
          }),
          field({ label: 'Sapaan pertama', id: 'f-greeting', control: fields.greeting }),
        ),
      ),
    ),
    h('div', { class: 'row', style: { marginTop: '16px' } }, submit),
    errorSlot,
  );

  requestAnimationFrame(() => fields.name.focus());

  return h(
    'div',
    {},
    pageHead('Tenant baru', 'Company yang akan dilayani bot.', [
      h(
        'a',
        { class: 'btn btn--ghost', href: '#/tenants' },
        h('span', { class: 'btn-label', text: 'Batal' }),
      ),
    ]),
    h('div', { style: { maxWidth: '840px' } }, form),
  );
}
