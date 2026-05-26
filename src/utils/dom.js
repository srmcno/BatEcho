// Lightweight DOM helpers: element creation, event delegation, toasts, modals.

export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

// Build a DOM tree from an HTML string and return the first element.
export function fromHTML(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

// Delegated click handler keyed by [data-action].
export function onAction(root, handlers) {
  root.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target || !root.contains(target)) return;
    const action = target.dataset.action;
    if (handlers[action]) handlers[action](target, e);
  });
}

let toastHost;
export function toast(message, kind = 'info', ms = 3200) {
  if (!toastHost) {
    toastHost = h('div', { class: 'toast-host' });
    document.body.appendChild(toastHost);
  }
  const t = h('div', { class: `toast ${kind}`, text: message });
  toastHost.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, ms);
}

export function modal(contentEl, { large = false } = {}) {
  const overlay = h('div', { class: 'modal-overlay' });
  const box = h('div', { class: `modal ${large ? 'modal-lg' : ''}` });
  box.appendChild(contentEl);
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  function close() { document.removeEventListener('keydown', onKey); overlay.remove(); }
  document.body.appendChild(overlay);
  return { close, box };
}

export function confirmDialog(title, message, { danger = false, confirmText = 'Confirm' } = {}) {
  return new Promise((resolve) => {
    const content = h('div', {}, [
      h('h2', { text: title }),
      h('p', { class: 'c-2', style: { marginTop: '6px' }, text: message }),
      h('div', { class: 'modal-foot' }, [
        h('button', { class: 'btn', text: 'Cancel', onclick: () => { m.close(); resolve(false); } }),
        h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, text: confirmText, onclick: () => { m.close(); resolve(true); } }),
      ]),
    ]);
    const m = modal(content);
  });
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
