import { ST } from './state.js';
import { toast } from './utils.js';

// --- LÓGICA DE PERFORMANCE v6.0 ---
export const PERF = {
  open: false, state: 0, // 0:IDLE, 1:WAIT_STOP, 2:READY, 3:RUNNING, 4:DONE
  startTime: 0, stopStart: 0,
  splits: [], nextSplit: 50,
  prevV: 0, history: []
};

export function initPerf() {
  const saved = localStorage.getItem('pulsedash_perf_hist');
  if (saved) {
    try {
      PERF.history = JSON.parse(saved);
      updateHistoryUI();
    } catch(e) {}
  }
}

export function updatePerf() {
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
  const currentVal = parseFloat(result);
  
  // Se já tivermos 5 recordes, verifica se esse novo tempo bate o 5º lugar
  if (PERF.history.length >= 5) {
    const piorTempoDoTop5 = parseFloat(PERF.history[PERF.history.length - 1].result);
    if (currentVal >= piorTempoDoTop5) {
      toast('🐢 TEMPO ALTO. NÃO ENTROU NO TOP 5.');
      return; // Aborta e não suja a memória da ESP32
    }
  }

  // Passou no teste! Entrou pro ranking.
  const timeStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  PERF.history.push({ time: timeStr, result: result });
  
  // Ordena do Menor tempo (melhor) para o Maior tempo (pior)
  PERF.history.sort((a, b) => parseFloat(a.result) - parseFloat(b.result));
  
  // Limita estritamente ao Top 5
  if (PERF.history.length > 5) {
    PERF.history = PERF.history.slice(0, 5);
  }
  
  // Salva nativamente no celular para nunca perder
  localStorage.setItem('pulsedash_perf_hist', JSON.stringify(PERF.history));
  updateHistoryUI();
  
  // Manda backup pro ESP32 via Bluetooth só se o ranking mudou
  if (typeof window.bluetoothSerial !== 'undefined') {
    const payload = JSON.stringify(PERF.history);
    window.bluetoothSerial.write(`{"cmd":"perf", "payload":${payload}}\n`);
  }
}

export function updateHistoryUI() {
  const container = document.getElementById('perf-history');
  let h = '<div style="color:#aaa;font-size:9px;margin-bottom:6px;text-align:center;letter-spacing:1px">🏆 RECORDES (0-100)</div>';
  if (PERF.history.length === 0) h += '<div class="hist-item"><i>Aguardando recordes...</i></div>';
  PERF.history.forEach(i => {
    h += `<div class="hist-item"><span>📅 ${i.time}</span><b>${i.result}s</b></div>`;
  });
  if (container) container.innerHTML = h;
}

function addSplitUI(v, t) {
  const container = document.getElementById('perf-splits');
  const div = document.createElement('div');
  div.className = 'split';
  div.innerHTML = `<span>0-${v} km/h</span><b>${t}s</b>`;
  if (container) container.prepend(div);
}

export function resetPerf() {
  PERF.state = 0; PERF.splits = []; PERF.nextSplit = 50;
  document.getElementById('perf-timer-val').textContent = '00.000';
  document.getElementById('perf-splits').innerHTML = '';
  toast('♻️ CRONÔMETRO REINICIADO');
}

// Ouvinte para restaurar o histórico recebido da ESP32
document.addEventListener('perf_data', (e) => {
  try {
    const data = e.detail;
    if (Array.isArray(data) && data.length > 0) {
      PERF.history = data;
      localStorage.setItem('pulsedash_perf_hist', JSON.stringify(data));
      updateHistoryUI();
      console.log("[PERF] Histórico de 0-100 restaurado da ECU com sucesso!");
    }
  } catch(err) {
    console.error("[PERF] Erro ao restaurar histórico:", err);
  }
});
