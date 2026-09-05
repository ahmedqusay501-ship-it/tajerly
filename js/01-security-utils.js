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
