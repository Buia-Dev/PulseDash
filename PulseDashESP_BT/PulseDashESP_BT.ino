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

// ==============================================================
// ★ FUNÇÃO: SALVAR HISTÓRICO DE 7 DIAS ★
// ==============================================================
void saveTripToHistory(uint32_t ts_day) {
  if (tripDist < 0.5f) return; // Ignora se não andou nem 500 metros
  
  String hist = "[]";
  if (LittleFS.exists("/trip_hist.json")) {
    File f = LittleFS.open("/trip_hist.json", "r");
    if(f) { hist = f.readString(); f.close(); }
  }
  
  char entry[160];
  snprintf(entry, sizeof(entry), "{\"ts\":%u,\"dist\":%.2f,\"fuel\":%.3f,\"ttot\":%u,\"tdri\":%u,\"price\":%.2f}", 
           ts_day, tripDist, tripFuel, tripTimeTot, tripTimeDri, fuelPrice);
           
  if (hist.length() <= 2) {
    hist = "[" + String(entry) + "]";
  } else {
    hist.remove(hist.length() - 1); // remove o último "]"
    hist += ",";
    hist += String(entry);
    hist += "]";
  }
  
  // Limita a 7 registros
  int entryCount = 0;
  for(int i=0; i<hist.length(); i++) { if(hist[i] == '{') entryCount++; }
  
  while(entryCount > 7) {
    int firstOpen = hist.indexOf('{');
    int secondOpen = hist.indexOf('{', firstOpen + 1);
    if(secondOpen > 0) {
      hist = "[" + hist.substring(secondOpen);
      entryCount--;
    } else { break; }
  }

  File f = LittleFS.open("/trip_hist.json", "w");
  if(f) { f.print(hist); f.close(); }
  
  logEvent("[TRIP] Viagem fechada e salva no historico. Dist: " + String(tripDist));

  // Zera contadores do dia atual
  tripDist = 0;
  tripFuel = 0;
  tripTimeTot = 0;
  tripTimeDri = 0;
  lastSavedDist = 0.0f; // v6.5: Reseta o marcador de distância gravada
  LittleFS.remove("/trip_current.json");
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

// --- Variáveis de Controle e Simulação de DTC ---
volatile bool dtcScanPending = false;
volatile bool dtcClearPending = false;
bool simDtcsCleared = false; // Flag para simulação em bancada


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
  float loopMs = 0; // v6.9: Tempo de loop CAN em milissegundos
};
SensorData sensors;

// ==============================================================
// ★ CAN / TWAI: COMUNICAÇÃO OBD2 DIRETO (29-bit @ 500kbps) ★
// ==============================================================
// Confirmado: TX=0x18DB33F1 | RX=0x18DAF111 | Onix 2026

bool canInit() {
  twai_general_config_t g = TWAI_GENERAL_CONFIG_DEFAULT(
      (gpio_num_t)CAN_TX_PIN, (gpio_num_t)CAN_RX_PIN, TWAI_MODE_NORMAL);
  g.alerts_enabled = TWAI_ALERT_ALL;
  g.rx_queue_len = 10;
  twai_timing_config_t t = TWAI_TIMING_CONFIG_500KBITS();
  twai_filter_config_t f = TWAI_FILTER_CONFIG_ACCEPT_ALL();
  if (twai_driver_install(&g, &t, &f) != ESP_OK)
    return false;
  if (twai_start() != ESP_OK) {
    twai_driver_uninstall();
    return false;
  }
  return true;
}

bool canSendOBD(uint8_t pid) {
  twai_message_t m;
  memset(&m, 0, sizeof(m));
  m.identifier = 0x18DB33F1; // Broadcast OBD2 29-bit
  m.extd = 1;
  m.data_length_code = 8;
  m.data[0] = 0x02;
  m.data[1] = 0x01;
  m.data[2] = pid;
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

// Envia pedido e aguarda resposta — retorna valor calculado ou -999.0f se timeout/erro
float canReadSensor(uint8_t pid, int nBytes) {
  if (!canSendOBD(pid))
    return -999.0f;
  twai_message_t r;
  uint32_t t0 = millis();
  // v5.5: Timeout reduzido para 25ms para latência zero absoluta (ECU responde em ~12-15ms)
  while (millis() - t0 < 25) {
    if (twai_receive(&r, pdMS_TO_TICKS(1)) == ESP_OK) {
      if (r.extd && r.identifier == 0x18DAF111 && r.data[1] == 0x41 &&
          r.data[2] == pid) {
        uint8_t A = r.data[3], B = r.data[4];
        switch (pid) {
        case 0x0C:
          return ((A * 256.0f) + B) / 4.0f; // RPM
        case 0x0D:
          return (float)A; // Velocidade
        case 0x05:
          return A - 40.0f; // Temp. Coolant
        case 0x11:
          return A * 100.0f / 255.0f; // Throttle (Borboleta)
        case 0x49:
          return A * 100.0f / 255.0f; // Pedal APP
        case 0x04:
          return A * 100.0f / 255.0f; // Carga motor
        case 0x5E:
          return ((A * 256.0f) + B) / 20.0f; // Fuel Rate (L/h)
        case 0x0B:
          return (float)A; // MAP kPa
        case 0x46:
          return A - 40.0f; // Temp. Ambiente
        case 0x52:
          return A * 100.0f / 255.0f; // Etanol %
        case 0x3C:
          return ((A * 256.0f) + B) / 10.0f - 40; // Catalisador
        case 0x42:
          return ((A * 256.0f) + B) / 1000.0f; // Tensão ECU
        case 0x2F:
          return A * 100.0f / 255.0f; // Nível combustível
        case 0x10:
          return ((A * 256.0f) + B) / 100.0f; // MAF (g/s)
        default:
          return (float)A;
        }
      }
    }
  }
  return -999.0f;
}

// Envia pedido UDS (Service 22) de 29-bit física
bool canSendUDS(uint32_t txId, uint16_t pid) {
  twai_message_t m;
  memset(&m, 0, sizeof(m));
  m.identifier = txId;
  m.extd = 1;
  m.data_length_code = 8;
  m.data[0] = 0x03; // Single Frame, 3 bytes adicionais
  m.data[1] = 0x22; // Service 22
  m.data[2] = (pid >> 8) & 0xFF;
  m.data[3] = pid & 0xFF;
  m.data[4] = 0x00;
  m.data[5] = 0x00;
  m.data[6] = 0x00;
  m.data[7] = 0x00;
  return twai_transmit(&m, pdMS_TO_TICKS(20)) == ESP_OK;
}

// Lê resposta de pedido UDS (Service 22)
float canReadUDS(uint32_t txId, uint32_t rxId, uint16_t pid) {
  if (!canSendUDS(txId, pid))
    return -999.0f;
  twai_message_t r;
  uint32_t t0 = millis();
  // Timeout 30ms para resposta UDS proprietária
  while (millis() - t0 < 30) {
    if (twai_receive(&r, pdMS_TO_TICKS(1)) == ESP_OK) {
      if (r.extd && r.identifier == rxId && r.data[1] == 0x62) {
        uint16_t respPid = (r.data[2] << 8) | r.data[3];
        if (respPid == pid) {
          uint8_t A = r.data[4], B = r.data[5];
          switch (pid) {
           case 0x1940: // Temperatura do Câmbio
            return A - 40.0f;
          case 0x115C: // Pressão de Óleo
            return (A * 0.65f) - 17.5f;
          case 0x1154: // Temperatura do Óleo
            return A - 40.0f;
          default:
            return (float)A;
          }
        }
      }
    }
  }
  return -999.0f;
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
  logEvent("[SYS] Task OBD (CAN direto) pronta.");

  for (;;) {
    // STANDBY — aguarda o dashboard solicitar conexão
    if (!btRequested) {
      vTaskDelay(500 / portTICK_PERIOD_MS);
      continue;
    }

    // ESTADO 1: Iniciar driver TWAI
    obdState = 1;
    logEvent("[CAN] Iniciando TWAI 29-bit @ 500kbps...");
    digitalWrite(LED_PIN, HIGH);

    if (!canInit()) {
      logEvent("[CAN] ERRO: falha ao instalar driver TWAI!");
      obdState = 9;
      digitalWrite(LED_PIN, LOW);
      vTaskDelay(5000 /
                 portTICK_PERIOD_MS); // espera 5s antes de tentar de novo
      continue;
    }
    logEvent("[CAN] Driver OK. Heap: " + String(ESP.getFreeHeap()));
    digitalWrite(LED_PIN, LOW);

    // ESTADO 3: Handshake Robusto (v5.1 para Cabos Longos)
    obdState = 3;
    logEvent("[CAN] Handshake agressivo iniciando...");
    bool handshakeOk = false;

    for (int tentativa = 0; tentativa < 10 && !handshakeOk; tentativa++) {
      digitalWrite(LED_PIN, HIGH);
      // 1. Acorda a ECU (Tester Present)
      twai_message_t tp;
      memset(&tp, 0, sizeof(tp));
      tp.identifier = 0x18DB33F1;
      tp.extd = 1;
      tp.data_length_code = 8;
      tp.data[0] = 0x02;
      tp.data[1] = 0x3E;
      tp.data[2] = 0x00;
      twai_transmit(&tp, pdMS_TO_TICKS(10));

      vTaskDelay(100 / portTICK_PERIOD_MS); // Pequena pausa pro carro processar

      // 2. Manda o pedido de PIDs (Rajada)
      canSendOBD(0x00);

      // 3. Escuta resposta ativa por 800ms
      uint32_t t0 = millis();
      while (millis() - t0 < 800) {
         twai_message_t r;
        if (twai_receive(&r, pdMS_TO_TICKS(5)) == ESP_OK) {
          // Se receber resposta da ECU (0x41 0x00)
          if (r.extd && r.data[1] == 0x41 && r.data[2] == 0x00) {
            handshakeOk = true;
            logEvent("[CAN] Handshake OK! ECU detectada: 0x" +
                     String(r.identifier, HEX));
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

    // Leitura inteligente de Etanol no startup
    float ethStartup = canReadSensor(0x52, 1);
    if (ethStartup > -900.0f) {
      xSemaphoreTake(dataMutex, portMAX_DELAY);
      sensors.ethanol = ethStartup;
      xSemaphoreGive(dataMutex);
      logEvent("[CAN] Etanol lido no startup: " + String(ethStartup) + "%");
    }

    // ESTADO 4: ONLINE — loop de leitura contínua
    obdState = 4;
    obdLastOk = millis();
    ledBlink(3, 50); // v5.1: Sinal visual de sucesso
    uint32_t lastTP = millis();
    uint32_t lastLoop = millis();
    bool coldSoakChecked = false; // Gatilho de motor frio

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
        m.identifier = 0x18DB33F1; // Broadcast OBD2 29-bit
        m.extd = 1;
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
            // Resposta Modo 43 da ECU do Motor (0x18DAF111) ou outra ID física (0x18DAF1XX)
            if (r.extd && (r.identifier & 0xFFFF0000) == 0x18DA0000 && r.data[1] == 0x43) {
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
        m.identifier = 0x18DB33F1;
        m.extd = 1;
        m.data_length_code = 8;
        m.data[0] = 0x01;
        m.data[1] = 0x04; // Modo 04
        
        twai_transmit(&m, pdMS_TO_TICKS(20));
        
        uint32_t tStart = millis();
        bool success = false;
        while (millis() - tStart < 800) {
          twai_message_t r;
          if (twai_receive(&r, pdMS_TO_TICKS(5)) == ESP_OK) {
            if (r.extd && (r.identifier & 0xFFFF0000) == 0x18DA0000 && r.data[1] == 0x44) {
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
      if (millis() - lastTP > 2000) {
        lastTP = millis();
        twai_message_t tp;
        memset(&tp, 0, sizeof(tp));
        tp.identifier = 0x18DB33F1;
        tp.extd = 1;
        tp.data_length_code = 8;
        tp.data[0] = 0x02;
        tp.data[1] = 0x3E;
        tp.data[2] = 0x00;
        twai_transmit(&tp, pdMS_TO_TICKS(5));
      }

      // --- LOOP ULTRA-RÁPIDO (20Hz / 50ms) ---
      uint32_t loopStart = millis();
      float rpm = canReadSensor(0x0C, 2);
      float spd = canReadSensor(0x0D, 1);

      // --- ESCALONADOR ESTRETO DE 4 NÍVEIS ---
      static uint32_t loopCount = 0;
      static int slowIndex = 0;
      uint32_t now = millis();

      // 1. RÁPIDO (100ms): Alternado a cada 2 iterações (50ms * 2 = 100ms)
      if (loopCount % 2 == 0) {
        if (loopCount % 4 == 0) {
          float thr = canReadSensor(0x11, 1);
          if (thr > -900.0f) {
            xSemaphoreTake(dataMutex, portMAX_DELAY);
            sensors.throttle = thr;
            xSemaphoreGive(dataMutex);
          }
        } else {
          float ped = canReadSensor(0x49, 1);
          if (ped > -900.0f) {
            xSemaphoreTake(dataMutex, portMAX_DELAY);
            sensors.pedal = ped;
            xSemaphoreGive(dataMutex);
          }
        }
      }

      // 2. MÉDIO (500ms): Leitura da Carga do Motor
      if (loopCount % 10 == 0) {
        float ld = canReadSensor(0x04, 1);
        if (ld > -900.0f) {
          xSemaphoreTake(dataMutex, portMAX_DELAY);
          sensors.load = ld;
          xSemaphoreGive(dataMutex);
        }
      }

      // 3. MÉDIO-RÁPIDO (500ms): Leitura do Consumo Físico L/h a 2Hz (500ms)
      if (loopCount % 10 == 5) {
        float fr = canReadSensor(0x5E, 2);
        if (fr > -900.0f && fr > 0.001f) {
          xSemaphoreTake(dataMutex, portMAX_DELAY);
          sensors.fuelRate = fr;
          xSemaphoreGive(dataMutex);
        } else {
          // Fallback químico estequiométrico a 2Hz
          float maf = canReadSensor(0x10, 2);
          if (maf > -900.0f) {
            float ethRatio = 0.0f;
            xSemaphoreTake(dataMutex, portMAX_DELAY);
            ethRatio = sensors.ethanol / 100.0f;
            xSemaphoreGive(dataMutex);

            if (ethRatio < 0.0f) ethRatio = 0.0f;
            if (ethRatio > 1.0f) ethRatio = 1.0f;

            float afrTarget = 14.7f * (1.0f - ethRatio) + 9.0f * ethRatio;
      float density = 737.0f * (1.0f - ethRatio) + 789.0f * ethRatio; // Densidade real g/L

            float calculatedFuelRate = ((maf / afrTarget) * 3600.0f) / density;
            
            xSemaphoreTake(dataMutex, portMAX_DELAY);
            sensors.fuelRate = calculatedFuelRate;
            xSemaphoreGive(dataMutex);
          }
        }
      }

      // 3. LENTO (500ms ciclo completo / 100ms por slot circular): Executado nas iterações ímpares
      if (loopCount % 2 == 1) {
        static uint8_t ambFailed = 0;
        static uint32_t ambCooldown = 0;
        
        static uint8_t catFailed = 0;
        static uint32_t catCooldown = 0;
        
        static uint8_t fuelFailed = 0;
        static uint32_t fuelCooldown = 0;

        switch (slowIndex) {
          case 0: {
            float cool = canReadSensor(0x05, 1);
            if (cool > -900.0f) {
              xSemaphoreTake(dataMutex, portMAX_DELAY);
              sensors.coolant = cool;
              xSemaphoreGive(dataMutex);
            }
            break;
          }
          case 1: {
            float volt = canReadSensor(0x42, 2);
            if (volt > -900.0f) {
              xSemaphoreTake(dataMutex, portMAX_DELAY);
              sensors.voltage = volt;
              xSemaphoreGive(dataMutex);
            }
            break;
          }
          case 2: {
            if (now >= ambCooldown) {
              float amb = canReadSensor(0x46, 1);
              if (amb > -900.0f) {
                ambFailed = 0;
                xSemaphoreTake(dataMutex, portMAX_DELAY);
                sensors.ambientTemp = amb;
                xSemaphoreGive(dataMutex);
              } else {
                ambFailed++;
                if (ambFailed >= 5) {
                  ambCooldown = now + 30000; // 30s de cooldown
                  logEvent("[CAN] PID Temp. Ambiente (0x46) em cooldown por falhas.");
                }
              }
            }
            break;
          }
          case 3: {
            if (now >= catCooldown) {
              float cat = canReadSensor(0x3C, 2);
              if (cat > -900.0f) {
                catFailed = 0;
                xSemaphoreTake(dataMutex, portMAX_DELAY);
                sensors.catalyst = cat;
                xSemaphoreGive(dataMutex);
              } else {
                catFailed++;
                if (catFailed >= 5) {
                  catCooldown = now + 30000; // 30s de cooldown
                  logEvent("[CAN] PID Catalisador (0x3C) em cooldown por falhas.");
                }
              }
            }
            break;
          }
          case 4: {
            static uint32_t lastFuelQuery = 0;
            uint32_t nowMs = millis();

            xSemaphoreTake(dataMutex, portMAX_DELAY);
            float currentRpm = sensors.rpm;
            xSemaphoreGive(dataMutex);

            // v6.5: Polling dinâmico — 10 segundos correndo (cruzeiro) vs 1 segundo parado (abastecimento)
            uint32_t queryInterval = (currentRpm >= 800.0f) ? 10000 : 1000;

            if ((lastFuelQuery == 0 || nowMs - lastFuelQuery >= queryInterval) && nowMs >= fuelCooldown) {
              lastFuelQuery = nowMs;
              float fRaw = canReadSensor(0x2F, 1);
              if (fRaw > -900.0f) {
                fuelFailed = 0;
                if (currentRpm >= 800.0f) {
                  // Modo Cruzeiro: amortecimento ultra-lento para ignorar chacoalhadas nas curvas
                  if (emaFuel < 0) {
                    emaFuel = fRaw; // Snap de segurança se a primeira leitura for com motor ligado
                  } else {
                    emaFuel = (0.01f * fRaw) + (0.99f * emaFuel);
                  }
                } else {
                  // Motor desligado/cranking (ignição ligada / parado): leitura crua e direta ao vivo a 1Hz!
                  emaFuel = fRaw;
                }

                xSemaphoreTake(dataMutex, portMAX_DELAY);
                sensors.fuelLevel = emaFuel;
                xSemaphoreGive(dataMutex);
              } else {
                fuelFailed++;
                if (fuelFailed >= 5) {
                  fuelCooldown = nowMs + 30000; // 30s de cooldown
                  logEvent("[CAN] PID Nivel Combustivel (0x2F) em cooldown por falhas.");
                }
              }
            }
            break;
          }
        }
        slowIndex = (slowIndex + 1) % 5;
      }

      // Atualização periódica ultra-lenta do Etanol a cada 5 minutos (300s) com cooldown de falha
      static uint32_t lastEthUpdate = 0;
      static uint8_t ethFailedCount = 0;
      static uint32_t ethCooldownUntil = 0;
      if (lastEthUpdate == 0 || now - lastEthUpdate >= 300000) {
        if (now >= ethCooldownUntil) {
          float eth = canReadSensor(0x52, 1);
          lastEthUpdate = now; // Evita loop infinito de timeout no boot/falha
          if (eth > -900.0f) {
            ethFailedCount = 0;
            xSemaphoreTake(dataMutex, portMAX_DELAY);
            sensors.ethanol = eth;
            xSemaphoreGive(dataMutex);
            logEvent("[CAN] Etanol misturado atualizado: " + String(eth) + "%");
          } else {
            ethFailedCount++;
            if (ethFailedCount >= 3) {
              ethCooldownUntil = now + 600000; // 10 min de cooldown para desativar falha sequencial
              logEvent("[CAN] PID Etanol (0x52) indisponivel. Entrando em cooldown de 10 min.");
            }
          }
        }
      }

      // v6.5: Atualiza struct principal com tratamento de falhas e shutdown
      if (rpm > -900.0f) {
        failedQueries = 0; // Reseta o contador de falhas consecutivas
        xSemaphoreTake(dataMutex, portMAX_DELAY);
        sensors.rpm = rpm;
        if (spd > -900.0f) sensors.speed = spd;
        obdLastOk = millis();
        xSemaphoreGive(dataMutex);
      } else {
        failedQueries++; // Incrementa falhas se a ECU não responder
      }

      // v6.4: Gatilho Inteligente de Desligamento (5 falhas consecutivas = 250ms de silêncio)
      if (failedQueries >= 5 && obdState == 4) {
        logEvent("[CAN] Falha de comunicacao consecutiva (ECU offline). Preservando viagem...");
        failedQueries = 0;
        emaFuel = -1.0f; // v6.5: Reseta o filtro de combustível no desligamento

        // 1. SALVA A VIAGEM NA FLASH IMEDIATAMENTE (ANTES DE QUALQUER COISA)
        File f = LittleFS.open("/trip_current.json", "w");
        if (f) {
          f.printf("{\"ts\":%u,\"dist\":%.2f,\"fuel\":%.3f,\"ttot\":%u,\"tdri\":%u,\"price\":%.2f}", 
                   lastKnownEpoch, tripDist, tripFuel, tripTimeTot, tripTimeDri, fuelPrice);
          f.close();
          logEvent("[TRIP] Viagem diária salva com sucesso no desligamento!");
        }

        // 2. ZERA APENAS AS MÉTRICAS DOS PONTEIROS PARA O CELULAR IR A ZERO
        xSemaphoreTake(dataMutex, portMAX_DELAY);
        sensors.rpm = 0;
        sensors.speed = 0;
        sensors.throttle = 0;
        sensors.pedal = 0;
        sensors.load = 0;
        sensors.fuelRate = 0;
        sensors.boost = 0;
        xSemaphoreGive(dataMutex);

        // 3. DESCONECTA E SAI DO LOOP DE TELEMETRIA
        obdState = 9; 
        break;
      }

      // v6.9: Salva a duração real de processamento do loop CAN na struct
      uint32_t loopDuration = millis() - loopStart;
      xSemaphoreTake(dataMutex, portMAX_DELAY);
      sensors.loopMs = (float)loopDuration;
      xSemaphoreGive(dataMutex);

      loopCount = (loopCount + 1) % 200;

      // Controle estrito de frequência de 20Hz (50ms por iteração)
      uint32_t elapsed = millis() - loopStart;
      if (elapsed < 50) {
        vTaskDelay(pdMS_TO_TICKS(50 - elapsed));
      } else {
        vTaskDelay(pdMS_TO_TICKS(1)); // Força yield se a rede engasgar
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
// ★ SETUP ★
// ==============================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n╔══════════════════════════════════════════╗");
  Serial.println("║   PulseDash v6.5 — CAN Direto Edition    ║");
  Serial.println("║   Onix 2026 × SN65HVD230 × ESP32         ║");
  Serial.println("╚══════════════════════════════════════════╝");
  logEvent("[SYS] Heap inicial: " + String(ESP.getFreeHeap()) + " bytes");
  logEvent("[0s] PulseDash v6.5 Iniciado (CAN direto).");
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  dataMutex = xSemaphoreCreateMutex();

  if (!LittleFS.begin(true)) {
    Serial.println("[ERRO] LittleFS falhou!");
  } else {
    Serial.println("[OK] LittleFS pronto.");
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
  xTaskCreatePinnedToCore(
      obdTask, "OBD", 8192, NULL, 1, NULL,
      0); // v5.0: Stack aumentado para 8192 para segurança com LittleFS
}

// ==============================================================
// ★ PROCESSAMENTO DE COMANDOS BLUETOOTH NATIVO ★
// ==============================================================
void processBluetoothCommand(String jsonStr) {
  if (jsonStr.indexOf("\"cmd\":\"sync\"") > 0) {
    // Reset da simulação de DTC ao reconectar (sincronismo inicial)
    simDtcsCleared = false;
    
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
        saveTripToHistory(lastKnownEpoch);
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
      // Se na bancada, envia os DTCs de simulação
      String codesJson = "";
      if (!simDtcsCleared) {
        codesJson = "\"P0300\",\"P0115\",\"U0100\"";
      }
      String jsonResp = "{\"cmd\":\"dtc_data\",\"codes\":[" + codesJson + "]}";
      vTaskDelay(800 / portTICK_PERIOD_MS); // Simula o tempo de escaneamento
      SerialBT.println(jsonResp);
      logEvent("[BT] Simulado DTC Scan enviado: " + jsonResp);
    }
  } else if (jsonStr.indexOf("\"cmd\":\"dtc_clear\"") > 0) {
    logEvent("[BT] Requisicao de DTC Clear recebida.");
    xSemaphoreTake(dataMutex, portMAX_DELAY);
    int state = obdState;
    xSemaphoreGive(dataMutex);
    
    if (state == 4) {
      dtcClearPending = true;
    } else {
      // Simula sucesso de limpeza e limpa a lista simulada
      simDtcsCleared = true;
      vTaskDelay(600 / portTICK_PERIOD_MS);
      String jsonResp = "{\"cmd\":\"dtc_clear_result\",\"success\":true}";
      SerialBT.println(jsonResp);
      logEvent("[BT] Simulado DTC Clear enviado: success=true");
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
    currentSpeed = sensors.speed;
    currentFuelRate = sensors.fuelRate; // L/h
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
    File f = LittleFS.open("/trip_current.json", "w");
    if (f) {
      f.printf("{\"ts\":%u,\"dist\":%.2f,\"fuel\":%.3f,\"ttot\":%u,\"tdri\":%u,\"price\":%.2f}", 
               lastKnownEpoch, tripDist, tripFuel, tripTimeTot, tripTimeDri, fuelPrice);
      f.close();
      Serial.println("[TRIP] Backup de 5km salvo com sucesso na Flash!");
    }
  }

  // ==============================================================
  // ★ TRANSMISSÃO BLUETOOTH DE TELEMETRIA (20Hz / 50ms) ★
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

    char buf[768];
    snprintf(
        buf, sizeof(buf),
        "{"
        "\"rpm\":%.0f,\"speed\":%.0f,\"throttle\":%.1f,\"pedal\":%.1f,\"load\":%.1f,"
        "\"fuelRate\":%.2f,\"boost\":%.1f,\"coolant\":%.0f,\"catalyst\":%.1f,"
        "\"ambient\":%.0f,\"ethanol\":%.0f,\"voltage\":%.2f,\"fuelLevel\":%.1f,"
        "\"tripDist\":%.2f,\"tripFuel\":%.3f,\"tripTimeTot\":%u,\"tripTimeDri\":%u,"
        "\"obd_state\":%d,"
        "\"loopMs\":%.0f"
        "}",
        s.rpm, s.speed, s.throttle, s.pedal, s.load, s.fuelRate, s.boost,
        s.coolant, s.catalyst, s.ambientTemp, s.ethanol, s.voltage, s.fuelLevel,
        tripDist, tripFuel, tripTimeTot, tripTimeDri,
        st,
        s.loopMs);
    
    SerialBT.println(buf);
  }
}
