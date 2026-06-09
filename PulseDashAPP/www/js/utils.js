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
  const el = document.getElementById(`pg-bg-${idx}`);
  if (!el) return;
  
  if (!pg.bg) pg.bg = { img: '', size: 'cover', opacity: 1, x: 0, y: 0 };
  
  if (pg.bg.img) {
    el.style.backgroundImage = `url('${pg.bg.img}')`;
    el.style.backgroundSize = pg.bg.size;
    el.style.opacity = pg.bg.opacity !== undefined ? pg.bg.opacity : 1.0;
    
    const x = pg.bg.x !== undefined ? pg.bg.x : 0;
    const y = pg.bg.y !== undefined ? pg.bg.y : 0;
    el.style.backgroundPosition = `calc(50% + ${x}px) calc(50% + ${y}px)`;
  } else {
    el.style.backgroundImage = '';
    el.style.opacity = 1.0;
    el.style.backgroundPosition = 'center';
  }
}
