// The question canvas: everything a train sees is pixels. Text wrapping, options, images, watermark, hit areas.
import { svgFor } from '../svg.js';

const FONT = '16px Arial, sans-serif', BOLD = 'bold 18px Arial, sans-serif';
const wrap = (ctx, text, x, y, w, lh) => {
  let yy = y;
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > w && line) { ctx.fillText(line, x, yy); yy += lh; line = word; } else line = t;
    }
    ctx.fillText(line, x, yy); yy += lh;
  }
  return yy;
};

const bitmapCache = new Map();
export const bitmapFor = async (key, bytesOrSvg, mime) => {
  if (bitmapCache.has(key)) return bitmapCache.get(key);
  const blob = typeof bytesOrSvg === 'string' ? new Blob([bytesOrSvg], { type: 'image/svg+xml' }) : new Blob([bytesOrSvg], { type: mime });
  const bmp = await createImageBitmap(blob).catch(() => null);
  bitmapCache.set(key, bmp); return bmp;
};
export const forget = () => { for (const b of bitmapCache.values()) b?.close?.(); bitmapCache.clear(); };

/**
 * Draw one item. Returns hit regions [{x,y,w,h,kind,id}] for clicks.
 * `item` is the decrypted item; `answer` the current answer; `pick` for match = left id awaiting a right.
 */
export const drawItem = (canvas, item, { answer, pick, images = [], watermark = '', index = 0, count = 0 }) => {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, pad = 24, lh = 24, colW = W - 2 * pad;
  const hits = [];
  ctx.clearRect(0, 0, W, canvas.height);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, canvas.height);
  ctx.fillStyle = '#111'; ctx.font = BOLD; ctx.textBaseline = 'top';
  ctx.fillText(`${index + 1} / ${count}`, pad, pad);
  let y = pad + 36;
  ctx.font = FONT;
  y = wrap(ctx, item.prompt, pad, y, colW, lh) + 8;
  for (const img of images) if (img) {
    const scale = Math.min(1, colW / img.width, 360 / img.height);
    const w = img.width * scale, hh = img.height * scale;
    ctx.drawImage(img, pad, y, w, hh); hits.push({ x: pad, y, w, h: hh, kind: 'zoom', id: img });
    y += hh + 12;
  }
  if (item.type === 'mc') {
    for (const o of item.options) {
      const top = y;
      ctx.fillStyle = answer === o.id ? '#dbeafe' : '#f5f5f5'; ctx.fillRect(pad, top, colW, 4); // placeholder height; redraw below
      ctx.fillStyle = '#111';
      const end = wrap(ctx, o.text, pad + 40, top + 8, colW - 48, lh);
      const hh = end - top + 4;
      ctx.fillStyle = answer === o.id ? '#dbeafe' : '#f5f5f5'; ctx.fillRect(pad, top, colW, hh);
      ctx.fillStyle = '#111'; ctx.font = BOLD; ctx.fillText(o.id + ')', pad + 10, top + 8); ctx.font = FONT;
      wrap(ctx, o.text, pad + 40, top + 8, colW - 48, lh);
      hits.push({ x: pad, y: top, w: colW, h: hh, kind: 'option', id: o.id });
      y = top + hh + 8;
    }
  } else if (item.type === 'match') {
    const half = (colW - 16) / 2, a = answer || {};
    ctx.font = BOLD; ctx.fillText('Terms', pad, y); ctx.fillText('Definitions', pad + half + 16, y); ctx.font = FONT; y += lh + 4;
    let yl = y, yr = y;
    for (const p of item.pairs) {
      const top = yl; const chosen = a[p.id];
      ctx.fillStyle = pick === p.id ? '#fde68a' : chosen ? '#dcfce7' : '#f5f5f5'; ctx.fillRect(pad, top, half, 4);
      const end = wrap(ctx, `${chosen ? '✓ ' : ''}${p.left}${chosen ? '  → ' + item.rights.findIndex((r) => r.id === chosen) + 1 : ''}`, pad + 8, top + 6, half - 16, lh);
      const hh = end - top + 2; ctx.fillStyle = pick === p.id ? '#fde68a' : chosen ? '#dcfce7' : '#f5f5f5'; ctx.fillRect(pad, top, half, hh);
      ctx.fillStyle = '#111'; wrap(ctx, `${chosen ? '✓ ' : ''}${p.left}${chosen ? '  → ' + (item.rights.findIndex((r) => r.id === chosen) + 1) : ''}`, pad + 8, top + 6, half - 16, lh);
      hits.push({ x: pad, y: top, w: half, h: hh, kind: 'left', id: p.id }); yl = top + hh + 6;
    }
    item.rights.forEach((r, i) => {
      const top = yr, x = pad + half + 16;
      const end = wrap(ctx, `${i + 1}. ${r.text}`, x + 8, top + 6, half - 16, lh); const hh = end - top + 2;
      ctx.fillStyle = '#f5f5f5'; ctx.fillRect(x, top, half, hh); ctx.fillStyle = '#111'; wrap(ctx, `${i + 1}. ${r.text}`, x + 8, top + 6, half - 16, lh);
      hits.push({ x, y: top, w: half, h: hh, kind: 'right', id: r.id }); yr = top + hh + 6;
    });
    y = Math.max(yl, yr);
  }
  // watermark
  if (watermark) {
    ctx.save(); ctx.globalAlpha = 0.09; ctx.fillStyle = '#000'; ctx.font = 'bold 40px Arial'; ctx.translate(W / 2, canvas.height / 2); ctx.rotate(-Math.PI / 7);
    for (let k = -2; k <= 2; k++) ctx.fillText(watermark, -W / 2, k * 160);
    ctx.restore();
  }
  return { hits, height: y + pad };
};

export const imagesFor = async (item) => {
  const out = [];
  if (item.svg) out.push(await bitmapFor('svg:' + item.id, svgFor(item.svg)));
  for (const [i, im] of (item.img || []).entries()) out.push(await bitmapFor(`img:${item.id}:${i}`, Uint8Array.from(atob(im.b64), (c) => c.charCodeAt(0)), im.mime));
  return out;
};
