'use strict';
import { ST, CFG_DEF, LOCAL_IMAGES } from './state.js';
import { renderWidget } from './renderers.js';
import {
  mkWidget, toggleEditor, exitEditor, openBgMenu, openAddMenu,
  delWidget, closePanel, toggleMoveMode, closeAddMenu, closeBgMenu,
  applyBg, applyConfig, closeLayerPicker, selWidget, joinGroup, separarWidget, rmWidget
} from './editor.js';
import { PERF, updatePerf, resetPerf, initPerf } from './perf.js';
import { TRIP, initTrip, updateTripUI, resetTrip, saveTrip } from './trip.js';
import { initTransport, saveToESP, loadFromESP, manualConnect } from './transport.js';
import { toast, applyPageBg } from './utils.js';

function toggleFS(){ if(!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{}); else document.exitFullscreen(); }

// ★ Variáveis globais de frequência e temporização OBD ★
let _freqHz = 0;
let _freqCounter = 0;
let _freqTimer = null;
let _blinkTimer = null;
function hexToRgb(hex) {
  if(!hex || hex.length < 7) return '255,255,255';
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `${isNaN(r)?255:r},${isNaN(g)?255:g},${isNaN(b)?255:b}`;
}

export function validarConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  
  // Migração Legada: se vier do formato antigo 'paginas', converte para 'orientations'
  if (cfg.paginas && !cfg.orientations) {
    cfg.orientations = {
      portrait: cfg.paginas,
      landscape: JSON.parse(JSON.stringify(cfg.paginas)) // Clona para o landscape inicial
    };
    delete cfg.paginas;
  }

  if (!cfg.orientations || !cfg.orientations.portrait || !cfg.orientations.landscape) return false;

  ['portrait', 'landscape'].forEach(ori => {
    for (let i = 0; i < cfg.orientations[ori].length; i++) {
      let p = cfg.orientations[ori][i];
      if (!p || typeof p !== 'object') p = { bg:{img:'',size:'cover'}, widgets:[] };
      if (!p.bg || typeof p.bg !== 'object') p.bg = {img:'',size:'cover'};
      if (!p.widgets || !Array.isArray(p.widgets)) p.widgets = [];
      p.widgets = p.widgets.filter(w => w && w.tipo !== 'volante_virtual' && w.tipo !== 'tpms_neon' && w.tipo !== 'econometro_classico' && w.x >= -10 && w.x <= 110 && w.y >= -10 && w.y <= 110);
      p.widgets.forEach(w => {
        if (w && ['test', 'transTemp', 'oilPres', 'oilTemp'].includes(w.sensor)) {
          w.sensor = 'demo';
        }
        if (w && w.sensor === 'econometer') {
          w.sensor = 'load';
        }
      });
      cfg.orientations[ori][i] = p;
    }
  });
  return true;
}



function autoScale() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  
  const newOri = (w > h) ? 'landscape' : 'portrait';
  const baseW = newOri === 'landscape' ? 915 : 412;
  const baseH = newOri === 'landscape' ? 412 : 915;
  ST.scale = Math.min(w / baseW, h / baseH);
  
  if (newOri !== ST.orientation && !ST.booting) {
    ST.orientation = newOri;
    swapOrientation();
  } else {
    ST.orientation = newOri;
  }
  
  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.classList.remove('portrait-mode', 'landscape-mode');
    appEl.classList.add(`${newOri}-mode`);
  }
  
  const scaledW = baseW * ST.scale;
  const scaledH = baseH * ST.scale;
  const offsetX = (w - scaledW) / 2;
  const offsetY = (h - scaledH) / 2;
  
  let gap = (w / ST.scale) - baseW + 50;
  if (gap < 50) gap = 50;
  
  const pw = document.getElementById('pages-wrap');
  if (pw) {
    pw.style.gap = gap + 'px';
    const tx = (baseW + gap) * ST.pg * -1;
    pw.style.transform = `scale(${ST.scale}) translateX(${tx}px)`;
    pw.style.left = offsetX + 'px';
    pw.style.top = offsetY + 'px';
  }
}

export function swapOrientation() {
  ST.cvs = {};
  ST.widgetMap.clear();
  
  const baseW = ST.orientation === 'landscape' ? 915 : 412;
  const baseH = ST.orientation === 'landscape' ? 412 : 915;
  
  for(let i=0; i<ST.cfg.orientations[ST.orientation].length; i++) {
    const layer = document.getElementById(`wl-${i}`);
    if (layer) layer.innerHTML = '';
  }
  
  if(ST.editor) closePanel();
  
  ST.cfg.orientations[ST.orientation].forEach((pg,idx)=>{
    if (pg && Array.isArray(pg.widgets)) {
      pg.widgets.forEach(w=> {
        if (w) mkWidget(w,idx);
      });
    }
    applyPageBg(idx);
  });
}

window.addEventListener('resize', autoScale);

function goPg(idx) {
  if (!ST.cfg || !ST.cfg.orientations || idx < 0 || idx >= ST.cfg.orientations[ST.orientation].length) return;
  ST.pg = idx; 
  autoScale();
  document.querySelectorAll('.pd').forEach((d,i)=>d.classList.toggle('active', i===idx));
}



export function processTelemetry(j) {
  const oldState = ST.dados.obd_state;
  Object.assign(ST.dados, j);
  if (j.rpm !== undefined) _freqCounter++;
  
  // --- FASE 6: Síntese Virtual de Vácuo/MAP para Onix Aspirado ---
  // Se o carro não responder MAP físico (boost) ou estiver zerado, estimamos com perfeição baseada na Carga
  if (ST.dados.boost === undefined || ST.dados.boost < 1.0) {
    const load = ST.dados.load ?? 0;
    ST.dados.boost = 30.0 + (load / 100.0 * 70.0);
  }
  
  // --- FASE 4: Sensibilidade de Consumo Instantâneo (km/L) e Detecção Física de Cut-off ---
  if (ST.dados.speed !== undefined && ST.dados.fuelRate !== undefined) {
    const s = ST.dados.speed;
    const fr = ST.dados.fuelRate; // Fator Onix (removido multiplicador 2.05)
    
    // Detecção física de freio motor (Cut-off): pé fora do acelerador, motor acima de 1100 RPM e carro andando
    let isCutOff = false;
    const rpm = ST.dados.rpm ?? 0;
    const pedalVal = ST.dados.pedal ?? 0;
    const throttleVal = ST.dados.throttle ?? 0;
    
    // Se o pedal está solto (abaixo de 1.5%) e o carro está engatado em movimento (RPM > 1100 e velocidade > 10 km/h)
    // OU se o fluxo de combustível cai a um nível residual baixíssimo (abaixo de 0.45 L/h) nessas condições
    if (rpm > 1100 && s > 10) {
      if (pedalVal < 1.5 || throttleVal < 14.5 || fr < 0.45) {
        isCutOff = true;
      }
    }

    if (s < 1.0) {
      ST.dados.instCons = 0.0; // Carro parado
    } else if (isCutOff || fr < 0.1) {
      ST.dados.instCons = 99.9; // Injeção 100% cortada (Cut-off)
    } else {
      let kmL = s / fr;
      if (kmL > 99.9) kmL = 99.9;
      ST.dados.instCons = kmL;
    }
  }
  
  if (j.obd_state !== undefined) {
    if (j.obd_state !== oldState) {
      updateBtButton(j.obd_state);
      updateOverlay(j.obd_state, true); 
    }
  }
}

// v3.4: k por sensor — rápidos suavizam, lentos são instantâneos
const SMOOTH_K = {
  rpm: 0.1,  speed: 0.1,  throttle: 0.1, pedal: 0.15, 
  load: 0.12, // v6.1: Suavização moderada (leitura a cada 500ms pelo scheduler)
  fuelRate: 0.05, instCons: 0.02, boost: 0.1, coolant: 0.3, catalyst: 0.3,
  ambient: 0.3, ethanol: 0.3, fuelLevel: 0.05, voltage: 1.0,   // fuelLevel: 1.0→0.05 (duplo filtro com EMA do firmware)
  
  // Novos Sensores OBD2
  turbo: 0.1, maf: 0.1, oilPress: 0.1, fuelPress: 0.1,
  oilTemp: 0.2, iat: 0.2, egt: 0.15,
  afr: 0.08, lambda: 0.08, timing: 0.1
};

// Lógicas de TRIP e PERF foram movidas para trip.js e perf.js

function suavizar(){ for(const key in ST.smooth){ const k=SMOOTH_K[key]??0.05; ST.smooth[key]+=(ST.dados[key]-ST.smooth[key])*k; } }



const FRAME_BUDGET_MS = 33; // 30fps cap (~33ms por frame)
let lastFrameTime = 0;
let lastRenderTs = 0;

function update(ts){ 
  if (ST.booting) {
    requestAnimationFrame(update);
    return;
  }

  // --- Throttle a 30fps: pula o frame se ainda não passaram 33ms ---
  if (ts - lastRenderTs < FRAME_BUDGET_MS) {
    requestAnimationFrame(update);
    return;
  }
  lastRenderTs = ts;

  const now = ts * 0.001;
  let dt = lastFrameTime > 0 ? (now - lastFrameTime) : 0;
  lastFrameTime = now;
  if (dt > 2.0) dt = 0;

  // Sensor de teste: onda triangular 0→100→0 baseada na velocidade configurada (ST.demoSpeed) aumentada em 50%
  const speedFactor = ((ST.demoSpeed || 50) / 1000) * 1.5;
  ST.dados.demo = Math.abs(((ts * speedFactor) % 200) - 100);
  suavizar(); 
  updatePerf();
  if (TRIP.open) updateTripUI();

  // Redesenha apenas widgets da página ativa (ou todos no editor)
  for(const wid in ST.cvs){ 
    const w = ST.widgetMap.get(wid);
    if(w && (w.pg === ST.pg || ST.editor)) {
      renderWidget(ST.cvs[wid].ctx, w, ST.cvs[wid].cW/2, ST.cvs[wid].cH/2); 
    }
  }
  requestAnimationFrame(update); 
}

function runBootSequence() {
  const splash = document.getElementById('splash');
  if(!splash) { ST.booting = false; return; }

  const pcb = document.getElementById('splash-pcb');
  const hud = document.querySelector('.hud-box');
  const statusText = document.getElementById('splash-status');

  // Ativa a exibição suave das animações após 500ms de tela preta pura
  setTimeout(() => {
    splash.classList.add('active');
  }, 500);

  const statuses = [
    { time: 500,  text: "[ 📡 SEARCHING OBD... ]" },
    { time: 900,  text: "[ 🔌 CONNECTING CAN BUS... ]" },
    { time: 1400, text: "[ ⚡ ENGINE ECU HANDSHAKE ]" },
    { time: 1900, text: "[ 📁 READING ECO LOGS... ]" },
    { time: 2400, text: "[ 🏆 SYNCING TOP 5 RANK ]" },
    { time: 2800, text: "[ 🚀 SYSTEM READY — GO! ]" }
  ];

  let timers = [];

  // Loop de escrita dos status de diagnóstico
  statuses.forEach(item => {
    let t = setTimeout(() => {
      if (statusText) {
        statusText.innerText = item.text;
        if (item.time === 2800) {
          statusText.style.color = "#9b00ff";
          statusText.style.textShadow = "0 0 10px #9b00ff";
        } else {
          statusText.style.color = "#00f2ff";
          statusText.style.textShadow = "0 0 5px rgba(0, 242, 255, 0.6)";
        }
      }
    }, item.time);
    timers.push(t);
  });

  // Revela o painel de trás no momento do OK! (Aos 3.0 segundos)
  let tReveal = setTimeout(() => {
    splash.classList.add("reveal");
    if (pcb) pcb.classList.add("fade-out");
    if (hud) hud.classList.add("fade-out");
  }, 3000);
  timers.push(tReveal);

  // Remove o container de splash completamente do DOM aos 3.5 segundos
  let tFinalHide = setTimeout(() => {
    splash.style.display = "none";
    ST.booting = false;
  }, 3500);
  timers.push(tFinalHide);
}

// ==============================================================
// ★ OBD2 CONNECTION MANAGER — CAN DIRETO ★
// ==============================================================

// Frequencia: inicia contador e pisca a bolinha
function startFreqTracking() {
  if (_freqTimer) { clearInterval(_freqTimer); _freqTimer = null; }
  _freqTimer = setInterval(() => {
    _freqHz = _freqCounter;
    _freqCounter = 0;
    
    // Escreve no DOM apenas 1 vez por segundo, e apenas se o modal estiver visível!
    if (ST.dados.obd_state === 4) {
      const overlay = document.getElementById('obd-overlay');
      if (overlay && overlay.classList.contains('open')) {
        const el = document.getElementById('step-freq-detail');
        if (el) el.textContent = `${_freqHz} Hz`;
      }
    }
  }, 1000);
}

function startPillBlink() {
  if (_blinkTimer) { clearInterval(_blinkTimer); _blinkTimer = null; }
  _blinkTimer = setInterval(() => {
    if (ST.dados.obd_state !== 4) return;
    const dot = document.querySelector('#obd-status-pill .dot');
    if (!dot) return;
    let cls = 'freq-blink-blue';
    if (_freqHz < 1)      cls = 'freq-blink-red';
    else if (_freqHz < 3) cls = 'freq-blink-yellow';
    dot.classList.add(cls);
    setTimeout(() => dot.classList.remove(cls), 420);
  }, 2000);
}

function stopBlink() {
  if (_blinkTimer) { clearInterval(_blinkTimer); _blinkTimer = null; }
  if (_freqTimer)  { clearInterval(_freqTimer);  _freqTimer  = null; }
}

function updateBtButton(state) {
  const pill = document.getElementById('obd-status-pill');
  if (!pill) return;
  pill.className = '';
  if (state === 1) {
    pill.classList.add('status-blue');    // CAN iniciando
  } else if (state === 3) {
    pill.classList.add('status-yellow'); // handshake
  } else if (state === 4) {
    pill.classList.add('status-green');  // online — blink ativo
    startFreqTracking();
    startPillBlink();
  } else if (state === 9) {
    pill.classList.add('status-red');    // falha
    stopBlink();
  } else {
    stopBlink();
  }
}

const OBD_STATES = {
  0: { detBt: 'Aguardando...', detCan: '500kbps / Aguardando...', detEcu: 'Aguardando...', detFreq: '-- Hz', msg: 'Toque para conectar', fail: false },
  1: { detBt: 'Conectado ✓',   detCan: '500kbps / Iniciando...',  detEcu: 'Aguardando...', detFreq: '-- Hz', msg: 'INICIANDO CAN BUS...', fail: false },
  3: { detBt: 'Conectado ✓',   detCan: '500kbps ✓',              detEcu: 'Handshake...',  detFreq: '-- Hz', msg: 'CONECTANDO NA ECU...', fail: false },
  4: { detBt: 'Conectado ✓',   detCan: '500kbps ✓',              detEcu: 'Online ✓',     detFreq: '...',   msg: '★ RECEBENDO DADOS DO VEÍCULO ★', fail: false },
  9: { detBt: 'Conectado ✓',   detCan: 'Falha na conexão',       detEcu: 'Sem resposta', detFreq: '-- Hz', msg: 'FALHA — Verifique a ignição', fail: true }
};

function updateOverlay(state, autoClose = false) {
  const cfg = OBD_STATES[state] || OBD_STATES[0];
  const stepBt   = document.getElementById('step-bt');
  const stepCan  = document.getElementById('step-can');
  const stepEcu  = document.getElementById('step-ecu');
  const stepFreq = document.getElementById('step-freq');
  const lines    = document.querySelectorAll('.obd-line');

  [stepBt, stepCan, stepEcu, stepFreq].forEach(s => { if(s) s.className = 'obd-step'; });
  lines.forEach(l => l.className = 'obd-line');

  const stepBtLabel = document.getElementById('step-bt-label');
  if (stepBtLabel) {
    stepBtLabel.textContent = 'BLUETOOTH (PULSESCAN)';
  }

  const dBt   = document.getElementById('step-bt-detail');
  const dCan  = document.getElementById('step-can-detail');
  const dEcu  = document.getElementById('step-ecu-detail');
  const dFreq = document.getElementById('step-freq-detail');
  if (dBt)   dBt.textContent   = cfg.detBt;
  if (dCan)  dCan.textContent  = cfg.detCan;
  if (dEcu)  dEcu.textContent  = cfg.detEcu;
  if (dFreq) dFreq.textContent = state === 4 ? `${_freqHz} Hz` : cfg.detFreq;
  document.getElementById('obd-status-msg').textContent = cfg.msg;

  // Exibe o botão de conectar se estiver desconectado
  const btnConnect = document.getElementById('btn-obd-connect');
  if (btnConnect) {
    btnConnect.style.display = (state === 0 || state === 9) ? 'block' : 'none';
  }

  // Etapa 1: Conexão com o módulo PulseScan (qualquer estado > 0 indica conectado)
  if (state >= 1 && state <= 9) {
    if (stepBt) stepBt.classList.add('ok');
    if (lines[0]) lines[0].classList.add('ok');
  }

  if (state >= 1 && state <= 4) {
    if (stepCan) stepCan.classList.add(state === 1 ? 'active' : 'ok');
    if (state >= 3) {
      if (lines[1]) lines[1].classList.add('ok');
      if (stepEcu)  stepEcu.classList.add(state === 3 ? 'active' : 'ok');
    }
    if (state >= 4) {
      if (lines[2])  lines[2].classList.add('ok');
      if (stepFreq)  stepFreq.classList.add('ok');
    }
  }
  if (cfg.fail) {
    if (stepCan) stepCan.classList.add('fail');
  }

  // Só auto-fecha se for solicitado e for o estado ONLINE
  if (state === 4 && autoClose) {
    setTimeout(() => {
      // Só fecha se ainda estiver no estado 4
      if (ST.dados.obd_state === 4) closeOBDOverlay();
    }, 2500);
  }
}

async function toggleOBD() {
  document.getElementById('obd-overlay').classList.add('open');
  const st = ST.dados.obd_state || 0;
  updateOverlay(st, false); // Ao clicar manualmente, NUNCA auto-fecha
}

function closeOBDOverlay() {
  document.getElementById('obd-overlay').classList.remove('open');
}

// ==============================================================

let touchStartX = 0;
document.addEventListener('touchstart', e => {
  if (e.target.closest('#cpanel') || e.target.closest('#ov-bar') || e.target.closest('.widget') || e.target.closest('#mv-lock-btn') || e.target.closest('#obd-overlay')) return;
  touchStartX = e.changedTouches[0].screenX;
}, {passive: true});

document.addEventListener('touchend', e => {
  if (!touchStartX || ST.moving) return;
  const touchEndX = e.changedTouches[0].screenX;
  if (touchStartX - touchEndX > 50 && ST.pg < ST.cfg.orientations[ST.orientation].length - 1) goPg(ST.pg + 1);
  if (touchEndX - touchStartX > 50 && ST.pg > 0) goPg(ST.pg - 1);
  touchStartX = 0;
}, {passive: true});

async function init(){
  await loadFromESP();
  autoScale(); // Define a orientação física primeiro antes de renderizar

  // PREVINE WIDGETS DUPLICADOS (Ghost Widgets)
  document.querySelectorAll('.widget-layer').forEach(el => el.innerHTML = '');
  ST.cvs = {}; ST.widgetMap.clear();

  ST.cfg.orientations[ST.orientation].forEach((pg,idx)=>{
    if (pg && Array.isArray(pg.widgets)) {
      pg.widgets.forEach(w=> {
        if (w) mkWidget(w,idx);
      });
    }
    applyPageBg(idx);
  });
  runBootSequence();
  initTransport();
  initTrip(); // Inicializa o computador de bordo
  initPerf(); // Inicializa o histórico de performance
  setInterval(saveTrip, 60000); // Salva a viagem no localStorage a cada 60s (desafoga I/O síncrono da thread principal)
  bindEvents();
  requestAnimationFrame(update);

  toast('\u2726 PULSEDASH PREMIUM V6.6');
}

function bindEvents() {
  document.getElementById('pg-dots')?.addEventListener('click', e => {
    if (e.target.dataset.pg) goPg(parseInt(e.target.dataset.pg));
  });
  
  // Dashboard Overlays
  document.getElementById('obd-status-pill')?.addEventListener('click', toggleOBD);
  document.getElementById('fab')?.addEventListener('click', toggleEditor);
  
  // OBD Modal
  document.getElementById('btn-obd-close')?.addEventListener('click', closeOBDOverlay);
  document.getElementById('btn-obd-connect')?.addEventListener('click', manualConnect);
  
  // Editor Toolbar


  document.getElementById('btn-fs')?.addEventListener('click', toggleFS);
  document.getElementById('btn-bg')?.addEventListener('click', openBgMenu);
  document.getElementById('btn-add')?.addEventListener('click', openAddMenu);
  document.getElementById('btn-exit')?.addEventListener('click', exitEditor);
  
  // Move Lock
  document.getElementById('mv-lock-btn')?.addEventListener('click', toggleMoveMode);
  
  // Modais de Edição (Delegação Global)
  document.body.addEventListener('click', e => {
    if (e.target.id === 'addmenu') closeAddMenu();
    if (e.target.id === 'bgmenu') closeBgMenu();
    
    if (e.target.id === 'btn-del') delWidget();
    if (e.target.id === 'btn-save-panel') closePanel();
    if (e.target.id === 'btn-swap-cpanel') document.getElementById('cpanel').classList.toggle('right');
    if (e.target.id === 'btn-close-bg') closeBgMenu();

    if (e.target.id === 'btn-trigger-bg-picker') {
      document.getElementById('bg-file-picker')?.click();
    }
    if (e.target.id === 'btn-trigger-w-picker') {
      document.getElementById('w-file-picker')?.click();
    }

    if (e.target.closest('#btn-del-bg')) {
      const selBg = document.getElementById('bg-url');
      if (selBg && selBg.value.startsWith('data:image')) {
        removeCustomImage(selBg.value);
        const opt = selBg.querySelector(`option[value="${selBg.value}"]`);
        if(opt) opt.remove();
        selBg.value = '';
        applyBg();
        document.getElementById('btn-del-bg').style.display = 'none';
        toast('🗑️ IMAGEM APAGADA DA GALERIA');
      }
    }
    if (e.target.closest('#btn-del-img')) {
      const selImg = document.getElementById('c-img-url');
      if (selImg && selImg.value.startsWith('data:image')) {
        removeCustomImage(selImg.value);
        const opt = selImg.querySelector(`option[value="${selImg.value}"]`);
        if(opt) opt.remove();
        selImg.value = '';
        applyConfig('c-img-url');
        document.getElementById('btn-del-img').style.display = 'none';
        toast('🗑️ IMAGEM APAGADA DA GALERIA');
      }
    }

    const lpItem = e.target.closest('.lp-item');
    if (lpItem) { closeLayerPicker(); selWidget(lpItem.dataset.wid, parseInt(lpItem.dataset.pg)); }
    
    const lpJoin = e.target.closest('.lp-join-btn');
    if (lpJoin) joinGroup(JSON.parse(lpJoin.dataset.wids), parseInt(lpJoin.dataset.pg));
    
    const btnSep = e.target.closest('.btn-separar');
    if (btnSep) separarWidget(btnSep.dataset.wid, parseInt(btnSep.dataset.pg));
  });

  // Trata o carregamento de arquivos de imagem locais da galeria (Base64)
  document.body.addEventListener('change', e => {
    if (e.target.id === 'bg-file-picker') {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 3.5 * 1024 * 1024) {
          alert('❌ Imagem muito pesada (Limite de 3.5MB). Reduza no celular antes de enviar.');
          e.target.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
          const base64 = evt.target.result;

          // Salva na biblioteca interna do App
          try {
            let customImgs = [];
            const str = localStorage.getItem('pulsedash_custom_images');
            if (str) customImgs = JSON.parse(str);
            if (!customImgs.includes(base64)) {
              customImgs.push(base64);
              localStorage.setItem('pulsedash_custom_images', JSON.stringify(customImgs));
              ST.imgList.push(base64);
            }
          } catch(err) {
            console.error("Erro salvando imagem de fundo", err);
            if (err.name === 'QuotaExceededError' || err.code === 22) {
              alert('❌ Limite de armazenamento atingido! Apague imagens antigas.');
              return;
            }
          }

          const pg = ST.cfg.orientations[ST.orientation][ST.pg];
          if(pg) {
            pg.bg.img = base64;
            applyPageBg(ST.pg);
            saveToESP();
            toast("📸 FUNDO ATUALIZADO E SALVO!");
          }
          const selBg = document.getElementById('bg-url');
          if (selBg) {
            let opt = [...selBg.options].find(o => o.value === base64);
            if (!opt) {
              opt = document.createElement('option');
              opt.value = base64;
              opt.text = "➔ Customizada Salva";
              selBg.appendChild(opt);
            }
            opt.selected = true;
          }
        };
        reader.readAsDataURL(file);
      }
    }
    
    if (e.target.id === 'w-file-picker') {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 3.5 * 1024 * 1024) {
          alert('❌ Imagem muito pesada (Limite de 3.5MB). Reduza no celular antes de enviar.');
          e.target.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
          const base64 = evt.target.result;

          // Salva na biblioteca interna do App
          try {
            let customImgs = [];
            const str = localStorage.getItem('pulsedash_custom_images');
            if (str) customImgs = JSON.parse(str);
            if (!customImgs.includes(base64)) {
              customImgs.push(base64);
              localStorage.setItem('pulsedash_custom_images', JSON.stringify(customImgs));
              ST.imgList.push(base64);
            }
          } catch(err) {
            console.error("Erro salvando imagem customizada", err);
            if (err.name === 'QuotaExceededError') {
              alert('❌ Limite de armazenamento atingido! Apague imagens antigas.');
              return;
            }
          }

          if (ST.sel) {
            const w = ST.widgetMap.get(ST.sel);
            if (w) {
              const oldDiv = document.getElementById(`W-${w.id}`);
              if (oldDiv) oldDiv.remove();

              w.url = base64;
              mkWidget(w, ST.pg);
              saveToESP();
              toast("📸 IMAGEM ATUALIZADA E SALVA!");
              
              const selImg = document.getElementById('c-img-url');
              if (selImg) {
                let opt = [...selImg.options].find(o => o.value === base64);
                if (!opt) {
                  opt = document.createElement('option');
                  opt.value = base64;
                  opt.text = "➔ Customizada Salva";
                  selImg.appendChild(opt);
                }
                opt.selected = true;
              }
            }
          }
        };
        reader.readAsDataURL(file);
      }
    }
  });

  // Editor Inputs (Delegação)
  const cpanel = document.getElementById('cpanel');
  if(cpanel) {
    cpanel.addEventListener('input', e => {
      if (e.target.matches('.frange, .fcol, .finp')) {
        const fv = e.target.parentElement.querySelector('.fv');
        if (fv) fv.innerText = e.target.value;
        applyConfig(e.target.id);
      }
    });
    cpanel.addEventListener('change', e => {
      if (e.target.matches('.fsel, .finp')) applyConfig(e.target.id);
      if (e.target.id === 'c-img-url') {
        const btn = document.getElementById('btn-del-img');
        if(btn) btn.style.display = e.target.value.startsWith('data:image') ? 'block' : 'none';
      }
    });
  }

  // Performance Panel
  document.getElementById('perf-btn')?.addEventListener('click', () => {
    PERF.open = true;
    document.getElementById('perf-overlay').classList.add('open');
    resetPerf();
  });
  document.getElementById('btn-perf-close')?.addEventListener('click', () => {
    PERF.open = false;
    document.getElementById('perf-overlay').classList.remove('open');
  });
  document.getElementById('btn-perf-reset')?.addEventListener('click', resetPerf);

  // Trip Computer Panel
  document.getElementById('trip-btn')?.addEventListener('click', () => {
    TRIP.open = true;
    document.getElementById('trip-overlay').classList.add('open');
    updateTripUI();
  });
  document.getElementById('btn-trip-close')?.addEventListener('click', () => {
    TRIP.open = false;
    document.getElementById('trip-overlay').classList.remove('open');
  });
  document.getElementById('btn-trip-reset')?.addEventListener('click', resetTrip);

  // Alternância de Abas do Computador de Bordo (Diário vs Trip A)
  document.getElementById('tab-trip-diario')?.addEventListener('click', () => {
    document.getElementById('tab-trip-diario').classList.add('active');
    document.getElementById('tab-trip-a').classList.remove('active');
    document.getElementById('trip-content-diario').classList.add('active');
    document.getElementById('trip-content-a').classList.remove('active');
  });

  document.getElementById('tab-trip-a')?.addEventListener('click', () => {
    document.getElementById('tab-trip-a').classList.add('active');
    document.getElementById('tab-trip-diario').classList.remove('active');
    document.getElementById('trip-content-a').classList.add('active');
    document.getElementById('trip-content-diario').classList.remove('active');
  });

  // Histórico de Viagens (7 Dias)
  document.getElementById('btn-trip-history')?.addEventListener('click', () => {
    const popup = document.getElementById('trip-hist-popup');
    if (popup) {
      popup.style.display = 'flex';
      const list = document.getElementById('trip-hist-list');
      if (list) list.innerHTML = '<div style="text-align: center; color: #666; font-family: \'Rajdhani\'; font-size: 12px; margin-top: 30px;">Buscando histórico na ESP32...</div>';
      
      // Solicita os dados via Bluetooth
      if (typeof window.bluetoothSerial !== 'undefined') {
        window.bluetoothSerial.write('{"cmd":"trip_hist"}\n');
      }
    }
  });

  document.getElementById('btn-trip-hist-close')?.addEventListener('click', () => {
    const popup = document.getElementById('trip-hist-popup');
    if (popup) popup.style.display = 'none';
  });

  // Ouvintes do Modal de Configuração Rápida de Combustível (Canetinha)
  document.getElementById('btn-trip-edit-price')?.addEventListener('click', () => {
    const popup = document.getElementById('trip-edit-popup');
    if (popup) {
      const inpPrice = document.getElementById('trip-inp-price');
      const selType = document.getElementById('trip-sel-type');
      if (inpPrice) inpPrice.value = (TRIP.price !== null && TRIP.price > 0) ? TRIP.price.toFixed(2) : '';
      if (selType) selType.value = TRIP.fuelType;
      popup.style.display = 'flex';
    }
  });

  document.getElementById('btn-trip-popup-close')?.addEventListener('click', () => {
    const popup = document.getElementById('trip-edit-popup');
    if (popup) popup.style.display = 'none';
  });

  document.getElementById('btn-trip-popup-save')?.addEventListener('click', () => {
    const popup = document.getElementById('trip-edit-popup');
    const inpPrice = document.getElementById('trip-inp-price');
    const selType = document.getElementById('trip-sel-type');
    
    if (inpPrice) {
      const rawVal = inpPrice.value.trim();
      if (rawVal === '') {
        TRIP.price = null;
      } else {
        const val = parseFloat(rawVal);
        if (!isNaN(val) && val >= 0) {
          TRIP.price = val;
        } else {
          TRIP.price = null;
        }
      }
    }
    
    if (selType) {
      TRIP.fuelType = selType.value;
    }
    
    saveTrip();
    updateTripUI();
    if (popup) popup.style.display = 'none';
    toast('💾 CONFIGURAÇÕES SALVAS');
    
    // Sincroniza o novo preço com a ESP32 v6.5 via Bluetooth
    if (typeof window.bluetoothSerial !== 'undefined' && TRIP.price !== null) {
      window.bluetoothSerial.write(`{"cmd":"price", "val":${TRIP.price}}\n`);
    }
  });

  document.getElementById('bg-url')?.addEventListener('change', e => {
    applyBg();
    const btn = document.getElementById('btn-del-bg');
    if(btn) btn.style.display = e.target.value.startsWith('data:image') ? 'block' : 'none';
  });
  document.getElementById('bg-size')?.addEventListener('change', applyBg);
}

function removeCustomImage(base64) {
  if (!base64 || !base64.startsWith('data:image')) return;
  try {
    const str = localStorage.getItem('pulsedash_custom_images');
    if (str) {
      let customImgs = JSON.parse(str);
      customImgs = customImgs.filter(i => i !== base64);
      localStorage.setItem('pulsedash_custom_images', JSON.stringify(customImgs));
    }
    ST.imgList = ST.imgList.filter(i => i !== base64);
  } catch(e) {}
}

init();


