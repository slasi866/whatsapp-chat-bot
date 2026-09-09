import { h } from '../core/dom.js';
import { endpoints } from '../core/api.js';
import { isAdmin, store } from '../core/store.js';
import { go } from '../core/router.js';
import { toast } from '../core/toast.js';
import { confirmDialog, infoDialog } from '../core/modal.js';
import { pageHead } from '../components/shell.js';
import { skeletonTable } from '../components/feedback.js';
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

const LANGUAGES = [
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'en', label: 'English' },
  { value: 'ms', label: 'Bahasa Melayu' },
  { value: 'jv', label: 'Basa Jawa' },
];

const MODELS = [
  { value: '', label: 'Default platform' },
  { value: 'pesat-flash', label: 'pesat-flash' },
  { value: 'pesat-pro', label: 'pesat-pro' },
  { value: 'pesat-lite', label: 'pesat-lite' },
];

const PLANS = [
  { value: 'starter', label: 'starter' },
  { value: 'growth', label: 'growth' },
  { value: 'scale', label: 'scale' },
];

const STATUSES = [
  { value: 'active', label: 'aktif' },
  { value: 'suspended', label: 'suspend' },
];

export function skeleton() {
  return h('div', {}, pageHead('Pengaturan', 'Memuat...'), skeletonTable(6, 2));
}

export async function render() {
  const tenant = store.tenant;
  const admin = isAdmin();

  const fields = {
    name: input({ id: 's-name', value: tenant.name }),
    language: select({ id: 's-lang', value: tenant.language, options: LANGUAGES }),
    model: select({ id: 's-model', value: tenant.model ?? '', options: MODELS }),
    escalation: input({ id: 's-esc', value: tenant.escalation_number ?? '' }),
    persona: textarea({ id: 's-persona', value: tenant.persona ?? '', rows: 6 }),
    greeting: input({ id: 's-greeting', value: tenant.greeting ?? '' }),
    fallback: input({ id: 's-fallback', value: tenant.fallback_message ?? '' }),
    phone: input({ id: 's-phone', value: tenant.wa_phone_number_id ?? '' }),
    token: input({
      id: 's-token',
      type: 'password',
      placeholder: 'kosongkan bila tidak diubah',
    }),
  };

  const adminFields = admin
    ? {
        plan: select({ id: 's-plan', value: tenant.plan, options: PLANS }),
        quota: input({ id: 's-quota', type: 'number', value: tenant.monthly_quota, min: '0' }),
        status: select({ id: 's-status', value: tenant.status, options: STATUSES }),
      }
    : null;

  const errorSlot = h('div', {});
  const saveButton = button({ label: 'Simpan perubahan', variant: 'primary', type: 'submit' });

  const form = h(
    'form',
    {
      onSubmit: async (event) => {
        event.preventDefault();
        errorSlot.replaceChildren();
        setLoading(saveButton, true);

        const body = {
          name: fields.name.value,
          language: fields.language.value,
          model: fields.model.value,
          escalation_number: fields.escalation.value,
          persona: fields.persona.value,
          greeting: fields.greeting.value,
          fallback_message: fields.fallback.value,
          wa_phone_number_id: fields.phone.value,
        };
        if (fields.token.value) body.wa_access_token = fields.token.value;
        if (adminFields) {
          body.plan = adminFields.plan.value;
          body.monthly_quota = Number(adminFields.quota.value);
          body.status = adminFields.status.value;
        }

        try {
          const result = await endpoints.updateTenant(store.tenantId, body);
          store.tenant = result.tenant;
          fields.token.value = '';
          toast('Pengaturan disimpan.', 'success');
        } catch (error) {
          errorSlot.replaceChildren(notice(error.message, 'danger'));
        } finally {
          setLoading(saveButton, false);
        }
      },
    },
    h(
      'div',
      { class: 'col', style: { gap: '16px' } },
      card(
        cardHead('Perilaku bot'),
        cardBody(
          h(
            'div',
            { class: 'col', style: { gap: '16px' } },
            h(
              'div',
              { class: 'grid form' },
              field({ label: 'Nama company', id: 's-name', control: fields.name }),
              field({ label: 'Bahasa balasan', id: 's-lang', control: fields.language }),
              field({
                label: 'Model',
                id: 's-model',
                control: fields.model,
                hint: 'Kosongkan untuk mengikuti default platform.',
              }),
              field({
                label: 'Nomor agent untuk eskalasi',
                id: 's-esc',
                control: fields.escalation,
                hint: 'Dikirimi notifikasi saat bot menyerahkan percakapan.',
              }),
            ),
            field({
              label: 'Tentang bisnis (persona)',
              id: 's-persona',
              control: fields.persona,
              hint: 'Konteks tetap. Fakta yang sering berubah sebaiknya masuk knowledge base, bukan di sini.',
            }),
            field({ label: 'Sapaan pertama', id: 's-greeting', control: fields.greeting }),
            field({
              label: 'Pesan cadangan saat bot gagal',
              id: 's-fallback',
              control: fields.fallback,
              hint: 'Dipakai saat kuota habis atau terjadi kegagalan teknis.',
            }),
          ),
        ),
      ),
      card(
        cardHead('Sambungan WhatsApp'),
        cardBody(
          h(
            'div',
            { class: 'col', style: { gap: '16px' } },
            h(
              'div',
              { class: 'grid form' },
              field({
                label: 'Phone number ID',
                id: 's-phone',
                control: fields.phone,
                hint: 'Penentu tenant mana yang menerima pesan masuk.',
              }),
              field({
                label: 'Access token baru',
                id: 's-token',
                control: fields.token,
                hint: 'Token lama tidak bisa ditampilkan karena tersimpan terenkripsi.',
              }),
            ),
          ),
        ),
      ),
      adminFields &&
        card(
          cardHead('Komersial'),
          cardBody(
            h(
              'div',
              { class: 'col', style: { gap: '16px' } },
              notice('Bagian ini hanya terlihat dan bisa diubah oleh admin platform.', 'info'),
              h(
                'div',
                { class: 'grid form' },
                field({ label: 'Paket', id: 's-plan', control: adminFields.plan }),
                field({
                  label: 'Kuota pesan per bulan',
                  id: 's-quota',
                  control: adminFields.quota,
                }),
                field({
                  label: 'Status',
                  id: 's-status',
                  control: adminFields.status,
                  hint: 'Tenant suspend tidak dijawab bot sama sekali.',
                }),
              ),
            ),
          ),
        ),
      h('div', { class: 'row' }, saveButton),
      errorSlot,
    ),
  );

  // --- Admin-only destructive actions ------------------------------------

  const dangerCard = admin
    ? card(
        cardHead('Tindakan admin'),
        cardBody(
          h(
            'div',
            { class: 'col', style: { gap: '14px' } },
            h('p', {
              class: 'muted t-sm',
              text: 'Rotasi key mencabut key lama milik client seketika. Penghapusan tenant tidak bisa dibatalkan.',
            }),
            h(
              'div',
              { class: 'row wrap' },
              button({
                label: 'Rotasi API key',
                iconName: 'key',
                onClick: async () => {
                  const confirmed = await confirmDialog({
                    title: 'Rotasi API key?',
                    description:
                      'Key lama langsung tidak berlaku. Dashboard client akan meminta login lagi dengan key baru.',
                    confirmLabel: 'Rotasi sekarang',
                    danger: true,
                  });
                  if (!confirmed) return;
                  try {
                    const result = await endpoints.rotateKey(store.tenantId);
                    await infoDialog({
                      title: 'API key baru',
                      description: 'Hanya ditampilkan sekali. Simpan lalu kirimkan ke client.',
                      closeLabel: 'Sudah saya simpan',
                      content: copyField(result.api_key),
                    });
                  } catch (error) {
                    toast(error.message, 'error');
                  }
                },
              }),
              button({
                label: 'Hapus tenant',
                iconName: 'trash',
                variant: 'danger',
                onClick: async () => {
                  const confirmed = await confirmDialog({
                    title: `Hapus ${tenant.name}?`,
                    description:
                      'Seluruh percakapan, dokumen, vektor, lead, dan riwayat pemakaian tenant ini akan hilang permanen.',
                    confirmLabel: 'Hapus permanen',
                    danger: true,
                  });
                  if (!confirmed) return;
                  try {
                    await endpoints.deleteTenant(store.tenantId);
                    store.tenant = null;
                    store.tenantId = null;
                    toast('Tenant dihapus.', 'success');
                    go('#/tenants');
                  } catch (error) {
                    toast(error.message, 'error');
                  }
                },
              }),
            ),
          ),
        ),
      )
    : null;

  return h(
    'div',
    {},
    pageHead('Pengaturan', `${tenant.name} · ${tenant.slug}`),
    h(
      'div',
      { class: 'col', style: { gap: '16px', maxWidth: '860px' } },
      form,
      dangerCard,
    ),
  );
}
