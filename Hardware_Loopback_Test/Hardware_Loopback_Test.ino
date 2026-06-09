#include <Arduino.h>
#include <SPIFFS.h>

#define KLINE_TX_PIN 4
#define KLINE_RX_PIN 5
#define LED_PIN 2

File logFile;

void logMsg(String msg) {
  Serial.println(msg);
  if (logFile) {
    logFile.println(msg);
    logFile.flush();
  }
}

void blink(int vezes, int delayTempo = 100) {
  for (int i = 0; i < vezes; i++) {
    digitalWrite(LED_PIN, HIGH); delay(delayTempo);
    digitalWrite(LED_PIN, LOW);  delay(delayTempo);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT); digitalWrite(LED_PIN, LOW);
  
  if(!SPIFFS.begin(true)){ Serial.println("ERRO SPIFFS!"); return; }
  
  Serial.println("\n==============================================");
  Serial.println("  TESTE DE LOOPBACK K-LINE (GRAVA NO LOG)");
  Serial.println(" 'r' = LER log | 'e' = APAGAR log");
  Serial.println(" Sem input = INICIAR TESTE CEGO");
  Serial.println("==============================================");

  // Aguarda 5 segundos para você digitar 'r' no PC antes de rodar o teste
  unsigned long t0 = millis();
  while(millis() - t0 < 5000) {
    digitalWrite(LED_PIN, (millis() / 200) % 2);
    if(Serial.available()){
      char c = Serial.read();
      if(c == 'r' || c == 'R'){
        digitalWrite(LED_PIN, LOW);
        Serial.println("\n--- INICIO LOG LOOPBACK ---");
        File f = SPIFFS.open("/loopbacklog.txt", "r");
        if(f){ while(f.available()) Serial.write(f.read()); f.close(); } 
        else { Serial.println("(Log vazio)"); }
        Serial.println("\n--- FIM DO LOG ---");
        while(true) delay(1000);
      } else if(c == 'e' || c == 'E'){
        SPIFFS.remove("/loopbacklog.txt");
        Serial.println("Log limpo com sucesso!");
        while(true) delay(1000);
      }
    }
  }
  digitalWrite(LED_PIN, LOW);

  // Abre log para gravação
  logFile = SPIFFS.open("/loopbacklog.txt", "a");
  if(!logFile){ Serial.println("ERRO: Falha loopbacklog.txt"); return; }
  
  pinMode(KLINE_TX_PIN, OUTPUT);
  pinMode(KLINE_RX_PIN, INPUT_PULLUP);
  
  logMsg("\n=======================================================");
  logMsg("  INICIANDO TESTE FÍSICO LOOPBACK NO CARRO");
  logMsg("=======================================================");
  
  // Pisca rapido pra voce saber que ele ta fazendo o teste
  blink(5, 50);

  // 1. Forca ALTO (TX = HIGH -> NPN Liga -> K-Line LOW)
  digitalWrite(KLINE_TX_PIN, HIGH);
  delay(100); 
  int readHigh = digitalRead(KLINE_RX_PIN);
  
  // 2. Forca BAIXO (TX = LOW -> NPN Desliga -> K-Line HIGH)
  digitalWrite(KLINE_TX_PIN, LOW);
  delay(100);
  int readLow = digitalRead(KLINE_RX_PIN);
  
  logMsg("-------------------------------------------------------");
  logMsg("Enviando sinal HIGH (1) na Base -> K-Line deve ir a 0V -> RX leu: " + String(readHigh == LOW ? "LOW [OK]" : "HIGH [ERRO]"));
  logMsg("Enviando sinal LOW  (0) na Base -> K-Line deve ir a 12V -> RX leu: " + String(readLow == HIGH ? "HIGH [OK]" : "LOW [ERRO]"));
  
  if (readHigh == LOW && readLow == HIGH) {
    logMsg("\n>>> SUCESSO! SEU CIRCUITO ESTA 100% FUNCIONANDO! <<<");
    logMsg("O ESP32 conversa com o modulo e os fios D4/D5 estao perfeitos.");
  } 
  else {
    logMsg("\n!!! FALHA NO HARDWARE DETECTADA !!!");
    logMsg("Causas mais provaveis:");
    logMsg("1. Fios invertidos (Inverta o D4 com o D5 na plaquinha e teste de novo no carro).");
    logMsg("2. Falta de 12V e GND corretos vindos da bateria do carro.");
  }
  
  logMsg("=======================================================\n");
  logFile.close();
  
  // Pisca longo indicando fim do teste. Pode desconectar do carro!
  blink(3, 1000);
}

void loop() {
  // Para a execucao, grava no log so uma vez ao plugar.
}
