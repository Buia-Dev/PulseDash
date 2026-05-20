'use strict';
import { ST, CFG_DEF, LOCAL_IMAGES } from './state.js';
import { renderWidget } from './renderers.js';
import {
  mkWidget, toggleEditor, exitEditor, openBgMenu, openAddMenu,
  delWidget, closePanel, toggleMoveMode, closeAddMenu, closeBgMenu,
  applyBg, applyConfig, closeLayerPicker, selWidget, joinGroup, separarWidget
} from './editor.js';

function toast(msg){ const el=document.getElementById('toast'); el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2000); }
function toggleFS(){ if(!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{}); else document.exitFullscreen(); }
function hexToRgb(hex) {
  if(!hex || hex.length < 7) return '255,255,255';
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `${isNaN(r)?255:r},${isNaN(g)?255:g},${isNaN(b)?255:b}`;
}

function validarConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  if (!cfg.paginas || !Array.isArray(cfg.paginas) || cfg.paginas.length === 0) return false;
  for (let i = 0; i < cfg.paginas.length; i++) {
    const p = cfg.paginas[i];
    if (!p || typeof p !== 'object') return false;
    if (!p.bg || typeof p.bg !== 'object') return false;
    if (!p.widgets || !Array.isArray(p.widgets)) return false;
  }
  return true;
}

function randomizeDemoWidgets(){
  const fonts = ['Orbitron', 'Oxanium', 'Michroma', 'Teko'];
  const maxVals = [20, 50, 100, 160, 240, 280, 360, 440, 6000, 7000, 8000, 9000];
  const mv = maxVals[Math.floor(Math.random() * maxVals.length)];
  const unit = mv >= 1000 ? 'RPM' : 'KM/H';
  const font = fonts[Math.floor(Math.random() * fonts.length)];

  if (!ST.cfg || !ST.cfg.paginas || !Array.isArray(ST.cfg.paginas)) return;

  ST.cfg.paginas.forEach(p => {
    if (p && Array.isArray(p.widgets)) {
      p.widgets.forEach(w => {
        if(w && w.sensor === 'demo') {
          const hue = Math.floor(Math.random() * 360);
          w.cor = `hsl(${hue}, 100%, 65%)`;
          if(w.rLabelCor) w.rLabelCor = `hsl(${(hue+40)%360}, 100%, 85%)`;
          
          if(w.tipo === 'regua_pura') {
            w.rFont = font; w.rMax = mv;
            if (mv >= 1000) w.rLabelOffset = 35; else w.rLabelOffset = 20; 
          }
          if(w.tipo === 'numero_puro') {
            w.fontFamily = font; w.maxValor = mv; w.unidade = unit;
            w.tamanho = (mv >= 1000) ? 150 : 120;
          }
        }
      });
    }
  });
}

function autoScale() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const baseW = 412;
  const baseH = 915;
  ST.scale = Math.min(w / baseW, h / baseH);
  
  const scaledW = baseW * ST.scale;
  const scaledH = baseH * ST.scale;
  const offsetX = (w - scaledW) / 2;
  const offsetY = (h - scaledH) / 2;
  
  // Calcula o gap (espaçamento) necessário para garantir que a próxima página 
  // fique completamente fora da tela (escondida), mesmo em monitores ultrawide
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

window.addEventListener('resize', autoScale);

function goPg(idx) {
  ST.pg = idx; 
  autoScale();
  document.querySelectorAll('.pd').forEach((d,i)=>d.classList.toggle('active', i===idx));
}

function applyPageBg(idx) {
  const pg=ST.cfg.paginas[idx], el=document.getElementById(`pg-${idx}`);
  if(pg.bg.img) { el.style.backgroundImage=`url('${pg.bg.img}')`; el.style.backgroundSize=pg.bg.size; }
  else { el.style.backgroundImage=''; }
}

async function saveToESP(){
  try {
    localStorage.setItem('PULSEDASH_CFG', JSON.stringify(ST.cfg));
    toast('💾 SALVANDO...');
    const r = await fetch('/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ST.cfg)
    });
    if(r.ok) toast('✅ SALVO NO ESP');
  } catch(e) { console.error(e); }
}

async function loadFromESP(){
  try {
    const rqArq = await fetch('/arquivos', { signal: AbortSignal.timeout(1000) });
    if(rqArq.ok) {
      ST.imgList = await rqArq.json();
    } else {
      throw new Error("Local Server (404)");
    }
  } catch(e) { 
    console.log("VSCode Detectado: Usando imagens locais da pasta relogios/"); 
    ST.imgList = LOCAL_IMAGES;
  }

  try {
    let loc = localStorage.getItem('PULSEDASH_CFG');
    if(!loc) {
      // Fallback para manter o layout anterior do Gol G1 se existir
      loc = localStorage.getItem('GOL_DASH_CFG');
    }
    if(loc) {
      const parsed = JSON.parse(loc);
      if (validarConfig(parsed)) {
        ST.cfg = parsed;
        console.log("Local Config Loaded and Validated");
      }
    }

    const r = await fetch('/config', { signal: AbortSignal.timeout(1000) });
    if(r.ok) {
      const j = await r.json();
      if(validarConfig(j)) { 
        ST.cfg = j;
        randomizeDemoWidgets();
        toast('📥 LAYOUT SINCRONIZADO'); 
        ST.cfg.paginas.forEach((p,i)=>applyPageBg(i));
        return true; 
      }
    }
  } catch(e) { console.log("Usando backup local/padrao:", e); }
  
  // Garantia absoluta de integridade contra dados corrompidos de versoes anteriores no localStorage
  if(!validarConfig(ST.cfg)) {
    console.log("Resetando para configuracao padrao robusta");
    ST.cfg = JSON.parse(JSON.stringify(CFG_DEF));
  }

  // Sincroniza recordes físicos do ESP32
  try {
    const rPerf = await fetch('/perf', { signal: AbortSignal.timeout(1000) });
    if (rPerf.ok) {
      const data = await rPerf.json();
      if (Array.isArray(data)) {
        PERF.history = data;
        updateHistoryUI();
        console.log("Recordes sincronizados com sucesso do LittleFS!");
      }
    }
  } catch (e) {
    console.log("Erro ao carregar recordes físicos do ESP32, operando offline:", e);
  }
}

let ws = null;
let wsReconnectTimer = null;

// Frequencia: conta quantas atualizacoes de rpm chegam por segundo
let _freqCounter = 0;
let _freqHz      = 0;
let _freqTimer   = null;
let _blinkTimer  = null;

function initWebSocket() {
  if (ws && ws.readyState === 1) return; // 1=OPEN
  
  if (ws && ws.readyState === 0) { // 0=CONNECTING
    if (ws._connStart && Date.now() - ws._connStart > 3000) {
      console.log("[WS] Timeout na conexao. Forcando fechamento...");
      ws.close();
    } else {
      return; // Ainda aguardando timeout
    }
  }
  
  // No VSCode/Localhost, location.hostname é localhost. Vamos tentar conectar ao ESP ou simular falha.
  const host = location.hostname === '127.0.0.1' || location.hostname === 'localhost' ? '192.168.4.1' : location.hostname;
  ws = new WebSocket(`ws://${host}:81/`);
  ws._connStart = Date.now();
  
  ws.onopen = () => {
    console.log('[WS] Conectado à Telemetria Tempo-Real!');
    toast('⚡ TELEMETRIA ONLINE');
    if (wsReconnectTimer) { clearInterval(wsReconnectTimer); wsReconnectTimer = null; }
  };
  
  ws.onmessage = (e) => {
    try {
      const j = JSON.parse(e.data);
      const oldState = ST.dados.obd_state;
      Object.assign(ST.dados, j);
      if (j.rpm !== undefined) _freqCounter++;
      
      if (j.obd_state !== undefined) {
        updateBtButton(j.obd_state);
        // Só atualiza o overlay via socket se o estado MUDOU
        if (j.obd_state !== oldState) {
          updateOverlay(j.obd_state, true); // true = permite auto-fechar se for sucesso
        } else {
          // Se já está aberto, apenas atualiza os textos sem resetar animações ou fechar
          if (document.getElementById('obd-overlay').classList.contains('open')) {
            const dFreq = document.getElementById('step-freq-detail');
            if (dFreq) dFreq.textContent = `${_freqHz} Hz`;
          }
        }
      }
    } catch(err) {}
  };
  
  ws.onclose = () => {
    if (!wsReconnectTimer) {
      console.log('[WS] Desconectado. Auto-reconnect em 2s...');
      wsReconnectTimer = setInterval(initWebSocket, 2000);
    }
  };
  
  ws.onerror = () => { ws.close(); };
}

async function fetchDadosFallback(){ 
  if(ST.fetching || (ws && ws.readyState === 1)) return;
  ST.fetching = true;
  try { 
    const r = await fetch('/dados', { signal: AbortSignal.timeout(1000) }); 
    const j = await r.json(); 
    Object.assign(ST.dados, j);
    if (j.rpm !== undefined) _freqCounter++;
    if (j.obd_state !== undefined) {
      updateBtButton(j.obd_state);
      updateOverlay(j.obd_state, OBD_STATES[j.obd_state] ? OBD_STATES[j.obd_state].label : '???');
    }
  } catch(e) {} finally { ST.fetching = false; }
}

// v3.4: k por sensor — rápidos suavizam, lentos são instantâneos
const SMOOTH_K = {
  rpm: 0.1,  speed: 0.1,  throttle: 0.1, pedal: 0.15, 
  load: 1.0, // v5.4.1: Sem suavização (valor bruto lido a cada 10s)
  fuelRate: 0.1, boost: 0.1, coolant: 0.3, catalyst: 0.3,
  ambient: 0.3, ethanol: 0.3, fuelLevel: 1.0, voltage: 1.0, demo: 0.05   
};

// --- LÓGICA DE PERFORMANCE v5.4 ---
const PERF = {
  open: false, state: 0, // 0:IDLE, 1:WAIT_STOP, 2:READY, 3:RUNNING, 4:DONE
  startTime: 0, stopStart: 0,
  splits: [], nextSplit: 50,
  prevV: 0, history: [] // v5.4: Abortar e Histórico
};

function updatePerf() {
  if (!PERF.open) return;
  const v = ST.dados.speed || 0;
  const now = performance.now();
  
  document.getElementById('perf-speed').textContent = Math.round(v);
  const flag = document.getElementById('perf-ready-flag');

  if (PERF.state === 0) {
    flag.classList.remove('active');
    if (v === 0) { PERF.state = 1; PERF.stopStart = now; }
  } 
  else if (PERF.state === 1) {
    if (v > 0) PERF.state = 0;
    else if (now - PERF.stopStart > 2000) { PERF.state = 2; toast('🏁 PREPARADO!'); }
  }
  else if (PERF.state === 2) {
    flag.classList.add('active');
    if (v > 0) { 
      PERF.state = 3; PERF.startTime = now; PERF.splits = []; PERF.nextSplit = 50;
      PERF.prevV = v; flag.classList.remove('active');
    }
  }
  else if (PERF.state === 3) {
    const elapsed = (now - PERF.startTime) / 1000;
    
    // 1. Só aborta se a velocidade cair mais de 15 km/h de uma só vez (frenagem real)
    if (v < PERF.prevV - 15) {
      PERF.state = 0; toast('❌ TESTE ABORTADO');
      return;
    }
    
    // 2. Aborta se o veículo parar totalmente (velocidade < 2 km/h) após o primeiro segundo de puxada
    if (v < 2 && elapsed > 1.0) {
      PERF.state = 0; toast('❌ TESTE ABORTADO (PARADO)');
      return;
    }
    
    PERF.prevV = v;

    document.getElementById('perf-timer-val').textContent = elapsed.toFixed(3);
    
    if (v >= PERF.nextSplit) {
      const splitTime = elapsed.toFixed(3);
      PERF.splits.push({ v: PERF.nextSplit, t: splitTime });
      addSplitUI(PERF.nextSplit, splitTime);
      
      if (PERF.nextSplit === 100) {
        toast('🏆 0-100 BATIDO!');
        saveToHistory(splitTime);
        PERF.state = 4; // Finaliza ao chegar em 100 (ou continua se preferir)
      }
      PERF.nextSplit += 50;
    }
  }
}

async function saveToHistory(result) {
  const timeStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  PERF.history.unshift({ time: timeStr, result: result });
  if (PERF.history.length > 5) PERF.history.pop();
  updateHistoryUI();
  
  try {
    await fetch('/perf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(PERF.history)
    });
  } catch (e) {
    console.log("Erro ao salvar recordes no LittleFS do ESP32:", e);
  }
}

function updateHistoryUI() {
  const container = document.getElementById('perf-history');
  let h = '<div style="color:#aaa;font-size:9px;margin-bottom:6px;text-align:center;letter-spacing:1px">🏆 RECORDIES (0-100)</div>';
  if (PERF.history.length === 0) h += '<div class="hist-item"><i>Aguardando recordes...</i></div>';
  PERF.history.forEach(i => {
    h += `<div class="hist-item"><span>📅 ${i.time}</span><b>${i.result}s</b></div>`;
  });
  container.innerHTML = h;
}

function addSplitUI(v, t) {
  const container = document.getElementById('perf-splits');
  const div = document.createElement('div');
  div.className = 'split';
  div.innerHTML = `<span>0-${v} km/h</span><b>${t}s</b>`;
  container.prepend(div);
}

function resetPerf() {
  PERF.state = 0; PERF.splits = []; PERF.nextSplit = 50;
  document.getElementById('perf-timer-val').textContent = '00.000';
  document.getElementById('perf-splits').innerHTML = '';
  toast('♻️ CRONÔMETRO REINICIADO');
}

// --- LÓGICA DO COMPUTADOR DE BORDO v6.0 ---
const TRIP = {
  open: false,
  price: 5.50,
  fuelType: 'gasolina',
  distance: 0,
  fuelVolume: 0,
  avgSpeed: 0,
  avgCons: 0,
  cost: 0,
  ethanolPct: 0,
  timeTotal: 0,
  timeDriving: 0,
  timeStopped: 0,
  initialOdometer: -1
};

function initTrip() {
  const saved = localStorage.getItem('pulsedash_trip_data');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      TRIP.price = (data.price !== undefined && data.price !== null) ? data.price : null;
      TRIP.fuelType = data.fuelType ?? 'gasolina';
      TRIP.distance = data.distance ?? 0;
      TRIP.fuelVolume = data.fuelVolume ?? 0;
      TRIP.avgSpeed = data.avgSpeed ?? 0;
      TRIP.avgCons = data.avgCons ?? 0;
      TRIP.cost = data.cost ?? 0;
      TRIP.ethanolPct = data.ethanolPct ?? 0;
      TRIP.timeTotal = data.timeTotal ?? 0;
      TRIP.timeDriving = data.timeDriving ?? 0;
      TRIP.timeStopped = data.timeStopped ?? 0;
    } catch (e) {
      console.error(e);
    }
  } else {
    TRIP.price = null;
    TRIP.fuelType = 'gasolina';
  }
  
  const inpPrice = document.getElementById('trip-inp-price');
  const selType = document.getElementById('trip-sel-type');
  if (inpPrice) inpPrice.value = (TRIP.price !== null && TRIP.price > 0) ? TRIP.price.toFixed(2) : '';
  if (selType) selType.value = TRIP.fuelType;
  
  updateTripUI();
}

function saveTrip() {
  const data = {
    price: TRIP.price,
    fuelType: TRIP.fuelType,
    distance: TRIP.distance,
    fuelVolume: TRIP.fuelVolume,
    avgSpeed: TRIP.avgSpeed,
    avgCons: TRIP.avgCons,
    cost: TRIP.cost,
    ethanolPct: TRIP.ethanolPct,
    timeTotal: TRIP.timeTotal,
    timeDriving: TRIP.timeDriving,
    timeStopped: TRIP.timeStopped
  };
  localStorage.setItem('pulsedash_trip_data', JSON.stringify(data));
}

function updateTripLogic(dt) {
  if (ST.booting) return;
  const isOnline = ST.dados.obd_state === 4;
  const isDemo = ST.dados.demo !== undefined && ST.dados.rpm > 0;
  
  if (isOnline || isDemo) {
    const speed = ST.dados.speed ?? 0;
    const fuelRate = ST.dados.fuelRate ?? 0;
    
    TRIP.timeTotal += dt;
    if (speed > 1.5) {
      TRIP.timeDriving += dt;
    } else {
      TRIP.timeStopped += dt;
    }
    
    // Plano A: Odômetro físico / proprietário GM
    const odom = ST.dados.tripDist ?? 0;
    if (odom > 0.01 && isOnline) {
      if (TRIP.initialOdometer < 0) {
        TRIP.initialOdometer = odom;
      }
      TRIP.distance = odom - TRIP.initialOdometer;
    } else {
      // Plano B: Fallback via velocidade integrada
      TRIP.distance += (speed / 3600.0) * dt;
    }
    
    if (fuelRate > 0) {
      TRIP.fuelVolume += (fuelRate / 3600.0) * dt;
    }
    
    const eth = ST.dados.ethanol ?? 0;
    if (eth > 0) {
      TRIP.ethanolPct = eth;
    }
    
    TRIP.avgSpeed = TRIP.timeDriving > 0 ? (TRIP.distance / (TRIP.timeDriving / 3600.0)) : 0;
    TRIP.avgCons = TRIP.fuelVolume > 0 ? (TRIP.distance / TRIP.fuelVolume) : 0;
    
    if (TRIP.price !== null && TRIP.price > 0) {
      TRIP.cost = TRIP.fuelVolume * TRIP.price;
    } else {
      TRIP.cost = 0;
    }
    
    // Atualiza o state global do PulseDash
    ST.dados.tripDistance = TRIP.distance;
    ST.dados.tripFuel = TRIP.fuelVolume;
    ST.dados.tripAvgSpeed = TRIP.avgSpeed;
    ST.dados.tripAvgCons = TRIP.avgCons;
    ST.dados.tripCost = TRIP.cost;
    ST.dados.tripTimeTotal = TRIP.timeTotal / 60.0;
  }
  
  // Economômetro clássico
  const mapVal = ST.dados.boost ?? 100;
  ST.dados.econometer = Math.max(0, Math.min(100, 100 - ((mapVal - 30) / 70.0 * 100)));
}

function updateTripUI() {
  if (!TRIP.open) return;
  const elDist = document.getElementById('trip-val-dist');
  const elFuel = document.getElementById('trip-val-fuel');
  const elEth = document.getElementById('trip-val-eth');
  const elAvgSpeed = document.getElementById('trip-val-avgspeed');
  const elAvgCons = document.getElementById('trip-val-avgcons');
  const elCost = document.getElementById('trip-val-cost');
  
  const elTTotal = document.getElementById('trip-timer-total');
  const elTDriving = document.getElementById('trip-timer-driving');
  const elTStopped = document.getElementById('trip-timer-stopped');
  
  if (elDist) elDist.textContent = TRIP.distance.toFixed(2);
  if (elFuel) elFuel.textContent = TRIP.fuelVolume.toFixed(2);
  if (elEth) elEth.textContent = TRIP.ethanolPct > 0 ? Math.round(TRIP.ethanolPct) : '--';
  if (elAvgSpeed) elAvgSpeed.textContent = TRIP.avgSpeed.toFixed(1);
  if (elAvgCons) elAvgCons.textContent = TRIP.avgCons.toFixed(2);
  if (elCost) {
    elCost.textContent = (TRIP.price !== null && TRIP.price > 0) ? TRIP.cost.toFixed(2) : '--';
  }
  
  const elFuelType = document.getElementById('trip-val-fuel-type');
  if (elFuelType) {
    elFuelType.textContent = TRIP.price !== null ? TRIP.fuelType.toUpperCase() : '--';
  }
  
  if (elTTotal) elTTotal.textContent = formatTime(TRIP.timeTotal);
  if (elTDriving) elTDriving.textContent = formatTime(TRIP.timeDriving);
  if (elTStopped) elTStopped.textContent = formatTime(TRIP.timeStopped);
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function resetTrip() {
  TRIP.distance = 0;
  TRIP.fuelVolume = 0;
  TRIP.avgSpeed = 0;
  TRIP.avgCons = 0;
  TRIP.cost = 0;
  TRIP.timeTotal = 0;
  TRIP.timeDriving = 0;
  TRIP.timeStopped = 0;
  TRIP.initialOdometer = -1;
  saveTrip();
  updateTripUI();
  toast('♻️ VIAGEM ZERADA');
}

function suavizar(){ for(const key in ST.smooth){ const k=SMOOTH_K[key]??0.05; ST.smooth[key]+=(ST.dados[key]-ST.smooth[key])*k; } }



let lastFrameTime = 0;
function update(ts){ 
  if (ST.booting) {
    requestAnimationFrame(update);
    return;
  }
  const now = ts * 0.001;
  let dt = lastFrameTime > 0 ? (now - lastFrameTime) : 0;
  lastFrameTime = now;
  if (dt > 2.0) dt = 0;

  ST.dados.demo = 512 + 512 * Math.sin(ts * 0.001); 
  suavizar(); 
  updatePerf(); // Atualiza lógica de performance
  updateTripLogic(dt); // Atualiza lógica do computador de bordo
  if (TRIP.open) {
    updateTripUI(); // Atualiza painel visual apenas se aberto
  }
  ST.demoT = ts * 0.001; 
  for(const wid in ST.cvs){ 
    const w = ST.widgetMap.get(wid);
    if(w && (w.pg === ST.pg || ST.editor)) {
      renderWidget(ST.cvs[wid].ctx, w, ST.cvs[wid].cW/2, ST.cvs[wid].cH/2, ST.demoT); 
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

  const statuses = [
    { time: 0,    text: "[ 📡 SEARCHING OBD... ]" },
    { time: 400,  text: "[ 🔌 CONNECTING CAN BUS... ]" },
    { time: 900,  text: "[ ⚡ ENGINE ECU HANDSHAKE ]" },
    { time: 1400, text: "[ 📁 READING ECO LOGS... ]" },
    { time: 1900, text: "[ 🏆 SYNCING TOP 5 RANK ]" },
    { time: 2300, text: "[ 🚀 SYSTEM READY — GO! ]" }
  ];

  let timers = [];

  // Loop de escrita dos status de diagnóstico
  statuses.forEach(item => {
    let t = setTimeout(() => {
      if (statusText) {
        statusText.innerText = item.text;
        if (item.time === 2300) {
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

  // Revela o painel de trás no momento do OK!
  // Aos 2.5 segundos o fundo preto se desfaz em transparente, revelando os ponteiros
  let tReveal = setTimeout(() => {
    splash.classList.add("reveal");
    if (pcb) pcb.classList.add("fade-out");
    if (hud) hud.classList.add("fade-out");
  }, 2500);
  timers.push(tReveal);

  // Remove o container de splash completamente do DOM aos 3.0 segundos
  let tFinalHide = setTimeout(() => {
    splash.style.display = "none";
    ST.booting = false;
  }, 3000);
  timers.push(tFinalHide);
}

// ==============================================================
// ★ OBD2 CONNECTION MANAGER — CAN DIRETO ★
// ==============================================================

// Frequencia: inicia contador e pisca a bolinha
function startFreqTracking() {
  if (_freqTimer) return;
  _freqTimer = setInterval(() => {
    _freqHz = _freqCounter;
    _freqCounter = 0;
    const el = document.getElementById('step-freq-detail');
    if (el && ST.dados.obd_state === 4) el.textContent = `${_freqHz} Hz`;
  }, 1000);
}

function startPillBlink() {
  if (_blinkTimer) return;
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
    stepBtLabel.textContent = typeof window.bluetoothSerial !== 'undefined' ? 'BLUETOOTH (PULSESCAN)' : 'WI-FI (PULSESCAN)';
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
  if (touchStartX - touchEndX > 50 && ST.pg < ST.cfg.paginas.length - 1) goPg(ST.pg + 1);
  if (touchEndX - touchStartX > 50 && ST.pg > 0) goPg(ST.pg - 1);
  touchStartX = 0;
}, {passive: true});

async function init(){
  await loadFromESP();
  randomizeDemoWidgets();
  ST.cfg.paginas.forEach((pg,idx)=>{
    if (pg && Array.isArray(pg.widgets)) {
      pg.widgets.forEach(w=> {
        if (w) mkWidget(w,idx);
      });
    }
    applyPageBg(idx);
  });
  autoScale(); // Inicializa o scale
  runBootSequence();
  document.addEventListener('deviceready', () => {
    console.log("[SYS] deviceready disparado! Inicializando Bluetooth...");
    if (typeof window.bluetoothSerial !== 'undefined') {
      initBluetoothSerial();
    } else {
      initWebSocket();
    }
  });
  setTimeout(() => {
    if (typeof window.bluetoothSerial === 'undefined' && !ws && !wsReconnectTimer) {
      console.log("[SYS] deviceready nao disparou, assumindo modo navegador.");
      initWebSocket();
    }
  }, 1000);
  initTrip(); // Inicializa o computador de bordo
  setInterval(saveTrip, 1500); // Salva a viagem no localStorage a cada 1.5s
  setInterval(fetchDadosFallback, 500); // Roda a cada 500ms SÓ SE o WebSocket cair
  bindEvents();
  requestAnimationFrame(update);
  toast('\u2726 PULSEDASH PREMIUM V6.0');
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
  document.getElementById('btn-obd-connect')?.addEventListener('click', () => {
    if (typeof initBluetoothSerial === 'function') {
      initBluetoothSerial();
    } else {
      fetch('/bt/connect').catch(e => console.error(e));
    }
  });
  
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
    if (e.target.id === 'btn-close-bg') closeBgMenu();

    if (e.target.id === 'btn-trigger-bg-picker') {
      document.getElementById('bg-file-picker')?.click();
    }
    if (e.target.id === 'btn-trigger-w-picker') {
      document.getElementById('w-file-picker')?.click();
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
        const reader = new FileReader();
        reader.onload = (evt) => {
          const base64 = evt.target.result;
          const pg = ST.cfg.paginas[ST.pg];
          pg.bg.img = base64;
          applyPageBg(ST.pg);
          saveToESP();
          toast("📸 FUNDO ATUALIZADO!");
          const selBg = document.getElementById('bg-url');
          if (selBg) {
            let opt = [...selBg.options].find(o => o.value === base64);
            if (!opt) {
              opt = document.createElement('option');
              opt.value = base64;
              opt.text = "➔ Imagem da Galeria";
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
        const reader = new FileReader();
        reader.onload = (evt) => {
          const base64 = evt.target.result;
          if (ST.sel) {
            const w = ST.widgetMap.get(ST.sel);
            if (w) {
              w.url = base64;
              mkWidget(w, ST.pg);
              saveToESP();
              toast("📸 IMAGEM ATUALIZADA!");
              const selImg = document.getElementById('c-img-url');
              if (selImg) {
                let opt = [...selImg.options].find(o => o.value === base64);
                if (!opt) {
                  opt = document.createElement('option');
                  opt.value = base64;
                  opt.text = "➔ Imagem da Galeria";
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
  });

  document.getElementById('bg-url')?.addEventListener('change', applyBg);
  document.getElementById('bg-size')?.addEventListener('change', applyBg);
}

init();

export { saveToESP, toast, applyPageBg };


// ==============================================================
// ★ CAPACITOR BLUETOOTH SERIAL INTEGRATION (PulseDash v5.5) ★
// ==============================================================
function initBluetoothSerial() {
  console.log("[BT] Iniciando conexão Bluetooth...");
  toast("🔎 PROCURANDO PULSESCAN...");
  
  if (typeof window.bluetoothSerial === 'undefined') {
    console.error("[BT] Plugin bluetoothSerial não disponível.");
    return;
  }

  // Garante que o Bluetooth está ativado no celular
  window.bluetoothSerial.isEnabled(() => {
    // Bluetooth ativo, lista dispositivos pareados
    window.bluetoothSerial.list((devices) => {
      console.log("[BT] Dispositivos pareados encontrados:", devices.length);
      const target = devices.find(d => {
        const name = (d.name || "").toUpperCase();
        return name.includes("PULSESCAN") || name.includes("PULSEDASH") || name.includes("BUIUBER") || name.includes("ESP32");
      });
      
      if (target) {
        connectToDevice(target.id || target.address);
      } else {
        console.log("[BT] PulseScan não encontrado nos pareados. Tentando primeiro dispositivo ou avisando...");
        toast("❌ PAREIE O PULSESCAN VIA BLUETOOTH");
        setTimeout(initBluetoothSerial, 6000);
      }
    }, (err) => {
      console.error("[BT] Erro ao listar pareados:", err);
      setTimeout(initBluetoothSerial, 5000);
    });
  }, () => {
    // Bluetooth desativado, solicita ativação ao usuário
    toast("🔌 ATIVE O BLUETOOTH DO CELULAR");
    window.bluetoothSerial.showBluetoothSettings();
    setTimeout(initBluetoothSerial, 6000);
  });
}

function connectToDevice(address) {
  console.log("[BT] Conectando ao endereço:", address);
  toast("🔌 CONECTANDO AO PULSESCAN...");
  
  window.bluetoothSerial.connect(address, () => {
    console.log("[BT] Conectado com sucesso!");
    toast("⚡ TELEMETRIA ONLINE (BT)");
    
    ST.dados.obd_state = 4;
    updateBtButton(4);
    updateOverlay(4, true);
    
    // Escuta dados linha por linha finalizadas com caractere de nova linha '\n'
    window.bluetoothSerial.subscribe('\n', (data) => {
      try {
        const j = JSON.parse(data.trim());
        const oldState = ST.dados.obd_state;
        Object.assign(ST.dados, j);
        if (j.rpm !== undefined) _freqCounter++;
        
        if (j.obd_state !== undefined) {
          updateBtButton(j.obd_state);
          if (j.obd_state !== oldState) {
            updateOverlay(j.obd_state, true);
          } else {
            if (document.getElementById('obd-overlay').classList.contains('open')) {
              const dFreq = document.getElementById('step-freq-detail');
              if (dFreq) dFreq.textContent = `${_freqHz} Hz`;
            }
          }
        }
      } catch (err) {
        // Ignora pacotes cortados
      }
    }, (err) => {
      console.error("[BT] Assinatura serial falhou:", err);
      toast("❌ CONEXÃO DE DADOS PERDIDA");
      initBluetoothSerial();
    });
  }, (err) => {
    console.log("[BT] Falha na conexão. Retentando em 4s...", err);
    toast("❌ CONEXÃO BT FALHOU");
    setTimeout(initBluetoothSerial, 4000);
  });
}
