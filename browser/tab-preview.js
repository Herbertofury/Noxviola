'use strict';
// Adapted from Enderloom tab-preview.js (GPL-3.0-only).
window.preview.onData(data => {
  document.getElementById('title').textContent = data.title || 'Untitled tab';
  const domain = document.getElementById('domain');
  domain.textContent = data.domain || ''; domain.hidden = !data.domain;
  const image = document.getElementById('image'), empty = document.getElementById('empty');
  image.hidden = !data.image; empty.hidden = !!data.image;
  if (data.image) image.src = data.image; else image.removeAttribute('src');
  empty.textContent = data.pending ? 'Loading preview…' : 'Preview unavailable';
});
