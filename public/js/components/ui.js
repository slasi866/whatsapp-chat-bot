import { h } from '../core/dom.js';
import { countUp, nextFrame } from '../core/motion.js';
import { icon } from './icon.js';

/**
 * Form and action primitives. Every view builds its interface from these, so
 * spacing, states, and validation wording stay identical across pages.
 */

export function button({
  label,
  variant = 'default',
  size = 'md',
  iconName = null,
  onClick = null,
  type = 'button',
  disabled = false,
  block = false,
  autofocus = false,
  title = null,
  ariaLabel = null,
}) {
  return h(
    'button',
    {
      type,
      class: [
        'btn',
        variant !== 'default' && `btn--${variant}`,
        size === 'sm' && 'btn--sm',
        !label && 'btn--icon',
        block && 'btn--block',
      ],
      disabled,
      title,
      'aria-label': ariaLabel ?? (!label ? title : null),
      dataset: autofocus ? { autofocus: 'true' } : {},
      onClick,
    },
    iconName && icon(iconName, size === 'sm' ? 14 : 16),
    label && h('span', { class: 'btn-label', text: label }),
  );
}

/** Toggles a button into its spinner state during an in-flight request. */
export function setLoading(node, loading) {
  node.dataset.loading = loading ? 'true' : 'false';
  node.disabled = loading;
}

export function field({ label, control, hint = null, id = null }) {
  return h(
    'div',
    { class: 'field' },
    label && h('label', { for: id, text: label }),
    control,
    hint && h('span', { class: 'hint', text: hint }),
  );
}

export function input({
  id,
  value = '',
  type = 'text',
  placeholder = '',
  required = false,
  autocomplete = 'off',
  onInput = null,
  onKeydown = null,
  min = null,
  pattern = null,
}) {
  return h('input', {
    id,
    class: 'input',
    type,
    value,
    placeholder,
    required,
    autocomplete,
    spellcheck: false,
    min,
    pattern,
    onInput,
    onKeydown,
  });
}

export function textarea({ id, value = '', placeholder = '', rows = null, required = false }) {
  return h('textarea', { id, class: 'textarea', value, placeholder, rows, required });
}

export function select({ id, value, options, onChange = null }) {
  const node = h(
    'select',
    { id, class: 'select', onChange },
    options.map((option) =>
      h('option', { value: option.value, selected: option.value === value }, option.label),
    ),
  );
  node.value = value ?? '';
  return node;
}

export function checkbox({ id, label, checked = false }) {
  return h(
    'label',
    { class: 'check' },
    h('input', { id, type: 'checkbox', checked }),
    h('span', { text: label }),
  );
}

export function searchInput({ placeholder, value = '', onInput }) {
  return h(
    'div',
    { class: 'search' },
    icon('search', 15),
    h('input', {
      class: 'input',
      type: 'search',
      placeholder,
      value,
      spellcheck: false,
      onInput,
    }),
  );
}

export function badge(label, variant = null, withDot = false) {
  return h(
    'span',
    { class: ['badge', variant && `badge--${variant}`] },
    withDot && h('i', { class: 'dot' }),
    h('span', { text: label }),
  );
}

export function card(...children) {
  return h('section', { class: 'card' }, children);
}

export function cardBody(...children) {
  return h('div', { class: 'card-body' }, children);
}

export function cardHead(title, ...trailing) {
  return h(
    'header',
    { class: 'card-head' },
    h('h2', { text: title }),
    trailing.length ? h('div', { class: 'row push' }, trailing) : null,
  );
}

export function notice(message, kind = 'info', iconName = null) {
  return h(
    'div',
    { class: ['notice', `notice--${kind}`] },
    icon(iconName ?? (kind === 'warn' || kind === 'danger' ? 'alert' : 'info')),
    h('div', {}, message),
  );
}

export function fieldError(message) {
  return h('span', { class: 'field-error', text: message, role: 'alert' });
}

/**
 * @param {{label: string, value: string, count?: number,
 *          format?: (n: number) => string, sub?: string|null,
 *          meter?: {percent: number, state: string}|null}} options
 * Pass `count` to have the figure count up instead of appearing; the meter
 * always fills from zero, which is why its width is set on the next frame
 * rather than inline.
 */
export function statTile({ label, value, count = null, format = null, sub = null, meter = null }) {
  const valueNode = h('div', { class: 'stat-value', text: value });
  const meterFill = meter ? h('i') : null;

  const node = h(
    'div',
    { class: 'stat' },
    h('div', { class: 'stat-label', text: label }),
    valueNode,
    meterFill && h('div', { class: 'meter', dataset: { state: meter.state } }, meterFill),
    sub && h('div', { class: 'stat-sub', text: sub }),
  );

  if (count !== null) countUp(valueNode, count, format ?? ((n) => String(n)));
  if (meterFill) {
    nextFrame(() => {
      meterFill.style.width = `${Math.min(100, meter.percent)}%`;
    });
  }
  return node;
}

/** Monospaced value with a copy button, used for freshly issued API keys. */
export function copyField(value) {
  const copyButton = button({
    iconName: 'copy',
    title: 'Salin',
    onClick: async () => {
      try {
        await navigator.clipboard.writeText(value);
        copyButton.replaceChildren(icon('check', 16));
        setTimeout(() => copyButton.replaceChildren(icon('copy', 16)), 1400);
      } catch {
        // Clipboard is blocked outside a secure context; selecting still works.
        const range = document.createRange();
        range.selectNodeContents(code);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    },
  });
  const code = h('code', { text: value });
  return h('div', { class: 'copy-field' }, code, copyButton);
}
