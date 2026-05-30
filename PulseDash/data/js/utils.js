'use strict';
import { ST } from './state.js';

export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}

export function applyPageBg(idx) {
  const pg = ST.cfg.orientations[ST.orientation][idx];
  const el = document.getElementById(`pg-${idx}`);
  if (pg && pg.bg && pg.bg.img) {
    el.style.backgroundImage = `url('${pg.bg.img}')`;
    el.style.backgroundSize = pg.bg.size;
  } else {
    el.style.backgroundImage = '';
  }
}
