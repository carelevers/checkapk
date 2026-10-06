/** Fotogalerij met vergrote weergave (native <dialog>), inclusief bronvermelding per foto. */
import { esc } from './html.js';

/** @typedef {import('../api/commons.js').Photo} Photo */

/** Bronvermelding volgens de licentie. @param {Photo} p */
export const photoCredit = (p) =>
  `Foto: ${esc(p.artist)} · <a href="${esc(p.pageUrl)}" target="_blank" rel="noopener">${esc(p.license)}, Wikimedia Commons</a>`;

/**
 * Raster met miniaturen. Klik opent de foto groot (zie bindGallery).
 * @param {Photo[]} photos @param {{note?: string}} [opts]
 */
export function galleryHtml(photos, opts = {}) {
  if (!photos.length) return '<p class="muted">Geen foto\'s gevonden voor dit model.</p>';
  return `<div class="gallery">${photos.map((p, i) => `
    <button class="gallery-item" data-photo="${i}" aria-label="Foto ${i + 1} vergroten">
      <img src="${esc(p.thumb)}" alt="${esc(p.title)}" loading="lazy" decoding="async">
    </button>`).join('')}</div>
    <p class="small muted gallery-note">${esc(opts.note || 'Voorbeeldfoto\'s van dit model van Wikimedia Commons, niet van deze specifieke auto. Klik voor bron en maker.')}</p>`;
}

/**
 * Koppelt klikken op [data-photo] binnen `root` aan een vergrote weergave.
 * @param {ParentNode} root @param {Photo[]} photos
 */
export function bindGallery(root, photos) {
  root.querySelectorAll('[data-photo]').forEach((el) => el.addEventListener('click', () => openLightbox(photos, Number(/** @type {HTMLElement} */ (el).dataset.photo))));
}

/** @param {Photo[]} photos @param {number} start */
export function openLightbox(photos, start) {
  let i = start;
  const dlg = document.createElement('dialog');
  dlg.className = 'lightbox';
  dlg.innerHTML = `<figure><img alt=""><figcaption></figcaption></figure>
    <button class="lb-btn lb-close" aria-label="Sluiten">✕</button>
    ${photos.length > 1 ? '<button class="lb-btn lb-prev" aria-label="Vorige">‹</button><button class="lb-btn lb-next" aria-label="Volgende">›</button>' : ''}`;
  const img = /** @type {HTMLImageElement} */ (dlg.querySelector('img'));
  const cap = /** @type {HTMLElement} */ (dlg.querySelector('figcaption'));
  const show = () => {
    const p = photos[i];
    img.src = p.full; img.alt = p.title;
    cap.innerHTML = `<span>${esc(p.title)}</span><span>${photoCredit(p)}</span>`;
  };
  const step = (d) => { i = (i + d + photos.length) % photos.length; show(); };
  dlg.querySelector('.lb-close')?.addEventListener('click', () => dlg.close());
  dlg.querySelector('.lb-prev')?.addEventListener('click', () => step(-1));
  dlg.querySelector('.lb-next')?.addEventListener('click', () => step(1));
  dlg.addEventListener('keydown', (ev) => { if (ev.key === 'ArrowLeft') step(-1); if (ev.key === 'ArrowRight') step(1); });
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) dlg.close(); });   // klik naast de foto
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  show();
  dlg.showModal();
}
