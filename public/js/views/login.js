import { h } from '../core/dom.js';
import { icon } from '../components/icon.js';
import {
  button,
  card,
  cardBody,
  checkbox,
  field,
  input,
  setLoading,
} from '../components/ui.js';

const POINTS = [
  {
    iconName: 'bot',
    title: 'Jawab otomatis dari knowledge base',
    body: 'Bot hanya menjawab dari dokumen company, bukan mengarang harga.',
  },
  {
    iconName: 'user',
    title: 'Ambil alih kapan saja',
    body: 'Agent bisa masuk ke percakapan dan bot langsung diam.',
  },
  {
    iconName: 'shield',
    title: 'Terpisah per company',
    body: 'Data dan knowledge base tiap client tidak pernah tercampur.',
  },
];

/**
 * Login screen. The API key is the only credential the backend understands,
 * so the form is a single field; the left panel exists to make a demo to a
 * prospective client look like a product rather than an internal tool.
 *
 * @param {(key: string, remember: boolean) => Promise<void>} onSubmit
 */
export function renderLogin(onSubmit) {
  const keyInput = input({
    id: 'api-key',
    type: 'password',
    placeholder: 'pk_... atau key admin',
    required: true,
    autocomplete: 'current-password',
  });
  const remember = checkbox({ id: 'remember', label: 'Ingat di browser ini', checked: true });
  const errorSlot = h('div', {});

  const submit = button({
    label: 'Masuk',
    variant: 'primary',
    type: 'submit',
    block: true,
  });

  const form = h(
    'form',
    {
      class: 'col',
      style: { gap: '16px' },
      onSubmit: async (event) => {
        event.preventDefault();
        errorSlot.replaceChildren();

        const key = keyInput.value.trim();
        if (!key) return;

        setLoading(submit, true);
        try {
          await onSubmit(key, remember.querySelector('input').checked);
        } catch (error) {
          errorSlot.replaceChildren(
            h(
              'div',
              { class: 'notice notice--danger', role: 'alert' },
              icon('alert'),
              h('div', { text: error.message }),
            ),
          );
          keyInput.focus();
          keyInput.select();
        } finally {
          setLoading(submit, false);
        }
      },
    },
    field({
      label: 'API key',
      id: 'api-key',
      control: keyInput,
      hint: 'Key admin membuka semua tenant. Key tenant hanya membuka datanya sendiri.',
    }),
    remember,
    submit,
    errorSlot,
  );

  const pitch = h(
    'section',
    { class: 'login-pitch' },
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'logo-mark', text: 'P' }),
      h('span', { class: 'strong', text: 'Pesat.ai' }),
    ),
    h(
      'div',
      { class: 'col', style: { gap: '12px' } },
      h('h1', { text: 'Chatbot WhatsApp untuk company Anda' }),
      h('p', {
        class: 'lede',
        text: 'Satu console untuk mengelola bot, knowledge base, dan percakapan customer.',
      }),
    ),
    h(
      'ul',
      { class: 'login-points' },
      POINTS.map((point, index) =>
        h(
          'li',
          { style: { '--i': index } },
          icon(point.iconName),
          h(
            'div',
            {},
            h('div', { class: 'strong', text: point.title }),
            h('div', { class: 't-sm', style: { opacity: '0.85' }, text: point.body }),
          ),
        ),
      ),
    ),
  );

  const node = h(
    'div',
    { class: 'login' },
    pitch,
    h(
      'section',
      { class: 'login-form-side' },
      h(
        'div',
        { class: 'login-card' },
        card(
          cardBody(
            h(
              'div',
              { class: 'col', style: { gap: '4px', marginBottom: '20px' } },
              h('h1', { text: 'Masuk ke console' }),
              h('p', { class: 'muted', text: 'Tempel API key yang Anda terima.' }),
            ),
            form,
          ),
        ),
      ),
    ),
  );

  // Focus lands on the only field that needs input.
  requestAnimationFrame(() => keyInput.focus());
  return node;
}
