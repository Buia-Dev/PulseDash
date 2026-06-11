import { processTelemetry, validarConfig } from './main.js';
import { toast, applyPageBg } from './utils.js';
import { ST, LOCAL_IMAGES, CFG_DEF } from './state.js';
import { PERF, updateHistoryUI } from './perf.js';
import { TRIP } from './trip.js';
import { PROFILES } from './profiles_db.js';

let ws = null;
let wsReconnectTimer = null;
let rxBuffer = new Uint8Array(0);
let btRetryDelay = 4000; // Delay inicial de auto-reconexão em ms

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
    btRetryDelay = 4000; // Reset do delay na conexão bem-sucedida
    
    // Força o estado para conectado
    processTelemetry({ obd_state: 4 });
    
    // Sincroniza a hora do celular com o ESP32 v6.0
    // Aplica o fuso horário para que o ESP32 calcule a "meia-noite local" e não a UTC
    const d = new Date();
    const tsLocal = Math.floor(d.getTime() / 1000) - (d.getTimezoneOffset() * 60);
    
    // Envia a string de configuração do veículo v7.0
    const cfgStr = compileConfigString(ST.car || { brand: 'chevrolet', model: 'Onix 2026', engine: '1.0', aspiration: 'turbo', fuel: 'flex', tank: 44, profile: 'generic' });
    console.log("[BT] Enviando configuração de perfil:", cfgStr.trim());
    window.bluetoothSerial.write(cfgStr);
    
    window.bluetoothSerial.write(`{"cmd":"sync", "ts":${tsLocal}}\n`);
    
    // Sincroniza o preço do combustível com a ESP32 v6.5
    if (TRIP && TRIP.price !== null) {
      window.bluetoothSerial.write(`{"cmd":"price", "val":${TRIP.price}}\n`);
    }
    
    // Pede o histórico de performance da placa caso o App tenha sido reinstalado
    setTimeout(() => {
      window.bluetoothSerial.write(`{"cmd":"perf_req"}\n`);
    }, 500);
    
    // Assina stream binário bruto v7.0
    window.bluetoothSerial.subscribeRawData((data) => {
      const bytes = new Uint8Array(data);
      appendToBuffer(bytes);
      processRxQueue();
    }, (err) => {
      console.error("[BT] Assinatura serial falhou:", err);
      toast("❌ CONEXÃO DE DADOS PERDIDA");
      processTelemetry({ obd_state: 0 });
      
      // Reconecta usando o backoff progressivo
      setTimeout(initBluetoothSerial, btRetryDelay);
      btRetryDelay = Math.min(30000, btRetryDelay * 2);
    });
  }, (err) => {
    console.log(`[BT] Falha na conexão. Retentando em ${btRetryDelay/1000}s...`, err);
    toast("❌ CONEXÃO BT FALHOU");
    setTimeout(initBluetoothSerial, btRetryDelay);
    btRetryDelay = Math.min(30000, btRetryDelay * 2); // Dobra o delay até o cap de 30s
  });
}

// ==============================================================
// ★ DECODIFICADOR BINÁRIO v7.0 ★
// ==============================================================

function appendToBuffer(newBytes) {
  const tmp = new Uint8Array(rxBuffer.length + newBytes.length);
  tmp.set(rxBuffer);
  tmp.set(newBytes, rxBuffer.length);
  rxBuffer = tmp;
}

function removeFromBuffer(length) {
  rxBuffer = rxBuffer.slice(length);
}

function processRxQueue() {
  while (rxBuffer.length > 0) {
    // Verifica se é um frame binário de telemetria (headers: 0x44, 0x33, 0x22, 0x11)
    if (rxBuffer.length >= 4 && 
        rxBuffer[0] === 0x44 && 
        rxBuffer[1] === 0x33 && 
        rxBuffer[2] === 0x22 && 
        rxBuffer[3] === 0x11) {
      
      if (rxBuffer.length < 51) {
        break; // Espera o frame ficar completo
      }
      
      const frame = rxBuffer.slice(0, 51);
      
      // Validação de Checksum
      let sum = 0;
      for (let i = 0; i < 50; i++) {
        sum = (sum + frame[i]) & 0xFF;
      }
      
      if (sum === frame[50]) {
        parseBinaryTelemetry(frame);
        removeFromBuffer(51);
      } else {
        console.warn("[BT] Checksum inválido no frame binário. Descartando 1 byte para realinhamento.");
        removeFromBuffer(1);
      }
      continue;
    }
    
    // Verifica se é uma resposta JSON (começa com '{' e termina com '\n')
    if (rxBuffer[0] === 0x7B) { // '{'
      let nlIdx = rxBuffer.indexOf(0x0A); // '\n'
      if (nlIdx === -1) {
        break; // Espera a linha de comando terminar
      }
      
      const jsonBytes = rxBuffer.slice(0, nlIdx + 1);
      removeFromBuffer(nlIdx + 1);
      
      try {
        const text = new TextDecoder("utf-8").decode(jsonBytes);
        const j = JSON.parse(text.trim());
        handleJsonCommand(j);
      } catch (e) {
        console.error("[BT] Erro ao parsear JSON recebido:", e);
      }
      continue;
    }
    
    // Descarta bytes inválidos fora do padrão (ruído de conexão)
    removeFromBuffer(1);
  }
}

function parseBinaryTelemetry(frame) {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  
  const rawRpm = view.getUint16(5, false); // Big Endian
  const rawSpeed = view.getUint8(7);
  const rawThrottle = view.getUint8(8);
  const rawPedal = view.getUint8(9);
  const rawLoad = view.getUint8(10);
  const rawFuelRate = view.getUint16(11, false);
  const rawBoost = view.getInt16(13, false);
  const rawCoolant = view.getInt8(15);
  const rawCatalyst = view.getInt16(16, false);
  const rawAmbient = view.getInt8(18);
  const rawEthanol = view.getUint8(19);
  const rawVoltage = view.getUint16(20, false);
  const rawFuelLevel = view.getUint8(22);
  
  // Novos 8 sensores de Prioridade 2
  const rawOilPress = view.getUint8(39);
  const rawFuelPress = view.getUint8(40);
  const rawOilTemp = view.getInt8(41);
  const rawIat = view.getInt8(42);
  const rawEgt = view.getUint16(43, false); // Big Endian para 2 bytes
  const rawAfr = view.getUint8(45);
  const rawLambda = view.getUint8(46);
  const rawTiming = view.getInt8(47);
  
  const profileKey = ST.car?.profile || 'generic';
  
  // Aplica as equações dinamicamente baseado no perfil ativo
  const rpm = evalProfileFormula(getFormulaForSensor(profileKey, 37), rawRpm);
  const speed = evalProfileFormula(getFormulaForSensor(profileKey, 81), rawSpeed);
  const throttle = evalProfileFormula(getFormulaForSensor(profileKey, 42), rawThrottle);
  const pedal = evalProfileFormula(getFormulaForSensor(profileKey, 49), rawPedal);
  const load = evalProfileFormula(getFormulaForSensor(profileKey, 100), rawLoad);
  const fuelRate = evalProfileFormula(getFormulaForSensor(profileKey, 236), rawFuelRate);
  const boost = evalProfileFormula(getFormulaForSensor(profileKey, 31), rawBoost);
  const coolant = evalProfileFormula(getFormulaForSensor(profileKey, 14), rawCoolant);
  const catalyst = evalProfileFormula(getFormulaForSensor(profileKey, 38), rawCatalyst);
  const ambient = evalProfileFormula(getFormulaForSensor(profileKey, 173), rawAmbient);
  const ethanol = evalProfileFormula(getFormulaForSensor(profileKey, 284), rawEthanol);
  const voltage = evalProfileFormula(getFormulaForSensor(profileKey, 12), rawVoltage);
  const fuelLevel = evalProfileFormula(getFormulaForSensor(profileKey, 170), rawFuelLevel);
  
  // Novas conversões físicas
  const oilPress = evalProfileFormula(getFormulaForSensor(profileKey, 150), rawOilPress);
  const fuelPress = evalProfileFormula(getFormulaForSensor(profileKey, 139), rawFuelPress);
  const oilTemp = evalProfileFormula(getFormulaForSensor(profileKey, 151), rawOilTemp);
  const iat = evalProfileFormula(getFormulaForSensor(profileKey, 27), rawIat);
  const egt = evalProfileFormula(getFormulaForSensor(profileKey, 96), rawEgt);
  const afr = evalProfileFormula(getFormulaForSensor(profileKey, 54), rawAfr);
  const lambda = evalProfileFormula(getFormulaForSensor(profileKey, 166), rawLambda);
  const timing = evalProfileFormula(getFormulaForSensor(profileKey, 35), rawTiming);
  
  const tripDist = view.getFloat32(23, true); // Little Endian
  const tripFuel = view.getFloat32(27, true); // Little Endian
  const tripTimeTot = view.getUint32(31, true); // Little Endian
  const tripTimeDri = view.getUint32(35, true); // Little Endian
  
  const obd_state = view.getUint8(48);
  const loopMs = view.getUint8(49);
  
  const telemetry = {
    rpm,
    speed,
    throttle,
    pedal,
    load,
    fuelRate,
    boost,
    coolant,
    catalyst,
    ambient,
    ethanol,
    voltage,
    fuelLevel,
    oilPress,
    fuelPress,
    oilTemp,
    iat,
    egt,
    afr,
    lambda,
    timing,
    tripDist,
    tripFuel,
    tripTimeTot,
    tripTimeDri,
    obd_state,
    loopMs
  };
  
  processTelemetry(telemetry);
}

// ==============================================================
// ★ COMPILADOR E PARSER DINÂMICO DE PERFIS OBD2 v7.0 ★
// ==============================================================

function getFormulaForSensor(profileKey, targetId) {
  const profile = PROFILES[profileKey] || PROFILES['generic'];
  
  // 1. Procura em comandos planos
  const cmd = profile.commands.find(c => c.targetId === targetId);
  if (cmd && cmd.conversion) return cmd.conversion;
  
  // 2. Procura em blocos de valores aninhados
  for (const c of profile.commands) {
    if (c.values) {
      const v = c.values.find(val => val.targetId === targetId);
      if (v && v.conversion) return v.conversion;
    }
  }
  
  // Fallbacks universais padrão OBD2
  if (targetId === 37) return "V/4"; // RPM
  if (targetId === 81) return "V";   // Speed
  if (targetId === 42) return "V*100/255"; // Throttle
  if (targetId === 49) return "V*100/255"; // Pedal
  if (targetId === 100) return "V*100/255"; // Load
  if (targetId === 14) return "V-40"; // Coolant
  if (targetId === 12) return "V/1000"; // Voltage
  if (targetId === 173) return "V-40"; // Ambient
  if (targetId === 38) return "V/10-40"; // Catalyst
  if (targetId === 170) return "V*100/255"; // Fuel level
  if (targetId === 284) return "V*100/255"; // Ethanol
  if (targetId === 31) return "V"; // Boost (MAP)
  if (targetId === 236) return "V/20"; // FuelRate
  
  // Fallbacks para Sensores Prioridade 2
  if (targetId === 150) return "V/10"; // Oil Press
  if (targetId === 139) return "V";    // Fuel Press
  if (targetId === 151) return "V-40"; // Oil Temp
  if (targetId === 27) return "V-40";  // IAT
  if (targetId === 96) return "V";     // EGT (Escape)
  if (targetId === 54) return "V/10";  // AFR
  if (targetId === 166) return "V/100";// Lambda
  if (targetId === 35) return "(V-128)/2"; // Timing (Ignição)
  
  return "V";
}

const formulaCache = new Map();

function evalProfileFormula(formulaStr, rawVal) {
  if (!formulaStr) return rawVal;
  try {
    let fn = formulaCache.get(formulaStr);
    if (!fn) {
      let fNorm = formulaStr.trim()
        .replace(/\(B\d+\*256\+B\d+\)/g, "V")
        .replace(/B\d+\*256\+B\d+/g, "V")
        .replace(/B\d+/g, "V") // Substitui variáveis como B10 por V
        .replace(/A/g, "V")    // Suporte para notação RealDash ABC
        .replace(/B/g, "V");
      fn = new Function('V', `return (${fNorm});`);
      formulaCache.set(formulaStr, fn);
    }
    return fn(rawVal);
  } catch (e) {
    return rawVal;
  }
}

export function compileConfigString(car) {
  const profileKey = car.profile || 'generic';
  const profile = PROFILES[profileKey] || PROFILES['generic'];
  
  // Valores default Onix 2026 / Genérico CAN
  let baud = 500;
  let canType = 29;
  let txId = "18db33f1";
  let rxId = "18daf111";
  let tester = 1;
  let handshake = "00";
  
  let speedFormula = 0; // 0 = raw byte
  let fuelFormula = 0;  // 0 = standard PID 5E (FuelRate)
  
  // Analisa o array de inicialização para ajustar Baudrate e tipos CAN
  if (profile.init) {
    profile.init.forEach(cmd => {
      cmd = cmd.toLowerCase().trim();
      if (cmd.startsWith("atsp")) {
        const proto = cmd.replace("atsp", "");
        if (proto === "0" || proto === "a" || proto === "6" || proto === "7") {
          canType = 29;
        } else {
          canType = 11;
        }
      }
      if (cmd.startsWith("atsh")) {
        const header = cmd.replace("atsh", "");
        txId = header;
        if (header === "7df") {
          rxId = "7e8";
        } else if (header.length === 3) {
          const id = parseInt(header, 16);
          rxId = (id + 8).toString(16);
        } else if (header.length === 8) {
          if (header === "18db33f1") rxId = "18daf111";
          else rxId = header.replace("db", "da").replace("33f1", "f111");
        }
      }
      if (!cmd.startsWith("at")) {
        // Extrai o handshake (ex: "0100" -> "00", ou "2101" -> "2101")
        handshake = cmd.replace(/^01/, "");
      }
    });
  }

  // Fórmulas para o Trip Computer na firmware
  if (profileKey === "bosch_mp70") {
    speedFormula = 0; 
    fuelFormula = 2; // Bosch MAF
  } else if (profileKey === "january_5_1" || profileKey === "Itelma_M73_E3") {
    speedFormula = 0; 
    fuelFormula = 3; // Yanvar MAF
  } else if (profileKey.includes("toyota") || profileKey.includes("nissan")) {
    speedFormula = 0;
    fuelFormula = 0;
  }
  
  // Nossos 13 sensores e seus respectivos targetIds RealDash
  const sensorsList = [
    { name: 'speed', targetId: 81, defaultPid: "0d", len: 1, skip: 1, id: 0 },
    { name: 'throttle', targetId: 42, defaultPid: "11", len: 1, skip: 3, id: 1 },
    { name: 'pedal', targetId: 49, defaultPid: "49", len: 1, skip: 3, id: 2 },
    { name: 'load', targetId: 100, defaultPid: "04", len: 1, skip: 9, id: 3 },
    { name: 'fuelRate', targetId: 236, defaultPid: "5e", len: 2, skip: 9, id: 4 },
    { name: 'boost', targetId: 31, defaultPid: "0b", len: 1, skip: 0, id: 5 },
    { name: 'coolant', targetId: 14, defaultPid: "05", len: 1, skip: 99, id: 6 },
    { name: 'catalyst', targetId: 38, defaultPid: "3c", len: 2, skip: 99, id: 7 },
    { name: 'ambientTemp', targetId: 173, defaultPid: "46", len: 1, skip: 99, id: 8 },
    { name: 'ethanol', targetId: 284, defaultPid: "52", len: 1, skip: 5999, id: 9 },
    { name: 'voltage', targetId: 12, defaultPid: "42", len: 2, skip: 99, id: 10 },
    { name: 'fuelLevel', targetId: 170, defaultPid: "2f", len: 1, skip: 99, id: 11 },
    { name: 'rpm', targetId: 37, defaultPid: "0c", len: 2, skip: 0, id: 12 },
    
    // Novos 8 sensores de Prioridade 2
    { name: 'oilPress', targetId: 150, defaultPid: "00", len: 1, skip: 99, id: 13 },
    { name: 'fuelPress', targetId: 139, defaultPid: "0a", len: 1, skip: 99, id: 14 },
    { name: 'oilTemp', targetId: 151, defaultPid: "5c", len: 1, skip: 99, id: 15 },
    { name: 'iat', targetId: 27, defaultPid: "0f", len: 1, skip: 99, id: 16 },
    { name: 'egt', targetId: 96, defaultPid: "78", len: 2, skip: 99, id: 17 },
    { name: 'afr', targetId: 54, defaultPid: "44", len: 1, skip: 99, id: 18 },
    { name: 'lambda', targetId: 166, defaultPid: "24", len: 1, skip: 99, id: 19 },
    { name: 'timing', targetId: 35, defaultPid: "0e", len: 1, skip: 9, id: 20 }
  ];
  
  const sensorStrings = [];
  
  sensorsList.forEach(s => {
    let pid = s.defaultPid;
    let len = s.len;
    let skip = s.skip;
    let srcOffset = 0;
    
    // Procura por ID direto no comando plano
    let matchedCmd = profile.commands.find(c => c.targetId === s.targetId);
    if (matchedCmd) {
      pid = matchedCmd.send.replace(/^01/, "");
      len = matchedCmd.conversion ? (matchedCmd.conversion.includes("B1") || matchedCmd.conversion.includes("B0*256") ? 2 : 1) : s.len;
      skip = matchedCmd.skipCount !== undefined ? matchedCmd.skipCount : s.skip;
    } else {
      // Procura em comandos que contém valores aninhados
      let parentCmd = profile.commands.find(c => c.values && c.values.some(v => v.targetId === s.targetId));
      if (parentCmd) {
        pid = parentCmd.send;
        skip = parentCmd.skipCount !== undefined ? parentCmd.skipCount : s.skip;
        
        const nestedVal = parentCmd.values.find(v => v.targetId === s.targetId);
        const conv = nestedVal.conversion || "";
        const match = conv.match(/B(\d+)/i);
        if (match) {
          srcOffset = parseInt(match[1], 10);
        }
        len = conv.includes("*256") ? 2 : 1;
      }
    }
    
    sensorStrings.push(`${pid}:${len}:${skip}:${srcOffset}:${s.id}`);
  });
  
  return `CFG;${baud};${canType};${txId};${rxId};${tester};${handshake};${speedFormula};${fuelFormula};${sensorStrings.join(";")}\n`;
}

function handleJsonCommand(j) {
  if (j.cmd === 'trip_hist_data') {
    document.dispatchEvent(new CustomEvent('trip_hist_data', { detail: j.payload }));
    return;
  }
  if (j.cmd === 'perf_data') {
    document.dispatchEvent(new CustomEvent('perf_data', { detail: j.payload }));
    return;
  }
  if (j.cmd === 'dtc_data') {
    document.dispatchEvent(new CustomEvent('dtc_data', { detail: j.codes || [] }));
    return;
  }
  if (j.cmd === 'dtc_clear_result') {
    document.dispatchEvent(new CustomEvent('dtc_clear_result', { detail: { success: !!j.success } }));
    return;
  }
  processTelemetry(j);
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

  // Carrega configuração do carro v7.0
  try {
    const savedCar = localStorage.getItem('PULSEDASH_CAR');
    if (savedCar) {
      ST.car = JSON.parse(savedCar);
      console.log("[CAR] Configuração do veículo carregada:", ST.car);
    }
  } catch (e) {
    console.error("[CAR] Erro ao carregar veículo:", e);
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

