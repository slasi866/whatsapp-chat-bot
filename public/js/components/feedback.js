import { h } from '../core/dom.js';
import { icon } from './icon.js';

/**
 * Loading and empty presentation. Both exist so a view never shows a bare
 * "Memuat..." or a blank panel: a first-time client should always be told what
 * the next step is.
 */

export function skeletonLine(width = '100%', height = 12) {
  return h('div', {
    class: 'skeleton',
    style: { width, height: `${height}px` },
  });
}

export function skeletonTable(rows = 5, columns = 4) {
  return h(
    'div',
    { class: 'card' },
    h(
      'div',
      { class: 'card-body', style: { display: 'grid', gap: '14px' } },
      Array.from({ length: rows }, (_, row) =>
        h(
          'div',
          { class: 'row', style: { gap: '16px' } },
          Array.from({ length: columns }, (_, column) =>
            skeletonLine(column === 0 ? '28%' : '16%', row === 0 ? 10 : 14),
          ),
        ),
      ),
    ),
  );
}

export function skeletonCards(count = 3) {
  return h(
    'div',
    { class: 'grid cols' },
    Array.from({ length: count }, () =>
      h(
        'div',
        { class: 'stat', style: { display: 'grid', gap: '10px' } },
        skeletonLine('40%', 10),
        skeletonLine('62%', 24),
      ),
    ),
  );
}

export function skeletonList(count = 6) {
  return h(
    'div',
    {},
    Array.from({ length: count }, () =>
      h(
        'div',
        { class: 'conv', style: { cursor: 'default' } },
        h('div', { class: 'skeleton', style: { width: '34px', height: '34px', borderRadius: '50%' } }),
        h(
          'div',
          { class: 'conv-main', style: { display: 'grid', gap: '7px' } },
          skeletonLine('58%', 11),
          skeletonLine('34%', 9),
        ),
      ),
    ),
  );
}

/**
 * @param {{iconName?: string, title: string, message?: string, action?: Node}} options
 */
export function emptyState({ iconName = 'info', title, message = null, action = null }) {
  return h(
    'div',
    { class: 'empty' },
    icon(iconName, 30),
    h('h3', { text: title }),
    message && h('p', { text: message }),
    action,
  );
}

export function emptyCard(options) {
  return h('div', { class: 'card' }, emptyState(options));
}

export function errorCard(message, retry = null) {
  return h(
    'div',
    { class: 'card' },
    emptyState({
      iconName: 'alert',
      title: 'Gagal memuat',
      message,
      action: retry,
    }),
  );
}
