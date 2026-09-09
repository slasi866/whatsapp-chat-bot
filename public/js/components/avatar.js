import { h } from '../core/dom.js';
import { colorFor, initials } from '../core/format.js';

/**
 * Initials avatar with a colour derived from a stable seed, usually the
 * WhatsApp id, so the same contact is recognisable across sessions.
 */
export function avatar(name, seed = null, small = false) {
  return h('span', {
    class: ['avatar', small && 'avatar--sm'],
    style: { background: colorFor(seed ?? name) },
    text: initials(name),
    'aria-hidden': 'true',
  });
}
