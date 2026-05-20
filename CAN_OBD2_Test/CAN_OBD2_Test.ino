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

// ── Inicializa TWAI CAN 29-bit a 500kbps ────────────────────────────────────
bool iniciarCAN() {
  twai_general_config_t g = TWAI_GENERAL_CONFIG_DEFAULT(
    (gpio_num_t)CAN_TX_PIN, (gpio_num_t)CAN_RX_PIN, TWAI_MODE_NORMAL);
  g.alerts_enabled = TWAI_ALERT_ALL;
  g.rx_queue_len   = 15;
  twai_timing_config_t t = TWAI_TIMING_CONFIG_500KBITS();
  twai_filter_config_t f = TWAI_FILTER_CONFIG_ACCEPT_ALL();
  if(twai_driver_install(&g, &t, &f) != ESP_OK) return false;
  if(twai_start() != ESP_OK){ twai_driver_uninstall(); return false; }
  return true;
}

// ── Transmite frame OBD2 ────────────────────────────────────────────────────
bool enviarOBD(uint8_t modo, uint8_t pid) {
  twai_message_t m;
  memset(&m, 0, sizeof(m));
  m.identifier = 0x18DB33F1; // Broadcast OBD2 29-bit
  m.extd = 1;
  m.data_length_code = 8;
  m.data[0] = 0x02; // 2 bytes de dados válidos adicionais
  m.data[1] = modo;
  m.data[2] = pid;
  return twai_transmit(&m, pdMS_TO_TICKS(20)) == ESP_OK;
}

// ── Escuta resposta específica da ECU ───────────────────────────────────────
bool receberResposta(twai_message_t* r, uint8_t modoEsperado, uint8_t pidEsperado, uint32_t timeoutMs) {
  uint32_t t0 = millis();
  while(millis() - t0 < timeoutMs) {
    if(twai_receive(r, pdMS_TO_TICKS(1)) == ESP_OK) {
      if(r->extd && r->identifier == 0x18DAF111) {
        if(r->data[1] == (modoEsperado + 0x40) && r->data[2] == pidEsperado) {
          return true;
        }
      }
    }
  }
  return false;
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
  if (enviarOBD(0x09, 0x02)) {
    twai_message_t r;
    if (receberResposta(&r, 0x09, 0x02, 300)) {
      String rawVIN = "  Raw VIN Frame: ";
      for (int i = 0; i < r.data_length_code; i++) {
        if (r.data[i] < 0x10) rawVIN += "0";
        rawVIN += String(r.data[i], HEX) + " ";
      }
      logMsg(rawVIN);
    } else {
      logMsg("  Sem resposta para o VIN (0902)");
    }
  }

  // 3. Tenta obter o Ângulo do Volante via UDS (ABS/EBCM no ID 0x18DA28F1 / 0x18DAF128)
  logMsg("\n========================================================");
  logMsg(" EXTRAINDO DIREÇÃO E VOLANTE VIA UDS (ABS/EBCM)");
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

  // 4. Tenta obter a Pressão de Pneu (TPMS) via UDS (BCM no ID 0x18DA40F1 / 0x18DAF140)
  logMsg("\n========================================================");
  logMsg(" EXTRAINDO PRESSÃO DE PNEUS (TPMS) VIA UDS (BCM)");
  logMsg("========================================================");
  
  logMsg("Solicitando Sessão de Diagnóstico Estendida na BCM (10 03)...");
  bool bcmSessionOk = false;
  if (enviarSessaoUDS(0x18DA40F1, 0x03)) {
    twai_message_t r;
    if (receberRespostaSessaoUDS(&r, 0x18DAF140, 0x03, 300)) {
      logMsg("  [OK] Sessão Estendida BCM Ativa!");
      bcmSessionOk = true;
    } else {
      logMsg("  [AVISO] BCM não respondeu Sessão Estendida, tentando ler de qualquer forma...");
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
    delay(50); // pausa amigável
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

  // Inicia driver CAN
  if(!iniciarCAN()) {
    logMsg("ERRO CRÍTICO: Falha ao iniciar controlador CAN/TWAI!");
    logFile.close();
    while(true) { blink(5, 50, 50); delay(500); }
  }
  logMsg("CAN 500kbps ... [OK]");

  // 1. Handshake inicial rápido
  logMsg("[HANDSHAKE] Enviando Tester Present...");
  uint8_t tp[8] = {0x02, 0x3E, 0x00, 0, 0, 0, 0, 0};
  twai_message_t tmp;
  memset(&tmp, 0, sizeof(tmp));
  tmp.identifier = 0x18DB33F1; 
  tmp.extd = 1; 
  tmp.data_length_code = 8;
  memcpy(tmp.data, tp, 8);
  twai_transmit(&tmp, pdMS_TO_TICKS(10));
  delay(100);

  // 2. Executa varredura total
  executarVarreduraCompleta();

  // Finaliza tudo de forma limpa
  twai_stop();
  twai_driver_uninstall();
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
