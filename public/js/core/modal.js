import { h } from './dom.js';
import { button } from '../components/ui.js';

/**
 * Accessible dialog. Replaces window.confirm so destructive actions can carry
 * real context, and so the wording is in the product's own voice.
 *
 * Focus is trapped while open and returned to the trigger on close, and Escape
 * always resolves to a cancel.
 */
function openDialog({ title, description, content, actions, wide }) {
  const previouslyFocused = document.activeElement;

  return new Promise((resolve) => {
    const close = (result) => {
      document.removeEventListener('keydown', onKeydown, true);
      scrim.remove();
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
      resolve(result);
    };

    const dialog = h(
      'div',
      {
        class: ['modal', wide && 'modal--wide'],
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
      },
      h(
        'div',
        { class: 'modal-head' },
        h('h2', { text: title }),
        description && h('p', { class: 'muted', style: { marginTop: '4px' }, text: description }),
      ),
      content && h('div', { class: 'modal-body' }, content),
      h('div', { class: 'modal-foot' }, actions(close)),
    );

    const scrim = h(
      'div',
      {
        class: 'modal-scrim',
        onClick: (event) => {
          if (event.target === scrim) close(null);
        },
      },
      dialog,
    );

    function onKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeydown, true);
    document.body.appendChild(scrim);

    const autofocus = dialog.querySelector('[data-autofocus]') ?? dialog.querySelector('button');
    if (autofocus instanceof HTMLElement) autofocus.focus();
  });
}

/** Resolves true only when the user picks the confirming action. */
export function confirmDialog({
  title,
  description,
  confirmLabel = 'Lanjutkan',
  cancelLabel = 'Batal',
  danger = false,
  content = null,
}) {
  return openDialog({
    title,
    description,
    content,
    actions: (close) => [
      button({ label: cancelLabel, variant: 'ghost', onClick: () => close(false) }),
      button({
        label: confirmLabel,
        variant: danger ? 'danger' : 'primary',
        autofocus: true,
        onClick: () => close(true),
      }),
    ],
  });
}

/** Informational dialog with a single dismiss action. */
export function infoDialog({ title, description, content, closeLabel = 'Tutup', wide = false }) {
  return openDialog({
    title,
    description,
    content,
    wide,
    actions: (close) => [
      button({ label: closeLabel, variant: 'primary', autofocus: true, onClick: () => close(true) }),
    ],
  });
}
