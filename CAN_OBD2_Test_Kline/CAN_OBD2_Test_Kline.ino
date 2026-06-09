#include <Arduino.h>
#include <SPIFFS.h>

#define KLINE_TX_PIN 4
#define KLINE_RX_PIN 5
#define LED_PIN 2

File logFile;
bool supportedPIDs[256];
uint8_t currentTargetAddr = 0x33;

String getPIDDesc(uint8_t pid) {
  switch(pid) {
    case 0x01: return "Monitor status since DTCs cleared";
    case 0x02: return "Freeze DTC";
    case 0x03: return "Fuel system status";
    case 0x04: return "Calculated engine load";
    case 0x05: return "Engine coolant temp (Agua)";
    case 0x06: return "Short term fuel trim Bank 1";
    case 0x07: return "Long term fuel trim Bank 1";
    case 0x0B: return "Intake manifold absolute pressure (MAP)";
    case 0x0C: return "Engine RPM";
    case 0x0D: return "Vehicle speed";
    case 0x0E: return "Timing advance";
    case 0x0F: return "Intake air temp (IAT)";
    case 0x10: return "MAF air flow rate";
    case 0x11: return "Throttle position (Borboleta)";
    case 0x1F: return "Run time since engine start";
    case 0x21: return "Distance traveled with MIL on";
    case 0x2F: return "Fuel tank level input";
    case 0x31: return "Distance traveled since DTCs cleared";
    case 0x33: return "Absolute barometric pressure";
    case 0x3C: return "Catalyst temperature";
    case 0x42: return "Control module voltage";
    case 0x43: return "Absolute load value";
    case 0x45: return "Relative throttle position";
    case 0x46: return "Ambient air temp";
    case 0x49: return "Accelerator pedal position D";
    case 0x4A: return "Accelerator pedal position E";
    case 0x51: return "Fuel Type";
    case 0x52: return "Ethanol fuel %";
    case 0x5E: return "Engine fuel rate";
    default: return "Outro PID Padrao";
  }
}

void blink(int vezes, int delayTempo = 100) {
  for (int i = 0; i < vezes; i++) {
    digitalWrite(LED_PIN, HIGH); delay(delayTempo);
    digitalWrite(LED_PIN, LOW);  delay(delayTempo);
  }
}

void logMsg(String msg) {
  Serial.println(msg);
  if (logFile) {
    logFile.println(msg);
    logFile.flush();
  }
}

void klineFastInit() {
  Serial2.end();
  pinMode(KLINE_TX_PIN, OUTPUT);
  digitalWrite(KLINE_TX_PIN, HIGH); delay(300); 
  digitalWrite(KLINE_TX_PIN, LOW); delay(25);   
  digitalWrite(KLINE_TX_PIN, HIGH); delay(25);  
  Serial2.begin(10400, SERIAL_8N1, KLINE_RX_PIN, KLINE_TX_PIN);
  pinMode(KLINE_RX_PIN, INPUT_PULLUP);
}

void kline5BaudInit(uint8_t targetAddr) {
  Serial2.end();
  pinMode(KLINE_TX_PIN, OUTPUT);
  digitalWrite(KLINE_TX_PIN, HIGH); delay(300); 
  logMsg("     [5-BAUD] Enviando bit a bit o endereco 0x" + String(targetAddr, HEX) + "...");
  uint8_t bits[10];
  bits[0] = 0; 
  for (int i = 0; i < 8; i++) bits[1 + i] = (targetAddr >> i) & 0x01; 
  bits[9] = 1; 
  for (int i = 0; i < 10; i++) {
    digitalWrite(KLINE_TX_PIN, bits[i] ? HIGH : LOW);
    delay(200);
  }
  Serial2.begin(10400, SERIAL_8N1, KLINE_RX_PIN, KLINE_TX_PIN);
  pinMode(KLINE_RX_PIN, INPUT_PULLUP);
}

uint8_t calcularChecksumKWP(uint8_t* data, int len) {
  uint8_t sum = 0;
  for (int i = 0; i < len; i++) sum += data[i];
  return sum;
}

bool enviarKWP(uint8_t modo, uint8_t pid) {
  while(Serial2.available() > 0) Serial2.read();
  uint8_t packet[6];
  packet[0] = 0xC2; 
  packet[1] = currentTargetAddr; 
  packet[2] = 0xF1; 
  packet[3] = modo;
  packet[4] = pid;
  packet[5] = calcularChecksumKWP(packet, 5);
  int written = Serial2.write(packet, 6);
  Serial2.flush();
  uint32_t t0 = millis();
  int ecoLido = 0;
  while (ecoLido < 6 && (millis() - t0 < 50)) {
    if (Serial2.available()) { Serial2.read(); ecoLido++; }
  }
  return written == 6;
}

bool enviarKWP_DTC(uint8_t modo) {
  while(Serial2.available() > 0) Serial2.read();
  uint8_t packet[5];
  packet[0] = 0xC1; 
  packet[1] = currentTargetAddr; 
  packet[2] = 0xF1; 
  packet[3] = modo;
  packet[4] = calcularChecksumKWP(packet, 4);
  int written = Serial2.write(packet, 5);
  Serial2.flush();
  uint32_t t0 = millis();
  int ecoLido = 0;
  while (ecoLido < 5 && (millis() - t0 < 50)) {
    if (Serial2.available()) { Serial2.read(); ecoLido++; }
  }
  return written == 5;
}

bool receberKWP(uint8_t* payload, int &payloadLen, uint8_t modoEsperado, uint8_t pidEsperado, uint32_t timeoutMs) {
  uint8_t header[4];
  uint32_t t0 = millis();
  int bytesLidos = 0;
  while (bytesLidos < 3 && (millis() - t0 < timeoutMs)) {
    if (Serial2.available()) header[bytesLidos++] = Serial2.read();
  }
  if (bytesLidos < 3) return false;
  uint8_t format = header[0];
  uint8_t target = header[1];
  uint8_t source = header[2];
  if (target != 0xF1) return false; 
  int dataLen = format & 0x3F;
  if (dataLen == 0) {
    while (!Serial2.available() && (millis() - t0 < timeoutMs));
    if (!Serial2.available()) return false;
    dataLen = Serial2.read();
  }
  int totalParaLer = dataLen + 1;
  uint8_t dataBuf[64];
  int dadosLidos = 0;
  while (dadosLidos < totalParaLer && (millis() - t0 < timeoutMs)) {
    if (Serial2.available()) dataBuf[dadosLidos++] = Serial2.read();
  }
  if (dadosLidos < totalParaLer) return false;
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
  
  uint8_t respModo = dataBuf[0];
  uint8_t respPid = dataBuf[1];
  
  if (respModo == (modoEsperado + 0x40) && respPid == pidEsperado) {
    payloadLen = dataLen - 2;
    memcpy(payload, dataBuf + 2, payloadLen);
    return true;
  }
  return false;
}

void escanearBlocoSuporteKLine(uint8_t bloco) {
  logMsg("\n[SCAN] Solicitando Bloco 0x" + String(bloco < 0x10 ? "0" : "") + String(bloco, HEX) + "...");
  digitalWrite(LED_PIN, HIGH);
  if (!enviarKWP(0x01, bloco)) {
    logMsg("  [ERRO] Falha de transmissao KWP.");
    digitalWrite(LED_PIN, LOW); return;
  }
  uint8_t payload[32]; int pLen = 0;
  if (receberKWP(payload, pLen, 0x01, bloco, 400)) {
    logMsg("  [OK] Bloco recebido!");
    if (pLen >= 4) {
      logMsg("  Bitmap: " + String(payload[0], HEX) + " " + String(payload[1], HEX) + " " + String(payload[2], HEX) + " " + String(payload[3], HEX));
      for (int i = 1; i <= 32; i++) {
        uint8_t byteIdx = (i - 1) / 8;
        uint8_t bitIdx  = 7 - ((i - 1) % 8);
        bool supported = (payload[byteIdx] >> bitIdx) & 0x01;
        uint8_t mappedPid = bloco + i;
        if (supported) {
          supportedPIDs[mappedPid] = true;
          logMsg("   -> [SUPORTADO] 0x" + String(mappedPid < 0x10 ? "0" : "") + String(mappedPid, HEX) + " : " + getPIDDesc(mappedPid));
        }
      }
    }
  } else {
    logMsg("  [AVISO] Sem resposta para bloco 0x" + String(bloco, HEX));
  }
  digitalWrite(LED_PIN, LOW); delay(80);
}

void lerValorPIDKLine(uint8_t pid) {
  if (!enviarKWP(0x01, pid)) return;
  uint8_t payload[16]; int pLen = 0;
  if (receberKWP(payload, pLen, 0x01, pid, 250)) {
    uint8_t A = payload[0]; uint8_t B = payload[1];
    String valStr = ""; float val = 0.0f;
    switch(pid) {
      case 0x0C: valStr = String(((A * 256.0f) + B) / 4.0f, 0) + " RPM"; break;
      case 0x0D: valStr = String(A) + " km/h"; break;
      case 0x05: valStr = String(A - 40) + " C"; break;
      case 0x0B: valStr = String(A) + " kPa"; break;
      case 0x10: valStr = String(((A * 256.0f) + B) / 100.0f, 2) + " g/s"; break;
      case 0x11: case 0x49: case 0x2F: case 0x52: valStr = String(A * 100.0f / 255.0f, 1) + " %"; break;
      case 0x42: valStr = String(((A * 256.0f) + B) / 1000.0f, 2) + " V"; break;
      case 0x3C: valStr = String(((A * 256.0f) + B) / 10.0f - 40.0f, 1) + " C"; break;
      default: valStr = "RAW: 0x" + String(A, HEX) + " 0x" + String(B, HEX); break;
    }
    logMsg("  * PID 0x" + String(pid < 0x10 ? "0" : "") + String(pid, HEX) + " -> " + valStr);
  } else {
    logMsg("  * PID 0x" + String(pid < 0x10 ? "0" : "") + String(pid, HEX) + " -> FALHA");
  }
}

void executarVarreduraCompleta(uint8_t addr) {
  currentTargetAddr = addr;
  logMsg("\n========================================================");
  logMsg(" INICIANDO MAPEAMENTO DE SENSORES E ERROS DA ECU 0x" + String(addr, HEX));
  logMsg("========================================================");
  
  memset(supportedPIDs, 0, sizeof(supportedPIDs));
  
  escanearBlocoSuporteKLine(0x00);
  if (supportedPIDs[0x20]) escanearBlocoSuporteKLine(0x20);
  if (supportedPIDs[0x40]) escanearBlocoSuporteKLine(0x40);
  if (supportedPIDs[0x60]) escanearBlocoSuporteKLine(0x60);
  if (supportedPIDs[0x80]) escanearBlocoSuporteKLine(0x80);
  
  int count = 0;
  for (int i=1; i<256; i++) if (supportedPIDs[i]) count++;
  logMsg("\n -> Total de Sensores PIDs detectados: " + String(count));
  
  logMsg("\n========================================================");
  logMsg(" AMOSTRAGEM FISICA DOS SENSORES (REAL-TIME)");
  logMsg("========================================================");
  for (int pid = 1; pid < 256; pid++) {
    if (supportedPIDs[pid] && pid != 0x20 && pid != 0x40 && pid != 0x60 && pid != 0x80) {
      lerValorPIDKLine(pid); delay(50);
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
           header[3] = dLen; headSize = 4;
        }
        uint8_t dbuf[64]; int l = 0;
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
}

// ── Funções de Teste de Handshake ───────────────────────────────────────────
bool testarFastInit(uint8_t addr) {
  logMsg("\n--------------------------------------------------------");
  logMsg(" TENTANDO CONECTAR: FAST INIT (KWP2000) ALVO: 0x" + String(addr, HEX));
  logMsg("--------------------------------------------------------");
  klineFastInit();
  while(Serial2.available()) Serial2.read(); 
  
  uint8_t startCmd[5] = {0xC1, addr, 0xF1, 0x81, 0};
  startCmd[4] = calcularChecksumKWP(startCmd, 4);
  Serial2.write(startCmd, 5);
  Serial2.flush();
  
  uint32_t t0 = millis(); int ecoLido = 0;
  while(ecoLido < 5 && (millis() - t0 < 100)) {
    if(Serial2.available()) { Serial2.read(); ecoLido++; }
  }
  
  uint8_t resp[64]; int respLen = 0; t0 = millis();
  while(respLen < 64 && (millis() - t0 < 600)) {
    if (Serial2.available()) resp[respLen++] = Serial2.read();
  }
  
  if (respLen >= 5) {
    logMsg("  [OK] ECU RESPONDOU AO FAST INIT! CONEXÃO ESTABELECIDA!");
    executarVarreduraCompleta(addr);
    return true;
  }
  logMsg("  [FALHA] Sem resposta da ECU.");
  return false;
}

bool testar5BaudInit(uint8_t addr) {
  logMsg("\n--------------------------------------------------------");
  logMsg(" TENTANDO CONECTAR: 5-BAUD INIT (ISO9141/KWP1281) ALVO: 0x" + String(addr, HEX));
  logMsg("--------------------------------------------------------");
  kline5BaudInit(addr);
  
  uint8_t sync = 0, kb1 = 0, kb2 = 0;
  uint32_t t0 = millis();
  while(!Serial2.available() && (millis() - t0 < 2000));
  if(Serial2.available()) sync = Serial2.read();
  else { logMsg("  [FALHA] Sem Sync 0x55."); return false; }
  
  t0 = millis();
  while(Serial2.available() < 2 && (millis() - t0 < 1000));
  if(Serial2.available() >= 2) { kb1 = Serial2.read(); kb2 = Serial2.read(); }
  
  if (sync == 0x55) {
    logMsg("  [OK] Sync 0x55 e KeyBytes Recebidos! KB1: 0x" + String(kb1, HEX) + " KB2: 0x" + String(kb2, HEX));
    uint8_t invKb2 = ~kb2;
    delay(25); 
    Serial2.write(invKb2);
    
    t0 = millis();
    while(!Serial2.available() && (millis() - t0 < 100));
    if(Serial2.available()) Serial2.read();
    
    uint8_t invAddr = 0; t0 = millis();
    while(!Serial2.available() && (millis() - t0 < 1000));
    if(Serial2.available()) invAddr = Serial2.read();
    
    logMsg("  [SUCESSO] HANDSHAKE 5-BAUD CONCLUÍDO!");
    
    // Testa escanear PIDs
    executarVarreduraCompleta(addr);
    return true;
  }
  logMsg("  [FALHA] ECU retornou lixo: 0x" + String(sync, HEX));
  return false;
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT); digitalWrite(LED_PIN, LOW);
  if(!SPIFFS.begin(true)){ Serial.println("ERRO SPIFFS!"); return; }

  Serial.println("\n==============================================");
  Serial.println(" PulseDash SCANNER K-LINE DEDICADO (Siena / Gol)");
  Serial.println(" 'r' = LER log | 'e' = APAGAR log");
  Serial.println(" Sem input = INICIAR MAPEAMENTO");
  Serial.println("==============================================");

  unsigned long t0 = millis();
  while(millis() - t0 < 5000) {
    digitalWrite(LED_PIN, (millis() / 200) % 2);
    if(Serial.available()){
      char c = Serial.read();
      if(c == 'r' || c == 'R'){
        digitalWrite(LED_PIN, LOW);
        Serial.println("\n--- INÍCIO LOG KLINELOG ---");
        File f = SPIFFS.open("/klinelog.txt", "r");
        if(f){ while(f.available()) Serial.write(f.read()); f.close(); } 
        else { Serial.println("(Log vazio)"); }
        Serial.println("\n--- FIM DO LOG ---");
        while(true) delay(1000);
      } else if(c == 'e' || c == 'E'){
        SPIFFS.remove("/klinelog.txt");
        Serial.println("Log limpo com sucesso!");
        while(true) delay(1000);
      }
    }
  }
  digitalWrite(LED_PIN, LOW);

  logFile = SPIFFS.open("/klinelog.txt", "a");
  if(!logFile){ Serial.println("ERRO: Falha klinelog.txt"); return; }

  logMsg("\n════════════════════════════════════════════════════════");
  logMsg(" INICIANDO TESTE ISOLADO E MAPEAMENTO TOTAL DE K-LINE");
  logMsg("════════════════════════════════════════════════════════");

  uint8_t targets[] = {0x33, 0x10, 0x01, 0x11};
  int numTargets = 4;
  bool conectou = false;

  for(int i = 0; i < numTargets; i++) {
    if (testarFastInit(targets[i])) { conectou = true; break; }
    delay(1500);
  }

  if (!conectou) {
    for(int i = 0; i < numTargets; i++) {
      if (testar5BaudInit(targets[i])) { conectou = true; break; }
      delay(3000);
    }
  }

  if (!conectou) {
    logMsg("\n [ERRO FATAL] ECU nao respondeu a nenhum dos metodos de K-Line (Fast Init e 5-Baud).");
    logMsg(" Verifique se a chave esta em MAR (painel aceso) e as ligacoes RX/TX no pino 7 estao invertidas ou isoladas.");
  }

  logMsg("\n════════════════════════════════════════════════════════");
  logMsg(" MAPEAMENTO K-LINE CONCLUÍDO!");
  logMsg("════════════════════════════════════════════════════════");

  Serial2.end();
  logFile.close();
  blink(3, 400);
  Serial.println("Pode desligar e puxar os dados apertando 'r'!");
}

void loop() {}
