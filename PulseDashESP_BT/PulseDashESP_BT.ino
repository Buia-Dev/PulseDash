// ==============================================================
//  PulseDash v6.5 — Computador de Bordo & Sensores Estendidos
//  Comunicação Direta via TWAI (SN65HVD230)
// --------------------------------------------------------------
//  v6.5: Computador de Bordo completo, UDS Service 22,
//        Economômetro clássico e Escalonador de 4 tempos.
// ==============================================================

#include "driver/twai.h" // v5.0: CAN direto (SN65HVD230)
#include <LittleFS.h>
#include "BluetoothSerial.h"
#include "esp_bt.h" // v6.9: Controle de baixo nível do rádio BT


#define CAN_TX_PIN 17
#define CAN_RX_PIN 16

// ==============================================================
// ★ OBJETOS GLOBAIS ★
// ==============================================================
// Removido WebServer para uso Puro Bluetooth
// Confirmado pareamento com o nome PULSESCAN
BluetoothSerial SerialBT;
SemaphoreHandle_t dataMutex;

// ==============================================================
// ★ COMPUTADOR DE BORDO & HISTÓRICO ★
// ==============================================================
float tripDist = 0;       // Distância da viagem (KM)
float tripFuel = 0;       // Combustível gasto (L)
uint32_t tripTimeTot = 0; // Tempo total da viagem (s)
uint32_t tripTimeDri = 0; // Tempo em movimento (s)

float fuelMultiplier = 1.0f;

uint32_t lastTripUpdate = 0;
uint32_t lastTripSave = 0;
float lastSavedDist = 0.0f;  // v6.5: Rastreia a última distância gravada em Flash
int failedQueries = 0;       // v6.5: Contador de falhas consecutivas de consulta CAN
float emaFuel = -1.0f;       // v6.5: Média móvel suavizada do combustível (global para snap no boot)
float fuelPrice = 0.0f;      // v6.5: Preço do combustível sincronizado do App

uint32_t unixTime = 0;
uint32_t lastUnixSyncMs = 0;
uint32_t lastKnownEpoch = 0; // Timestamp do último dia rodado

// --- Variáveis de Sinalização de Escrita em Flash (LittleFS) ---
volatile bool saveTripPending = false;
volatile bool saveUnsupportedPending = false;
volatile bool saveHistPending = false;
volatile bool saveConfigPending = false;

// Buffers de transferência para as tasks de background
uint32_t histPendingTs = 0;
float histPendingDist = 0.0f;
float histPendingFuel = 0.0f;
uint32_t histPendingTimeTot = 0;
uint32_t histPendingTimeDri = 0;
float histPendingPrice = 0.0f;

char pendingConfigCmd[512] = "";

// ==============================================================
// ★ FUNÇÃO: SINALIZAR SALVAMENTO DO HISTÓRICO EM SEGUNDO PLANO ★
// ==============================================================
void triggerSaveHistory(uint32_t ts_day) {
  if (saveHistPending) {
    logEvent("[TRIP] Salvamento de historico ja pendente. Ignorando.");
    return;
  }
  
  xSemaphoreTake(dataMutex, portMAX_DELAY);
  if (tripDist >= 0.5f) {
    histPendingTs = ts_day;
    histPendingDist = tripDist;
    histPendingFuel = tripFuel;
    histPendingTimeTot = tripTimeTot;
    histPendingTimeDri = tripTimeDri;
    histPendingPrice = fuelPrice;
    saveHistPending = true;
    logEvent("[TRIP] Sinalizado salvamento de historico na Flash em background.");
  } else {
    logEvent("[TRIP] Viagem curta demais para historico. Apenas resetando contadores.");
  }
  
  // Zera contadores locais do dia atual sob mutex
  tripDist = 0;
  tripFuel = 0;
  tripTimeTot = 0;
  tripTimeDri = 0;
  lastSavedDist = 0.0f;
  xSemaphoreGive(dataMutex);
}

#define LED_PIN 2

// ==============================================================
// ★ SISTEMA DE LOG (Apenas Serial) ★
// ==============================================================
void logEvent(String msg) {
  String line = "[" + String(millis() / 1000) + "s] " + msg;
  Serial.println(line);
}

// Handlers HTTP removidos (Puro Bluetooth)
// ==============================================================
// Wi-Fi desativado

// Estado OBD: 0=OFF, 1=INICIANDO CAN, 3=HANDSHAKE, 4=ONLINE, 9=FALHA
volatile int obdState = 0;
volatile bool btRequested = false; // dashboard controla liga/desliga
volatile uint32_t obdLastOk = 0;

// --- Variáveis de Controle de DTC ---
volatile bool dtcScanPending = false;
volatile bool dtcClearPending = false;


// Sensores em struct — reset limpo e cópia atômica
struct SensorData {
  float rpm = 0;
  float throttle = 0;
  float pedal = 0;
  float load = 0;
  float coolant = 0;
  float boost = 0;
  float ethanol = 0;
  float catalyst = 0;
  float ambientTemp = 0;
  float speed = 0;
  float voltage = 0;
  float fuelLevel = 0;
  float fuelRate = 0;
  float transTemp = 0;
  float oilPres = 0;
  float oilTemp = 0;
  float fuelPress = 0;
  float iat = 0;
  float egt = 0;
  float afr = 0;
  float lambda = 0;
  float timing = 0;
  float loopMs = 0; // v6.9: Tempo de loop CAN em milissegundos
};
SensorData sensors;

// ==============================================================
// ★ ESTRUTURAS DO NOVO ESCALONADOR DINÂMICO v7.0 ★
// ==============================================================
struct OBD2Sensor {
  uint16_t pid;          // v7.0: Alterado de uint8_t para uint16_t para PIDs de 2 bytes
  uint8_t mode;          // v7.0: Adicionado para suportar modos customizados (0x01, 0x21, 0x22, etc.)
  uint8_t nBytes;
  uint16_t skipCount;
  uint16_t skipCounter;
  float* valuePtr;
  uint32_t cooldownUntil;
  uint8_t failedCount;
  const char* name;
  uint8_t srcOffset;     // v7.0: offset do byte na resposta
  uint8_t destSensorId;  // v7.0: ID do sensor alvo no buffer binário
};

#define MAX_SENSORS 25
volatile int numSchedSensors = 11;
OBD2Sensor schedSensors[MAX_SENSORS] = {
  { 0x0D, 0x01, 1,   1, 0, &sensors.speed,       0, 0, "Speed",       0, 0 },
  { 0x11, 0x01, 1,   3, 0, &sensors.throttle,    0, 0, "Throttle",    0, 1 },
  { 0x49, 0x01, 1,   3, 0, &sensors.pedal,       0, 0, "Pedal",       0, 2 },
  { 0x04, 0x01, 1,   9, 0, &sensors.load,        0, 0, "Load",        0, 3 },
  { 0x5E, 0x01, 2,   9, 0, &sensors.fuelRate,    0, 0, "FuelRate",    0, 4 },
  { 0x05, 0x01, 1,  99, 0, &sensors.coolant,     0, 0, "Coolant",     0, 6 },
  { 0x42, 0x01, 2,  99, 0, &sensors.voltage,     0, 0, "Voltage",     0, 10 },
  { 0x46, 0x01, 1,  99, 0, &sensors.ambientTemp, 0, 0, "Ambient",     0, 8 },
  { 0x3C, 0x01, 2,  99, 0, &sensors.catalyst,    0, 0, "Catalyst",    0, 7 },
  { 0x2F, 0x01, 1,  99, 0, &sensors.fuelLevel,   0, 0, "FuelLevel",   0, 11 },
  { 0x52, 0x01, 1, 5999, 0, &sensors.ethanol,    0, 0, "Ethanol",     0, 9 }
};

// Variáveis dinâmicas de configuração v7.0
uint32_t configBaud = 500;
uint8_t configCanType = 29;
uint32_t configTxId = 0x18DB33F1;
uint32_t configRxId = 0x18DAF111;
uint8_t configTesterPresent = 1;
uint16_t configHandshakePid = 0x00; // v7.0: Alterado para uint16_t
uint8_t configHandshakeMode = 0x01; // v7.0: Adicionado para suportar modos estendidos no handshake

uint16_t rpmPid = 0x0C; // v7.0: Alterado de uint8_t para uint16_t
uint8_t rpmMode = 0x01; // v7.0: Adicionado para controle do modo do RPM
uint8_t rpmBytes = 2;
uint8_t rpmSrcOffset = 0;

uint8_t speedFormulaId = 0;
uint8_t fuelFormulaId = 0;

// Variáveis reais de viagem desacopladas do buffer bruto
float tripSpeed = 0.0f;
float tripFuelRate = 0.0f;

// ==============================================================
// ★ CAN / TWAI: COMUNICAÇÃO OBD2 DINÂMICA ★
// ==============================================================

bool canInit() {
  twai_general_config_t g = TWAI_GENERAL_CONFIG_DEFAULT(
      (gpio_num_t)CAN_TX_PIN, (gpio_num_t)CAN_RX_PIN, TWAI_MODE_NORMAL);
  g.alerts_enabled = TWAI_ALERT_ALL;
  g.rx_queue_len = 10;
  
  twai_timing_config_t t;
  if (configBaud == 250) {
    t = TWAI_TIMING_CONFIG_250KBITS();
  } else if (configBaud == 125) {
    t = TWAI_TIMING_CONFIG_125KBITS();
  } else {
    t = TWAI_TIMING_CONFIG_500KBITS();
  }
  
  twai_filter_config_t f = TWAI_FILTER_CONFIG_ACCEPT_ALL();
  if (twai_driver_install(&g, &t, &f) != ESP_OK)
    return false;
  if (twai_start() != ESP_OK) {
    twai_driver_uninstall();
    return false;
  }
  return true;
}

bool canSendOBD(uint16_t pid, uint8_t mode = 0x01, uint8_t len = 1) {
  twai_message_t m;
  memset(&m, 0, sizeof(m));
  m.identifier = configTxId;
  m.extd = (configCanType == 29) ? 1 : 0;
  m.data_length_code = 8;
  
  if (len == 2) {
    m.data[0] = 0x03;
    m.data[1] = mode;
    m.data[2] = (pid >> 8) & 0xFF;
    m.data[3] = pid & 0xFF;
  } else {
    m.data[0] = 0x02;
    m.data[1] = mode;
    m.data[2] = pid & 0xFF;
  }
  return twai_transmit(&m, pdMS_TO_TICKS(20)) == ESP_OK;
}

// --- Linguagem do LED (v5.1) ---
void ledBlink(int count, int delayMs) {
  for (int i = 0; i < count; i++) {
    digitalWrite(LED_PIN, HIGH);
    vTaskDelay(delayMs / portTICK_PERIOD_MS);
    digitalWrite(LED_PIN, LOW);
    vTaskDelay(delayMs / portTICK_PERIOD_MS);
  }
}

// Retorna valor bruto cru do sensor (Single Frame CAN)
int32_t canReadSensorRaw(uint16_t pid, uint8_t len, uint8_t srcOffset, uint8_t mode = 0x01) {
  uint8_t pidLen = (mode == 0x22 || pid > 0xFF) ? 2 : 1;
  if (!canSendOBD(pid, mode, pidLen))
    return -999;
    
  twai_message_t r;
  uint32_t t0 = millis();
  while (millis() - t0 < 25) {
    if (twai_receive(&r, pdMS_TO_TICKS(1)) == ESP_OK) {
      bool idMatch = (r.identifier == configRxId);
      uint8_t respMode = mode + 0x40;
      
      if (idMatch && r.data[1] == respMode) {
        bool pidMatch = false;
        uint8_t dataStartIdx = 3;
        if (pidLen == 2) {
          uint16_t respPid = (r.data[2] << 8) | r.data[3];
          if (respPid == pid) {
            pidMatch = true;
            dataStartIdx = 4;
          }
        } else {
          if (r.data[2] == (pid & 0xFF)) {
            pidMatch = true;
            dataStartIdx = 3;
          }
        }
        
        if (pidMatch) {
          int idx = dataStartIdx + srcOffset;
          if (idx >= 8) return -999;
          
          if (len == 2) {
            if (idx + 1 >= 8) return -999;
            return (r.data[idx] << 8) | r.data[idx+1];
          } else {
            return r.data[idx];
          }
        }
      }
    }
  }
  return -999;
}

float getSpeedFloat(int32_t rawVal) {
  if (rawVal == -999) return -999.0f;
  if (speedFormulaId == 1) return rawVal / 10.0f;
  return (float)rawVal;
}

float getFuelRateFloat(int32_t rawVal) {
  if (rawVal == -999) return -999.0f;
  if (fuelFormulaId == 0) return rawVal / 20.0f; // standard L/h
  if (fuelFormulaId == 1) {
    float maf = rawVal / 100.0f; 
    float ethRatio = sensors.ethanol / 100.0f;
    if (ethRatio < 0.0f) ethRatio = 0.0f;
    if (ethRatio > 1.0f) ethRatio = 1.0f;
    float afrTarget = 14.7f * (1.0f - ethRatio) + 9.0f * ethRatio;
    float density = 737.0f * (1.0f - ethRatio) + 789.0f * ethRatio;
    return ((maf / afrTarget) * 3600.0f) / density;
  }
  return rawVal;
}

// Converte os bytes de resposta OBD2 em string correspondente no padrão SAE J2012
String decodeDTC(uint8_t a, uint8_t b) {
  char typeChar;
  uint8_t typeBits = (a >> 6) & 0x03;
  switch (typeBits) {
    case 0: typeChar = 'P'; break;
    case 1: typeChar = 'C'; break;
    case 2: typeChar = 'B'; break;
    case 3: typeChar = 'U'; break;
  }
  
  uint8_t digit2 = (a >> 4) & 0x03;
  uint8_t digit3 = a & 0x0F;
  uint8_t digit4 = (b >> 4) & 0x0F;
  uint8_t digit5 = b & 0x0F;
  
  char buf[8];
  snprintf(buf, sizeof(buf), "%c%d%X%X%X", typeChar, digit2, digit3, digit4, digit5);
  return String(buf);
}

// ==============================================================
// ★ TASK CORE 0: COMUNICAÇÃO OBD2 VIA CAN ★
// ==============================================================
void obdTask(void *param) {
  logEvent("[SYS] Task OBD (CAN dinâmico) pronta.");

  for (;;) {
    // STANDBY — aguarda o dashboard solicitar conexão
    if (!btRequested) {
      vTaskDelay(500 / portTICK_PERIOD_MS);
      continue;
    }

    // ESTADO 1: Iniciar driver TWAI
    obdState = 1;
    logEvent("[CAN] Iniciando TWAI " + String(configCanType) + "-bit @ " + String(configBaud) + "kbps...");
    digitalWrite(LED_PIN, HIGH);

    if (!canInit()) {
      logEvent("[CAN] ERRO: falha ao instalar driver TWAI!");
      obdState = 9;
      digitalWrite(LED_PIN, LOW);
      vTaskDelay(5000 / portTICK_PERIOD_MS); 
      continue;
    }
    logEvent("[CAN] Driver OK. Heap: " + String(ESP.getFreeHeap()));
    digitalWrite(LED_PIN, LOW);

    // ESTADO 3: Handshake Robusto
    obdState = 3;
    logEvent("[CAN] Handshake agressivo iniciando...");
    bool handshakeOk = false;

    for (int tentativa = 0; tentativa < 10 && !handshakeOk; tentativa++) {
      digitalWrite(LED_PIN, HIGH);
      
      // 1. Acorda a ECU (Tester Present se ativo)
      if (configTesterPresent) {
        twai_message_t tp;
        memset(&tp, 0, sizeof(tp));
        tp.identifier = configTxId;
        tp.extd = (configCanType == 29) ? 1 : 0;
        tp.data_length_code = 8;
        tp.data[0] = 0x02;
        tp.data[1] = 0x3E;
        tp.data[2] = 0x00;
        twai_transmit(&tp, pdMS_TO_TICKS(10));
        vTaskDelay(100 / portTICK_PERIOD_MS); 
      }

      // 2. Manda o pedido de handshake com o modo configurado
      uint8_t hsLen = (configHandshakeMode == 0x22 || configHandshakeMode == 0x10 || configHandshakePid > 0xFF) ? 2 : 1;
      canSendOBD(configHandshakePid, configHandshakeMode, hsLen);

      // 3. Escuta resposta ativa por 800ms
      uint32_t t0 = millis();
      while (millis() - t0 < 800) {
         twai_message_t r;
        if (twai_receive(&r, pdMS_TO_TICKS(5)) == ESP_OK) {
          uint8_t respMode = configHandshakeMode + 0x40;
          bool hsMatch = false;
          if (r.identifier == configRxId && r.data[1] == respMode) {
            if (hsLen == 2) {
              uint16_t respPid = (r.data[2] << 8) | r.data[3];
              if (respPid == configHandshakePid) hsMatch = true;
            } else {
              if (r.data[2] == (configHandshakePid & 0xFF)) hsMatch = true;
            }
          }
          if (hsMatch) {
            handshakeOk = true;
            logEvent("[CAN] Handshake OK! ECU detectada: 0x" + String(r.identifier, HEX));
            break;
          }
        }
      }
      digitalWrite(LED_PIN, LOW);
      if (!handshakeOk)
        vTaskDelay(200 / portTICK_PERIOD_MS);
    }

    if (!handshakeOk) {
      logEvent("[CAN] ECU em silencio. Tentando reiniciar driver...");
      twai_stop();
      twai_driver_uninstall();
      obdState = 9;
      vTaskDelay(5000 / portTICK_PERIOD_MS);
      continue;
    }

    // ESTADO 4: ONLINE — loop de leitura contínua
    obdState = 4;
    obdLastOk = millis();
    ledBlink(3, 50); 
    uint32_t lastTP = millis();
    uint32_t lastLoop = millis();

    logEvent("[CAN] ★ ONLINE! Dashboard ativo.");

    while (btRequested && obdState == 4) {
      uint32_t alertas = 0;
      twai_read_alerts(&alertas, 0);
      if (alertas & TWAI_ALERT_BUS_OFF) {
        twai_initiate_recovery();
      }

      // --- TRATAMENTO FÍSICO DE DTC VIA CAN (Modo 03 e 04) ---
      if (dtcScanPending) {
        dtcScanPending = false;
        logEvent("[CAN] Iniciando scan de DTCs reais via CAN...");
        
        twai_message_t m;
        memset(&m, 0, sizeof(m));
        m.identifier = configTxId; 
        m.extd = (configCanType == 29) ? 1 : 0;
        m.data_length_code = 8;
        m.data[0] = 0x01; // 1 byte de dados
        m.data[1] = 0x03; // Modo 03 (Request DTCs)
        
        twai_transmit(&m, pdMS_TO_TICKS(20));
        
        uint32_t tStart = millis();
        bool respReceived = false;
        String codesJson = "";
        
        while (millis() - tStart < 800) {
          twai_message_t r;
          if (twai_receive(&r, pdMS_TO_TICKS(5)) == ESP_OK) {
            if (r.identifier == configRxId && r.data[1] == 0x43) {
              respReceived = true;
              for (int i = 2; i < 8; i += 2) {
                uint8_t a = r.data[i];
                uint8_t b = r.data[i+1];
                if (a == 0 && b == 0) continue;
                
                String dtc = decodeDTC(a, b);
                if (codesJson.length() > 0) codesJson += ",";
                codesJson += "\"" + dtc + "\"";
              }
              break;
            }
          }
          vTaskDelay(pdMS_TO_TICKS(2));
        }
        
        String jsonResp = "{\"cmd\":\"dtc_data\",\"codes\":[" + codesJson + "]}";
        SerialBT.println(jsonResp);
        logEvent("[BT] Resposta DTC scan enviada: " + jsonResp);
        
        lastLoop = millis();
        continue;
      }

      if (dtcClearPending) {
        dtcClearPending = false;
        logEvent("[CAN] Enviando comando de limpeza de DTCs (Modo 04) via CAN...");
        
        twai_message_t m;
        memset(&m, 0, sizeof(m));
        m.identifier = configTxId;
        m.extd = (configCanType == 29) ? 1 : 0;
        m.data_length_code = 8;
        m.data[0] = 0x01;
        m.data[1] = 0x04; // Modo 04
        
        twai_transmit(&m, pdMS_TO_TICKS(20));
        
        uint32_t tStart = millis();
        bool success = false;
        while (millis() - tStart < 800) {
          twai_message_t r;
          if (twai_receive(&r, pdMS_TO_TICKS(5)) == ESP_OK) {
            if (r.identifier == configRxId && r.data[1] == 0x44) {
              success = true;
              break;
            }
          }
          vTaskDelay(pdMS_TO_TICKS(2));
        }
        
        String jsonResp = "{\"cmd\":\"dtc_clear_result\",\"success\":" + String(success ? "true" : "false") + "}";
        SerialBT.println(jsonResp);
        logEvent("[BT] Resposta DTC clear enviada: " + jsonResp);
        
        lastLoop = millis();
        continue;
      }

      if (millis() - lastLoop < 10) {
        vTaskDelay(pdMS_TO_TICKS(1));
        continue;
      }
      lastLoop = millis();

      // Tester Present a cada 2s
      if (configTesterPresent && (millis() - lastTP > 2000)) {
        lastTP = millis();
        twai_message_t tp;
        memset(&tp, 0, sizeof(tp));
        tp.identifier = configTxId;
        tp.extd = (configCanType == 29) ? 1 : 0;
        tp.data_length_code = 8;
        tp.data[0] = 0x02;
        tp.data[1] = 0x3E;
        tp.data[2] = 0x00;
        twai_transmit(&tp, pdMS_TO_TICKS(5));
      }

      // --- LOOP ULTRA-RÁPIDO (20Hz / 50ms) ---
      uint32_t loopStart = millis();
      int32_t rawRpm = canReadSensorRaw(rpmPid, rpmBytes, rpmSrcOffset, rpmMode);

      // --- ESTRUTURA v7.0: ESCALONADOR skipCount COM MÁXIMO DE 2 CONSULTAS POR CICLO ---
      uint32_t now = millis();

      // Atualiza RPM
      if (rawRpm > -900) {
        failedQueries = 0; 
        xSemaphoreTake(dataMutex, portMAX_DELAY);
        sensors.rpm = (float)rawRpm;
        obdLastOk = now;
        xSemaphoreGive(dataMutex);
      } else {
        failedQueries++;
      }

      // Procura o sensor mais prioritário/atrasado na fila do scheduler
      int bestIndex = -1;
      float highestRatio = -1.0f;

      for (int i = 0; i < numSchedSensors; i++) {
        // Ignora se estiver desativado permanentemente na sessao
        if (schedSensors[i].cooldownUntil == 0xFFFFFFFF) {
          continue;
        }

        // Ignora se estiver em cooldown ativo
        if (schedSensors[i].cooldownUntil > 0 && now < schedSensors[i].cooldownUntil) {
          continue;
        }

        // Incrementa o contador do ciclo para este sensor
        schedSensors[i].skipCounter++;

        // Calcula a taxa de atraso em relação ao esperado
        float ratio = (float)schedSensors[i].skipCounter / (float)(schedSensors[i].skipCount + 1);
        if (ratio >= 1.0f && ratio > highestRatio) {
          highestRatio = ratio;
          bestIndex = i;
        }
      }

      // Se houver um sensor pronto para leitura, executa-o neste ciclo (máx 1 secundário por loop)
      if (bestIndex != -1) {
        OBD2Sensor& s = schedSensors[bestIndex];
        int32_t rawVal = -999;
        
        bool isBootTest = (s.failedCount >= 50); // Se iniciou em 50, é teste único no boot

        if (s.destSensorId == 4) { // FuelRate / Consumo
          // Lógica especial para Consumo Físico com fallback automático e permanente para MAF
          static bool useMafOnly = false;
          if (useMafOnly) {
            int32_t rawMaf = canReadSensorRaw(0x10, 2, 0, 0x01);
            if (rawMaf > -900) {
              tripFuelRate = getFuelRateFloat(rawMaf);
              rawVal = rawMaf;
            }
          } else {
            int32_t fr = canReadSensorRaw(s.pid, s.nBytes, s.srcOffset, s.mode);
            if (fr > -900 && fr > 0) {
              tripFuelRate = getFuelRateFloat(fr);
              rawVal = fr;
            } else {
              int32_t rawMaf = canReadSensorRaw(0x10, 2, 0, 0x01);
              if (rawMaf > -900) {
                tripFuelRate = getFuelRateFloat(rawMaf);
                rawVal = rawMaf;
              }
              s.failedCount++;
              if (s.failedCount >= 5) {
                useMafOnly = true;
                logEvent("[CAN] PID 0x" + String(s.pid, HEX) + " (FuelRate) indisponivel. Fallback MAF.");
                s.failedCount = 0;
              }
            }
          }
        } else if (s.destSensorId == 11) { // FuelLevel / Combustível
          // Lógica especial para Nível de Combustível com filtro EMA
          int32_t fRaw = canReadSensorRaw(s.pid, s.nBytes, s.srcOffset, s.mode);
          if (fRaw > -900) {
            float currentRpm = 0.0f;
            xSemaphoreTake(dataMutex, portMAX_DELAY);
            currentRpm = sensors.rpm;
            xSemaphoreGive(dataMutex);

            if (currentRpm >= 800.0f) {
              if (emaFuel < 0) {
                emaFuel = (float)fRaw;
              } else {
                emaFuel = (0.01f * (float)fRaw) + (0.99f * emaFuel);
              }
            } else {
              emaFuel = (float)fRaw;
            }
            rawVal = (int32_t)emaFuel;
          }
        } else {
          // Consulta OBD genérica padrão
          rawVal = canReadSensorRaw(s.pid, s.nBytes, s.srcOffset, s.mode);
        }

        // Processamento de sucesso ou erro/cooldown
        if (rawVal > -900) {
          if (isBootTest) {
            logEvent("[CAN] Sensor " + String(s.name) + " respondeu no boot! Reabilitado na Flash.");
            s.failedCount = 0;
            s.cooldownUntil = 0;
            saveUnsupportedSensors(); // Remove do arquivo da Flash
          } else {
            s.failedCount = 0;
          }
          
          xSemaphoreTake(dataMutex, portMAX_DELAY);
          *(s.valuePtr) = (float)rawVal;
          if (s.destSensorId == 0) { // Speed
            tripSpeed = getSpeedFloat(rawVal);
          }
          xSemaphoreGive(dataMutex);
        } else {
          if (isBootTest) {
            // Se falhou no teste único de boot, desativa imediatamente pela sessão
            s.cooldownUntil = 0xFFFFFFFF;
            logEvent("[CAN] Sensor " + String(s.name) + " ausente no boot. Desativado na sessao.");
          } else {
            s.failedCount++;
            if (s.failedCount == 5) {
              s.cooldownUntil = now + 30000; // 30s de silêncio
              logEvent("[CAN] PID 0x" + String(s.pid, HEX) + " (" + String(s.name) + ") falhou consecutivamente. Cooldown 30s.");
            } else if (s.failedCount >= 50) {
              s.cooldownUntil = 0xFFFFFFFF; // Desativação permanente
              saveUnsupportedSensors(); // Salva novo status na Flash
              logEvent("[CAN] PID 0x" + String(s.pid, HEX) + " (" + String(s.name) + ") inativo (50 falhas). Desativado e salvo na Flash.");
            }
          }
        }

        s.skipCounter = 0;
      }

      // v6.4: Gatilho de Motor desligado/Desligamento (5 falhas consecutivas do RPM = 250ms de silêncio)
      if (failedQueries >= 5 && obdState == 4) {
        logEvent("[CAN] ECU Offline (motor desligado). Preservando viagem...");
        failedQueries = 0;
        emaFuel = -1.0f;

        saveTripPending = true; // Dispara salvamento em background
        logEvent("[TRIP] Solicitado salvamento de desligamento em background.");

        xSemaphoreTake(dataMutex, portMAX_DELAY);
        sensors.rpm = 0;
        sensors.speed = 0;
        sensors.throttle = 0;
        sensors.pedal = 0;
        sensors.load = 0;
        sensors.fuelRate = 0;
        sensors.boost = 0;
        tripSpeed = 0;
        tripFuelRate = 0;
        xSemaphoreGive(dataMutex);

        obdState = 9;
        break;
      }

      // Medição real da duração do loop para depuração no App
      uint32_t loopDuration = millis() - loopStart;
      xSemaphoreTake(dataMutex, portMAX_DELAY);
      sensors.loopMs = (float)loopDuration;
      xSemaphoreGive(dataMutex);

      // Controle de frequência estrito a 20Hz (50ms por iteração)
      uint32_t elapsed = millis() - loopStart;
      if (elapsed < 50) {
        vTaskDelay(pdMS_TO_TICKS(50 - elapsed));
      } else {
        vTaskDelay(pdMS_TO_TICKS(1));
      }
    }

    // Encerrar sessão CAN
    twai_stop();
    twai_driver_uninstall();
    digitalWrite(LED_PIN, LOW);
    logEvent("[CAN] Sessao encerrada.");
    vTaskDelay(1000 / portTICK_PERIOD_MS);
  }
}

// ==============================================================
// ★ AUXILIAR: PARSER DO COMANDO DE CONFIGURAÇÃO DE PERFIL v7.0 ★
// ==============================================================
String getValue(String data, char separator, int index) {
  int found = 0;
  int strIndex[] = {0, -1};
  int maxIndex = data.length() - 1;
  for (int i = 0; i <= maxIndex && found <= index; i++) {
    if (data.charAt(i) == separator || i == maxIndex) {
      found++;
      strIndex[0] = strIndex[1] + 1;
      strIndex[1] = (i == maxIndex) ? i + 1 : i;
    }
  }
  return found > index ? data.substring(strIndex[0], strIndex[1]) : "";
}

// ==============================================================
// ★ TASK CORE 0: ESCRITA EM FLASH EM SEGUNDO PLANO (LITTLEFS) ★
// ==============================================================
void fsTask(void *param) {
  logEvent("[SYS] Task FS (escritas em Flash) pronta no Core 0.");
  for (;;) {
    if (saveTripPending) {
      saveTripPending = false;
      
      // Cópia atômica das variáveis sob o mutex
      xSemaphoreTake(dataMutex, portMAX_DELAY);
      uint32_t copyEpoch = lastKnownEpoch;
      float copyDist = tripDist;
      float copyFuel = tripFuel;
      uint32_t copyTimeTot = tripTimeTot;
      uint32_t copyTimeDri = tripTimeDri;
      float copyPrice = fuelPrice;
      xSemaphoreGive(dataMutex);

      File f = LittleFS.open("/trip_current.json", "w");
      if (f) {
        f.printf("{\"ts\":%u,\"dist\":%.2f,\"fuel\":%.3f,\"ttot\":%u,\"tdri\":%u,\"price\":%.2f}", 
                 copyEpoch, copyDist, copyFuel, copyTimeTot, copyTimeDri, copyPrice);
        f.close();
        logEvent("[TRIP] Backup de viagem salvo na Flash via background task.");
      }
    }
    
    if (saveUnsupportedPending) {
      saveUnsupportedPending = false;
      
      String unsupportedContent = "";
      xSemaphoreTake(dataMutex, portMAX_DELAY);
      for (int i = 0; i < numSchedSensors; i++) {
        if (schedSensors[i].cooldownUntil == 0xFFFFFFFF) {
          unsupportedContent += String(schedSensors[i].destSensorId) + " ";
        }
      }
      xSemaphoreGive(dataMutex);

      File f = LittleFS.open("/unsupported.dat", "w");
      if (f) {
        f.print(unsupportedContent);
        f.close();
        logEvent("[SYS] Lista de sensores nao suportados salva na Flash em background.");
      }
    }

    if (saveHistPending) {
      saveHistPending = false;
      
      // Executa escrita do histórico sem fragmentação de heap (buffer estático seguro)
      char histBuffer[1024];
      memset(histBuffer, 0, sizeof(histBuffer));
      strcpy(histBuffer, "[]");
      
      if (LittleFS.exists("/trip_hist.json")) {
        File f = LittleFS.open("/trip_hist.json", "r");
        if (f) {
          size_t len = f.readBytes(histBuffer, sizeof(histBuffer) - 1);
          histBuffer[len] = '\0';
          f.close();
        }
      }
      
      size_t len = strlen(histBuffer);
      while (len > 0 && (histBuffer[len - 1] == ' ' || histBuffer[len - 1] == '\r' || histBuffer[len - 1] == '\n')) {
        histBuffer[--len] = '\0';
      }
      
      char entry[160];
      snprintf(entry, sizeof(entry), "{\"ts\":%u,\"dist\":%.2f,\"fuel\":%.3f,\"ttot\":%u,\"tdri\":%u,\"price\":%.2f}", 
               histPendingTs, histPendingDist, histPendingFuel, histPendingTimeTot, histPendingTimeDri, histPendingPrice);
               
      if (len <= 2) {
        snprintf(histBuffer, sizeof(histBuffer), "[%s]", entry);
      } else {
        if (histBuffer[len - 1] == ']') {
          histBuffer[len - 1] = '\0';
          len--;
        }
        if (len + strlen(entry) + 3 < sizeof(histBuffer)) {
          strcat(histBuffer, ",");
          strcat(histBuffer, entry);
          strcat(histBuffer, "]");
        }
      }
      
      int entryCount = 0;
      for (int i = 0; histBuffer[i] != '\0'; i++) {
        if (histBuffer[i] == '{') entryCount++;
      }
      
      char *ptr = histBuffer;
      while (entryCount > 7) {
        char *firstOpen = strchr(ptr, '{');
        if (firstOpen) {
          char *secondOpen = strchr(firstOpen + 1, '{');
          if (secondOpen) {
            size_t secLen = strlen(secondOpen);
            memmove(ptr + 1, secondOpen, secLen + 1);
            ptr[0] = '[';
            entryCount--;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      
      File f = LittleFS.open("/trip_hist.json", "w");
      if (f) {
        f.print(histBuffer);
        f.close();
        logEvent("[TRIP] Historico de viagens atualizado na Flash em background.");
      }
      
      LittleFS.remove("/trip_current.json");
    }

    if (saveConfigPending) {
      saveConfigPending = false;
      
      char cmdCopy[512];
      xSemaphoreTake(dataMutex, portMAX_DELAY);
      strcpy(cmdCopy, pendingConfigCmd);
      xSemaphoreGive(dataMutex);
      
      File f = LittleFS.open("/car_profile.cfg", "w");
      if (f) {
        f.print(cmdCopy);
        f.close();
        logEvent("[CFG] Perfil salvo na Flash em background.");
      }
    }
    
    vTaskDelay(500 / portTICK_PERIOD_MS);
  }
}

// ==============================================================
// ★ PERSISTÊNCIA DE SENSORES NÃO SUPORTADOS (LITTLEFS) ★
// ==============================================================
void saveUnsupportedSensors() {
  saveUnsupportedPending = true; // Apenas sinaliza a task de background
  logEvent("[SYS] Solicitado salvamento de nao suportados em background.");
}

void loadUnsupportedSensors() {
  if (!LittleFS.exists("/unsupported.dat")) return;
  File f = LittleFS.open("/unsupported.dat", "r");
  if (!f) return;
  String content = f.readString();
  f.close();
  
  logEvent("[SYS] Carregando sensores nao suportados: " + content);
  for (int i = 0; i < numSchedSensors; i++) {
    String searchStr = " " + String(schedSensors[i].destSensorId) + " ";
    String text = " " + content + " ";
    if (text.indexOf(searchStr) >= 0) {
      schedSensors[i].failedCount = 50; // Inicia marcado para teste único no boot
      logEvent("[SYS] Sensor " + String(schedSensors[i].name) + " pre-configurado como nao suportado.");
    }
  }
}

void applyConfigString(String cmd) {
  cmd.trim();
  String sBaud = getValue(cmd, ';', 1);
  if (sBaud == "") return;
  
  configBaud = sBaud.toInt();
  configCanType = getValue(cmd, ';', 2).toInt();
  configTxId = strtoul(getValue(cmd, ';', 3).c_str(), NULL, 16);
  configRxId = strtoul(getValue(cmd, ';', 4).c_str(), NULL, 16);
  configTesterPresent = getValue(cmd, ';', 5).toInt();
  
  String sHandshake = getValue(cmd, ';', 6);
  sHandshake.trim();
  if (sHandshake.length() <= 2) {
    configHandshakeMode = 0x01;
    configHandshakePid = strtoul(sHandshake.c_str(), NULL, 16);
  } else if (sHandshake.length() == 4) {
    configHandshakeMode = strtoul(sHandshake.substring(0, 2).c_str(), NULL, 16);
    configHandshakePid = strtoul(sHandshake.substring(2, 4).c_str(), NULL, 16);
  } else if (sHandshake.length() == 6) {
    configHandshakeMode = strtoul(sHandshake.substring(0, 2).c_str(), NULL, 16);
    configHandshakePid = strtoul(sHandshake.substring(2, 6).c_str(), NULL, 16);
  } else {
    configHandshakeMode = 0x01;
    configHandshakePid = strtoul(sHandshake.c_str(), NULL, 16);
  }
  
  speedFormulaId = getValue(cmd, ';', 7).toInt();
  fuelFormulaId = getValue(cmd, ';', 8).toInt();
  
  numSchedSensors = 0;
  for (int idx = 9; idx < MAX_SENSORS + 9; idx++) {
    String sensorStr = getValue(cmd, ';', idx);
    if (sensorStr == "") break;
    
    String sPid = getValue(sensorStr, ':', 0);
    sPid.trim();
    uint16_t pid = 0;
    uint8_t mode = 0x01;
    
    if (sPid.length() <= 2) {
      mode = 0x01;
      pid = strtoul(sPid.c_str(), NULL, 16);
    } else if (sPid.length() == 4) {
      mode = strtoul(sPid.substring(0, 2).c_str(), NULL, 16);
      pid = strtoul(sPid.substring(2, 4).c_str(), NULL, 16);
    } else if (sPid.length() == 6) {
      mode = strtoul(sPid.substring(0, 2).c_str(), NULL, 16);
      pid = strtoul(sPid.substring(2, 6).c_str(), NULL, 16);
    } else {
      mode = 0x01;
      pid = strtoul(sPid.c_str(), NULL, 16);
    }
    
    uint8_t len = getValue(sensorStr, ':', 1).toInt();
    uint16_t skip = getValue(sensorStr, ':', 2).toInt();
    uint8_t srcOffset = getValue(sensorStr, ':', 3).toInt();
    uint8_t sensorId = getValue(sensorStr, ':', 4).toInt();
    
    float* valPtr = nullptr;
    const char* name = "";
    switch (sensorId) {
      case 0: valPtr = &sensors.speed; name = "Speed"; break;
      case 1: valPtr = &sensors.throttle; name = "Throttle"; break;
      case 2: valPtr = &sensors.pedal; name = "Pedal"; break;
      case 3: valPtr = &sensors.load; name = "Load"; break;
      case 4: valPtr = &sensors.fuelRate; name = "FuelRate"; break;
      case 5: valPtr = &sensors.boost; name = "Boost"; break;
      case 6: valPtr = &sensors.coolant; name = "Coolant"; break;
      case 7: valPtr = &sensors.catalyst; name = "Catalyst"; break;
      case 8: valPtr = &sensors.ambientTemp; name = "Ambient"; break;
      case 9: valPtr = &sensors.ethanol; name = "Ethanol"; break;
      case 10: valPtr = &sensors.voltage; name = "Voltage"; break;
      case 11: valPtr = &sensors.fuelLevel; name = "FuelLevel"; break;
      case 12:
        rpmPid = pid;
        rpmMode = mode;
        rpmBytes = len;
        rpmSrcOffset = srcOffset;
        logEvent("[CFG] RPM reconfigurado: Mode=0x" + String(mode, HEX) + ", PID=0x" + String(pid, HEX) + ", Bytes=" + String(len) + ", Offset=" + String(rpmSrcOffset));
        continue;
      case 13: valPtr = &sensors.oilPres; name = "OilPress"; break;
      case 14: valPtr = &sensors.fuelPress; name = "FuelPress"; break;
      case 15: valPtr = &sensors.oilTemp; name = "OilTemp"; break;
      case 16: valPtr = &sensors.iat; name = "IAT"; break;
      case 17: valPtr = &sensors.egt; name = "EGT"; break;
      case 18: valPtr = &sensors.afr; name = "AFR"; break;
      case 19: valPtr = &sensors.lambda; name = "Lambda"; break;
      case 20: valPtr = &sensors.timing; name = "Timing"; break;
    }
    
    if (valPtr != nullptr && numSchedSensors < MAX_SENSORS) {
      schedSensors[numSchedSensors] = {
        pid,
        mode,
        len,
        skip,
        0,
        valPtr,
        0,
        0,
        name,
        srcOffset,
        sensorId
      };
      numSchedSensors++;
    }
  }
  
  loadUnsupportedSensors(); // Carrega o histórico de não suportados para os sensores agendados
  
  logEvent("[CFG] Perfil aplicado. Baud=" + String(configBaud) + "K, CAN=" + String(configCanType) + "-bit");
  
  xSemaphoreTake(dataMutex, portMAX_DELAY);
  obdState = 1;
  xSemaphoreGive(dataMutex);
}

void parseConfigCommand(String cmd) {
  logEvent("[CFG] Nova configuracao recebida via BT: " + cmd);
  
  xSemaphoreTake(dataMutex, portMAX_DELAY);
  snprintf(pendingConfigCmd, sizeof(pendingConfigCmd), "%s", cmd.c_str());
  saveConfigPending = true;
  xSemaphoreGive(dataMutex);
  
  applyConfigString(cmd);
}

// ==============================================================
// ★ SETUP ★
// ==============================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n╔══════════════════════════════════════════╗");
  Serial.println("║   PulseDash v7.0 — CAN Dinamico Edition  ║");
  Serial.println("║   Universal OBD2 × SN65HVD230 × ESP32    ║");
  Serial.println("╚══════════════════════════════════════════╝");
  logEvent("[SYS] Heap inicial: " + String(ESP.getFreeHeap()) + " bytes");
  logEvent("[0s] PulseDash v7.0 Iniciado.");
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  dataMutex = xSemaphoreCreateMutex();

  if (!LittleFS.begin(true)) {
    Serial.println("[ERRO] LittleFS falhou!");
  } else {
    Serial.println("[OK] LittleFS pronto.");
  }

  // Carrega configuração salva ou inicia com a default (Onix 2026)
  if (!LittleFS.exists("/car_profile.cfg")) {
    String defCfg = "CFG;500;29;18db33f1;18daf111;1;00;0;0;0d:1:1:0:0;11:1:3:0:1;49:1:3:0:2;04:1:9:0:3;5e:2:9:0:4;0b:1:0:0:5;05:1:99:0:6;3c:2:99:0:7;46:1:99:0:8;52:1:5999:0:9;42:2:99:0:10;2f:1:99:0:11;0c:2:0:0:12";
    applyConfigString(defCfg);
  } else {
    File f = LittleFS.open("/car_profile.cfg", "r");
    if (f) {
      String savedCfg = f.readString();
      f.close();
      if (savedCfg.startsWith("CFG;")) {
        applyConfigString(savedCfg);
      }
    }
  }

  Serial.println("[SYS] LittleFS inicializado com sucesso.");

  Serial.println("[SYS] Iniciando task OBD (CAN) e Bluetooth...");
  
  // Inicializa o Bluetooth Clássico NATIVO do ESP32
  SerialBT.begin("PULSESCAN");
  esp_bt_sleep_disable(); // Impede o rádio de entrar em baixo consumo (Sniff Mode) solicitado pelo Android
  Serial.println("[BT] Bluetooth Classic iniciado como PULSESCAN e economia de energia desativada.");

  // Carrega a viagem atual salva (se houver)
  if (LittleFS.exists("/trip_current.json")) {
    File f = LittleFS.open("/trip_current.json", "r");
    String js = f.readString();
    f.close();
    // Parse básico sem ArduinoJson para economizar lib
    if (js.indexOf("\"dist\"") > 0) {
      if (js.indexOf("\"ts\":") > 0) {
        int idxTs = js.indexOf("\"ts\":") + 5;
        lastKnownEpoch = js.substring(idxTs, js.indexOf(",", idxTs)).toInt();
      }
      int id = js.indexOf("\"dist\":") + 7;
      tripDist = js.substring(id, js.indexOf(",", id)).toFloat();
      int iF = js.indexOf("\"fuel\":") + 7;
      tripFuel = js.substring(iF, js.indexOf(",", iF)).toFloat();
      int iTt = js.indexOf("\"ttot\":") + 7;
      tripTimeTot = js.substring(iTt, js.indexOf(",", iTt)).toInt();
      int iTd = js.indexOf("\"tdri\":") + 7;
      int nextComma = js.indexOf(",", iTd);
      tripTimeDri = js.substring(iTd, nextComma > 0 ? nextComma : js.indexOf("}", iTd)).toInt();
      if (js.indexOf("\"price\":") > 0) {
        int iPr = js.indexOf("\"price\":") + 8;
        fuelPrice = js.substring(iPr, js.indexOf("}", iPr)).toFloat();
      }
      Serial.println("[TRIP] Viagem carregada do LittleFS!");
      lastSavedDist = tripDist; // Sincroniza a distância inicial gravada
    }
  }

  logEvent("[SYS] PulseDash pronto para conexões Bluetooth.");

  btRequested = true;
  
  // Cria a task de escrita em Flash em background no Core 0
  xTaskCreatePinnedToCore(
      fsTask, "FS", 4096, NULL, 1, NULL,
      0);
      
  xTaskCreatePinnedToCore(
      obdTask, "OBD", 8192, NULL, 1, NULL,
      0); // v5.0: Stack aumentado para 8192 para segurança com LittleFS
}

// ==============================================================
// ★ PROCESSAMENTO DE COMANDOS BLUETOOTH NATIVO ★
// ==============================================================
void processBluetoothCommand(String jsonStr) {
  if (jsonStr.startsWith("CFG;")) {
    parseConfigCommand(jsonStr);
    return;
  }
  if (jsonStr.indexOf("\"cmd\":\"sync\"") > 0) {
    
    int tsIdx = jsonStr.indexOf("\"ts\":");
    if (tsIdx > 0) {
      uint32_t ts = jsonStr.substring(tsIdx + 5, jsonStr.indexOf("}", tsIdx)).toInt();
      unixTime = ts;
      lastUnixSyncMs = millis();
      int day = ts / 86400;
      int lastDay = lastKnownEpoch / 86400;
      
      if (lastKnownEpoch == 0) {
        lastKnownEpoch = ts; // Primeira sincronização da vida da placa
      } else if (day > lastDay) {
        // Virada de dia pelo App!
        logEvent("[BT] App conectou em novo dia. Salvando historico.");
        triggerSaveHistory(lastKnownEpoch);
        lastKnownEpoch = ts;
      } else {
        lastKnownEpoch = ts; // Mantém atualizado no dia
      }
      Serial.printf("[SYNC] Hora atualizada via App: %u (Dia %d)\n", ts, day);
    }
  } else if (jsonStr.indexOf("\"cmd\":\"trip_hist\"") > 0) {
    // Enviar o histórico de 7 dias pro app
    String resp = "{\"cmd\":\"trip_hist_data\",\"payload\":[]}";
    if (LittleFS.exists("/trip_hist.json")) {
      File f = LittleFS.open("/trip_hist.json", "r");
      if (f) {
         String content = f.readString();
         f.close();
         if(content.length() > 5) {
            resp = "{\"cmd\":\"trip_hist_data\",\"payload\":" + content + "}";
         }
      }
    }
    SerialBT.println(resp);
    Serial.println("[BT] Historico enviado ao app.");
  } else if (jsonStr.indexOf("\"cmd\":\"perf_req\"") > 0) {
    if (LittleFS.exists("/perf.txt")) {
      File f = LittleFS.open("/perf.txt", "r");
      if (f) {
         String content = f.readString();
         f.close();
         if(content.length() > 5) {
            SerialBT.println("{\"cmd\":\"perf_data\",\"payload\":" + content + "}");
         }
      }
    }
  } else if (jsonStr.indexOf("\"cmd\":\"perf\"") > 0) {
    // O app envia o array completo do Top 5: {"cmd":"perf", "payload":[{"time":"07.450"}]}
    int pIdx = jsonStr.indexOf("\"payload\":");
    if (pIdx > 0) {
      String payload = jsonStr.substring(pIdx + 10, jsonStr.lastIndexOf("]")+1);
      File f = LittleFS.open("/perf.txt", "w");
      if (f) { f.print(payload); f.close(); }
      Serial.println("[PERF] Novo Top 5 salvo via BT.");
    }
  } else if (jsonStr.indexOf("\"cmd\":\"price\"") > 0) {
    int valIdx = jsonStr.indexOf("\"val\":");
    if (valIdx > 0) {
      float p = jsonStr.substring(valIdx + 6, jsonStr.indexOf("}", valIdx)).toFloat();
      fuelPrice = p;
      Serial.printf("[TRIP] Preco do combustivel atualizado via BT: %.2f\n", p);
    }
  } else if (jsonStr.indexOf("\"cmd\":\"dtc_scan\"") > 0) {
    logEvent("[BT] Requisicao de DTC Scan recebida.");
    xSemaphoreTake(dataMutex, portMAX_DELAY);
    int state = obdState;
    xSemaphoreGive(dataMutex);
    
    if (state == 4) {
      // Se conectado ao carro, avisa a task OBD CAN para fazer a leitura física
      dtcScanPending = true;
    } else {
      // Retorna sem erros quando não estiver conectado ao carro (sem simulação)
      String jsonResp = "{\"cmd\":\"dtc_data\",\"codes\":[]}";
      SerialBT.println(jsonResp);
      logEvent("[BT] DTC Scan vazio (sem simulacao) enviado: " + jsonResp);
    }
  } else if (jsonStr.indexOf("\"cmd\":\"dtc_clear\"") > 0) {
    logEvent("[BT] Requisicao de DTC Clear recebida.");
    xSemaphoreTake(dataMutex, portMAX_DELAY);
    int state = obdState;
    xSemaphoreGive(dataMutex);
    
    if (state == 4) {
      dtcClearPending = true;
    } else {
      // Retorna sucesso de limpeza direto (sem simulação)
      String jsonResp = "{\"cmd\":\"dtc_clear_result\",\"success\":true}";
      SerialBT.println(jsonResp);
      logEvent("[BT] DTC Clear vazio (sem simulacao) enviado: success=true");
    }
  }

}

// ==============================================================
// ★ LOOP (Core 1 — Web Server) ★
// ==============================================================
void loop() {
  static String btBuffer = "";
  while (SerialBT.available()) {
    char c = SerialBT.read();
    if (c == '\n') {
      processBluetoothCommand(btBuffer);
      btBuffer = "";
    } else if (c != '\r') {
      btBuffer += c;
    }
  }

  // ==============================================================
  // ★ INTEGRAÇÃO DO COMPUTADOR DE BORDO (5Hz) ★
  // ==============================================================
  uint32_t now = millis();
  if (now - lastTripUpdate >= 200) { 
    uint32_t dtMs = now - lastTripUpdate;
    lastTripUpdate = now;
    
    float currentSpeed = 0;
    float currentFuelRate = 0;
    xSemaphoreTake(dataMutex, portMAX_DELAY);
    currentSpeed = tripSpeed;
    currentFuelRate = tripFuelRate; // L/h
    xSemaphoreGive(dataMutex);

    // Integração do tempo total de forma independente (ignição ativa)
    static uint32_t accMs = 0;
    static uint32_t accDriMs = 0;
    
    accMs += dtMs;
    if (accMs >= 1000) {
      tripTimeTot += (accMs / 1000);
      accMs %= 1000;
    }

    if (obdState == 4) { // Só integra distância, combustível e movimento se conectado à ECU
      if (currentSpeed > 2.0f) { // Considera movimento acima de 2km/h
        accDriMs += dtMs;
        if (accDriMs >= 1000) {
          tripTimeDri += (accDriMs / 1000);
          accDriMs %= 1000;
        }
      }
      
      // Consumo (L) = Vazão (L/h) * dt(h) * calibrador
      tripFuel += (currentFuelRate * (dtMs / 3600000.0f)) * fuelMultiplier;
      
      // Distância por integração matemática suave (Velocidade * Tempo)
      tripDist += (currentSpeed * (dtMs / 3600000.0f));
    }
  }

  // ==============================================================
  // ★ v6.5: SALVAMENTO HÍBRIDO POR DISTÂNCIA (A CADA 5.0 KM) ★
  // ==============================================================
  if (tripDist - lastSavedDist >= 5.0f && obdState == 4) {
    lastSavedDist = tripDist; // Sincroniza o marcador de distância
    saveTripPending = true;    // Dispara salvamento em background
    Serial.println("[TRIP] Solicitado backup de 5km em background.");
  }

  // ==============================================================
  // ★ TRANSMISSÃO BLUETOOTH DE TELEMETRIA BINÁRIA (20Hz / 50ms) ★
  // ==============================================================
  static uint32_t lastBtUpdate = 0;
  if (millis() - lastBtUpdate > 50) {
    lastBtUpdate = millis();

    SensorData s;
    int st;
    xSemaphoreTake(dataMutex, portMAX_DELAY);
    s = sensors;
    st = obdState;
    xSemaphoreGive(dataMutex);

    // Frame binário compacto de 51 bytes v7.0 (Fase 3)
    uint8_t buf[51];
    
    // Headers de sincronização
    buf[0] = 0x44;
    buf[1] = 0x33;
    buf[2] = 0x22;
    buf[3] = 0x11;
    
    // Tipo de pacote: 0x01 = Telemetria
    buf[4] = 0x01;
    
    // RPM (uint16)
    uint16_t rpmVal = (uint16_t)(s.rpm < 0 ? 0 : s.rpm);
    buf[5] = (rpmVal >> 8) & 0xFF;
    buf[6] = rpmVal & 0xFF;
    
    // Velocidade (uint8)
    buf[7] = (uint8_t)(s.speed < 0 ? 0 : s.speed);
    
    // Throttle / Borboleta (uint8)
    buf[8] = (uint8_t)(s.throttle < 0 ? 0 : s.throttle);
    
    // Pedal (uint8)
    buf[9] = (uint8_t)(s.pedal < 0 ? 0 : s.pedal);
    
    // Carga (uint8)
    buf[10] = (uint8_t)(s.load < 0 ? 0 : s.load);
    
    // Fuel Rate (uint16)
    uint16_t frVal = (uint16_t)(s.fuelRate < 0 ? 0 : s.fuelRate);
    buf[11] = (frVal >> 8) & 0xFF;
    buf[12] = frVal & 0xFF;
    
    // Boost / Pressão (int16)
    int16_t boostVal = (int16_t)s.boost;
    buf[13] = (boostVal >> 8) & 0xFF;
    buf[14] = boostVal & 0xFF;
    
    // Coolant / Água (int8)
    buf[15] = (int8_t)s.coolant;
    
    // Catalisador (int16)
    int16_t catVal = (int16_t)s.catalyst;
    buf[16] = (catVal >> 8) & 0xFF;
    buf[17] = catVal & 0xFF;
    
    // Temp. Ambiente (int8)
    buf[18] = (int8_t)s.ambientTemp;
    
    // Etanol % (uint8)
    buf[19] = (uint8_t)(s.ethanol < 0 ? 0 : s.ethanol);
    
    // Voltagem (uint16)
    uint16_t voltVal = (uint16_t)(s.voltage < 0 ? 0 : s.voltage);
    buf[20] = (voltVal >> 8) & 0xFF;
    buf[21] = voltVal & 0xFF;
    
    // Nível Combustível (uint8)
    buf[22] = (uint8_t)(s.fuelLevel < 0 ? 0 : s.fuelLevel);
    
    // Distância Viagem (float, 4 bytes - Little Endian nativo)
    memcpy(&buf[23], &tripDist, 4);
    
    // Combustível Gasto (float, 4 bytes - Little Endian nativo)
    memcpy(&buf[27], &tripFuel, 4);
    
    // Tempo Total Viagem (uint32_t, 4 bytes - Little Endian nativo)
    memcpy(&buf[31], &tripTimeTot, 4);
    
    // Tempo em Movimento (uint32_t, 4 bytes - Little Endian nativo)
    memcpy(&buf[35], &tripTimeDri, 4);
    
    // --- Novos 8 sensores de Prioridade 2 ---
    
    // Oil Press (uint8, envia como val * 10)
    buf[39] = (uint8_t)(s.oilPres < 0 ? 0 : (s.oilPres * 10 > 255 ? 255 : s.oilPres * 10));
    
    // Fuel Press (uint8, valor cru)
    buf[40] = (uint8_t)(s.fuelPress < 0 ? 0 : (s.fuelPress > 255 ? 255 : s.fuelPress));
    
    // Oil Temp (int8)
    buf[41] = (int8_t)s.oilTemp;
    
    // IAT (int8)
    buf[42] = (int8_t)s.iat;
    
    // EGT (uint16_t, 2 bytes, Big Endian)
    uint16_t egtVal = (uint16_t)(s.egt < 0 ? 0 : s.egt);
    buf[43] = (egtVal >> 8) & 0xFF;
    buf[44] = egtVal & 0xFF;
    
    // AFR (uint8, envia como val * 10)
    buf[45] = (uint8_t)(s.afr < 0 ? 0 : (s.afr * 10 > 255 ? 255 : s.afr * 10));
    
    // Lambda (uint8, envia como val * 100)
    buf[46] = (uint8_t)(s.lambda < 0 ? 0 : (s.lambda * 100 > 255 ? 255 : s.lambda * 100));
    
    // Timing (int8)
    buf[47] = (int8_t)s.timing;
    
    // --- Metadados de Diagnóstico e Checksum ---
    
    // Estado OBD (uint8)
    buf[48] = (uint8_t)st;
    
    // Duração do Loop CAN (uint8)
    buf[49] = (uint8_t)(s.loopMs > 255 ? 255 : s.loopMs);
    
    // Checksum (soma simples modulo 256 de todos os 50 bytes anteriores)
    uint8_t checksum = 0;
    for (int i = 0; i < 50; i++) {
      checksum += buf[i];
    }
    buf[50] = checksum;
    
    // Envia o frame binário de 51 bytes para o Bluetooth
    SerialBT.write(buf, 51);
  }
}
