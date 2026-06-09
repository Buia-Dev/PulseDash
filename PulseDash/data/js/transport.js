import { processTelemetry, validarConfig } from './main.js';
import { toast, applyPageBg } from './utils.js';
import { ST, LOCAL_IMAGES, CFG_DEF } from './state.js';
import { PERF, updateHistoryUI } from './perf.js';
import { TRIP } from './trip.js';

let ws = null;
let wsReconnectTimer = null;

// ==============================================================
// ★ TRANSPORT MANAGER: BLUETOOTH NATIVO (APP) vs WEBSOCKET (WEB)
// ==============================================================

export function initTransport() {
  document.addEventListener('deviceready', () => {
    console.log("[SYS] deviceready disparado! Verificando Bluetooth...");
    if (typeof window.bluetoothSerial !== 'undefined') {
      initBluetoothSerial();
    } else {
      console.error("[SYS] Plugin Bluetooth não encontrado!");
      toast("❌ ERRO: APP REQUER BLUETOOTH");
    }
  });
  
  // Fallback para Web: Se deviceready não disparar em 1s (navegador)
  setTimeout(() => {
    if (typeof window.bluetoothSerial === 'undefined') {
      console.error("[SYS] Navegador detectado. Apenas modo App Bluetooth é suportado para telemetria.");
      toast("⚠️ MODO BROWSER (SEM TELEMETRIA)");
    }
  }, 1000);
}

// ==============================================================
// ★ BLUETOOTH SERIAL (CAPACITOR NATIVE) ★
// ==============================================================
function initBluetoothSerial() {
  console.log("[BT] Iniciando conexão Bluetooth...");
  toast("🔎 PROCURANDO PULSESCAN...");
  
  if (typeof window.bluetoothSerial === 'undefined') {
    console.error("[BT] Plugin bluetoothSerial não disponível.");
    return;
  }

  window.bluetoothSerial.isEnabled(() => {
    // Lista pareados
    window.bluetoothSerial.list((devices) => {
      console.log("[BT] Dispositivos pareados encontrados:", devices.length);
      const target = devices.find(d => {
        const name = (d.name || "").toUpperCase();
        return name.includes("PULSESCAN") || name.includes("PULSEDASH") || name.includes("BUIUBER") || name.includes("ESP32");
      });
      
      if (target) {
        connectToDevice(target.id || target.address);
      } else {
        toast("❌ PAREIE O PULSESCAN VIA BLUETOOTH");
        setTimeout(initBluetoothSerial, 6000);
      }
    }, (err) => {
      console.error("[BT] Erro ao listar pareados:", err);
      setTimeout(initBluetoothSerial, 5000);
    });
  }, () => {
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
    
    // Força o estado para conectado
    processTelemetry({ obd_state: 4 });
    
    // Sincroniza a hora do celular com o ESP32 v6.0
    // Aplica o fuso horário para que o ESP32 calcule a "meia-noite local" e não a UTC
    const d = new Date();
    const tsLocal = Math.floor(d.getTime() / 1000) - (d.getTimezoneOffset() * 60);
    window.bluetoothSerial.write(`{"cmd":"sync", "ts":${tsLocal}}\n`);
    
    // Sincroniza o preço do combustível com a ESP32 v6.5
    if (TRIP && TRIP.price !== null) {
      window.bluetoothSerial.write(`{"cmd":"price", "val":${TRIP.price}}\n`);
    }
    
    // Pede o histórico de performance da placa caso o App tenha sido reinstalado
    setTimeout(() => {
      window.bluetoothSerial.write(`{"cmd":"perf_req"}\n`);
    }, 500);
    
    // Assina stream via LF
    window.bluetoothSerial.subscribe('\n', (data) => {
      try {
        const j = JSON.parse(data.trim());
        if (j.cmd === 'trip_hist_data') {
          document.dispatchEvent(new CustomEvent('trip_hist_data', { detail: j.payload }));
          return;
        }
        if (j.cmd === 'perf_data') {
          document.dispatchEvent(new CustomEvent('perf_data', { detail: j.payload }));
          return;
        }
        if (j.cmd === 'dtc_data') {
          // DTC real vindo do firmware (substitui o mock antigo)
          document.dispatchEvent(new CustomEvent('dtc_data', { detail: j.codes || [] }));
          return;
        }
        if (j.cmd === 'dtc_clear_result') {
          // Resultado do clear vindo do firmware — app reage ao que foi realmente enviado
          document.dispatchEvent(new CustomEvent('dtc_clear_result', { detail: { success: !!j.success } }));
          return;
        }
        processTelemetry(j);
      } catch (err) {}
    }, (err) => {
      console.error("[BT] Assinatura serial falhou:", err);
      toast("❌ CONEXÃO DE DADOS PERDIDA");
      processTelemetry({ obd_state: 0 });
      initBluetoothSerial();
    });
  }, (err) => {
    console.log("[BT] Falha na conexão. Retentando em 4s...", err);
    toast("❌ CONEXÃO BT FALHOU");
    setTimeout(initBluetoothSerial, 4000);
  });
}

// WEBSOCKET FOI COMPLETAMENTE REMOVIDO EM FAVOR DO BLUETOOTH NATIVO EXCLUSIVO

// ==============================================================
// ★ ENDPOINTS DE CONFIG E PERF (ABSTRAÇÃO REST/BT) ★
// ==============================================================

export async function saveToESP(cfgToSave){
  try {
    cfgToSave = cfgToSave || ST.cfg;
    // Clonagem profunda e limpeza do estado transitório w._sv para ambas orientações
    const cleanCfg = JSON.parse(JSON.stringify(cfgToSave));
    if (cleanCfg.orientations) {
      ['portrait', 'landscape'].forEach(ori => {
        if (cleanCfg.orientations[ori]) {
          cleanCfg.orientations[ori].forEach(p => {
            if (p.widgets) p.widgets.forEach(w => delete w._sv);
          });
        }
      });
    }
    
    localStorage.setItem('PULSEDASH_CFG', JSON.stringify(cleanCfg));
    toast('✅ SALVO NO APP');
  } catch(e) { console.error(e); }
}

export async function loadFromESP(){
  ST.imgList = [...LOCAL_IMAGES];

  // Carrega as imagens salvas pelo usuário na Biblioteca Interna
  try {
    const customImgsStr = localStorage.getItem('pulsedash_custom_images');
    if (customImgsStr) {
      const customImgs = JSON.parse(customImgsStr);
      ST.imgList.push(...customImgs);
    }
  } catch(e) { console.error("Erro carregando custom_images", e); }

  try {
    let loc = localStorage.getItem('PULSEDASH_CFG');
    if(!loc) loc = localStorage.getItem('GOL_DASH_CFG');
    
    if(loc) {
      const parsed = JSON.parse(loc);
      if (validarConfig(parsed)) {
        ST.cfg = parsed;
        console.log("Local Config Loaded");
      }
    }
  } catch(e) { console.log("Usando backup local/padrao:", e); }
  
  if(!validarConfig(ST.cfg)) {
    console.log("Resetando para configuracao padrao robusta");
    ST.cfg = JSON.parse(JSON.stringify(CFG_DEF));
  }

  loadRecordes();
}

async function loadRecordes() {
  try {
    const recs = localStorage.getItem('PULSEDASH_PERF');
    if (recs) {
      const data = JSON.parse(recs);
      if (Array.isArray(data)) {
        PERF.history = data;
        updateHistoryUI();
        console.log("Recordes carregados do App");
      }
    }
  } catch (e) {
    console.log("Erro ao carregar recordes do App:", e);
  }
}

export async function saveRecordes(historyArray) {
  localStorage.setItem('PULSEDASH_PERF', JSON.stringify(historyArray));
}

export function manualConnect() {
  initBluetoothSerial();
}

