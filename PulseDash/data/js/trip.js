import { ST } from './state.js';
import { toast } from './utils.js';

// --- LÓGICA DO COMPUTADOR DE BORDO v6.0 ---
export const TRIP = {
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
  viewingHistory: false,
  histData: null
};

export const TRIP_A = {
  distance: 0,
  fuelVolume: 0,
  timeTotal: 0,
  timeDriving: 0,
  timeStopped: 0,
  avgSpeed: 0,
  avgCons: 0,
  cost: 0
};

// === Histórico persistido no APP (acumulado localmente) ===
let tripHistory = [];

function loadTripHistory() {
  try {
    const saved = localStorage.getItem('pulsedash_trip_history');
    if (saved) {
      tripHistory = JSON.parse(saved) || [];
    }
  } catch (e) {
    console.error('Erro ao carregar histórico de viagens:', e);
    tripHistory = [];
  }
}

function saveTripHistory() {
  try {
    localStorage.setItem('pulsedash_trip_history', JSON.stringify(tripHistory));
  } catch (e) {
    console.error('Erro ao salvar histórico de viagens:', e);
  }
}

function mergeAndSaveHistory(newData) {
  const map = new Map();
  // Keep existing
  tripHistory.forEach(item => {
    if (item && item.ts) map.set(item.ts, item);
  });
  // Add/overwrite from new data from ESP
  (newData || []).forEach(item => {
    if (item && item.ts) map.set(item.ts, item);
  });
  tripHistory = Array.from(map.values())
    .sort((a, b) => b.ts - a.ts);
  // Limit to reasonable size (e.g. last 60 days) so it doesn't grow forever
  if (tripHistory.length > 60) {
    tripHistory = tripHistory.slice(0, 60);
  }
  saveTripHistory();
}

export function renderTripHistoryList(dataOverride = null) {
  const list = document.getElementById('trip-hist-list');
  if (!list) return;

  const sourceData = dataOverride || tripHistory;
  if (!sourceData || !sourceData.length) {
    list.innerHTML = '<div style="text-align: center; color: #666; font-family: \'Rajdhani\'; font-size: 12px; margin-top: 30px;">Nenhum histórico disponível.</div>';
    return;
  }

  const sorted = [...sourceData].sort((a, b) => b.ts - a.ts);

  // Calcular resumo acumulado (dos dados que estamos mostrando)
  let totalDist = 0;
  let totalFuel = 0;
  let totalCost = 0;
  let daysWithPrice = 0;

  sorted.forEach(item => {
    const dist = item.dist || 0;
    const fuel = item.fuel || 0;
    const p = (item.price !== undefined && item.price > 0) ? item.price : TRIP.price;
    totalDist += dist;
    totalFuel += fuel;
    if (p !== null && p > 0) {
      totalCost += fuel * p;
      daysWithPrice++;
    }
  });

  const avgCons = totalFuel > 0 ? (totalDist / totalFuel).toFixed(1) : '0.0';
  const costStr = daysWithPrice > 0 ? totalCost.toFixed(2) : '--';

  // Resumo no topo (sempre primeiro)
  let html = `
    <div class="trip-hist-item trip-hist-summary">
      <div class="trip-hist-title">
        <span>RESUMO SEMANAL</span>
        <span style="color: var(--roxo-c);">${totalDist.toFixed(1)} KM</span>
      </div>
      <div class="trip-hist-stats">
        <div class="trip-hist-stat">
          <span>CONSUMO MÉD.</span>
          <span>${avgCons} km/l</span>
        </div>
        <div class="trip-hist-stat">
          <span>COMBUST. TOTAL</span>
          <span>${totalFuel.toFixed(1)} L</span>
        </div>
        <div class="trip-hist-stat">
          <span>CUSTO TOTAL</span>
          <span>R$ ${costStr}</span>
        </div>
      </div>
    </div>
  `;

  // Itens de cada dia
  sorted.forEach((item, idx) => {
    const utcEpoch = item.ts + (new Date().getTimezoneOffset() * 60);
    const d = new Date(utcEpoch * 1000);
    const dayStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

    const dist = item.dist || 0;
    const fuel = item.fuel || 0;
    const avgC = fuel > 0 ? (dist / fuel).toFixed(1) : '0.0';
    const histP = (item.price !== undefined && item.price > 0) ? item.price : TRIP.price;
    const cst = (histP !== null && histP > 0) ? (fuel * histP).toFixed(2) : '--';

    html += `
      <div class="trip-hist-item" data-idx="${idx}">
        <div class="trip-hist-title">
          <span>DIA ${dayStr}</span>
          <span style="color: var(--cyan);">${dist.toFixed(1)} KM</span>
        </div>
        <div class="trip-hist-stats">
          <div class="trip-hist-stat">
            <span>CONSUMO</span>
            <span>${avgC} km/l</span>
          </div>
          <div class="trip-hist-stat">
            <span>COMBUST.</span>
            <span>${fuel.toFixed(1)} L</span>
          </div>
          <div class="trip-hist-stat">
            <span>CUSTO</span>
            <span>R$ ${cst}</span>
          </div>
        </div>
      </div>
    `;
  });

  list.innerHTML = html;

  // Clique só nos dias (não no resumo)
  list.querySelectorAll('.trip-hist-item:not(.trip-hist-summary)').forEach(el => {
    const handleSelect = (evt) => {
      evt.preventDefault();
      evt.stopPropagation();

      const idx = parseInt(el.dataset.idx);
      const item = sorted[idx];
      if (item) {
        TRIP.viewingHistory = true;
        const dist = item.dist || 0;
        const fuel = item.fuel || 0;
        const tTot = item.ttot || 0;
        const tDri = item.tdri || 0;
        const avgSpeed = tDri > 0 ? (dist / (tDri / 3600.0)) : 0;
        const avgC = fuel > 0 ? (dist / fuel) : 0;
        const histP = (item.price !== undefined && item.price > 0) ? item.price : TRIP.price;
        const costVal = (histP !== null && histP > 0) ? (fuel * histP) : 0;

        ST.dados.tripDistance = dist;
        ST.dados.tripFuel = fuel;
        ST.dados.tripAvgSpeed = avgSpeed;
        ST.dados.tripAvgCons = avgC;
        ST.dados.tripCost = costVal;
        ST.dados.tripTimeTotal = tTot / 60.0;

        const utcEpoch = item.ts + (new Date().getTimezoneOffset() * 60);
        const d = new Date(utcEpoch * 1000);
        const dayStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

        const elTitle = document.getElementById('trip-main-title');
        if (elTitle) elTitle.textContent = `HISTÓRICO: DIA ${dayStr}`;

        updateTripUI();

        const popHist = document.getElementById('trip-hist-popup');
        if (popHist) popHist.style.display = 'none';
      }
    };

    el.addEventListener('click', handleSelect);
    el.addEventListener('touchend', handleSelect);
  });
}

// Expor para o main.js poder chamar na abertura do popup
window.renderTripHistoryList = renderTripHistoryList;

// Rastreadores de delta para acúmulo preciso de Trip A (Opção B)
let prevTripDist = -1;
let prevTripFuel = -1;
let prevTripTimeTotal = -1;
let prevTripTimeDriving = -1;
let prevTripTimeStopped = -1;


export function initTrip() {
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

  const savedA = localStorage.getItem('pulsedash_trip_a_data');
  if (savedA) {
    try {
      const dataA = JSON.parse(savedA);
      TRIP_A.distance = dataA.distance ?? 0;
      TRIP_A.fuelVolume = dataA.fuelVolume ?? 0;
      TRIP_A.timeTotal = dataA.timeTotal ?? 0;
      TRIP_A.timeDriving = dataA.timeDriving ?? 0;
      TRIP_A.timeStopped = dataA.timeStopped ?? 0;
      TRIP_A.avgSpeed = dataA.avgSpeed ?? 0;
      TRIP_A.avgCons = dataA.avgCons ?? 0;
      TRIP_A.cost = dataA.cost ?? 0;
    } catch(e) {
      console.error(e);
    }
  }
  
  const inpPrice = document.getElementById('trip-inp-price');
  const selType = document.getElementById('trip-sel-type');
  if (inpPrice) inpPrice.value = (TRIP.price !== null && TRIP.price > 0) ? TRIP.price.toFixed(2) : '';
  if (selType) selType.value = TRIP.fuelType;
  
  updateTripUI();

  // Carrega histórico acumulado salvo no app
  loadTripHistory();

  // Inicia o loop do Computador de Bordo a 2Hz (500ms) - Otimização de Performance
  setInterval(() => {
    updateTripLogic(0.5); // dt fixo de 0.5s
  }, 500);

  // Resetar o histórico ao fechar
  document.getElementById('btn-trip-close')?.addEventListener('click', () => {
    if (TRIP.viewingHistory) {
      TRIP.viewingHistory = false;
      // Restaura o título principal
      const elTitle = document.getElementById('trip-main-title');
      if (elTitle) elTitle.textContent = 'COMPUTADOR DE BORDO';
      // Restaura dados ao vivo acumulados
      ST.dados.tripDistance   = TRIP.distance;
      ST.dados.tripFuel       = TRIP.fuelVolume;
      ST.dados.tripAvgSpeed   = TRIP.avgSpeed;
      ST.dados.tripAvgCons    = TRIP.avgCons;
      ST.dados.tripCost       = TRIP.cost;
      ST.dados.tripTimeTotal  = TRIP.timeTotal / 60.0;
    }
  });

  // Também reseta ao fechar aba A
  document.getElementById('btn-trip-close-a')?.addEventListener('click', () => {
    document.getElementById('trip-overlay').classList.remove('open');
    TRIP.open = false;
  });

  // Botão de resetar Trip A
  document.getElementById('btn-trip-a-reset')?.addEventListener('click', resetTripA);
}

export function saveTrip() {
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

  const dataA = {
    distance: TRIP_A.distance,
    fuelVolume: TRIP_A.fuelVolume,
    timeTotal: TRIP_A.timeTotal,
    timeDriving: TRIP_A.timeDriving,
    timeStopped: TRIP_A.timeStopped,
    avgSpeed: TRIP_A.avgSpeed,
    avgCons: TRIP_A.avgCons,
    cost: TRIP_A.cost
  };
  localStorage.setItem('pulsedash_trip_a_data', JSON.stringify(dataA));
}

function updateTripLogic(dt) {
  if (ST.booting) return;
  const isOnline = ST.dados.obd_state === 4;
  const isDemo = ST.dados.demo !== undefined && ST.dados.rpm > 0;

  if (isOnline || isDemo) {
    const speed    = ST.dados.speed    ?? 0;
    const fuelRate = ST.dados.fuelRate ?? 0;

    if (!TRIP.viewingHistory) {
      if (isOnline) {
        TRIP.distance   = ST.dados.tripDist    ?? 0;
        TRIP.fuelVolume = ST.dados.tripFuel    ?? 0;
        TRIP.timeTotal  = ST.dados.tripTimeTot ?? 0;
        TRIP.timeDriving = ST.dados.tripTimeDri ?? 0;
        TRIP.timeStopped = Math.max(0, TRIP.timeTotal - TRIP.timeDriving);
      } else {
        // --- Timers: acúmulo diário ---
        TRIP.timeTotal += dt;
        if (speed > 1.5) TRIP.timeDriving += dt;
        else             TRIP.timeStopped += dt;

        // --- Distância ---
        TRIP.distance += (speed / 3600.0) * dt;

        // --- Combustível ---
        if (fuelRate > 0) TRIP.fuelVolume += (fuelRate / 3600.0) * dt;
      }

      // --- Etanol ---
      const eth = ST.dados.ethanol ?? 0;
      if (eth > 0) TRIP.ethanolPct = eth;

      // --- Médias e custo ---
      TRIP.avgSpeed = TRIP.timeDriving > 0
        ? (TRIP.distance / (TRIP.timeDriving / 3600.0)) : 0;
      TRIP.avgCons  = TRIP.fuelVolume  > 0
        ? (TRIP.distance / TRIP.fuelVolume) : 0;
      TRIP.cost = (TRIP.price !== null && TRIP.price > 0)
        ? TRIP.fuelVolume * TRIP.price : 0;

      // --- ACÚMULO POR DELTA TRIP A (OPÇÃO B - precisão 100%) ---
      if (prevTripDist < 0) {
        // Inicialização dos rastreadores de delta com os valores diários atuais
        prevTripDist = TRIP.distance;
        prevTripFuel = TRIP.fuelVolume;
        prevTripTimeTotal = TRIP.timeTotal;
        prevTripTimeDriving = TRIP.timeDriving;
        prevTripTimeStopped = TRIP.timeStopped;
      } else {
        let deltaDist = TRIP.distance - prevTripDist;
        let deltaFuel = TRIP.fuelVolume - prevTripFuel;
        let deltaTimeTotal = TRIP.timeTotal - prevTripTimeTotal;
        let deltaTimeDriving = TRIP.timeDriving - prevTripTimeDriving;
        let deltaTimeStopped = TRIP.timeStopped - prevTripTimeStopped;

        // Trata reinicialização/reset diário à meia-noite (quando os acumuladores diários caem)
        if (deltaDist < 0 || deltaFuel < 0 || deltaTimeTotal < 0) {
          deltaDist = TRIP.distance;
          deltaFuel = TRIP.fuelVolume;
          deltaTimeTotal = TRIP.timeTotal;
          deltaTimeDriving = TRIP.timeDriving;
          deltaTimeStopped = TRIP.timeStopped;
        }

        TRIP_A.distance += deltaDist;
        TRIP_A.fuelVolume += deltaFuel;
        TRIP_A.timeTotal += deltaTimeTotal;
        TRIP_A.timeDriving += deltaTimeDriving;
        TRIP_A.timeStopped += deltaTimeStopped;

        prevTripDist = TRIP.distance;
        prevTripFuel = TRIP.fuelVolume;
        prevTripTimeTotal = TRIP.timeTotal;
        prevTripTimeDriving = TRIP.timeDriving;
        prevTripTimeStopped = TRIP.timeStopped;
      }

      // Cálculo das médias e custo da Trip A
      TRIP_A.avgSpeed = TRIP_A.timeDriving > 0 
        ? (TRIP_A.distance / (TRIP_A.timeDriving / 3600.0)) : 0;
      TRIP_A.avgCons = TRIP_A.fuelVolume > 0 
        ? (TRIP_A.distance / TRIP_A.fuelVolume) : 0;
      TRIP_A.cost = (TRIP.price !== null && TRIP.price > 0) 
        ? TRIP_A.fuelVolume * TRIP.price : 0;

      // Exporta para o state global (widgets de dashboard)
      ST.dados.tripDistance   = TRIP.distance;
      ST.dados.tripFuel       = TRIP.fuelVolume;
      ST.dados.tripAvgSpeed   = TRIP.avgSpeed;
      ST.dados.tripAvgCons    = TRIP.avgCons;
      ST.dados.tripCost       = TRIP.cost;
      ST.dados.tripTimeTotal  = TRIP.timeTotal / 60.0;
    }
  }


}

export function updateTripUI() {
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
  
  const viewDist = TRIP.viewingHistory ? (ST.dados.tripDistance || 0) : TRIP.distance;
  const viewFuel = TRIP.viewingHistory ? (ST.dados.tripFuel || 0) : TRIP.fuelVolume;
  const viewAvgSpeed = TRIP.viewingHistory ? (ST.dados.tripAvgSpeed || 0) : TRIP.avgSpeed;
  const viewAvgCons = TRIP.viewingHistory ? (ST.dados.tripAvgCons || 0) : TRIP.avgCons;
  const viewCost = TRIP.viewingHistory ? (ST.dados.tripCost || 0) : TRIP.cost;
  const viewTimeTotal = TRIP.viewingHistory ? (ST.dados.tripTimeTotal * 60 || 0) : TRIP.timeTotal;

  if (elDist) elDist.textContent = viewDist.toFixed(2);
  if (elFuel) elFuel.textContent = viewFuel.toFixed(2);
  if (elEth) elEth.textContent = TRIP.ethanolPct > 0 ? Math.round(TRIP.ethanolPct) : '--';
  if (elAvgSpeed) elAvgSpeed.textContent = viewAvgSpeed.toFixed(1);
  if (elAvgCons) elAvgCons.textContent = viewAvgCons.toFixed(2);
  if (elCost) {
    const hasPrice = TRIP.viewingHistory ? (viewCost > 0) : (TRIP.price !== null && TRIP.price > 0);
    elCost.textContent = hasPrice ? viewCost.toFixed(2) : '--';
  }
  
  const elFuelType = document.getElementById('trip-val-fuel-type');
  if (elFuelType) {
    elFuelType.textContent = TRIP.price !== null ? TRIP.fuelType.toUpperCase() : '--';
  }
  
  if (elTTotal) elTTotal.textContent = formatTime(viewTimeTotal);
  if (elTDriving) elTDriving.textContent = formatTime(TRIP.viewingHistory ? 0 : TRIP.timeDriving);
  if (elTStopped) elTStopped.textContent = formatTime(TRIP.viewingHistory ? 0 : TRIP.timeStopped);

  // --- TRIP A UI ---
  const elDistA = document.getElementById('trip-a-val-dist');
  const elFuelA = document.getElementById('trip-a-val-fuel');
  const elEthA = document.getElementById('trip-a-val-eth');
  const elAvgSpeedA = document.getElementById('trip-a-val-avgspeed');
  const elAvgConsA = document.getElementById('trip-a-val-avgcons');
  const elCostA = document.getElementById('trip-a-val-cost');
  const elFuelTypeA = document.getElementById('trip-a-val-fuel-type');
  
  const elTTotalA = document.getElementById('trip-a-timer-total');
  const elTDrivingA = document.getElementById('trip-a-timer-driving');
  const elTStoppedA = document.getElementById('trip-a-timer-stopped');

  if (elDistA) elDistA.textContent = TRIP_A.distance.toFixed(2);
  if (elFuelA) elFuelA.textContent = TRIP_A.fuelVolume.toFixed(2);
  if (elEthA) elEthA.textContent = TRIP.ethanolPct > 0 ? Math.round(TRIP.ethanolPct) : '--';
  if (elAvgSpeedA) elAvgSpeedA.textContent = TRIP_A.avgSpeed.toFixed(1);
  if (elAvgConsA) elAvgConsA.textContent = TRIP_A.avgCons.toFixed(2);
  if (elCostA) {
    elCostA.textContent = (TRIP.price !== null && TRIP.price > 0) ? TRIP_A.cost.toFixed(2) : '--';
  }
  if (elFuelTypeA) {
    elFuelTypeA.textContent = TRIP.price !== null ? TRIP.fuelType.toUpperCase() : '--';
  }
  
  if (elTTotalA) elTTotalA.textContent = formatTime(TRIP_A.timeTotal);
  if (elTDrivingA) elTDrivingA.textContent = formatTime(TRIP_A.timeDriving);
  if (elTStoppedA) elTStoppedA.textContent = formatTime(TRIP_A.timeStopped);
}

export function formatTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function resetTrip() {
  if (typeof window.bluetoothSerial !== 'undefined') {
    window.bluetoothSerial.write('{"cmd":"trip_reset"}\n');
  }
  TRIP.distance = 0;
  TRIP.fuelVolume = 0;
  TRIP.avgSpeed = 0;
  TRIP.avgCons = 0;
  TRIP.cost = 0;
  TRIP.timeTotal = 0;
  TRIP.timeDriving = 0;
  TRIP.timeStopped = 0;
  saveTrip();
  updateTripUI();
}

export function resetTripA() {
  TRIP_A.distance = 0;
  TRIP_A.fuelVolume = 0;
  TRIP_A.timeTotal = 0;
  TRIP_A.timeDriving = 0;
  TRIP_A.timeStopped = 0;
  TRIP_A.avgSpeed = 0;
  TRIP_A.avgCons = 0;
  TRIP_A.cost = 0;
  
  // Reseta os rastreadores de delta para os valores acumulados diários do exato momento do reset
  prevTripDist = TRIP.distance;
  prevTripFuel = TRIP.fuelVolume;
  prevTripTimeTotal = TRIP.timeTotal;
  prevTripTimeDriving = TRIP.timeDriving;
  prevTripTimeStopped = TRIP.timeStopped;

  saveTrip();
  updateTripUI();

  toast('♻️ TRIP A REINICIADA COM SUCESSO');
}

// Ouvinte para os dados do Histórico de 7 Dias
document.addEventListener('trip_hist_data', (e) => {
  const list = document.getElementById('trip-hist-list');
  if (!list) return;

  const data = e.detail; // Array JSON recebido da ESP
  if (!data || !data.length) {
    list.innerHTML = '<div style="text-align: center; color: #666; font-family: \'Rajdhani\'; font-size: 12px; margin-top: 30px;">Nenhum histórico disponível.</div>';
    return;
  }

  // Acumula no app + salva + re-render (com resumo no topo)
  mergeAndSaveHistory(data);
  renderTripHistoryList(tripHistory);

  // Adiciona cliques para carregar no "Time Machine" de widgets
  list.querySelectorAll('.trip-hist-item').forEach(el => {
    const handleSelect = (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      
      const idx = parseInt(el.dataset.idx);
      const item = data[idx];
      if (item) {
        TRIP.viewingHistory = true;
        const dist = item.dist || 0;
        const fuel = item.fuel || 0;
        const tTot = item.ttot || 0;
        const tDri = item.tdri || 0;
        const avgSpeed = tDri > 0 ? (dist / (tDri / 3600.0)) : 0;
        const avgCons = fuel > 0 ? (dist / fuel) : 0;
        // Usa o preço gravado no item, ou fallback para o atual do App
        const histPrice = (item.price !== undefined && item.price > 0) ? item.price : TRIP.price;
        const costVal = (histPrice !== null && histPrice > 0) ? (fuel * histPrice) : 0;

        // Injeta os dados históricos nos widgets de dashboard
        ST.dados.tripDistance = dist;
        ST.dados.tripFuel = fuel;
        ST.dados.tripAvgSpeed = avgSpeed;
        ST.dados.tripAvgCons = avgCons;
        ST.dados.tripCost = costVal;
        ST.dados.tripTimeTotal = tTot / 60.0;

        const utcEpoch = item.ts + (new Date().getTimezoneOffset() * 60);
        const d = new Date(utcEpoch * 1000);
        const dayStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        
        // Altera o título da aba
        const elTitle = document.getElementById('trip-main-title');
        if (elTitle) elTitle.textContent = `HISTÓRICO: DIA ${dayStr}`;

        // Atualiza os valores visuais no Diário
        updateTripUI();
        
        // Fecha APENAS o modal de histórico para revelar a aba Diário
        const popHist = document.getElementById('trip-hist-popup');
        if (popHist) popHist.style.display = 'none';
      }
    };

    el.addEventListener('click', handleSelect);
    el.addEventListener('touchend', handleSelect);
  });
});

