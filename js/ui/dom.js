// Tiny DOM builder: h('button', { class, onclick, ... }, ...children).
// Children may be strings, nodes, null/false (skipped) or nested arrays.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c);
  };
  children.forEach(add);
  return el;
}
