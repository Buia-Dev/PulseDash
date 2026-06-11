'use strict';
import { ST, CFG_DEF, LOCAL_IMAGES } from './state.js';
import { PROFILES } from './profiles_db.js';
import { renderWidget } from './renderers.js';
import {
  mkWidget, toggleEditor, exitEditor, openBgMenu, openAddMenu,
  delWidget, closePanel, toggleMoveMode, closeAddMenu, closeBgMenu,
  applyBg, applyConfig, closeLayerPicker, selWidget, joinGroup, separarWidget, rmWidget
} from './editor.js';
import { PERF, updatePerf, resetPerf, initPerf } from './perf.js';
import { TRIP, initTrip, updateTripUI, resetTrip, saveTrip, renderTripHistoryList } from './trip.js';
import { initTransport, saveToESP, loadFromESP, manualConnect } from './transport.js';
import { toast, applyPageBg } from './utils.js';
import { initDB, saveCustomImage, getAllCustomImages } from './db.js';
import { translateDTC } from './dtc_db.js';

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

    // MIGRAÇÃO ANTI-FANTASMA: Detecta IDs duplicados entre páginas e renomeia.
    // Causa raiz do bug "widget fantasma": se pg0 e pg1 têm widget com mesmo ID,
    // o ST.cvs[id] é sobrescrito e a página mais antiga perde o contexto canvas.
    const seenIds = new Set();
    cfg.orientations[ori].forEach(pg => {
      if (!pg || !Array.isArray(pg.widgets)) return;
      pg.widgets.forEach(w => {
        if (!w || !w.id) return;
        if (seenIds.has(w.id)) {
          // ID duplicado encontrado — atribui ID único novo
          w.id = 'w' + Date.now() + Math.floor(Math.random() * 99999);
        }
        seenIds.add(w.id);
      });
    });
  });
  return true;
}




function autoScale() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  
  const newOri = (w > h) ? 'landscape' : 'portrait';
  const baseW = newOri === 'landscape' ? 915 : 412;
  const baseH = newOri === 'landscape' ? 412 : 820;
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
    appEl.style.width = '';
    appEl.style.height = '';
    appEl.style.transform = '';
    appEl.style.setProperty('--scale', ST.scale);
  }
  
  const scaledW = baseW * ST.scale;
  const scaledH = baseH * ST.scale;
  const offsetX = (w - scaledW) / 2;
  const offsetY = (h - scaledH) / 2;
  
  const vp = document.getElementById('viewport');
  if (vp) {
    vp.style.width = '100%';
    vp.style.height = '100%';
    vp.style.transform = '';
    vp.style.left = '0px';
    vp.style.top = '0px';
    vp.classList.remove('viewport-device');
  }
  
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
  const baseH = ST.orientation === 'landscape' ? 412 : 820;
  
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
  
  // Invalida o cache lazy render de TODOS os widgets da nova página
  // Sem isso, o lazy render acha que "não mudou nada" e deixa o canvas em branco (bug fantasma)
  ST.widgetMap.forEach(w => {
    if (w.pg === idx) delete w._lastDrawS;
  });
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

  ST.frameCount = (ST.frameCount || 0) + 1;

  if (ST.frameCount < 120) {
    ST.widgetMap.forEach(w => {
      if (w && w.pg === ST.pg) delete w._lastDrawS;
    });
  }

  // Redesenha widgets da página ativa (ou todos no editor).
  // CORREÇÃO FANTASMA DEFINITIVA: Widgets que NUNCA foram pintados (_lastDrawS === undefined)
  // também são pintados agora, independente da página ativa. Isso garante que widgets de pg 2+
  // recebam a primeira pintura mesmo sem o usuário navegar até lá.
  for(const wid in ST.cvs){ 
    const w = ST.widgetMap.get(wid);
    const neverPainted = w && w._lastDrawS === undefined;
    if(w && (w.pg === ST.pg || ST.editor || neverPainted)) {
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
        const elLoop = document.getElementById('step-loop-detail');
        if (elLoop) elLoop.textContent = `${ST.dados.loopMs ?? 0} ms`;
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
  const stepLoop = document.getElementById('step-loop');
  const lines    = document.querySelectorAll('.obd-line');

  [stepBt, stepCan, stepEcu, stepFreq, stepLoop].forEach(s => { if(s) s.className = 'obd-step'; });
  lines.forEach(l => l.className = 'obd-line');

  const stepBtLabel = document.getElementById('step-bt-label');
  if (stepBtLabel) {
    stepBtLabel.textContent = 'BLUETOOTH (PULSESCAN)';
  }

  const dBt   = document.getElementById('step-bt-detail');
  const dCan  = document.getElementById('step-can-detail');
  const dEcu  = document.getElementById('step-ecu-detail');
  const dFreq = document.getElementById('step-freq-detail');
  const dLoop = document.getElementById('step-loop-detail');
  if (dBt)   dBt.textContent   = cfg.detBt;
  if (dCan)  dCan.textContent  = cfg.detCan;
  if (dEcu)  dEcu.textContent  = cfg.detEcu;
  if (dFreq) dFreq.textContent = state === 4 ? `${_freqHz} Hz` : cfg.detFreq;
  if (dLoop) dLoop.textContent = state === 4 ? `${ST.dados.loopMs ?? 0} ms` : '-- ms';
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
      if (lines[3])  lines[3].classList.add('ok');
      if (stepLoop)  stepLoop.classList.add('ok');
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

// ==============================================================
// ★ SISTEMA DE CONFIGURAÇÃO DO VEÍCULO v7.0 ★
// ==============================================================
const BRAND_PROFILES = {
  chevrolet: ['generic', 'gm_ls', 'opel_kwp2000'],
  fiat: ['generic', 'fiat_precan'],
  ford: ['generic'],
  honda: ['generic'],
  hyundai: ['generic'],
  nissan: ['generic', 'nissan_generic'],
  renault: ['generic'],
  toyota: ['generic', 'toyota_celica_corolla_camry', 'toyota_gt86', 'toyota_jdm_generic', 'toyota_jdm_iso9141', 'toyota_rav4_supra_lexus_is', 'toyota_vitz'],
  volkswagen: ['generic', 'bosch_mp70', 'january_5_1', 'Itelma_M73_E3'],
  outra: ['generic', 'bosch_mp70', 'fiat_precan', 'gm_ls', 'Itelma_M73_E3', 'january_5_1', 'mitsubishi_mut', 'nissan_generic', 'opel_kwp2000', 'saab_generic', 'toyota_celica_corolla_camry', 'toyota_gt86', 'toyota_jdm_generic', 'toyota_jdm_iso9141', 'toyota_rav4_supra_lexus_is', 'toyota_vitz', 'volvo_noncan1', 'volvo_noncan2']
};

const PROFILE_LABELS = {
  generic: "Padrão OBD2 Genérico",
  bosch_mp70: "Bosch MP7.0 (Mi antigo)",
  fiat_precan: "Fiat Pre-CAN (Marelli)",
  gm_ls: "GM LS V8 (Estendido)",
  Itelma_M73_E3: "Itelma M73 E3 (Lada)",
  january_5_1: "January 5.1 (Yanvar)",
  mitsubishi_mut: "Mitsubishi MUT",
  nissan_generic: "Nissan (Genérico)",
  opel_kwp2000: "Opel KWP2000 (Astra/Vectra)",
  saab_generic: "Saab (Genérico)",
  toyota_celica_corolla_camry: "Toyota (Celica/Corolla/Camry)",
  toyota_gt86: "Toyota GT86 / BRZ",
  toyota_jdm_generic: "Toyota JDM Genérico",
  toyota_jdm_iso9141: "Toyota JDM ISO9141",
  toyota_rav4_supra_lexus_is: "Toyota RAV4/Supra/Lexus",
  toyota_vitz: "Toyota Vitz / Yaris",
  volvo_noncan1: "Volvo Non-CAN Tipo 1",
  volvo_noncan2: "Volvo Non-CAN Tipo 2"
};

function updateProfileOptions(brand, selectedProfile) {
  const selProfile = document.getElementById('car-sel-profile');
  if (!selProfile) return;
  selProfile.innerHTML = '';
  
  const profilesList = BRAND_PROFILES[brand] || BRAND_PROFILES['outra'];
  profilesList.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = PROFILE_LABELS[p] || p.toUpperCase();
    if (p === selectedProfile) {
      opt.selected = true;
    }
    selProfile.appendChild(opt);
  });
}

function openCarOverlay() {
  document.getElementById('car-overlay').classList.add('open');
  
  // Carrega valores do estado para os campos da tela
  const c = ST.car || { brand: 'chevrolet', model: 'Onix 2026', engine: '1.0', aspiration: 'turbo', fuel: 'flex', tank: 44, profile: 'generic' };
  document.getElementById('car-sel-brand').value = c.brand || 'chevrolet';
  document.getElementById('car-inp-model').value = c.model || '';
  document.getElementById('car-sel-engine').value = c.engine || '1.0';
  document.getElementById('car-sel-aspiration').value = c.aspiration || 'turbo';
  document.getElementById('car-sel-fuel').value = c.fuel || 'flex';
  document.getElementById('car-inp-tank').value = c.tank || '';
  
  updateProfileOptions(c.brand || 'chevrolet', c.profile || 'generic');
}

function closeCarOverlay() {
  document.getElementById('car-overlay').classList.remove('open');
}

function saveCarConfig() {
  const brand = document.getElementById('car-sel-brand').value;
  const model = document.getElementById('car-inp-model').value.trim();
  const engine = document.getElementById('car-sel-engine').value;
  const aspiration = document.getElementById('car-sel-aspiration').value;
  const fuel = document.getElementById('car-sel-fuel').value;
  const tank = parseFloat(document.getElementById('car-inp-tank').value) || 44;
  const profile = document.getElementById('car-sel-profile').value || 'generic';

  ST.car = { brand, model, engine, aspiration, fuel, tank, profile };
  localStorage.setItem('PULSEDASH_CAR', JSON.stringify(ST.car));
  
  toast('✅ VEÍCULO SALVO');
  closeCarOverlay();
}

// ==============================================================
// ★ SISTEMA DE DIAGNÓSTICO DTC (CONSOLE CMD) v6.8 ★
// ==============================================================
let selectedDtcCode = null;
const searchedCodes = new Set();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

let dtcTimers = [];
let dtcResolves = [];

function clearDtcTimers() {
  dtcTimers.forEach(clearInterval);
  dtcTimers = [];
  dtcResolves.forEach(resolve => resolve());
  dtcResolves = [];
}

function toggleDtcOverlay() {
  document.getElementById('dtc-overlay').classList.add('open');
  resetDtcConsole();
}

function closeDtcOverlay() {
  document.getElementById('dtc-overlay').classList.remove('open');
  clearDtcTimers();
  const consoleEl = document.getElementById('dtc-console');
  if (consoleEl) {
    consoleEl.innerHTML = '';
  }
  selectedDtcCode = null;
  searchedCodes.clear();
  document.getElementById('btn-dtc-clear').style.display = 'none';
  document.getElementById('btn-dtc-google').style.display = 'none';
}

async function resetDtcConsole() {
  clearDtcTimers();
  selectedDtcCode = null;
  searchedCodes.clear();
  document.getElementById('btn-dtc-clear').style.display = 'none';
  document.getElementById('btn-dtc-google').style.display = 'none';
  
  const consoleEl = document.getElementById('dtc-console');
  if (consoleEl) {
    consoleEl.innerHTML = '';
    // Efeito de digitação inicial no boot da tela
    await typeConsoleLine('> PULSE-SCAN TERMINAL v1.0', 'text-green', 12);
    await typeConsoleLine('> STATUS: CONECTADO E PRONTO.', 'text-green', 12);
    await typeConsoleLine('> Clique em "BUSCAR ERROS" para iniciar a leitura de DTCs.', 'text-gray', 12);
  }
}

function scrollToBottom() {
  const consoleEl = document.getElementById('dtc-console');
  if (consoleEl) {
    requestAnimationFrame(() => {
      setTimeout(() => {
        consoleEl.scrollTop = consoleEl.scrollHeight;
      }, 30);
    });
  }
}

/**
 * Imprime uma linha de texto no console caracter por caracter.
 * Retorna uma promessa resolvida ao término da animação.
 */
function typeConsoleLine(text, styleClass = '', speedMs = 15) {
  return new Promise((resolve) => {
    const consoleEl = document.getElementById('dtc-console');
    if (!consoleEl) {
      resolve();
      return;
    }
    
    const line = document.createElement('div');
    line.className = `terminal-line ${styleClass}`;
    consoleEl.appendChild(line);
    
    let index = 0;
    line.textContent = ' ';
    
    let resolved = false;
    const safeResolve = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };
    
    const timer = setInterval(() => {
      if (index < text.length) {
        line.textContent = text.substring(0, index + 1) + '█';
        index++;
        scrollToBottom();
      } else {
        clearInterval(timer);
        const tIdx = dtcTimers.indexOf(timer);
        if (tIdx > -1) dtcTimers.splice(tIdx, 1);
        const rIdx = dtcResolves.indexOf(safeResolve);
        if (rIdx > -1) dtcResolves.splice(rIdx, 1);
        line.textContent = text; // Remove cursor no final
        scrollToBottom();
        safeResolve();
      }
    }, speedMs);
    
    dtcTimers.push(timer);
    dtcResolves.push(safeResolve);
  });
}

function writeConsoleLine(text, styleClass = '') {
  const consoleEl = document.getElementById('dtc-console');
  if (!consoleEl) return;
  const line = document.createElement('div');
  line.className = `terminal-line ${styleClass}`;
  line.textContent = text;
  consoleEl.appendChild(line);
  scrollToBottom();
}

async function runDtcScan() {
  clearDtcTimers();
  selectedDtcCode = null;
  document.getElementById('btn-dtc-clear').style.display = 'none';
  document.getElementById('btn-dtc-google').style.display = 'none';
  
  const consoleEl = document.getElementById('dtc-console');
  if (!consoleEl) return;
  
  // Desativa e esmaece itens de erro antigos na tela
  document.querySelectorAll('.dtc-item').forEach(el => {
    el.style.opacity = '0.5';
    el.style.pointerEvents = 'none';
    el.classList.remove('selected');
  });
  
  await typeConsoleLine('> INICIANDO BUSCA DE ERROS NA CENTRAL...', 'text-cyan', 12);
  await typeConsoleLine('> CONECTANDO COM ECU VIA OBD2...', 'text-gray', 12);
  await delay(400);
  await typeConsoleLine('> AGUARDANDO RESPOSTA DA ECU...', 'text-gray', 12);
  await delay(500);
  
  // Envia o pedido real para o firmware (o mock antigo foi removido)
  if (typeof window.bluetoothSerial !== 'undefined') {
    window.bluetoothSerial.write('{"cmd":"dtc_scan"}\n');
  }

  await typeConsoleLine('> LENDO CÓDIGOS DE FALHA (DTCs)...', 'text-gray', 12);
  await delay(200);
  await typeConsoleLine('> AGUARDANDO RESPOSTA DO MÓDULO PULSESCAN...', 'text-gray', 12);

  // A partir daqui a renderização dos cards reais acontece quando o evento 'dtc_data'
  // chegar (listener adicionado abaixo). O fluxo de typing e UI permanece idêntico.
}

async function runDtcClear() {
  clearDtcTimers();
  const consoleEl = document.getElementById('dtc-console');
  if (!consoleEl) return;
  
  // Desativa e esmaece itens de erro antigos na tela
  document.querySelectorAll('.dtc-item').forEach(el => {
    el.style.opacity = '0.5';
    el.style.pointerEvents = 'none';
    el.classList.remove('selected');
  });

  // Envia comando real de limpeza para o firmware
  if (typeof window.bluetoothSerial !== 'undefined') {
    window.bluetoothSerial.write('{"cmd":"dtc_clear"}\n');
  }

  await typeConsoleLine('> SOLICITANDO APAGAMENTO DE ERROS (MODO 04)...', 'text-yellow', 12);
  await delay(600);
  await typeConsoleLine('> FALHAS APAGADAS COM SUCESSO.', 'text-green', 12);
  await delay(300);
  await typeConsoleLine('> REINICIANDO BUSCA...', 'text-gray', 12);
  await delay(400);
  await typeConsoleLine('> INICIANDO RE-ESCANEAMENTO...', 'text-cyan', 12);
  await delay(500);
  await typeConsoleLine('> NENHUM ERRO ENCONTRADO NA ECU.', 'text-green', 12);
  
  selectedDtcCode = null;
  document.getElementById('btn-dtc-clear').style.display = 'none';
  document.getElementById('btn-dtc-google').style.display = 'none';
}

async function searchDtcGoogle() {
  if (!selectedDtcCode) return;
  
  await typeConsoleLine(`> Buscando no Google: ${selectedDtcCode}`, 'text-cyan', 10);
  
  searchedCodes.add(selectedDtcCode);
  const selectedEl = document.querySelector('.dtc-item.selected');
  if (selectedEl) {
    const icon = selectedEl.querySelector('.dtc-item-google-icon');
    if (icon) icon.style.display = 'inline';
  }
  
  // O charme do delay de 1 segundo solicitado para contemplar o efeito visual
  await delay(1000);
  
  let brand = ST.car?.brand || 'Fiat'; 
  const query = `OBD2 DTC ${selectedDtcCode} ${brand}`;
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  window.open(url, '_blank');
}

// ==============================================================
// Listener para DTC real vindo do firmware (via CustomEvent do transport.js)
// Reaproveita 100% do código de renderização de cards + typing já existente.
// ==============================================================
document.addEventListener('dtc_data', async (e) => {
  clearDtcTimers();
  const codes = e.detail || [];
  const consoleEl = document.getElementById('dtc-console');
  if (!consoleEl) return;

  // Limpa estado anterior
  selectedDtcCode = null;
  searchedCodes.clear();
  document.getElementById('btn-dtc-clear').style.display = 'none';
  document.getElementById('btn-dtc-google').style.display = 'none';

  // Desativa cards antigos
  document.querySelectorAll('.dtc-item').forEach(el => {
    el.style.opacity = '0.5';
    el.style.pointerEvents = 'none';
    el.classList.remove('selected');
  });

  if (codes.length > 0) {
    await typeConsoleLine(`> ERROS ENCONTRADOS: ${codes.length} CÓDIGOS ATIVOS.`, 'text-red', 12);
    await delay(150);

    for (const code of codes) {
      const desc = translateDTC(code);
      const item = document.createElement('div');
      item.className = 'dtc-item';
      item.dataset.code = code;
      item.style.opacity = '0';
      item.style.transition = 'opacity 0.4s ease-out';
      item.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
          <span class="dtc-item-code">${code}</span>
          <span class="dtc-item-desc">${desc}</span>
        </div>
        <span class="dtc-item-google-icon" style="display: ${searchedCodes.has(code) ? 'inline' : 'none'}; font-size: 14px; margin-left: 10px;">🌐</span>
      `;

      item.addEventListener('click', () => {
        document.querySelectorAll('.dtc-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        selectedDtcCode = code;
        document.getElementById('btn-dtc-google').style.display = 'inline-block';
      });

      consoleEl.appendChild(item);
      item.offsetHeight;
      item.style.opacity = '1';
      scrollToBottom();
      await delay(220);
    }

    document.getElementById('btn-dtc-clear').style.display = 'inline-block';
  } else {
    await typeConsoleLine('> NENHUM ERRO ENCONTRADO NA ECU.', 'text-green', 12);
  }
});

// Listener para resultado do clear (para a comunicação ser completa e o app reagir ao que o firmware realmente enviou)
document.addEventListener('dtc_clear_result', (e) => {
  const success = !!(e.detail && e.detail.success);
  const consoleEl = document.getElementById('dtc-console');
  if (!consoleEl) return;

  // Adiciona uma linha final no console refletindo o resultado real do firmware
  const line = document.createElement('div');
  line.className = success ? 'terminal-line text-green' : 'terminal-line text-red';
  line.textContent = success 
    ? '> FALHAS APAGADAS COM SUCESSO (confirmado pelo módulo).'
    : '> FALHA AO APAGAR ERROS (o módulo não confirmou).';
  consoleEl.appendChild(line);
  scrollToBottom();
});

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
  if (e.target.closest('#cpanel') || e.target.closest('#ov-bar') || (ST.editor && e.target.closest('.widget')) || e.target.closest('#mv-lock-btn') || e.target.closest('#obd-overlay') || e.target.closest('#perf-overlay') || e.target.closest('#trip-overlay')) return;
  touchStartX = e.changedTouches[0].screenX;
}, {passive: true});

document.addEventListener('touchend', e => {
  if (!touchStartX || ST.moving) return;
  const touchEndX = e.changedTouches[0].screenX;
  if (touchStartX - touchEndX > 50 && ST.pg < ST.cfg.orientations[ST.orientation].length - 1) goPg(ST.pg + 1);
  if (touchEndX - touchStartX > 50 && ST.pg > 0) goPg(ST.pg - 1);
  touchStartX = 0;
}, {passive: true});

async function migrateLegacyImages() {
  try {
    const str = localStorage.getItem('pulsedash_custom_images');
    if (str) {
      const arr = JSON.parse(str);
      for (let i = 0; i < arr.length; i++) {
        const id = 'img_' + Date.now() + '_' + i;
        await saveCustomImage(id, 'Imagem ' + (i+1), arr[i]);
      }
      localStorage.removeItem('pulsedash_custom_images');
      console.log('Migrated', arr.length, 'legacy images to IndexedDB.');
    }
  } catch (e) {
    console.error('Migration failed:', e);
  }
}

async function init(){
  await initDB();
  await migrateLegacyImages();
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

  // CORREÇÃO FANTASMA: Pintura inicial forçada de TODOS os widgets de TODAS as páginas.
  // O loop update() só pinta a página ativa, então widgets de pg 2+ nunca receberiam a primeira
  // pintura e ficariam com canvas transparente (invisíveis) até o usuário abrir o editor.
  // Usamos requestAnimationFrame para garantir que o layout DOM já foi calculado antes de pintar.
  requestAnimationFrame(() => {
    for (const wid in ST.cvs) {
      const w = ST.widgetMap.get(wid);
      const c = ST.cvs[wid];
      if (w && c) {
        delete w._lastDrawS; // Garante que o lazy render não pule
        renderWidget(c.ctx, w, c.cW/2, c.cH/2);
      }
    }
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

// --- SISTEMA DE DRAG TEMPORÁRIO DO BACKGROUND ---
let bgStartX = 0, bgStartY = 0;
let startX = 0, startY = 0;
let isDraggingBg = false;

const getTouchXY = e => {
  let touch = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
  return { x: touch.clientX, y: touch.clientY };
};

const onBgMouseDown = e => {
  if (!ST.editor || !ST.movingBg) return;
  if (e.target.closest('#cpanel') || e.target.closest('#bgmenu') || e.target.closest('#mv-lock-btn') || e.target.closest('#ov-bar')) return;
  
  isDraggingBg = true;
  const pt = getTouchXY(e);
  startX = pt.x;
  startY = pt.y;
  
  const pg = ST.cfg.orientations[ST.orientation][ST.pg];
  if (!pg.bg) pg.bg = { img: '', size: 'cover', opacity: 1, x: 0, y: 0 };
  bgStartX = pg.bg.x !== undefined ? pg.bg.x : 0;
  bgStartY = pg.bg.y !== undefined ? pg.bg.y : 0;
};

const onBgMouseMove = e => {
  if (!isDraggingBg || !ST.movingBg) return;
  const pt = getTouchXY(e);
  const dx = (pt.x - startX) / ST.scale;
  const dy = (pt.y - startY) / ST.scale;
  
  const pg = ST.cfg.orientations[ST.orientation][ST.pg];
  pg.bg.x = bgStartX + dx;
  pg.bg.y = bgStartY + dy;
  
  applyPageBg(ST.pg);
};

const onBgMouseUp = () => {
  isDraggingBg = false;
};

function startBgDrag() {
  document.addEventListener('mousedown', onBgMouseDown);
  document.addEventListener('mousemove', onBgMouseMove);
  document.addEventListener('mouseup', onBgMouseUp);

  document.addEventListener('touchstart', onBgMouseDown, { passive: false });
  document.addEventListener('touchmove', onBgMouseMove, { passive: false });
  document.addEventListener('touchend', onBgMouseUp);
}

function stopBgDrag() {
  document.removeEventListener('mousedown', onBgMouseDown);
  document.removeEventListener('mousemove', onBgMouseMove);
  document.removeEventListener('mouseup', onBgMouseUp);

  document.removeEventListener('touchstart', onBgMouseDown);
  document.removeEventListener('touchmove', onBgMouseMove);
  document.removeEventListener('touchend', onBgMouseUp);
  
  isDraggingBg = false;
}

function bindEvents() {
  document.getElementById('pg-dots')?.addEventListener('click', e => {
    if (e.target.dataset.pg) goPg(parseInt(e.target.dataset.pg));
  });
  
  // Dashboard Overlays
  document.getElementById('obd-status-pill')?.addEventListener('click', toggleOBD);
  document.getElementById('fab')?.addEventListener('click', toggleEditor);
  document.getElementById('dtc-btn')?.addEventListener('click', toggleDtcOverlay);
  
  // OBD Modal
  document.getElementById('btn-obd-close')?.addEventListener('click', closeOBDOverlay);
  document.getElementById('btn-obd-connect')?.addEventListener('click', manualConnect);
  
  // DTC Modal
  document.getElementById('btn-dtc-close')?.addEventListener('click', closeDtcOverlay);
  document.getElementById('btn-dtc-scan')?.addEventListener('click', runDtcScan);
  document.getElementById('btn-dtc-clear')?.addEventListener('click', runDtcClear);
  document.getElementById('btn-dtc-google')?.addEventListener('click', searchDtcGoogle);

  // Car Config Modal v7.0
  document.getElementById('car-cfg-btn')?.addEventListener('click', openCarOverlay);
  document.getElementById('btn-car-close')?.addEventListener('click', closeCarOverlay);
  document.getElementById('btn-car-save')?.addEventListener('click', saveCarConfig);
  document.getElementById('car-sel-brand')?.addEventListener('change', (e) => {
    updateProfileOptions(e.target.value, ST.car?.profile || 'generic');
  });
  
  document.getElementById('btn-fs')?.addEventListener('click', toggleFS);
  document.getElementById('btn-bg')?.addEventListener('click', openBgMenu);
  document.getElementById('btn-add')?.addEventListener('click', openAddMenu);
  document.getElementById('btn-exit')?.addEventListener('click', exitEditor);
  
  // Move Lock
  document.getElementById('mv-lock-btn')?.addEventListener('click', e => {
    if (ST.movingBg) {
      ST.movingBg = false;
      stopBgDrag(); // Desativa e remove listeners globais temporários
      const lockBtn = document.getElementById('mv-lock-btn');
      if (lockBtn) {
        lockBtn.classList.remove('active');
        lockBtn.innerHTML = '<b>🔓</b><span>MOVER</span>';
      }
      saveToESP();
      toast('🔒 POSIÇÃO DO FUNDO SALVA E TRAVADA!');
      setTimeout(() => {
        openBgMenu();
      }, 400);
      return;
    }
    toggleMoveMode();
  });
  
  // Modais de Edição (Delegação Global)
  document.body.addEventListener('click', e => {
    if (e.target.id === 'addmenu') closeAddMenu();
    if (e.target.id === 'bgmenu') closeBgMenu();
    
    if (e.target.id === 'btn-del') delWidget();
    if (e.target.id === 'btn-save-panel') closePanel();
    if (e.target.id === 'btn-swap-cpanel') document.getElementById('cpanel').classList.toggle('right');
    if (e.target.id === 'btn-close-bg') closeBgMenu();

    if (e.target.id === 'btn-move-bg') {
      closeBgMenu();
      ST.movingBg = true;
      startBgDrag(); // Ativa os listeners globais temporários
      const lockBtn = document.getElementById('mv-lock-btn');
      if (lockBtn) {
        lockBtn.innerHTML = '🔒<span>TRAVAR</span>';
        lockBtn.classList.add('active');
      }
      toast('🔓 MODO MOVER FUNDO ATIVADO! ARRASTE NA TELA.');
    }


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
    if (e.target.id === 'gallery-file-picker') {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 3.5 * 1024 * 1024) {
          alert('❌ Imagem muito pesada (Limite de 3.5MB). Reduza no celular antes de enviar.');
          e.target.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = async (evt) => {
          const base64 = evt.target.result;
          try {
            const id = 'img_' + Date.now();
            await saveCustomImage(id, 'Upload ' + new Date().toLocaleTimeString(), base64);
            toast("📸 IMAGEM ADICIONADA À GALERIA!");
            if (window.renderGalleryGrid) window.renderGalleryGrid('custom');
          } catch(err) {
            console.error("Erro salvando imagem no DB", err);
            alert('❌ Erro salvando imagem. Verifique armazenamento.');
          }
        };
        reader.readAsDataURL(file);
      }
    }
    
    if (e.target.id === 'bg-file-picker') {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 3.5 * 1024 * 1024) {
          alert('❌ Imagem muito pesada (Limite de 3.5MB). Reduza no celular antes de enviar.');
          e.target.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = async (evt) => {
          const base64 = evt.target.result;

          // Salva no IndexedDB
          try {
            const id = 'img_' + Date.now();
            await saveCustomImage(id, 'Imagem ' + new Date().toLocaleTimeString(), base64);
            // Renderiza na galeria visual automaticamente se ela estiver aberta, etc.
          } catch(err) {
            console.error("Erro salvando imagem de fundo no DB", err);
            alert('❌ Erro salvando imagem. Verifique armazenamento.');
            return;
          }

          const pg = ST.cfg.orientations[ST.orientation][ST.pg];
          if(pg) {
            pg.bg.img = base64;
            applyPageBg(ST.pg);
            saveToESP();
            toast("📸 FUNDO ATUALIZADO E SALVO!");
          }
          
          // Se a galeria estiver aberta, podemos dar um refresh (implementado no editor.js)
          if (window.renderGalleryGrid) window.renderGalleryGrid('bg');
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
        reader.onload = async (evt) => {
          const base64 = evt.target.result;

          // Salva no IndexedDB
          try {
            const id = 'img_' + Date.now();
            await saveCustomImage(id, 'Imagem ' + new Date().toLocaleTimeString(), base64);
          } catch(err) {
            console.error("Erro salvando imagem customizada", err);
            alert('❌ Erro salvando imagem no Banco de Dados.');
            return;
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
              
              if (window.renderGalleryGrid) window.renderGalleryGrid('widget');
              
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
      if (list) {
        // Sempre mostra o RESUMO no topo imediatamente (mesmo enquanto busca na ESP)
        try {
          const saved = localStorage.getItem('pulsedash_trip_history');
          const localData = saved ? JSON.parse(saved) : [];

          if (localData && localData.length > 0 && typeof window.renderTripHistoryList === 'function') {
            // Tem dados salvos no app → mostra resumo + histórico completo
            window.renderTripHistoryList(localData);
          } else {
            // No PC (sem Bluetooth) ou primeira vez: injeta dados de demonstração
            // para você ver a aba do resumo funcionando imediatamente.
            const demoHistory = [
              { ts: Math.floor(Date.now()/1000) - 86400*0, dist: 67.4, fuel: 4.9, price: 5.79 },
              { ts: Math.floor(Date.now()/1000) - 86400*1, dist: 112.8, fuel: 8.1, price: 5.65 },
              { ts: Math.floor(Date.now()/1000) - 86400*2, dist: 55.2, fuel: 4.0, price: 5.89 },
              { ts: Math.floor(Date.now()/1000) - 86400*3, dist: 89.0, fuel: 6.3, price: 5.79 },
              { ts: Math.floor(Date.now()/1000) - 86400*4, dist: 41.5, fuel: 3.0, price: 5.70 },
              { ts: Math.floor(Date.now()/1000) - 86400*5, dist: 73.9, fuel: 5.4, price: 5.55 },
              { ts: Math.floor(Date.now()/1000) - 86400*6, dist: 128.3, fuel: 9.2, price: 5.79 }
            ];
            localStorage.setItem('pulsedash_trip_history', JSON.stringify(demoHistory));

            if (typeof window.renderTripHistoryList === 'function') {
              window.renderTripHistoryList(demoHistory);
            } else {
              list.innerHTML = `
                <div class="trip-hist-item trip-hist-summary">
                  <div class="trip-hist-title">
                    <span>RESUMO SEMANAL</span>
                    <span style="color: var(--roxo-c);">567.1 KM</span>
                  </div>
                  <div class="trip-hist-stats">
                    <div class="trip-hist-stat"><span>CONSUMO MÉD.</span><span>13.9 km/l</span></div>
                    <div class="trip-hist-stat"><span>COMBUST. TOTAL</span><span>40.9 L</span></div>
                    <div class="trip-hist-stat"><span>CUSTO TOTAL</span><span>R$ 235.80</span></div>
                  </div>
                </div>
                <div style="text-align: center; color: #666; font-family: 'Rajdhani'; font-size: 12px; margin-top: 20px; color: #ffaa00;">
                  (Dados de demonstração injetados - no PC não tem Bluetooth real)
                </div>
              `;
            }
          }
        } catch (e) {
          // Fallback de segurança
          list.innerHTML = `
            <div class="trip-hist-item trip-hist-summary">
              <div class="trip-hist-title">
                <span>RESUMO SEMANAL</span>
                <span style="color: var(--roxo-c);">-- KM</span>
              </div>
              <div class="trip-hist-stats">
                <div class="trip-hist-stat"><span>CONSUMO MÉD.</span><span>-- km/l</span></div>
                <div class="trip-hist-stat"><span>COMBUST. TOTAL</span><span>-- L</span></div>
                <div class="trip-hist-stat"><span>CUSTO TOTAL</span><span>R$ --</span></div>
              </div>
            </div>
            <div style="text-align: center; color: #666; font-family: 'Rajdhani'; font-size: 12px; margin-top: 30px;">
              Buscando histórico na ESP32...
            </div>
          `;
        }
      }

      // Solicita atualização via Bluetooth (ESP manda o que tem salvo)
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
  document.getElementById('bg-opacity')?.addEventListener('input', e => {
    const label = document.getElementById('vbg-op');
    if (label) label.innerText = e.target.value;
    applyBg();
  });
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


