// NOTE: normal (non-module) script on purpose — module scripts have their own private scope,
// so onclick="..." handlers in the HTML can't find functions defined inside a module script.

// ---------- SECURITY: HTML ESCAPING / SAFE URLS ----------
// Almost every screen in this app renders text that came from someone who never logged in:
// a stranger filling the public merchant-join form, an anonymous customer at checkout, or a
// merchant typing their own store bio. All of that text gets stitched into innerHTML template
// strings all over the file, so ANY of it can contain <script> or onerror= and run as real code
// for the next person who views that screen (admin, merchant, or another customer). esc() must
// wrap every such value before it goes into a template string. Never remove/bypass this.
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Use for any user-supplied value placed inside an href="..." / src="..." attribute.
// Blocks javascript:, data:text/html, vbscript: and similar script-executing schemes while
// still allowing normal http(s)/mailto/tel links and relative paths.
function safeUrl(value) {
  const v = (value || '').toString().trim();
  if (!v) return '#';
  if (/^(https?:|mailto:|tel:|#|\.|\/)/i.test(v)) return v;
  // No scheme at all (e.g. "wa.me/xxx") — treat as a relative/bare URL, not a script scheme.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v)) return v;
  return '#';
}

// Use for any value placed inside a JS string literal that lives in an HTML event attribute,
// e.g. onclick="pick(${jsAttr(value)})". esc() alone is NOT enough there: the browser decodes
// &#39; back to ' BEFORE the JavaScript runs, so a value like  a');alert(1);//  would break out
// of the string. JSON-encoding first makes it a safe JS string literal, then esc() makes that
// literal safe inside the attribute.
function jsAttr(value) {
  return esc(JSON.stringify(String(value === null || value === undefined ? '' : value)));
}
// Use for any user-supplied value placed inside an <img src="..."> attribute. Only real image
// data URLs and http(s)/relative/blob URLs pass; anything else (including quotes that try to
// close the attribute and inject onerror=) becomes an empty string. Already HTML-escaped.
function imgSrc(value) {
  const v = (value === null || value === undefined ? '' : String(value)).trim();
  if (!v) return '';
  if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,[A-Za-z0-9+\/=]+$/i.test(v)) return esc(v);
  if (/^(https?:\/\/|blob:|\.{0,2}\/)/i.test(v)) return esc(v);
  return '';
}
// A CSS color that is safe to drop into a style="" attribute (hex only).
function safeColor(value, fallback) {
  const v = (value === null || value === undefined ? '' : String(value)).trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : (fallback || '#C77B4A');
}

// Number formatter for anything that ends up inside an HTML template string. A bare
// `value.toLocaleString()` on a STRING returns the string untouched (and unescaped), so a
// tampered document with price:"<img onerror=...>" would become live markup. fmtNum() coerces to a
// finite number first, so the output can only ever be digits.
function fmtNum(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return (isFinite(n) ? n : 0).toLocaleString();
}
// Opens a print/PDF window from an HTML string built by the app. Defence in depth for the
// document.write() path: the window gets its own Content-Security-Policy meta as its FIRST
// element (no scripts, no network, no frames, inline styles only), so even if some field were ever
// left unescaped it could not execute code or reach the opener's session (the window is same-origin).
const PRINT_WINDOW_CSP = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: https:; base-uri 'none'; form-action 'none'\">";
function openPrintWindow(html) {
  const w = window.open('', '_blank');
  if (!w) return null;
  const withCsp = String(html).replace(/<head>/i, '<head>' + PRINT_WINDOW_CSP);
  w.document.open();
  w.document.write(withCsp);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 350);
  return w;
}
