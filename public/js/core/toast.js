import { h } from './dom.js';
import { icon } from '../components/icon.js';

let stack = null;

function ensureStack() {
  if (!stack) {
    stack = h('div', { class: 'toast-stack', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(stack);
  }
  return stack;
}

/**
 * @param {string} message
 * @param {'info'|'success'|'error'} kind
 */
export function toast(message, kind = 'info') {
  const iconName = kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'info';
  const node = h(
    'div',
    { class: ['toast', kind !== 'info' && `toast--${kind}`] },
    icon(iconName),
    h('span', { text: message }),
  );

  ensureStack().appendChild(node);

  // Errors linger; confirmations get out of the way.
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity 160ms linear';
    setTimeout(() => node.remove(), 200);
  }, kind === 'error' ? 5200 : 2600);
}
