// ==============================================================
//  PulseDash v6.0 — Computador de Bordo & Sensores Estendidos
//  Comunicação Direta via TWAI (SN65HVD230)
// --------------------------------------------------------------
//  v6.0: Computador de Bordo completo, UDS Service 22,
//        Economômetro clássico e Escalonador de 4 tempos.
// ==============================================================

#include "driver/twai.h" // v5.0: CAN direto (SN65HVD230)
#include "esp_wifi.h"    // v3.3: para esp_wifi_set_ps (modem sleep)
#include <ESPmDNS.h>
#include <LittleFS.h>
#include <WebServer.h>
#include <WebSocketsServer.h> // v4.1: WebSocket Server
#include <WiFi.h>

#define CAN_TX_PIN 17
#define CAN_RX_PIN 16

// ==============================================================
// ★ OBJETOS GLOBAIS ★
// ==============================================================
WebServer server(80);
WebSocketsServer webSocket = WebSocketsServer(81);
SemaphoreHandle_t dataMutex;

#define LED_PIN 2

// ==============================================================
// ★ SISTEMA DE LOG (LittleFS) ★
// ==============================================================
#define LOG_FILE "/btlog.txt"
#define MAX_LOG_SIZE                                                           \
  (600 * 1024) // 600KB: Aguenta ~12 horas de viagem sem apagar

// Buffer para o EcoLog
String ecoBuffer = "";
uint32_t lastEcoLog = 0;
const uint32_t ECO_LOG_INTERVAL = 5000; // Grava a cada 5 segundos

void logEvent(String msg) {
  static uint32_t lastLogTime = 0;
  String line = "[" + String(millis() / 1000) + "s] " + msg;
  Serial.println(line);

  File f = LittleFS.open(LOG_FILE, "a");
  if (f) {
    if (f.size() > MAX_LOG_SIZE) {
      f.close();
      LittleFS.remove(LOG_FILE);
      f = LittleFS.open(LOG_FILE, "w");
    }
    f.println(line);
    f.close();
  }
}

void handleConsole() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Refresh", "5");
  String html = "<html><head><meta charset='UTF-8'><meta name='viewport' "
                "content='width=device-width, initial-scale=1'><style>";
  html += "body{background:#111;color:#0f0;font-family:monospace;padding:10px;"
          "font-size:12px;}";
  html += "h2{color:#fff;border-bottom:1px solid #333;padding-bottom:5px;}";
  html += "pre{white-space:pre-wrap;word-wrap:break-word;}";
  html += "</style></head><body>";
  html += "<h2>PulseDash v6.0 Console</h2><pre>";

  if (LittleFS.exists(LOG_FILE)) {
    File f = LittleFS.open(LOG_FILE, "r");
    while (f.available())
      html += (char)f.read();
    f.close();
  } else {
    html += "Nenhum log encontrado.";
  }

  html += "</pre></body></html>";
  server.send(200, "text/html", html);
}

void handleLog() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  if (LittleFS.exists(LOG_FILE)) {
    File f = LittleFS.open(LOG_FILE, "r");
    server.streamFile(f, "text/plain");
    f.close();
  } else {
    server.send(200, "text/plain", "Log vazio.");
  }
}
// ==============================================================
// ★ CONFIGURAÇÃO WiFi ★
// ==============================================================
const char *ssid = "BuiUber";
const char *password = "12345678";

// ==============================================================
// ★ CONSTANTES ★
// ==============================================================
static const uint32_t WIFI_CHECK_INTERVAL = 30000;

// Estado OBD: 0=OFF, 1=INICIANDO CAN, 3=HANDSHAKE, 4=ONLINE, 9=FALHA
volatile int obdState = 0;
volatile bool btRequested = false; // dashboard controla liga/desliga
volatile uint32_t obdLastOk = 0;

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

  // Novos sensores estendidos e computador de bordo v6.0
  float transTemp = 0;   // Temp. do câmbio (UDS)
  float oilPres = 0;     // Pressão de óleo (UDS)
  float oilTemp = 0;     // Temp. do óleo (UDS)
  float tripDist = 0;    // Odômetro (PID 0x31)
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
        case 0x31:
          return (float)((A * 256) + B); // Odômetro (Distância)
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

      // 3. Escuta ativa por 800ms
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
    float emaFuel = -1.0f;
    uint32_t lastTP = millis();
    uint32_t lastLoop = millis();

    logEvent("[CAN] ★ ONLINE! Dashboard ativo.");

    while (btRequested && obdState == 4) {
      uint32_t alertas = 0;
      twai_read_alerts(&alertas, 0);
      if (alertas & TWAI_ALERT_BUS_OFF) {
        twai_initiate_recovery();
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

      // 2. MÉDIO (500ms): Alternado a cada 10 iterações (50ms * 10 = 500ms)
      if (loopCount % 10 == 0) {
        if (loopCount % 20 == 0) {
          float ld = canReadSensor(0x04, 1);
          if (ld > -900.0f) {
            xSemaphoreTake(dataMutex, portMAX_DELAY);
            sensors.load = ld;
            xSemaphoreGive(dataMutex);
          }
        } else {
          float bst = canReadSensor(0x0B, 1);
          if (bst > -900.0f) {
            xSemaphoreTake(dataMutex, portMAX_DELAY);
            sensors.boost = bst;
            xSemaphoreGive(dataMutex);
          }
        }
      }

      // 3. LENTO (1s / 100ms por slot circular): Executado nas iterações ímpares (loopCount % 2 == 1)
      if (loopCount % 2 == 1) {
        switch (slowIndex) {
          case 0: {
            // Consumo Inteligente (Plano 1 - Físico vs Plano 2 - Fallback Flex)
            float fr = canReadSensor(0x5E, 2);
            if (fr > -900.0f && fr > 0.001f) {
              xSemaphoreTake(dataMutex, portMAX_DELAY);
              sensors.fuelRate = fr;
              xSemaphoreGive(dataMutex);
            } else {
              // Fallback químico estequiométrico: MAF (0x10) + Etanol % (mistura Flex)
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
            break;
          }
          case 1: {
            float cool = canReadSensor(0x05, 1);
            if (cool > -900.0f) {
              xSemaphoreTake(dataMutex, portMAX_DELAY);
              sensors.coolant = cool;
              xSemaphoreGive(dataMutex);
            }
            break;
          }
          case 2: {
            float trip = canReadSensor(0x31, 2);
            if (trip > -900.0f) {
              xSemaphoreTake(dataMutex, portMAX_DELAY);
              sensors.tripDist = trip;
              xSemaphoreGive(dataMutex);
            }
            break;
          }
          case 3: {
            float volt = canReadSensor(0x42, 2);
            if (volt > -900.0f) {
              xSemaphoreTake(dataMutex, portMAX_DELAY);
              sensors.voltage = volt;
              xSemaphoreGive(dataMutex);
            }
            break;
          }
          case 4: {
            float amb = canReadSensor(0x46, 1);
            if (amb > -900.0f) {
              xSemaphoreTake(dataMutex, portMAX_DELAY);
              sensors.ambientTemp = amb;
              xSemaphoreGive(dataMutex);
            }
            break;
          }
          case 5: {
            float cat = canReadSensor(0x3C, 2);
            if (cat > -900.0f) {
              xSemaphoreTake(dataMutex, portMAX_DELAY);
              sensors.catalyst = cat;
              xSemaphoreGive(dataMutex);
            }
            break;
          }
          case 6: {
            float fRaw = canReadSensor(0x2F, 1);
            if (fRaw > -900.0f) {
              if (emaFuel < 0)
                emaFuel = fRaw;
              else
                emaFuel = (0.05f * fRaw) + (0.95f * emaFuel);
              xSemaphoreTake(dataMutex, portMAX_DELAY);
              sensors.fuelLevel = emaFuel;
              xSemaphoreGive(dataMutex);
            }
            break;
          }
          case 7: {
            // Temp Câmbio UDS (ECM Address 11)
            float tc = canReadUDS(0x18DA11F1, 0x18DAF111, 0x1940);
            if (tc > -900.0f) {
              xSemaphoreTake(dataMutex, portMAX_DELAY);
              sensors.transTemp = tc;
              xSemaphoreGive(dataMutex);
            }
            break;
          }
          case 8: {
            // Pressão de Óleo UDS (ECM Address 11)
            float op = canReadUDS(0x18DA11F1, 0x18DAF111, 0x115C);
            if (op > -900.0f) {
              xSemaphoreTake(dataMutex, portMAX_DELAY);
              sensors.oilPres = op;
              xSemaphoreGive(dataMutex);
            }
            break;
          }
          case 9: {
            // Temp Óleo UDS (ECM Address 11)
            float ot = canReadUDS(0x18DA11F1, 0x18DAF111, 0x1154);
            if (ot > -900.0f) {
              xSemaphoreTake(dataMutex, portMAX_DELAY);
              sensors.oilTemp = ot;
              xSemaphoreGive(dataMutex);
            }
            break;
          }
        }
        slowIndex = (slowIndex + 1) % 10;
      }

      // Atualização periódica ultra-lenta do Etanol a cada 5 minutos (300s)
      static uint32_t lastEthUpdate = 0;
      if (lastEthUpdate == 0 || now - lastEthUpdate >= 300000) {
        float eth = canReadSensor(0x52, 1);
        if (eth > -900.0f) {
          xSemaphoreTake(dataMutex, portMAX_DELAY);
          sensors.ethanol = eth;
          xSemaphoreGive(dataMutex);
          lastEthUpdate = now;
          logEvent("[CAN] Etanol misturado atualizado: " + String(eth) + "%");
        }
      }

      // Atualiza struct principal para RPM e Velocidade
      xSemaphoreTake(dataMutex, portMAX_DELAY);
      if (rpm > -900.0f) {
        sensors.rpm = rpm;
        obdLastOk = millis();
      }
      if (spd > -900.0f)
        sensors.speed = spd;
      xSemaphoreGive(dataMutex);

      // EcoLog — grava em flash a cada 5s
      if (millis() - lastEcoLog >= ECO_LOG_INTERVAL) {
        lastEcoLog = millis();
        char ecoLine[80];

        xSemaphoreTake(dataMutex, portMAX_DELAY);
        snprintf(ecoLine, sizeof(ecoLine),
                 "%lu,%.0f,%.0f,%.1f,%.0f,%.2f,%.0f\n", millis() / 1000,
                 sensors.rpm, sensors.speed, sensors.throttle, sensors.coolant,
                 sensors.voltage, sensors.fuelLevel);
        xSemaphoreGive(dataMutex);

        ecoBuffer += String(ecoLine);
        if (ecoBuffer.length() >= 200) {
          File f = LittleFS.open(LOG_FILE, "a");
          if (f) {
            if (f.size() > MAX_LOG_SIZE) {
              f.close();
              LittleFS.remove(LOG_FILE);
              f = LittleFS.open(LOG_FILE, "w");
            }
            if (f)
              f.print(ecoBuffer);
            f.close();
          }
          ecoBuffer = "";
        }
      }

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
// ★ HTTP HANDLERS ★
// ==============================================================

void handleDados() {
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
      "\"transTemp\":%.1f,\"oilPres\":%.1f,\"oilTemp\":%.1f,"
      "\"tripDist\":%.2f,"
      "\"obd_state\":%d"
      "}",
      s.rpm, s.speed, s.throttle, s.pedal, s.load, s.fuelRate, s.boost,
      s.coolant, s.catalyst, s.ambientTemp, s.ethanol, s.voltage, s.fuelLevel,
      s.transTemp, s.oilPres, s.oilTemp, s.tripDist,
      st);

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Cache-Control", "no-cache, no-store");
  server.send(200, "application/json", buf);
}

void handleBtConnect() {
  server.sendHeader("Access-Control-Allow-Origin", "*");

  if (obdState == 4) {
    btRequested = false;
    obdState = 0;
    xSemaphoreTake(dataMutex, portMAX_DELAY);
    sensors = SensorData();
    xSemaphoreGive(dataMutex);
    server.send(200, "application/json",
                "{\"ok\":true,\"action\":\"disconnect\"}");

  } else if (obdState == 0 || obdState == 9) {
    obdState = 0;
    btRequested = true;
    server.send(200, "application/json",
                "{\"ok\":true,\"action\":\"connect\"}");

  } else {
    server.send(200, "application/json",
                "{\"ok\":true,\"action\":\"already_connecting\"}");
  }
}

void handleBtStatus() {
  server.sendHeader("Access-Control-Allow-Origin", "*");

  static const char *labels[] = {
      "OFF", "INICIANDO CAN...", "---", "HANDSHAKE...", "ONLINE", "", "", "",
      "",    "FALHA CAN"};

  char buf[128];
  snprintf(buf, sizeof(buf),
           "{\"state\":%d,\"label\":\"%s\",\"heap\":%d,\"uptime\":%lu}",
           obdState, labels[obdState], ESP.getFreeHeap(), millis() / 1000UL);
  server.send(200, "application/json", buf);
}
// ==============================================================
// ★ HANDLERS: CONFIGURAÇÃO E SISTEMA ★
// ==============================================================
void handleConfigGet() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  if (LittleFS.exists("/config.json")) {
    File f = LittleFS.open("/config.json", "r");
    server.streamFile(f, "application/json");
    f.close();
  } else {
    server.send(404, "application/json",
                "{\"erro\":\"config nao encontrada\"}");
  }
}

void handleConfigPost() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  String body = server.arg("plain");
  if (body.length() == 0) {
    server.send(400, "application/json", "{\"erro\":\"body vazio\"}");
    return;
  }
  File f = LittleFS.open("/config.json", "w");
  if (!f) {
    server.send(500, "application/json", "{\"erro\":\"falha ao gravar\"}");
    return;
  }
  f.print(body);
  f.close();
  Serial.printf("[CONFIG] Salvo: %d bytes\n", body.length());
  server.send(200, "application/json", "{\"ok\":true}");
}

void handlePerfGet() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  if (LittleFS.exists("/perf.txt")) {
    File f = LittleFS.open("/perf.txt", "r");
    server.streamFile(f, "application/json");
    f.close();
  } else {
    server.send(200, "application/json", "[]");
  }
}

void handlePerfPost() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  String body = server.arg("plain");
  if (body.length() == 0) {
    server.send(400, "application/json", "{\"erro\":\"body vazio\"}");
    return;
  }
  File f = LittleFS.open("/perf.txt", "w");
  if (!f) {
    server.send(500, "application/json", "{\"erro\":\"falha ao gravar recordes\"}");
    return;
  }
  f.print(body);
  f.close();
  Serial.printf("[PERF] Recordes salvos: %d bytes\n", body.length());
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleOptions() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.send(200, "text/plain", "");
}

void handleRoot() {
  if (LittleFS.exists("/index.html.gz")) {
    File f = LittleFS.open("/index.html.gz", "r");
    server.sendHeader("Content-Encoding", "gzip");
    server.streamFile(f, "text/html");
    f.close();
  } else if (LittleFS.exists("/index.html")) {
    File f = LittleFS.open("/index.html", "r");
    server.streamFile(f, "text/html");
    f.close();
  } else {
    server.send(404, "text/plain", "index.html nao encontrado no LittleFS!");
  }
}

void handleListFiles() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  String json = "[";
  bool first = true;
  const char *dirs[] = {"/", "/relogios"};
  for (int d = 0; d < 2; d++) {
    File root = LittleFS.open(dirs[d]);
    if (!root || !root.isDirectory())
      continue;
    File file = root.openNextFile();
    while (file) {
      String name = file.name();
      if (name.endsWith(".png") || name.endsWith(".webp") ||
          name.endsWith(".jpg")) {
        if (!first)
          json += ",";
        String fp = name.startsWith("/") ? name : String(dirs[d]) + "/" + name;
        json += "\"" + fp + "\"";
        first = false;
      }
      file = root.openNextFile();
    }
  }
  json += "]";
  server.send(200, "application/json", json);
}

void handleHeap() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  char buf[128];
  snprintf(buf, sizeof(buf),
           "{\"free\":%d,\"min_free\":%d,\"total\":%d,\"uptime\":%lu}",
           ESP.getFreeHeap(), ESP.getMinFreeHeap(), ESP.getHeapSize(),
           millis() / 1000UL);
  server.send(200, "application/json", buf);
}

// ==============================================================
// ★ SETUP ★
// ==============================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n╔══════════════════════════════════════════╗");
  Serial.println("║   PulseDash v6.0 — CAN Direto Edition    ║");
  Serial.println("║   Onix 2026 × SN65HVD230 × ESP32         ║");
  Serial.println("╚══════════════════════════════════════════╝");
  logEvent("[SYS] Heap inicial: " + String(ESP.getFreeHeap()) + " bytes");
  logEvent("[0s] PulseDash v6.0 Iniciado (CAN direto).");
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  dataMutex = xSemaphoreCreateMutex();

  if (!LittleFS.begin(true)) {
    Serial.println("[ERRO] LittleFS falhou!");
  } else {
    Serial.println("[OK] LittleFS pronto.");
  }

  // --- Comando de Leitura de Log via Serial ---
  Serial.println(
      "\n[DICA] Digite 'L' para LER, ou 'C' para LIMPAR o log (1.5s).");

  ecoBuffer.reserve(
      512); // v5.0: evita realocação de memória no heap durante a viagem
  uint32_t startWait = millis();
  while (millis() - startWait < 1500) { // v3.1: Reduzido de 5s para 1.5s
    if (Serial.available()) {
      char c = Serial.read();
      if (c == 'L' || c == 'l') {
        Serial.println("\n=== DUMP DE LOG (LITTLEFS) ===");
        if (LittleFS.exists(LOG_FILE)) {
          File f = LittleFS.open(LOG_FILE, "r");
          while (f.available())
            Serial.write(f.read());
          f.close();
        } else {
          Serial.println("Arquivo de log vazio.");
        }
        Serial.println("\n=== FIM DO DUMP ===");
      } else if (c == 'C' || c == 'c') {
        LittleFS.remove(LOG_FILE);
        Serial.println("\n[OK] Arquivo de log deletado!");
      }
    }
  }

  // WiFi sobe imediatamente — CAN não concorre com rádio 2.4GHz
  Serial.println("[SYS] Iniciando WiFi e task OBD (CAN)...");

  // Rotas HTTP
  server.on("/", HTTP_GET, handleRoot);
  server.on("/dados", HTTP_GET, handleDados);
  server.on("/config", HTTP_GET, handleConfigGet);
  server.on("/config", HTTP_POST, handleConfigPost);
  server.on("/config", HTTP_OPTIONS, handleOptions);
  server.on("/perf", HTTP_GET, handlePerfGet);
  server.on("/perf", HTTP_POST, handlePerfPost);
  server.on("/perf", HTTP_OPTIONS, handleOptions);
  server.on("/arquivos", HTTP_GET, handleListFiles);
  server.on("/bt/connect", HTTP_GET, handleBtConnect);
  server.on("/bt/status", HTTP_GET, handleBtStatus);
  server.on("/heap", HTTP_GET, handleHeap);
  server.on("/log", HTTP_GET, handleLog);
  server.on("/console", HTTP_GET, handleConsole);
  // v3.1: A pilha de rede (LwIP) precisa ser inicializada antes do
  // server.begin()
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  server.serveStatic("/", LittleFS, "/");
  server.begin();
  webSocket.begin(); // Inicializa WebSockets na porta 81

  // Otimização de RAM: Pre-aloca o buffer do CSV para evitar fragmentação
  ecoBuffer.reserve(512);

  logEvent("[SYS] Servidor HTTP ativo.");

  // v5.0: CAN inicia automaticamente — sem precisar de botao no dashboard
  btRequested = true;
  xTaskCreatePinnedToCore(
      obdTask, "OBD", 8192, NULL, 1, NULL,
      0); // v5.0: Stack aumentado para 8192 para segurança com LittleFS
}

// ==============================================================
// ★ LOOP (Core 1 — Web Server) ★
// ==============================================================
void loop() {
  server.handleClient();
  webSocket.loop();

  // Transmissão WebSocket de Telemetria a cada 30ms (~33Hz) para fluidez absoluta
  static uint32_t lastWsUpdate = 0;
  if (millis() - lastWsUpdate > 30) {
    lastWsUpdate = millis();

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
        "\"transTemp\":%.1f,\"oilPres\":%.1f,\"oilTemp\":%.1f,"
        "\"tripDist\":%.2f,"
        "\"obd_state\":%d"
        "}",
        s.rpm, s.speed, s.throttle, s.pedal, s.load, s.fuelRate, s.boost,
        s.coolant, s.catalyst, s.ambientTemp, s.ethanol, s.voltage, s.fuelLevel,
        s.transTemp, s.oilPres, s.oilTemp, s.tripDist,
        st);
    webSocket.broadcastTXT(buf);
  }

  // Reconexão WiFi
  static uint32_t lastWifiCheck = 0;
  static bool lastWifiStatus = false;

  if (millis() - lastWifiCheck > WIFI_CHECK_INTERVAL) {
    lastWifiCheck = millis();
    wl_status_t status = WiFi.status();

    if (status != WL_CONNECTED && status != WL_DISCONNECTED) {
      // Já está tentando conectar ou em idle, não faz nada
    } else if (status != WL_CONNECTED) {
      WiFi.begin(ssid, password);
    } else if (status == WL_CONNECTED && !lastWifiStatus) {
      logEvent("[WIFI] Online! IP: " + WiFi.localIP().toString());
      // v3.3: Re-aplica Modem Sleep após reconexão WiFi
      esp_wifi_set_ps(WIFI_PS_MIN_MODEM);
    }
    lastWifiStatus = (status == WL_CONNECTED);
  }

  /*
  // Log de status periódico
  static uint32_t lastStat = 0;
  if (millis() - lastStat > 300000) { // Alterado para 5min (300s) para
  economizar Flash lastStat = millis(); static const char* statusLabels[] = {
      "OFF", "INICIANDO_CAN", "---", "HANDSHAKE", "ONLINE",
      "", "", "", "", "FALHA"
    };
    char buf[80];
    snprintf(buf, sizeof(buf), "[SYS] Modo: %s | Heap: %d",
             statusLabels[obdState], ESP.getFreeHeap());
    logEvent(buf);
  }
  */
}
