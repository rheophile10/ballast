// Drawings from spec strings. Our own generator, never pasted SVG, so nothing here can carry script.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LAMP = { G: '#2fbf4a', Y: '#f2c319', R: '#e23b2e', L: '#f4f4f4', x: '#2a2a2a' };

/** signal G,x,R  — heads top to bottom; letters G Y R L (lunar) x (dark); suffix f = flashing (drawn with rays). */
const signal = (arg) => {
  const heads = arg.trim().split(/\s*,\s*/).filter(Boolean);
  const h = 40 + heads.length * 70;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 ${h}" width="240" height="${h * 2}">`;
  s += `<rect x="56" y="0" width="8" height="${h}" fill="#555"/>`;
  heads.forEach((raw, i) => {
    const flash = /f$/i.test(raw), c = LAMP[raw.replace(/f$/i, '')] ?? LAMP.x;
    const cy = 35 + i * 70;
    s += `<rect x="30" y="${cy - 30}" width="60" height="60" rx="10" fill="#1b1b1b"/><circle cx="60" cy="${cy}" r="20" fill="${c}"/>`;
    if (flash) for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; s += `<line x1="${60 + 24 * Math.cos(a)}" y1="${cy + 24 * Math.sin(a)}" x2="${60 + 32 * Math.cos(a)}" y2="${cy + 32 * Math.sin(a)}" stroke="${c}" stroke-width="3"/>`; }
  });
  return s + '</svg>';
};

/** switch normal|reversed [main|siding] — a turnout with points drawn for the route. */
const sw = (arg) => {
  const rev = /rev/i.test(arg);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 160" width="400" height="160">`;
  s += `<line x1="0" y1="110" x2="400" y2="110" stroke="#444" stroke-width="6"/>`; // main
  s += `<path d="M120 110 Q 220 110 300 50 L 400 50" fill="none" stroke="#444" stroke-width="6"/>`; // diverging
  s += `<path d="M120 110 Q 200 110 250 ${rev ? 76 : 110}" fill="none" stroke="${rev ? '#c0392b' : '#2fbf4a'}" stroke-width="8"/>`; // points
  s += `<rect x="330" y="120" width="14" height="30" fill="#333"/><rect x="322" y="112" width="30" height="12" fill="${rev ? '#e23b2e' : '#2fbf4a'}"/>`; // target
  s += `<text x="10" y="150" font-size="16" font-family="sans-serif" fill="#333">switch ${rev ? 'reversed' : 'normal'}</text>`;
  return s + '</svg>';
};

/** form clearance no=134 to="WNR 5411" proceed="A → B" work="A – B" protect="Frmn Brown, Mile 33–Borden" call="after leaving Borden" complete="0830" rtc="ABC" */
const form = (arg) => {
  const f = {}; for (const m of arg.matchAll(/(\w+)=(?:"([^"]*)"|(\S+))/g)) f[m[1]] = m[2] ?? m[3];
  const row = (y, label, val) => `<text x="16" y="${y}" font-size="13" fill="#666" font-family="sans-serif">${esc(label)}</text><text x="130" y="${y}" font-size="15" fill="#111" font-family="monospace">${esc(val || '')}</text><line x1="130" y1="${y + 4}" x2="560" y2="${y + 4}" stroke="#bbb"/>`;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580 330" width="580" height="330"><rect x="1" y="1" width="578" height="328" fill="#fffef5" stroke="#333"/>`;
  s += `<text x="16" y="28" font-size="18" font-weight="bold" font-family="sans-serif">${esc(f.kind || 'OCS Clearance')}</text><text x="440" y="28" font-size="16" font-family="monospace">No. ${esc(f.no || '')}</text>`;
  const rows = [['To', f.to], ['Do not leave until', f.until], ['Proceed from / to', f.proceed], ['Work between', f.work], ['Take siding at', f.siding], ['Protect against', f.protect], ['Warning switches', f.warning], ['Permission switches', f.permission], ['Call RTC', f.call]];
  rows.forEach(([l, v], i) => { s += row(60 + i * 26, l, v); });
  s += row(300, 'Complete', `${f.complete || ''}   RTC ${f.rtc || ''}`);
  return s + '</svg>';
};

const KINDS = { signal, switch: sw, form };
/** @returns {string} SVG markup, or a small "unknown drawing" placeholder. */
export const svgFor = (spec) => {
  const m = /^(\w+)\s*(.*)$/s.exec(spec.trim());
  const fn = m && KINDS[m[1].toLowerCase()];
  return fn ? fn(m[2]) : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 40" width="300" height="40"><text x="4" y="26" font-size="14" fill="#a00" font-family="sans-serif">unknown drawing: ${esc(spec)}</text></svg>`;
};
