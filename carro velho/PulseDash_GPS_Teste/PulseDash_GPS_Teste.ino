#include <Arduino.h>

#define RXD2 16
#define TXD2 17

void setup() {
  Serial.begin(115200);
  
  // Inicia a comunicação física com os pinos do GPS
  Serial2.begin(9600, SERIAL_8N1, RXD2, TXD2);
  
  Serial.println("\n\n========================================================");
  Serial.println("   DIAGNOSTICO BRUTO DE HARDWARE (SEM BIBLIOTECAS) ");
  Serial.println("========================================================");
  Serial.println("Como ler os resultados que vao aparecer aqui embaixo:");
  Serial.println("1) NADA APARECE: O fio do pino 16 esta quebrado ou solto.");
  Serial.println("2) APARECE LIXO (????) ou quadrados: Os fios 16 e 17 estao invertidos ou tem curto-circuito na solda.");
  Serial.println("3) APARECE TEXTO COMEÇANDO COM '$GP': Sua solda e os fios estao 100% PERFEITOS!");
  Serial.println("========================================================\n");
}

void loop() {
  // Pega qualquer pulso elétrico que chegar no pino 16 e joga cru na tela
  while (Serial2.available()) {
    char c = Serial2.read();
    Serial.write(c);
  }
}
