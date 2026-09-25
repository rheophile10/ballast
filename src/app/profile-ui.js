// Registration and the avatar, shared by all three roles. Photo → 240px JPEG → base64 inside the profile text.
import { h, mount, download } from './h.js';
import { makeProfile, profileText } from '../profile.js';

export const avatar = (p, size = 64) => p?.photo
  ? h('img', { src: 'data:image/jpeg;base64,' + p.photo, alt: p.name, width: size, height: size, class: 'avatar' })
  : h('div', { class: 'avatar blank', style: { width: size + 'px', height: size + 'px', lineHeight: size + 'px', fontSize: Math.round(size / 3) + 'px' } }, (p?.name || '?').trim()[0]?.toUpperCase() || '?');

const toJpeg = (draw) => new Promise((res) => { const c = h('canvas', { width: 240, height: 240 }); const x = c.getContext('2d'); x.fillStyle = '#ddd'; x.fillRect(0, 0, 240, 240); draw(x); c.toBlob(async (b) => res(btoa(String.fromCharCode(...new Uint8Array(await b.arrayBuffer())))), 'image/jpeg', 0.8); });

/** Render the registration form for `role`; calls done(profile, text). `extractable` for RTC/superintendent (their keys live in their file). */
export const renderRegister = (root, done) => {
  let photo = '', stream = null;
  const video = h('video', { autoplay: true, playsinline: true, muted: true, style: { display: 'none', width: '240px', borderRadius: '8px' } });
  const preview = h('div', { class: 'row' });
  const status = h('p', { class: 'status' });
  const stopCam = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; video.style.display = 'none'; };
  const show = () => mount(preview, photo ? h('img', { src: 'data:image/jpeg;base64,' + photo, width: 120, height: 120, class: 'avatar' }) : null);
  const webcam = async () => { try { stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 480 } }); video.srcObject = stream; video.style.display = 'block'; } catch { status.textContent = 'No camera available — upload a photo instead.'; } };
  const snap = async () => { if (!stream) return; const s = Math.min(video.videoWidth, video.videoHeight); photo = await toJpeg((c) => c.drawImage(video, (video.videoWidth - s) / 2, (video.videoHeight - s) / 2, s, s, 0, 0, 240, 240)); stopCam(); show(); };
  const upload = async (e) => { const f = e.target.files[0]; if (!f) return; const bmp = await createImageBitmap(f); const s = Math.min(bmp.width, bmp.height); photo = await toJpeg((c) => c.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 240, 240)); show(); };
  const name = h('input', { placeholder: 'Name', required: true, autocomplete: 'name' });
  const pin = h('input', { placeholder: 'PIN', inputmode: 'numeric', required: true });
  const submit = async (e) => {
    e.preventDefault();
    try { const p = await makeProfile('none', name.value, pin.value, photo, true); stopCam(); done(p, await profileText(p)); }
    catch (err) { status.textContent = err.message; }
  };
  mount(root, h('h1', {}, 'Register'),
    h('form', { onsubmit: submit, class: 'card' },
      h('label', {}, 'Name ', name), h('label', {}, 'PIN (your employee number) ', pin),
      h('div', { class: 'row' }, h('button', { type: 'button', onclick: webcam }, 'Use webcam'), h('button', { type: 'button', onclick: snap }, 'Take photo'), h('label', { class: 'btn' }, 'Upload photo', h('input', { type: 'file', accept: 'image/*', onchange: upload, style: { display: 'none' } }))),
      video, preview, status,
      h('button', { type: 'submit', class: 'primary' }, 'Register')),
    h('p', { class: 'small' }, 'Your browser makes and keeps your keys. Your registration — name, PIN, photo, public keys — is a text file you send to your RTC, who sends back your profile with your role.'));
};

export const profileCard = (p, text, extra = []) => h('div', { class: 'card row' }, avatar(p, 72),
  h('div', {}, h('b', {}, p.name), ` · ${p.role === 'crew' ? 'Crew ' : ''}${p.pin} · ${p.role === 'none' ? 'not yet minted' : p.role}`, p.minted ? h('div', { class: 'small' }, `${p.role} since ${p.minted.start}, minted by ${p.minted.by.name}`, p.minted.root && p.minted.root.sig !== p.sig ? ` · under superintendent ${p.minted.root.name}` : '') : null, h('div', { class: 'row' },
    text ? h('button', { onclick: () => download(`profile-${p.pin}.txt`, text) }, 'Download profile') : null,
    text ? h('button', { onclick: () => navigator.clipboard?.writeText(text) }, 'Copy profile text') : null, ...extra)));
