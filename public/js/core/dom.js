/**
 * Minimal DOM builder.
 *
 * Views build real element nodes instead of HTML strings. Text always goes
 * through createTextNode, so customer-authored content can never be parsed as
 * markup. That removes the escaping discipline the string-template approach
 * needed on every single interpolation.
 */

const DIRECT_ATTRIBUTES = new Set(['role', 'list', 'form']);

function applyProp(node, key, value) {
  if (value === null || value === undefined || value === false) return;

  if (key === 'class' || key === 'className') {
    node.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
    return;
  }
  if (key === 'text') {
    node.textContent = value;
    return;
  }
  // Opt-in escape hatch, used only for icon markup defined in this codebase.
  if (key === 'html') {
    node.innerHTML = value;
    return;
  }
  if (key === 'dataset') {
    Object.assign(node.dataset, value);
    return;
  }
  if (key === 'style' && typeof value === 'object') {
    for (const [property, setting] of Object.entries(value)) {
      // Custom properties are invisible to the style object's named setters,
      // so they have to go through setProperty.
      if (property.startsWith('--')) node.style.setProperty(property, setting);
      else node.style[property] = setting;
    }
    return;
  }
  if (key.startsWith('on') && typeof value === 'function') {
    node.addEventListener(key.slice(2).toLowerCase(), value);
    return;
  }
  if (key.includes('-') || DIRECT_ATTRIBUTES.has(key)) {
    node.setAttribute(key, value === true ? '' : value);
    return;
  }
  if (key in node) {
    node[key] = value;
    return;
  }
  node.setAttribute(key, value === true ? '' : value);
}

function appendChild(node, child) {
  if (child === null || child === undefined || child === false || child === true) return;
  if (Array.isArray(child)) {
    for (const item of child) appendChild(node, item);
    return;
  }
  if (child instanceof Node) {
    node.appendChild(child);
    return;
  }
  node.appendChild(document.createTextNode(String(child)));
}

export function h(tag, props = null, ...children) {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) applyProp(node, key, value);
  }
  appendChild(node, children);
  return node;
}

export function svg(inner, size = 16, extraClass = '') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('width', size);
  node.setAttribute('height', size);
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '1.8');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('class', `icon ${extraClass}`.trim());
  node.innerHTML = inner;
  return node;
}

export function fragment(...children) {
  const frag = document.createDocumentFragment();
  appendChild(frag, children);
  return frag;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

export function mount(node, ...children) {
  node.replaceChildren();
  appendChild(node, children);
  return node;
}

export function byId(id) {
  return document.getElementById(id);
}
