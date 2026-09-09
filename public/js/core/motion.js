/**
 * Motion helpers.
 *
 * The CSS in motion.css does the animating; this file only supplies the few
 * things CSS cannot express on its own: per-child stagger indices, counting a
 * number up, and route transitions.
 *
 * Every helper degrades to the final state when the viewer asks for reduced
 * motion, so nothing here is load bearing.
 */

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Sets --i on each child so CSS can offset its animation delay. Used for
 * lists, so items read as arriving in order rather than snapping in together.
 */
export function stagger(container, selector = null) {
  const children = selector ? container.querySelectorAll(selector) : container.children;
  let index = 0;
  for (const child of children) {
    child.style.setProperty('--i', index);
    index += 1;
  }
  return container;
}

/**
 * Counts a number up to its final value. A dashboard figure that lands rather
 * than appears gives the eye a moment to notice it changed.
 */
export function countUp(node, target, format = (n) => String(n), duration = 900) {
  const end = Number(target) || 0;

  if (prefersReducedMotion() || end === 0) {
    node.textContent = format(end);
    return;
  }

  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    // Ease out cubic: fast first, settling at the end.
    const eased = 1 - Math.pow(1 - progress, 3);
    node.textContent = format(Math.round(end * eased));
    if (progress < 1) requestAnimationFrame(step);
    else node.textContent = format(end);
  };
  requestAnimationFrame(step);
}

/** Lets a width or transform animate from its CSS start value on first paint. */
export function nextFrame(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/**
 * Cross-fades the old and new view where the browser supports it. Falls back
 * to swapping immediately, which is what every browser did before.
 */
export function transition(swap) {
  if (prefersReducedMotion() || !document.startViewTransition) {
    swap();
    return;
  }
  document.startViewTransition(swap);
}

/** Three bouncing dots, shown while an agent's reply is in flight. */
export function typingIndicator() {
  const node = document.createElement('div');
  node.className = 'typing';
  node.setAttribute('aria-label', 'Mengirim');
  for (let i = 0; i < 3; i++) node.appendChild(document.createElement('i'));
  return node;
}
