#include <Arduino.h>
#include <SPIFFS.h>
#include "driver/twai.h"

// ============================================================================
//  PulseDash OBD2 Support Scanner — Chevrolet Onix 2026
// ----------------------------------------------------------------------------
//  Este código é 100% voltado para diagnósticos e mapeamento seguro.
//  Ele executa varreduras nos blocos 0100, 0120, 0140, 0160, 0180 e 01A0.
//  Decodifica os bitmaps retornados e mostra a lista EXATA de PIDs que o carro
//  realmente suporta no protocolo SAE J1979 padrão.
// ============================================================================

#define CAN_TX_PIN  17
#define CAN_RX_PIN  16
#define LED_PIN      2

File logFile;
bool supportedPIDs[256];
bool useExtendedCAN = false; // false = 11-bit (Honda Fit), true = 29-bit (Onix)
uint32_t ecuPhysicalRxId = 0; // ID físico de resposta da ECU capturado em tempo de execução



// ── Descrições amigáveis dos PIDs padrão SAE ─────────────────────────────────
String getPIDDesc(uint8_t pid) {
  switch(pid) {
    case 0x01: return "Monitor status since DTCs cleared";
    case 0x02: return "Freeze DTC";
    case 0x03: return "Fuel system status";
    case 0x04: return "Calculated engine load";
    case 0x05: return "Engine coolant temperature (Água)";
    case 0x06: return "Short term fuel trim—Bank 1";
    case 0x07: return "Long term fuel trim—Bank 1";
    case 0x0B: return "Intake manifold absolute pressure (MAP / Boost)";
    case 0x0C: return "Engine RPM";
    case 0x0D: return "Vehicle speed";
    case 0x0E: return "Timing advance";
    case 0x0F: return "Intake air temperature (IAT / Temp. Ar Admissão)";
    case 0x10: return "MAF air flow rate";
    case 0x11: return "Throttle position (Borboleta)";
    case 0x1F: return "Run time since engine start";
    case 0x21: return "Distance traveled with MIL on";
    case 0x2F: return "Fuel tank level input (Nível Combustível)";
    case 0x31: return "Distance traveled since DTCs cleared (Odômetro)";
    case 0x33: return "Absolute barometric pressure";
    case 0x3C: return "Catalyst temperature (Catalisador)";
    case 0x42: return "Control module voltage (Voltagem)";
    case 0x43: return "Absolute load value";
    case 0x45: return "Relative throttle position";
    case 0x46: return "Ambient air temperature (Ar Externo)";
    case 0x49: return "Accelerator pedal position D";
    case 0x4A: return "Accelerator pedal position E";
    case 0x51: return "Fuel Type";
    case 0x52: return "Ethanol fuel % (Etanol)";
    case 0x5E: return "Engine fuel rate (Vazão Consumo)";
    default: return "Outro PID OBD2 Padrão";
  }
}

// ── Sinalizadores Visuais LED ────────────────────────────────────────────────
void blink(int n, int onMs = 80, int offMs = 80) {
  for (int i = 0; i < n; i++) {
    digitalWrite(LED_PIN, HIGH); delay(onMs);
    digitalWrite(LED_PIN, LOW);
    if (i < n - 1) delay(offMs);
  }
}

// ── Gravação de Logs ─────────────────────────────────────────────────────────
void logMsg(String m) {
  Serial.println(m);
  if (logFile) {
    logFile.println(m);
    logFile.flush();
  }
}

// ── Inicializa TWAI CAN dinamicamente com velocidade configurável ───────────
bool iniciarCAN(uint32_t baudRate = 500000) {
  // Para permitir re-inicialização com velocidades diferentes, paramos e limpamos o driver anterior se houver
  twai_stop();
  twai_driver_uninstall();
  delay(30);

  twai_general_config_t g = TWAI_GENERAL_CONFIG_DEFAULT(
    (gpio_num_t)CAN_TX_PIN, (gpio_num_t)CAN_RX_PIN, TWAI_MODE_NORMAL);
  g.alerts_enabled = TWAI_ALERT_ALL;
  g.rx_queue_len   = 15;

  twai_timing_config_t t;
  if (baudRate == 250000) {
    t = TWAI_TIMING_CONFIG_250KBITS();
  } else {
    t = TWAI_TIMING_CONFIG_500KBITS(); // Padrão 500k
  }

  twai_filter_config_t f = TWAI_FILTER_CONFIG_ACCEPT_ALL();
  if(twai_driver_install(&g, &t, &f) != ESP_OK) return false;
  if(twai_start() != ESP_OK){ twai_driver_uninstall(); return false; }
  return true;
}

// ── Transmite frame OBD2 ────────────────────────────────────────────────────
bool enviarOBD(uint8_t modo, uint8_t pid) {
  twai_message_t m;
  memset(&m, 0, sizeof(m));
  if (useExtendedCAN) {
    m.identifier = 0x18DB33F1; // Broadcast OBD2 29-bit
    m.extd = 1;
  } else {
    m.identifier = 0x7DF;      // Broadcast OBD2 11-bit
    m.extd = 0;
  }
  m.data_length_code = 8;
  m.data[0] = 0x02; // 2 bytes de dados válidos adicionais
  m.data[1] = modo;
  m.data[2] = pid;
  for (int i = 3; i < 8; i++) m.data[i] = 0xAA; // Padding para evitar rejeição
  return twai_transmit(&m, pdMS_TO_TICKS(20)) == ESP_OK;
}

// ── Escuta resposta específica da ECU ───────────────────────────────────────
bool receberResposta(twai_message_t* r, uint8_t modoEsperado, uint8_t pidEsperado, uint32_t timeoutMs) {
  uint32_t t0 = millis();
  while(millis() - t0 < timeoutMs) {
    if(twai_receive(r, pdMS_TO_TICKS(1)) == ESP_OK) {
      if (useExtendedCAN) {
        if(r->extd && (r->identifier == 0x18DAF111 || (r->identifier & 0xFFFF0000) == 0x18DA0000)) {
          if(r->data[1] == (modoEsperado + 0x40) && r->data[2] == pidEsperado) {
            ecuPhysicalRxId = r->identifier; // Salva o ID físico da ECU que respondeu
            return true;
          }
        }
      } else {
        if(!r->extd && (r->identifier >= 0x7E8 && r->identifier <= 0x7EF)) {
          if(r->data[1] == (modoEsperado + 0x40) && r->data[2] == pidEsperado) {
            ecuPhysicalRxId = r->identifier; // Salva o ID físico da ECU que respondeu
            return true;
          }
        }
      }
    }
  }
  return false;
}

uint32_t getPhysicalTxId() {
  if (ecuPhysicalRxId == 0) {
    return useExtendedCAN ? 0x18DA11F1 : 0x7E0; // Fallback
  }
  if (useExtendedCAN) {
    uint8_t source = ecuPhysicalRxId & 0xFF;
    return 0x18DA0000 | (source << 8) | 0xF1; // Inverte target/source
  } else {
    return ecuPhysicalRxId - 8; // 0x7E8 -> 0x7E0
  }
}

bool enviarOBDFisico(uint8_t modo, uint8_t pid) {
  twai_message_t m;
  memset(&m, 0, sizeof(m));
  m.identifier = getPhysicalTxId();
  m.extd = useExtendedCAN ? 1 : 0;
  m.data_length_code = 8;
  m.data[0] = 0x02; // 2 bytes válidos
  m.data[1] = modo;
  m.data[2] = pid;
  for (int i = 3; i < 8; i++) m.data[i] = 0xAA; // Padding
  return twai_transmit(&m, pdMS_TO_TICKS(20)) == ESP_OK;
}

// ── Transmite frame UDS Service 22 ──────────────────────────────────────────
bool enviarUDS(uint32_t txId, uint16_t pid) {
  twai_message_t m;
  memset(&m, 0, sizeof(m));
  m.identifier = txId;
  m.extd = 1;
  m.data_length_code = 8;
  m.data[0] = 0x03; // 3 bytes válidos
  m.data[1] = 0x22; // Service 22 (Read Data By Identifier)
  m.data[2] = (pid >> 8) & 0xFF;
  m.data[3] = pid & 0xFF;
  return twai_transmit(&m, pdMS_TO_TICKS(20)) == ESP_OK;
}

// ── Transmite alteração de Sessão UDS Service 10 ────────────────────────────
bool enviarSessaoUDS(uint32_t txId, uint8_t tipoSessao) {
  twai_message_t m;
  memset(&m, 0, sizeof(m));
  m.identifier = txId;
  m.extd = 1;
  m.data_length_code = 8;
  m.data[0] = 0x02; // 2 bytes válidos
  m.data[1] = 0x10; // Service 10 (Session Control)
  m.data[2] = tipoSessao;
  return twai_transmit(&m, pdMS_TO_TICKS(20)) == ESP_OK;
}

// ── Escuta resposta UDS Service 22 ──────────────────────────────────────────
bool receberRespostaUDS(twai_message_t* r, uint32_t rxId, uint16_t pidEsperada, uint32_t timeoutMs) {
  uint32_t t0 = millis();
  while(millis() - t0 < timeoutMs) {
    if(twai_receive(r, pdMS_TO_TICKS(1)) == ESP_OK) {
      if(r->extd && r->identifier == rxId) {
        if(r->data[1] == 0x62) { // 22 + 40 (Resposta Positiva)
          uint16_t respPid = (r->data[2] << 8) | r->data[3];
          if(respPid == pidEsperada) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

// ── Escuta resposta de Sessão UDS Service 10 ────────────────────────────────
bool receberRespostaSessaoUDS(twai_message_t* r, uint32_t rxId, uint8_t sessaoEsperada, uint32_t timeoutMs) {
  uint32_t t0 = millis();
  while(millis() - t0 < timeoutMs) {
    if(twai_receive(r, pdMS_TO_TICKS(1)) == ESP_OK) {
      if(r->extd && r->identifier == rxId) {
        if(r->data[1] == 0x50 && r->data[2] == sessaoEsperada) { // 10 + 40 (Resposta Positiva)
          return true;
        }
      }
    }
  }
  return false;
}

// ============================================================================
// ★ K-LINE & KWP2000: PROTOCOLO DE DIAGNÓSTICO (ISO 14230-4) ★
// ============================================================================
#define KLINE_TX_PIN 4
#define KLINE_RX_PIN 5

void klineFastInit() {
  Serial2.end();
  pinMode(KLINE_TX_PIN, OUTPUT);
  
  // Executa o pulso elétrico físico de despertar (Fast Init)
  digitalWrite(KLINE_TX_PIN, LOW);
  delay(25);
  digitalWrite(KLINE_TX_PIN, HIGH);
  delay(25);
  
  // Inicializa porta Serial2 a 10.400 bps nos pinos GPIO 5 (RX) e GPIO 4 (TX)
  Serial2.begin(10400, SERIAL_8N1, KLINE_RX_PIN, KLINE_TX_PIN);
}

uint8_t calcularChecksumKWP(uint8_t* data, int len) {
  uint8_t sum = 0;
  for (int i = 0; i < len; i++) {
    sum += data[i];
  }
  return sum;
}

bool enviarKWP(uint8_t modo, uint8_t pid) {
  // Limpa o buffer de entrada
  while(Serial2.available() > 0) Serial2.read();
  
  uint8_t packet[6];
  packet[0] = 0xC2; // Formato KWP: 2 bytes de dados (Modo + PID) com cabeçalho de target/source
  packet[1] = 0x33; // Target: OBD Broadcast (ECU)
  packet[2] = 0xF1; // Source: Scan tool
  packet[3] = modo;
  packet[4] = pid;
  packet[5] = calcularChecksumKWP(packet, 5);
  
  int written = Serial2.write(packet, 6);
  Serial2.flush();
  
  // Limpa o eco físico gerado pela comunicação K-Line bidirecional no mesmo fio
  uint32_t t0 = millis();
  int ecoLido = 0;
  while (ecoLido < 6 && (millis() - t0 < 50)) {
    if (Serial2.available()) {
      Serial2.read();
      ecoLido++;
    }
  }
  return written == 6;
}

bool enviarKWP_DTC(uint8_t modo) {
  // Limpa o buffer de entrada
  while(Serial2.available() > 0) Serial2.read();
  
  uint8_t packet[5];
  packet[0] = 0xC1; // Formato KWP: 1 byte de dados (apenas o Modo)
  packet[1] = 0x33; // Target: OBD
  packet[2] = 0xF1; // Source: Tester
  packet[3] = modo;
  packet[4] = calcularChecksumKWP(packet, 4);
  
  int written = Serial2.write(packet, 5);
  Serial2.flush();
  
  // Limpa eco físico (5 bytes)
  uint32_t t0 = millis();
  int ecoLido = 0;
  while (ecoLido < 5 && (millis() - t0 < 50)) {
    if (Serial2.available()) {
      Serial2.read();
      ecoLido++;
    }
  }
  return written == 5;
}

bool receberKWP(uint8_t* payload, int &payloadLen, uint8_t modoEsperado, uint8_t pidEsperado, uint32_t timeoutMs) {
  uint8_t header[4];
  uint32_t t0 = millis();
  
  // 1. Lê os primeiros 3 bytes (Header format, target, source)
  int bytesLidos = 0;
  while (bytesLidos < 3 && (millis() - t0 < timeoutMs)) {
    if (Serial2.available()) {
      header[bytesLidos++] = Serial2.read();
    }
  }
  if (bytesLidos < 3) return false;
  
  uint8_t format = header[0];
  uint8_t target = header[1];
  uint8_t source = header[2];
  
  if (target != 0xF1) return false; // Confirma se a resposta somos nós (tester)
  
  int dataLen = format & 0x3F;
  if (dataLen == 0) {
    // Se o tamanho não estiver no formato, lê o 4º byte
    while (!Serial2.available() && (millis() - t0 < timeoutMs));
    if (!Serial2.available()) return false;
    dataLen = Serial2.read();
  }
  
  // 2. Lê os dados úteis + 1 byte de Checksum
  int totalParaLer = dataLen + 1;
  uint8_t dataBuf[64];
  int dadosLidos = 0;
  while (dadosLidos < totalParaLer && (millis() - t0 < timeoutMs)) {
    if (Serial2.available()) {
      dataBuf[dadosLidos++] = Serial2.read();
    }
  }
  if (dadosLidos < totalParaLer) return false;
  
  // 3. Valida Checksum do pacote completo
  int headerLen = (format & 0x3F) == 0 ? 4 : 3;
  uint8_t fullPacket[128];
  memcpy(fullPacket, header, 3);
  if (headerLen == 4) {
    fullPacket[3] = dataLen;
    memcpy(fullPacket + 4, dataBuf, dataLen);
  } else {
    memcpy(fullPacket + 3, dataBuf, dataLen);
  }
  
  uint8_t csCalculado = calcularChecksumKWP(fullPacket, headerLen + dataLen);
  uint8_t csRecebido = dataBuf[dataLen];
  if (csCalculado != csRecebido) return false;
  
  // 4. Valida se a resposta corresponde ao modo e PID solicitados
  uint8_t respModo = dataBuf[0];
  uint8_t respPid = dataBuf[1];
  
  if (respModo == (modoEsperado + 0x40) && respPid == pidEsperado) {
    payloadLen = dataLen - 2;
    memcpy(payload, dataBuf + 2, payloadLen);
    return true;
  }
  return false;
}

bool iniciarKLine() {
  logMsg("\n[K-LINE] Iniciando Handshake com a ECU...");
  klineFastInit();
  
  while(Serial2.available() > 0) Serial2.read(); // Limpa lixo residual
  
  // Envia comando Start Communication (KWP2000): 0xC1 0x33 0xF1 0x81 0x66
  uint8_t startCmd[5] = {0xC1, 0x33, 0xF1, 0x81, 0x66};
  Serial2.write(startCmd, 5);
  Serial2.flush();
  
  // Descarta eco do Start Communication
  uint32_t t0 = millis();
  int ecoLido = 0;
  while (ecoLido < 5 && (millis() - t0 < 50)) {
    if (Serial2.available()) { Serial2.read(); ecoLido++; }
  }
  
  // Escuta resposta física da ECU: 0x83 0xF1 0x33 0xC1 [Key1] [Key2] [Checksum]
  uint8_t resp[32];
  int respLen = 0;
  t0 = millis();
  while(respLen < 32 && (millis() - t0 < 1000)) {
    if (Serial2.available()) {
      resp[respLen++] = Serial2.read();
      if (respLen >= 5 && resp[3] == 0xC1) {
        uint8_t cs = calcularChecksumKWP(resp, respLen - 1);
        if (cs == resp[respLen - 1]) {
          logMsg("  [K-LINE OK] ECU conectada via KWP2000!");
          return true;
        }
      }
      if (respLen >= 7 && resp[3] == 0xC1) {
        uint8_t cs = calcularChecksumKWP(resp, 6);
        if (cs == resp[6]) {
          logMsg("  [K-LINE OK] ECU conectada! Key Bytes: 0x" + String(resp[4], HEX) + " 0x" + String(resp[5], HEX));
          return true;
        }
      }
    }
  }
  logMsg("  [K-LINE FALHA] ECU não respondeu ao Start Communication.");
  return false;
}

void escanearBlocoSuporteKLine(uint8_t bloco) {
  logMsg("\n[K-LINE] Solicitando Bloco 0x" + String(bloco < 0x10 ? "0" : "") + String(bloco, HEX) + "...");
  digitalWrite(LED_PIN, HIGH);
  
  if (!enviarKWP(0x01, bloco)) {
    logMsg("  [K-LINE ERRO] Falha ao transmitir pacote KWP.");
    digitalWrite(LED_PIN, LOW);
    return;
  }
  
  uint8_t payload[32];
  int pLen = 0;
  if (receberKWP(payload, pLen, 0x01, bloco, 400)) {
    logMsg("  [K-LINE OK] Resposta de suporte recebida!");
    if (pLen >= 4) {
      uint8_t A = payload[0];
      uint8_t B = payload[1];
      uint8_t C = payload[2];
      uint8_t D = payload[3];
      logMsg("  Bitmap K-Line: " + String(A, HEX) + " " + String(B, HEX) + " " + String(C, HEX) + " " + String(D, HEX));
      
      for (int i = 1; i <= 32; i++) {
        uint8_t byteIdx = (i - 1) / 8;
        uint8_t bitIdx  = 7 - ((i - 1) % 8);
        uint8_t currentByte = payload[byteIdx];
        
        bool supported = (currentByte >> bitIdx) & 0x01;
        uint8_t mappedPid = bloco + i;
        
        if (supported) {
          supportedPIDs[mappedPid] = true;
          logMsg("   -> [APOIADO] 0x" + String(mappedPid < 0x10 ? "0" : "") + String(mappedPid, HEX) + " : " + getPIDDesc(mappedPid));
        }
      }
    }
  } else {
    logMsg("  [K-LINE AVISO] Bloco 0x" + String(bloco, HEX) + " não respondeu.");
  }
  digitalWrite(LED_PIN, LOW);
  delay(80);
}

void lerValorPIDKLine(uint8_t pid) {
  if (!enviarKWP(0x01, pid)) return;
  uint8_t payload[16];
  int pLen = 0;
  if (receberKWP(payload, pLen, 0x01, pid, 250)) {
    uint8_t A = payload[0];
    uint8_t B = payload[1];
    String valStr = "";
    float val = 0.0f;
    
    switch(pid) {
      case 0x0C:
        val = ((A * 256.0f) + B) / 4.0f;
        valStr = String(val, 0) + " RPM";
        break;
      case 0x0D:
        valStr = String(A) + " km/h";
        break;
      case 0x05:
        valStr = String(A - 40) + " °C";
        break;
      case 0x0B:
        valStr = String(A) + " kPa";
        break;
      case 0x10:
        val = ((A * 256.0f) + B) / 100.0f;
        valStr = String(val, 2) + " g/s";
        break;
      case 0x11:
      case 0x49:
      case 0x2F:
      case 0x52:
        val = A * 100.0f / 255.0f;
        valStr = String(val, 1) + " %";
        break;
      case 0x42:
        val = ((A * 256.0f) + B) / 1000.0f;
        valStr = String(val, 2) + " V";
        break;
      case 0x3C:
        val = ((A * 256.0f) + B) / 10.0f - 40.0f;
        valStr = String(val, 1) + " °C";
        break;
      case 0x5E:
        val = ((A * 256.0f) + B) / 20.0f;
        valStr = String(val, 2) + " L/h";
        break;
      default:
        char hex[32];
        snprintf(hex, sizeof(hex), "0x%02X 0x%02X", A, B);
        valStr = "RAW: " + String(hex);
        break;
    }
    logMsg("  * K-Line 0x" + String(pid < 0x10 ? "0" : "") + String(pid, HEX) + " -> " + valStr);
  } else {
    logMsg("  * K-Line 0x" + String(pid < 0x10 ? "0" : "") + String(pid, HEX) + " -> SEM RESPOSTA");
  }
}

void executarVarreduraKLine() {
  logMsg("\n========================================================");
  logMsg(" INICIANDO MAPEAMENTO AUTOMATIZADO K-LINE (ISO 14230)");
  logMsg("========================================================");
  
  memset(supportedPIDs, 0, sizeof(supportedPIDs));
  
  escanearBlocoSuporteKLine(0x00);
  
  if (supportedPIDs[0x20]) escanearBlocoSuporteKLine(0x20);
  if (supportedPIDs[0x40]) escanearBlocoSuporteKLine(0x40);
  if (supportedPIDs[0x60]) escanearBlocoSuporteKLine(0x60);
  if (supportedPIDs[0x80]) escanearBlocoSuporteKLine(0x80);
  
  logMsg("\n========================================================");
  logMsg(" LISTAGEM RESUMIDA DE PIDS SUPORTADOS (K-LINE)");
  logMsg("========================================================");
  int count = 0;
  for (int pid = 1; pid < 256; pid++) {
    if (supportedPIDs[pid]) {
      count++;
      logMsg(" [" + String(count) + "] PID 0x" + String(pid < 0x10 ? "0" : "") + String(pid, HEX) + " - " + getPIDDesc(pid));
    }
  }
  logMsg("Total de PIDs lidos via K-Line: " + String(count));
  
  logMsg("\n========================================================");
  logMsg(" AMOSTRAGEM DE VALORES EM TEMPO REAL (K-LINE)");
  logMsg("========================================================");
  for (int pid = 1; pid < 256; pid++) {
    if (supportedPIDs[pid] && pid != 0x20 && pid != 0x40 && pid != 0x60 && pid != 0x80 && pid != 0xA0) {
      lerValorPIDKLine(pid);
      delay(50);
    }
  }

  logMsg("\n========================================================");
  logMsg(" LENDO CÓDIGOS DE FALHA (DTC) VIA K-LINE");
  logMsg("========================================================");
  uint8_t dtcModesK[2] = {0x03, 0x07};
  String dtcDescK[2] = {"DTC Confirmados (Modo 03)", "DTC Pendentes (Modo 07)"};
  
  for(int m = 0; m < 2; m++) {
    logMsg("Solicitando " + dtcDescK[m] + "...");
    if (enviarKWP_DTC(dtcModesK[m])) {
      uint8_t header[4];
      uint32_t t0 = millis();
      int b = 0;
      while(b < 3 && (millis() - t0 < 800)) {
        if(Serial2.available()) header[b++] = Serial2.read();
      }
      if(b >= 3) {
        int dLen = header[0] & 0x3F;
        int headSize = 3;
        if(dLen == 0) {
           while(!Serial2.available() && millis()-t0 < 800);
           dLen = Serial2.read();
           header[3] = dLen;
           headSize = 4;
        }
        uint8_t dbuf[64];
        int l = 0;
        while(l < dLen + 1 && (millis() - t0 < 1000)) {
           if(Serial2.available()) dbuf[l++] = Serial2.read();
        }
        String raw = "  Raw RX: ";
        for(int i=0; i<headSize; i++) { if(header[i]<0x10) raw+="0"; raw += String(header[i],HEX) + " "; }
        for(int i=0; i<l; i++) { if(dbuf[i]<0x10) raw+="0"; raw += String(dbuf[i],HEX) + " "; }
        logMsg(raw);
      } else {
        logMsg("  Sem resposta para " + dtcDescK[m]);
      }
    }
  }

  logMsg("\n========================================================");
  logMsg(" MAPEAMENTO K-LINE CONCLUÍDO!");
  logMsg("========================================================");
}


// ── Consulta e Decodifica um bloco de suporte ───────────────────────────────
void escanearBlocoSuporte(uint8_t bloco) {
  logMsg("\n[SCAN] Solicitando Bloco 0x" + String(bloco < 0x10 ? "0" : "") + String(bloco, HEX) + "...");
  digitalWrite(LED_PIN, HIGH);
  
  if (!enviarOBD(0x01, bloco)) {
    logMsg("  [ERRO] Falha ao enviar requisição para o Bloco 0x" + String(bloco, HEX));
    digitalWrite(LED_PIN, LOW);
    return;
  }

  twai_message_t r;
  // Timeout estendido de 500ms para varredura de suporte estável
  if (receberResposta(&r, 0x01, bloco, 500)) {
    logMsg("  [OK] Resposta recebida da ECU!");
    
    // Mostra hex bruto retornado
    String raw = "  Raw RX: ";
    for (int i = 0; i < r.data_length_code; i++) {
      if (r.data[i] < 0x10) raw += "0";
      raw += String(r.data[i], HEX) + " ";
    }
    logMsg(raw);

    // Bytes de dados do bitmap: r.data[3], r.data[4], r.data[5], r.data[6]
    uint8_t A = r.data[3];
    uint8_t B = r.data[4];
    uint8_t C = r.data[5];
    uint8_t D = r.data[6];

    logMsg("  Bitmap decodificado: " + String(A, HEX) + " " + String(B, HEX) + " " + String(C, HEX) + " " + String(D, HEX));

    // Varre os 32 bits (PIDs correspondentes)
    for (int i = 1; i <= 32; i++) {
      uint8_t byteIdx = (i - 1) / 8;
      uint8_t bitIdx  = 7 - ((i - 1) % 8);
      uint8_t currentByte = r.data[3 + byteIdx];
      
      bool supported = (currentByte >> bitIdx) & 0x01;
      uint8_t mappedPid = bloco + i;

      if (supported) {
        supportedPIDs[mappedPid] = true;
        logMsg("   -> [APOIADO] 0x" + String(mappedPid < 0x10 ? "0" : "") + String(mappedPid, HEX) + " : " + getPIDDesc(mappedPid));
      }
    }
  } else {
    logMsg("  [AVISO] Sem resposta para o Bloco 0x" + String(bloco, HEX) + " (provavelmente não suportado)");
  }
  
  digitalWrite(LED_PIN, LOW);
  delay(100); // pequeno intervalo de proteção
}

// ── Consulta o valor em tempo real de um PID suportado ──────────────────────
void lerValorPID(uint8_t pid) {
  if (!enviarOBD(0x01, pid)) return;
  twai_message_t r;
  if (receberResposta(&r, 0x01, pid, 150)) {
    uint8_t A = r.data[3];
    uint8_t B = r.data[4];
    String valStr = "";
    float val = 0.0f;
    
    switch(pid) {
      case 0x0C: // RPM
        val = ((A * 256.0f) + B) / 4.0f;
        valStr = String(val, 0) + " RPM";
        break;
      case 0x0D: // Velocidade
        valStr = String(A) + " km/h";
        break;
      case 0x05: // Temperatura Água
        valStr = String(A - 40) + " °C";
        break;
      case 0x0B: // MAP
        valStr = String(A) + " kPa";
        break;
      case 0x10: // MAF
        val = ((A * 256.0f) + B) / 100.0f;
        valStr = String(val, 2) + " g/s";
        break;
      case 0x11: // Throttle Borboleta
      case 0x49: // Pedal real
      case 0x2F: // Nível de combustível
      case 0x52: // Etanol
        val = A * 100.0f / 255.0f;
        valStr = String(val, 1) + " %";
        break;
      case 0x42: // Tensão
        val = ((A * 256.0f) + B) / 1000.0f;
        valStr = String(val, 2) + " V";
        break;
      case 0x3C: // Catalisador
        val = ((A * 256.0f) + B) / 10.0f - 40.0f;
        valStr = String(val, 1) + " °C";
        break;
      case 0x5E: // Fuel Rate
        val = ((A * 256.0f) + B) / 20.0f;
        valStr = String(val, 2) + " L/h";
        break;
      default:
        // Exibe em Hex bruto os bytes retornados
        char hex[32];
        snprintf(hex, sizeof(hex), "0x%02X 0x%02X 0x%02X 0x%02X", r.data[3], r.data[4], r.data[5], r.data[6]);
        valStr = "RAW: " + String(hex);
        break;
    }
    logMsg("  * 0x" + String(pid < 0x10 ? "0" : "") + String(pid, HEX) + " -> " + valStr);
  } else {
    logMsg("  * 0x" + String(pid < 0x10 ? "0" : "") + String(pid, HEX) + " -> SEM RESPOSTA");
  }
}

// ── Executa a varredura e amostragem completa ────────────────────────────────
void executarVarreduraCompleta() {
  logMsg("\n========================================================");
  logMsg(" INICIANDO MAPEAMENTO AUTOMATIZADO J1979");
  logMsg("========================================================");
  
  // Zera cache local
  memset(supportedPIDs, 0, sizeof(supportedPIDs));

  // 1. Escaneia todos os blocos de suporte conhecidos
  escanearBlocoSuporte(0x00); // 0101-0120
  
  if (supportedPIDs[0x20]) {
    escanearBlocoSuporte(0x20); // 0121-0140
  }
  if (supportedPIDs[0x40]) {
    escanearBlocoSuporte(0x40); // 0141-0160
  }
  if (supportedPIDs[0x60]) {
    escanearBlocoSuporte(0x60); // 0161-0180
  }
  if (supportedPIDs[0x80]) {
    escanearBlocoSuporte(0x80); // 0181-01A0
  }
  if (supportedPIDs[0xA0]) {
    escanearBlocoSuporte(0xA0); // 01A1-01C0
  }

  logMsg("\n========================================================");
  logMsg(" LISTAGEM RESUMIDA DE PIDS SUPORTADOS");
  logMsg("========================================================");
  int count = 0;
  for (int pid = 1; pid < 256; pid++) {
    if (supportedPIDs[pid]) {
      count++;
      logMsg(" [" + String(count) + "] PID 0x" + String(pid < 0x10 ? "0" : "") + String(pid, HEX) + " - " + getPIDDesc(pid));
    }
  }
  logMsg("Total de PIDs anunciados pela ECU: " + String(count));

  logMsg("\n========================================================");
  logMsg(" AMOSTRAGEM DE VALORES EM TEMPO REAL");
  logMsg("========================================================");
  logMsg("Aguarde, colhendo amostra física dos PIDs suportados...");
  
  for (int pid = 1; pid < 256; pid++) {
    // Evita ler PIDs de bloco (suporte)
    if (supportedPIDs[pid] && pid != 0x20 && pid != 0x40 && pid != 0x60 && pid != 0x80 && pid != 0xA0 && pid != 0xC0) {
      lerValorPID(pid);
      delay(40); // intervalo amigável para não sobrecarregar
    }
  }

  // 2. Tenta obter os PIDs suportados do Modo 09 e o Chassi (VIN)
  logMsg("\n========================================================");
  logMsg(" EXTRAINDO INFORMAÇÃO DO VEÍCULO (MODO 09)");
  logMsg("========================================================");
  
  logMsg("Solicitando PIDs Suportados do Modo 09 (0900)...");
  if (enviarOBD(0x09, 0x00)) {
    twai_message_t r;
    if (receberResposta(&r, 0x09, 0x00, 300)) {
      logMsg("  [OK] Resposta recebida para 0900!");
      String raw0900 = "  Raw RX: ";
      for (int i = 0; i < r.data_length_code; i++) {
        if (r.data[i] < 0x10) raw0900 += "0";
        raw0900 += String(r.data[i], HEX) + " ";
      }
      logMsg(raw0900);
      
      uint8_t A = r.data[3];
      uint8_t B = r.data[4];
      uint8_t C = r.data[5];
      uint8_t D = r.data[6];
      logMsg("  Bitmap decodificado Modo 09: " + String(A, HEX) + " " + String(B, HEX) + " " + String(C, HEX) + " " + String(D, HEX));
    } else {
      logMsg("  Sem resposta para 0900 (PIDs suportados do Modo 09)");
    }
  }

  logMsg("Solicitando VIN (Chassi - 0902)...");
  if (enviarOBDFisico(0x09, 0x02)) {
    twai_message_t r;
    if (receberResposta(&r, 0x09, 0x02, 400)) {
      uint8_t vin[32];
      memset(vin, 0, sizeof(vin));
      int vinLen = 0;
      uint8_t frameType = (r.data[0] & 0xF0) >> 4;
      
      if (frameType == 0) {
        int length = r.data[0] & 0x0F;
        for (int i = 0; i < length - 3 && i < 17; i++) {
          vin[vinLen++] = r.data[3 + i];
        }
      } 
      else if (frameType == 1) {
        int totalLen = ((r.data[0] & 0x0F) << 8) | r.data[1];
        logMsg("  [ISO-TP] First Frame recebido! Tamanho do payload: " + String(totalLen) + " bytes.");
        
        // Em FF OBD2 Modo 9 PID 2: r.data[5..7] contêm os 3 primeiros bytes do VIN
        for (int i = 5; i < 8; i++) {
          vin[vinLen++] = r.data[i];
        }
        
        uint32_t rxId = r.identifier;
        uint32_t txFcId = 0;
        
        if (useExtendedCAN) {
          uint8_t target = (rxId >> 8) & 0xFF;
          uint8_t source = rxId & 0xFF;
          txFcId = 0x18DA0000 | (source << 8) | target;
        } else {
          txFcId = rxId - 8;
        }
        
        logMsg("  [ISO-TP] Enviando Flow Control para ID: 0x" + String(txFcId, HEX) + "...");
        twai_message_t fc;
        memset(&fc, 0, sizeof(fc));
        fc.identifier = txFcId;
        fc.extd = useExtendedCAN ? 1 : 0;
        fc.data_length_code = 8;
        fc.data[0] = 0x30; // Flow Control CTS
        fc.data[1] = 0x00; // Block Size = 0
        fc.data[2] = 0x00; // STmin = 0
        for (int j = 3; j < 8; j++) fc.data[j] = 0xAA;
        
        if (twai_transmit(&fc, pdMS_TO_TICKS(20)) == ESP_OK) {
          uint32_t tStart = millis();
          while (millis() - tStart < 800 && vinLen < 17) {
            twai_message_t cf;
            if (twai_receive(&cf, pdMS_TO_TICKS(5)) == ESP_OK) {
              if (cf.identifier == rxId) {
                uint8_t cfType = (cf.data[0] & 0xF0) >> 4;
                if (cfType == 2) { // Consecutive Frame
                  for (int k = 1; k < 8 && vinLen < 17; k++) {
                    vin[vinLen++] = cf.data[k];
                  }
                }
              }
            }
          }
        }
      }
      
      if (vinLen > 0) {
        String vinStr = "";
        for (int i = 0; i < vinLen; i++) {
          if (isprint(vin[i])) vinStr += (char)vin[i];
          else vinStr += '?';
        }
        logMsg("  ========================================");
        logMsg("  -> CHASSI/VIN DECODIFICADO: " + vinStr);
        logMsg("  ========================================");
      } else {
        logMsg("  [AVISO] Sem dados válidos do VIN.");
      }
    } else {
      logMsg("  Sem resposta para o VIN (0902)");
    }
  }

  // 3. Tenta obter o Ângulo do Volante e TPMS via UDS apenas se for Extended CAN (Onix)
  if (useExtendedCAN) {
    logMsg("\n========================================================");
    logMsg(" EXTRAINDO DIREÇÃO E VOLANTE VIA UDS (ABS/EBCM) [ONIX]");
    logMsg("========================================================");
    logMsg("Solicitando Sessão de Diagnóstico Estendida no ABS (10 03)...");
    if (enviarSessaoUDS(0x18DA28F1, 0x03)) {
      twai_message_t r;
      if (receberRespostaSessaoUDS(&r, 0x18DAF128, 0x03, 300)) {
        logMsg("  [OK] Sessão Estendida ABS Ativa!");
      } else {
        logMsg("  [AVISO] ABS não respondeu Sessão Estendida, tentando ler direto...");
      }
    }

    logMsg("Solicitando Ângulo do Volante (PID 0x2411)...");
    if (enviarUDS(0x18DA28F1, 0x2411)) {
      twai_message_t r;
      if (receberRespostaUDS(&r, 0x18DAF128, 0x2411, 300)) {
        logMsg("  [OK] Resposta de Volante Recebida!");
        String rawVol = "  Raw RX: ";
        for (int i = 0; i < r.data_length_code; i++) {
          if (r.data[i] < 0x10) rawVol += "0";
          rawVol += String(r.data[i], HEX) + " ";
        }
        logMsg(rawVol);
        
        uint8_t A = r.data[4];
        uint8_t B = r.data[5];
        float val = ((A * 256.0f + B) * 0.1f) - 3276.8f;
        logMsg("  -> Ângulo do Volante Decodificado: " + String(val, 1) + " graus");
      } else {
        logMsg("  Sem resposta para o Ângulo do Volante (0x2411) no ABS");
      }
    }

    logMsg("\n========================================================");
    logMsg(" EXTRAINDO PRESSÃO DE PNEUS (TPMS) VIA UDS (BCM) [ONIX]");
    logMsg("========================================================");
    logMsg("Solicitando Sessão de Diagnóstico Estendida na BCM (10 03)...");
    bool bcmSessionOk = false;
    if (enviarSessaoUDS(0x18DA40F1, 0x03)) {
      twai_message_t r;
      if (receberRespostaSessaoUDS(&r, 0x18DAF140, 0x03, 300)) {
        logMsg("  [OK] Sessão Estendida BCM Ativa!");
        bcmSessionOk = true;
      } else {
        logMsg("  [AVISO] BCM não respondeu Sessão Estendida, tentando ler...");
      }
    }

    uint16_t tpmsPids[4] = {0x281A, 0x281B, 0x281C, 0x281D};
    String tpmsNames[4] = {"Dianteiro Esquerdo (FL)", "Dianteiro Direito (FR)", "Traseiro Esquerdo (RL)", "Traseiro Direito (RR)"};

    for (int i = 0; i < 4; i++) {
      logMsg("Solicitando " + tpmsNames[i] + " (PID 0x" + String(tpmsPids[i], HEX) + ")...");
      if (enviarUDS(0x18DA40F1, tpmsPids[i])) {
        twai_message_t r;
        if (receberRespostaUDS(&r, 0x18DAF140, tpmsPids[i], 300)) {
          logMsg("  [OK] Resposta Recebida!");
          String rawT = "  Raw RX: ";
          for (int j = 0; j < r.data_length_code; j++) {
            if (r.data[j] < 0x10) rawT += "0";
            rawT += String(r.data[j], HEX) + " ";
          }
          logMsg(rawT);
          
          uint8_t A = r.data[4];
          float pressPsi = A * 0.145038f;
          logMsg("  -> Pressão Decodificada: " + String(pressPsi, 1) + " PSI (" + String(A) + " kPa)");
        } else {
          logMsg("  Sem resposta para o " + tpmsNames[i] + " (0x" + String(tpmsPids[i], HEX) + ")");
        }
      }
      delay(50);
    }
  } else {
    logMsg("\n========================================================");
    logMsg(" CONSULTAS UDS PROPRIETÁRIAS (ABS/TPMS) [OMITIDAS]");
    logMsg("========================================================");
    logMsg("  [INFO] Veículo 11-bit padrão detectado (ex: Honda Fit).");
    logMsg("  [INFO] As consultas UDS proprietárias do Chevrolet Onix 2026 foram omitidas.");
  }
  
  // 4. TESTE DE LEITURA DE ERROS (DTC) - MODO 03 E 07
  logMsg("\n========================================================");
  logMsg(" LENDO CÓDIGOS DE FALHA (DTC) - MODO 03 E 07");
  logMsg("========================================================");
  
  uint8_t dtcModes[2] = {0x03, 0x07};
  String dtcDesc[2] = {"DTC Confirmados (Modo 03)", "DTC Pendentes (Modo 07)"};

  for(int m = 0; m < 2; m++) {
    logMsg("Solicitando " + dtcDesc[m] + "...");
    twai_message_t tx;
    memset(&tx, 0, sizeof(tx));
    tx.identifier = useExtendedCAN ? 0x18DB33F1 : 0x7DF;
    tx.extd = useExtendedCAN ? 1 : 0;
    tx.data_length_code = 8;
    tx.data[0] = 0x01; // 1 byte de payload (o modo)
    tx.data[1] = dtcModes[m];
    for(int i=2; i<8; i++) tx.data[i] = 0xAA;
    
    if(twai_transmit(&tx, pdMS_TO_TICKS(20)) == ESP_OK) {
      uint32_t t0 = millis();
      bool respOk = false;
      while(millis() - t0 < 800) {
        twai_message_t r;
        if(twai_receive(&r, pdMS_TO_TICKS(10)) == ESP_OK) {
          bool ehResp = false;
          if (useExtendedCAN && r.extd && (r.identifier == 0x18DAF111 || (r.identifier & 0xFFFF0000) == 0x18DA0000)) ehResp = true;
          if (!useExtendedCAN && !r.extd && (r.identifier >= 0x7E8 && r.identifier <= 0x7EF)) ehResp = true;
          
          if(ehResp) {
            respOk = true;
            String rawD = "  Raw RX (ID " + String(r.identifier, HEX) + "): ";
            for (int j = 0; j < r.data_length_code; j++) {
              if (r.data[j] < 0x10) rawD += "0";
              rawD += String(r.data[j], HEX) + " ";
            }
            logMsg(rawD);
            
            // ISO-TP First Frame = payload multiquadro. Responde com Flow Control automático pra ECU descarregar tudo.
            if ((r.data[0] & 0xF0) == 0x10) {
              logMsg("  [ISO-TP] Multi-frame detectado, mandando Flow Control...");
              uint32_t txFcId = 0;
              if (useExtendedCAN) {
                uint8_t tgt = (r.identifier >> 8) & 0xFF;
                uint8_t src = r.identifier & 0xFF;
                txFcId = 0x18DA0000 | (src << 8) | tgt;
              } else {
                txFcId = r.identifier - 8;
              }
              twai_message_t fc;
              memset(&fc, 0, sizeof(fc));
              fc.identifier = txFcId;
              fc.extd = useExtendedCAN ? 1 : 0;
              fc.data_length_code = 8;
              fc.data[0] = 0x30; fc.data[1] = 0x00; fc.data[2] = 0x00;
              for(int i=3; i<8; i++) fc.data[i] = 0xAA;
              twai_transmit(&fc, pdMS_TO_TICKS(20));
            }
          }
        }
      }
      if(!respOk) logMsg("  Sem resposta para " + dtcDesc[m]);
    }
  }

  logMsg("\n========================================================");
  logMsg(" MAPEAMENTO CONCLUÍDO COM SUCESSO!");
  logMsg("========================================================");
}

// ── SETUP ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  if(!SPIFFS.begin(true)){
    Serial.println("ERRO SPIFFS!"); 
    return;
  }

  Serial.println("\n==============================================");
  Serial.println(" PulseDash OBD2 Support Scanner | Onix 2026");
  Serial.println(" 'r' = LER log | 'e' = APAGAR log");
  Serial.println(" Sem input = INICIAR MAPEAMENTO NO CARRO");
  Serial.println("==============================================");

  // Janela de 5 segundos para comandos do usuário no PC
  unsigned long t0 = millis();
  while(millis() - t0 < 5000) {
    digitalWrite(LED_PIN, (millis() / 200) % 2);
    if(Serial.available()){
      char c = Serial.read();
      if(c == 'r' || c == 'R'){
        digitalWrite(LED_PIN, LOW);
        Serial.println("\n--- INÍCIO LOG DE MAPEAMENTO ---");
        File f = SPIFFS.open("/canlog.txt", "r");
        if(f){ 
          while(f.available()) Serial.write(f.read()); 
          f.close(); 
        } else {
          Serial.println("(Log vazio ou inexistente)");
        }
        Serial.println("\n--- FIM DO LOG ---");
        while(true) delay(1000);
      } else if(c == 'e' || c == 'E'){
        SPIFFS.remove("/canlog.txt");
        Serial.println("Log limpo com sucesso! Reinicie o ESP32.");
        while(true) delay(1000);
      }
    }
  }
  digitalWrite(LED_PIN, LOW);

  // Abre arquivo de log para escrita (append)
  logFile = SPIFFS.open("/canlog.txt", "a");
  if(!logFile){ 
    Serial.println("ERRO: Falha ao abrir canlog.txt para escrita!"); 
    return; 
  }

  logMsg("\n════════════════════════════════════════════════════════");
  logMsg(" NOVO LOG DE MAPEAMENTO - " + String(millis()) + " ms");
  logMsg("════════════════════════════════════════════════════════");

  // ── DETECÇÃO AUTOMÁTICA DE VELOCIDADE E PROTOCOLO (500K/250K - 11/29-bit) ─
  logMsg("\n[DETECÇÃO] Procurando protocolo OBD2 ativo...");
  bool detectado = false;
  uint32_t velocidades[2] = {500000, 250000};
  String nomesVel[2] = {"500kbps", "250kbps"};
  uint32_t baudDetectado = 500000;

  for (int v = 0; v < 2; v++) {
    uint32_t baud = velocidades[v];
    logMsg("  -> Testando barramento a " + nomesVel[v] + "...");
    
    if (!iniciarCAN(baud)) {
      logMsg("     [ERRO] Falha ao configurar driver CAN a " + nomesVel[v]);
      continue;
    }
    
    // Teste 1: 11-bit Standard (ID 0x7DF) na velocidade atual
    logMsg("     * Testando 11-bit Standard (ID 0x7DF)...");
    useExtendedCAN = false;
    for (int t = 0; t < 3; t++) {
      enviarOBD(0x01, 0x00);
      twai_message_t r;
      if (receberResposta(&r, 0x01, 0x00, 150)) {
        logMsg("     [SUCESSO] Protocolo OBD2 11-bit Standard Detectado a " + nomesVel[v] + "!");
        detectado = true;
        baudDetectado = baud;
        break;
      }
      delay(40);
    }
    
    if (detectado) break;

    // Teste 2: 29-bit Extended (ID 0x18DB33F1) na velocidade atual
    logMsg("     * Testando 29-bit Extended (ID 0x18DB33F1)...");
    useExtendedCAN = true;
    for (int t = 0; t < 3; t++) {
      enviarOBD(0x01, 0x00);
      twai_message_t r;
      if (receberResposta(&r, 0x01, 0x00, 150)) {
        logMsg("     [SUCESSO] Protocolo OBD2 29-bit Extended Detectado a " + nomesVel[v] + "!");
        detectado = true;
        baudDetectado = baud;
        break;
      }
      delay(40);
    }
    
    if (detectado) break;
  }

  if (!detectado) {
    logMsg("  [AVISO] Nenhuma ECU respondeu a 500kbps ou 250kbps via CAN.");
    logMsg("  [DETECÇÃO] Iniciando varredura K-Line (Pinos D4/D5)...");
    
    if (iniciarKLine()) {
      logMsg("  [SUCESSO] Protocolo K-Line (ISO 14230-4 KWP2000) Detectado!");
      executarVarreduraKLine();
    } else {
      logMsg("  [ERRO] Nenhuma ECU respondeu via CAN ou K-Line.");
      logMsg("  -> Mantendo driver CAN a 500kbps / 11-bit Standard para varredura cega.");
      useExtendedCAN = false;
      iniciarCAN(500000);
      executarVarreduraCompleta();
    }
  } else {
    logMsg("  [OK] Conexão estabelecida com sucesso a " + String(baudDetectado / 1000) + " kbps!");
    
    // 3. Handshake Tester Present rápido para a sessão
    logMsg("[HANDSHAKE] Enviando Tester Present...");
    uint8_t tp[8] = {0x02, 0x3E, 0x00, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA};
    twai_message_t tmp;
    memset(&tmp, 0, sizeof(tmp));
    tmp.identifier = useExtendedCAN ? 0x18DB33F1 : 0x7DF; 
    tmp.extd = useExtendedCAN ? 1 : 0; 
    tmp.data_length_code = 8;
    memcpy(tmp.data, tp, 8);
    twai_transmit(&tmp, pdMS_TO_TICKS(10));
    delay(100);

    // 2. Executa varredura total
    executarVarreduraCompleta();
  }

  // Finaliza tudo de forma limpa
  twai_stop();
  twai_driver_uninstall();
  Serial2.end(); // Fecha a linha Serial K-Line se estivesse aberta
  logFile.close();

  // LED pisca 3 vezes lento indicando conclusão
  blink(3, 400, 200);
  Serial.println("\n==============================================");
  Serial.println(" TESTE COMPLETO CONCLUÍDO!");
  Serial.println(" O LED apagou. Você já pode desligar do carro.");
  Serial.println(" Conecte o ESP32 de volta no PC e digite 'r' para ler o log.");
  Serial.println("==============================================");
}

void loop() {}
