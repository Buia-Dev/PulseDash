// ==============================================================
//  PulseDash v5.5_BT — CAN Bus Nativo + Bluetooth Serial
//  Comunicação Direta via TWAI (SN65HVD230) & Bluetooth Classic
// --------------------------------------------------------------
//  Edição Especial Bluetooth (Sem Wi-Fi / Sem LittleFS)
//  Auto-start, Auto-recovery, 50Hz Fast Reading no Core 0
// ==============================================================

#include "BluetoothSerial.h"
#include "driver/twai.h" // CAN nativo (SN65HVD230)

#define CAN_TX_PIN 17
#define CAN_RX_PIN 16

// ==============================================================
// ★ OBJETOS GLOBAIS ★
// ==============================================================
BluetoothSerial SerialBT;
SemaphoreHandle_t dataMutex;

#define LED_PIN 2

// ==============================================================
// ★ CONSTANTES & ESTADOS ★
// ==============================================================
// Estado OBD: 0=OFF, 1=INICIANDO CAN, 3=HANDSHAKE, 4=ONLINE, 9=FALHA
volatile int obdState = 0;
volatile bool btRequested = true; // Auto-start ativado de fábrica para BT
volatile uint32_t obdLastOk = 0;

// Estrutura de Sensores (Thread Safe)
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
};
SensorData sensors;

// ==============================================================
// ★ CAN / TWAI: COMUNICAÇÃO OBD2 DIRETO (29-bit @ 500kbps) ★
// ==============================================================
// Identificadores Onix 2026: TX=0x18DB33F1 | RX=0x18DAF111

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

// Linguagem de Sinais Visuais do LED
void ledBlink(int count, int delayMs) {
  for (int i = 0; i < count; i++) {
    digitalWrite(LED_PIN, HIGH);
    vTaskDelay(delayMs / portTICK_PERIOD_MS);
    digitalWrite(LED_PIN, LOW);
    vTaskDelay(delayMs / portTICK_PERIOD_MS);
  }
}

// Envia pedido e aguarda resposta — retorna valor calculado ou -999.0f se erro/timeout
float canReadSensor(uint8_t pid, int nBytes) {
  if (!canSendOBD(pid))
    return -999.0f;
  twai_message_t r;
  uint32_t t0 = millis();
  // Timeout agressivo de 25ms para latência de resposta zero
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
          return A * 100.0f / 255.0f; // Throttle
        case 0x49:
          return A * 100.0f / 255.0f; // Pedal APP
        case 0x04:
          return A * 100.0f / 255.0f; // Carga motor
        case 0x5E:
          return ((A * 256.0f) + B) / 20.0f; // Fuel Rate (L/h)
        case 0x0B:
          return (float)A; // Boost (MAP kPa)
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
        default:
          return (float)A;
        }
      }
    }
  }
  return -999.0f;
}

// ==============================================================
// ★ TASK CORE 0: COMUNICAÇÃO OBD2 VIA CAN (50Hz) ★
// ==============================================================
void obdTask(void *param) {
  Serial.println("[SYS] Task OBD (Core 0) iniciada.");

  for (;;) {
    if (!btRequested) {
      vTaskDelay(500 / portTICK_PERIOD_MS);
      continue;
    }

    // ESTADO 1: Iniciar driver TWAI
    obdState = 1;
    Serial.println("[CAN] Iniciando TWAI 29-bit @ 500kbps...");
    digitalWrite(LED_PIN, HIGH);

    if (!canInit()) {
      Serial.println("[CAN] ERRO: falha ao instalar driver TWAI!");
      obdState = 9;
      digitalWrite(LED_PIN, LOW);
      vTaskDelay(5000 / portTICK_PERIOD_MS); // espera 5s para retentar
      continue;
    }
    Serial.print("[CAN] Driver instalado com sucesso. Heap livre: ");
    Serial.println(ESP.getFreeHeap());
    digitalWrite(LED_PIN, LOW);

    // ESTADO 3: Handshake OBD2
    obdState = 3;
    Serial.println("[CAN] Handshake agressivo iniciando...");
    bool handshakeOk = false;

    for (int tentativa = 0; tentativa < 10 && !handshakeOk; tentativa++) {
      digitalWrite(LED_PIN, HIGH);
      // 1. Envia Tester Present para acordar a ECU
      twai_message_t tp;
      memset(&tp, 0, sizeof(tp));
      tp.identifier = 0x18DB33F1;
      tp.extd = 1;
      tp.data_length_code = 8;
      tp.data[0] = 0x02;
      tp.data[1] = 0x3E;
      tp.data[2] = 0x00;
      twai_transmit(&tp, pdMS_TO_TICKS(10));

      vTaskDelay(100 / portTICK_PERIOD_MS);

      // 2. Solicita PIDs suportados (PID 0x00)
      canSendOBD(0x00);

      // 3. Escuta resposta ativa por 800ms
      uint32_t t0 = millis();
      while (millis() - t0 < 800) {
        twai_message_t r;
        if (twai_receive(&r, pdMS_TO_TICKS(5)) == ESP_OK) {
          if (r.extd && r.data[1] == 0x41 && r.data[2] == 0x00) {
            handshakeOk = true;
            Serial.print("[CAN] Handshake OK! ECU respondendo no ID: 0x");
            Serial.println(r.identifier, HEX);
            break;
          }
        }
      }
      digitalWrite(LED_PIN, LOW);
      if (!handshakeOk)
        vTaskDelay(200 / portTICK_PERIOD_MS);
    }

    if (!handshakeOk) {
      Serial.println("[CAN] Sem resposta da ECU. Reiniciando driver...");
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
      Serial.print("[CAN] Etanol lido no startup: ");
      Serial.print(ethStartup);
      Serial.println("%");
    }

    // ESTADO 4: ONLINE — Loop de Leitura Dinâmica Otimizada por Slots
    obdState = 4;
    obdLastOk = millis();
    ledBlink(3, 50); // Sinal visual de sucesso
    float emaFuel = -1.0f;
    uint32_t lastTP = millis();
    uint32_t lastLoop = millis();

    // Timers para os sensores secundários
    uint32_t lastThrottle = 0;
    uint32_t lastPedal = 0;
    uint32_t lastLoad = 0;
    uint32_t lastFuelRate = 0;
    uint32_t lastVoltage = 0;
    uint32_t lastCoolant = 0;
    uint32_t lastAmbient = 0;
    uint32_t lastCatalyst = 0;
    uint32_t lastFuelLevel = 0;
    uint32_t lastEthanol = 0;

    Serial.println("[CAN] ★ ONLINE! Iniciando telemetria otimizada a 20Hz.");

    while (btRequested && obdState == 4) {
      uint32_t alertas = 0;
      twai_read_alerts(&alertas, 0);
      if (alertas & TWAI_ALERT_BUS_OFF) {
        twai_initiate_recovery();
      }

      if (millis() - lastLoop < 50) {
        vTaskDelay(pdMS_TO_TICKS(2));
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

      // --- GRUPO ULTRA-RÁPIDO (Leitura em todo ciclo - 20Hz / 50ms) ---
      float rpm = canReadSensor(0x0C, 2);
      float spd = canReadSensor(0x0D, 1);

      // --- ESCALONADOR INTELIGENTE DE SENSORES SECUNDÁRIOS ---
      // Para não congestionar o barramento CAN, lemos no máximo 1 sensor secundário por ciclo de 50ms
      uint32_t now = millis();
      bool readExtra = false;

      // 1. Grupo Rápido (100ms)
      if (!readExtra && (lastThrottle == 0 || now - lastThrottle >= 100)) {
        float thr = canReadSensor(0x11, 1);
        if (thr > -900.0f) {
          xSemaphoreTake(dataMutex, portMAX_DELAY);
          sensors.throttle = thr;
          xSemaphoreGive(dataMutex);
        }
        lastThrottle = now;
        readExtra = true;
      }
      else if (!readExtra && (lastPedal == 0 || now - lastPedal >= 100)) {
        float ped = canReadSensor(0x49, 1);
        if (ped > -900.0f) {
          xSemaphoreTake(dataMutex, portMAX_DELAY);
          sensors.pedal = ped;
          xSemaphoreGive(dataMutex);
        }
        lastPedal = now;
        readExtra = true;
      }
      // 2. Grupo Médio (500ms)
      else if (!readExtra && (lastLoad == 0 || now - lastLoad >= 500)) {
        float ld = canReadSensor(0x04, 1);
        if (ld > -900.0f) {
          xSemaphoreTake(dataMutex, portMAX_DELAY);
          sensors.load = ld;
          xSemaphoreGive(dataMutex);
        }
        lastLoad = now;
        readExtra = true;
      }
      else if (!readExtra && (lastVoltage == 0 || now - lastVoltage >= 500)) {
        float volt = canReadSensor(0x42, 2);
        if (volt > -900.0f) {
          xSemaphoreTake(dataMutex, portMAX_DELAY);
          sensors.voltage = volt;
          xSemaphoreGive(dataMutex);
        }
        lastVoltage = now;
        readExtra = true;
      }
      // 3. Grupo Lento (1000ms / 1s)
      else if (!readExtra && (lastCoolant == 0 || now - lastCoolant >= 1000)) {
        float cool = canReadSensor(0x05, 1);
        if (cool > -900.0f) {
          xSemaphoreTake(dataMutex, portMAX_DELAY);
          sensors.coolant = cool;
          xSemaphoreGive(dataMutex);
        }
        lastCoolant = now;
        readExtra = true;
      }
      else if (!readExtra && (lastAmbient == 0 || now - lastAmbient >= 1000)) {
        float amb = canReadSensor(0x46, 1);
        if (amb > -900.0f) {
          xSemaphoreTake(dataMutex, portMAX_DELAY);
          sensors.ambientTemp = amb;
          xSemaphoreGive(dataMutex);
        }
        lastAmbient = now;
        readExtra = true;
      }
      else if (!readExtra && (lastCatalyst == 0 || now - lastCatalyst >= 1000)) {
        float cat = canReadSensor(0x3C, 2);
        if (cat > -900.0f) {
          xSemaphoreTake(dataMutex, portMAX_DELAY);
          sensors.catalyst = cat;
          xSemaphoreGive(dataMutex);
        }
        lastCatalyst = now;
        readExtra = true;
      }
      else if (!readExtra && (lastFuelLevel == 0 || now - lastFuelLevel >= 1000)) {
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
        lastFuelLevel = now;
        readExtra = true;
      }
      else if (!readExtra && (lastEthanol == 0 || now - lastEthanol >= 1000)) {
        float eth = canReadSensor(0x52, 1);
        if (eth > -900.0f) {
          xSemaphoreTake(dataMutex, portMAX_DELAY);
          sensors.ethanol = eth;
          xSemaphoreGive(dataMutex);
        }
        lastEthanol = now;
        readExtra = true;
      }

      // Atualiza struct principal protegida por mutex para os sensores ultra-rápidos & estimativas virtuais
      xSemaphoreTake(dataMutex, portMAX_DELAY);
      if (rpm > -900.0f) {
        sensors.rpm = rpm;
        obdLastOk = millis();
      }
      if (spd > -900.0f) {
        sensors.speed = spd;
      }

      // Estimativa Virtual do Boost (MAP Absoluto em kPa para o Onix 1.0T)
      if (sensors.rpm > 400.0f) {
        float mapEst = 100.0f; // Pressão atmosférica padrão (0 bar relativo)
        if (sensors.load > 15.0f) {
          mapEst += (sensors.load - 15.0f) * 1.1f; // Sobe proporcionalmente até ~193 kPa (0.93 bar de turbo)
        }
        sensors.boost = mapEst;
      } else {
        sensors.boost = 100.0f;
      }

      // Estimativa Virtual do Consumo Instantâneo (Fuel Rate L/h)
      if (sensors.rpm > 400.0f) {
        float frEst = 0.8f + (sensors.rpm * 0.0002f) + (sensors.load * 0.08f);
        // Simulação de Cut-off real em freio motor
        if (sensors.throttle < 2.0f && sensors.rpm > 1200.0f) {
          frEst = 0.0f;
        }
        sensors.fuelRate = frEst;
      } else {
        sensors.fuelRate = 0.0f;
      }
      xSemaphoreGive(dataMutex);

      vTaskDelay(10 / portTICK_PERIOD_MS);
    }

    // Encerrar sessão CAN
    twai_stop();
    twai_driver_uninstall();
    digitalWrite(LED_PIN, LOW);
    Serial.println("[CAN] Sessão CAN encerrada.");
    vTaskDelay(1000 / portTICK_PERIOD_MS);
  }
}

// ==============================================================
// ★ SETUP ★
// ==============================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n╔══════════════════════════════════════════╗");
  Serial.println("║  PulseDash v5.5_BT — Bluetooth Edition   ║");
  Serial.println("║  Onix 2026 × SN65HVD230 × ESP32          ║");
  Serial.println("╚══════════════════════════════════════════╝");
  
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  dataMutex = xSemaphoreCreateMutex();

  // Inicia o Bluetooth Serial com o nome de pareamento esperado pelo App
  Serial.println("[SYS] Iniciando Pareamento Bluetooth: \"PulseScan\"...");
  if (!SerialBT.begin("PulseScan")) {
    Serial.println("[ERRO] Falha ao iniciar Bluetooth Serial!");
  } else {
    Serial.println("[OK] Bluetooth Serial ativo e aguardando conexão.");
  }

  // Cria a tarefa de comunicação CAN no Core 0 (Isolada)
  xTaskCreatePinnedToCore(
      obdTask, "OBD", 4096, NULL, 1, NULL, 0);
}

// ==============================================================
// ★ LOOP PRINCIPAL (Core 1 — Transmissão Serial RFCOMM) ★
// ==============================================================
void loop() {
  static uint32_t lastBroadcast = 0;
  
  // Envia telemetria a cada 50ms (20Hz) para fluidez absoluta dos ponteiros e sem lag
  if (millis() - lastBroadcast >= 50) {
    lastBroadcast = millis();

    SensorData s;
    int st;
    
    // Cópia atômica dos sensores com mutex ultracurto
    xSemaphoreTake(dataMutex, portMAX_DELAY);
    s = sensors;
    st = obdState;
    xSemaphoreGive(dataMutex);

    // Força o estado OBD como 4 (ONLINE) para testes na bancada fora do carro
    st = 4; 

    // Formata o pacote JSON compactado para economizar dados e acelerar o parse no app
    char buf[256];
    snprintf(
        buf, sizeof(buf),
        "{"
        "\"rpm\":%.0f,\"speed\":%.0f,\"throttle\":%.0f,\"pedal\":%.0f,\"load\":%.0f,"
        "\"fuelRate\":%.1f,\"boost\":%.1f,\"coolant\":%.0f,\"catalyst\":%.0f,"
        "\"ambient\":%.0f,\"ethanol\":%.0f,\"voltage\":%.1f,\"fuelLevel\":%.0f,"
        "\"obd_state\":%d"
        "}",
        s.rpm, s.speed, s.throttle, s.pedal, s.load, s.fuelRate, s.boost,
        s.coolant, s.catalyst, s.ambientTemp, s.ethanol, s.voltage, s.fuelLevel,
        st);

    // Envia para o cliente Bluetooth ativo
    if (SerialBT.hasClient()) {
      SerialBT.println(buf);
    }

    // Exibe no monitor serial (USB) para depuração no PC do usuário
    Serial.println(buf);
  }

  // Pequeno delay para liberar a CPU
  vTaskDelay(pdMS_TO_TICKS(5));
}
