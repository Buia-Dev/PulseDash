# 🚗 Scan de Diagnóstico e Mapeamento — Fiat Siena 2016

Esta nota documenta os resultados obtidos na varredura OBD2 realizada no **Fiat Siena 2016 (Grand Siena / G4)** no dia **31 de Maio de 2026**. Esses dados guiaram a evolução do scanner universal PulseDash para suportar redes CAN lentas (250kbps).

---

## 🔌 Resultados do Teste Inicial (Sem Resposta)

No teste inicial, o veículo retornou **falha de comunicação**:
```text
[DETECÇÃO] Procurando protocolo OBD2 ativo...
  -> Testando 11-bit Standard (ID 0x7DF)...
  -> Sem resposta em 11-bit. Testando 29-bit Extended (ID 0x18DB33F1)...
  [AVISO] Nenhuma ECU respondeu ao handshake inicial (01 00).
```

### 🔍 Investigação e Diagnóstico Técnico
1. **Velocidade de Rede Incompatível:** A rede CAN do Siena 2016 pode estar operando no padrão de **250kbps** na porta de diagnósticos de Powertrain (alta velocidade) em vez de **500kbps** (o padrão do Onix e do Honda Fit). Como o firmware anterior estava fixo em 500k, o chip não conseguia sincronizar e dava timeout.
2. **Ignicão Fora de MAR (ON):** Se a chave não estava no segundo estágio (com o painel de instrumentos aceso), a ECU do motor fica inativa e não responde a comandos no barramento.
3. **GND de Chassi:** Sem um terra comum entre a porta OBD2 do Siena (pinos 4 ou 5) e o ESP32, o ruído elétrico impede a decodificação física dos sinais de rede diferenciados.

---

## ⚡ Upgrade de Firmware: Autodetect de Velocidade (250K vs 500K)

Para solucionar essa limitação, o firmware do scanner foi atualizado com um recurso de engenharia extremamente poderoso. O ESP32 agora executa uma **varredura dinâmica** no setup testando 4 combinações sequencialmente:

1. **500 kbps** ➔ **11-bit Standard** (ID `0x7DF`)
2. **500 kbps** ➔ **29-bit Extended** (ID `0x18DB33F1`)
3. **250 kbps** ➔ **11-bit Standard** (ID `0x7DF`)
4. **250 kbps** ➔ **29-bit Extended** (ID `0x18DB33F1`)

Se a ECU do Siena (ou qualquer outro carro) responder em qualquer uma dessas velocidades e formatos, o ESP32 fixa essa configuração e executa o mapeamento completo dos sensores e do VIN!

---

## 🏎️ Como Proceder para o Novo Teste

1. **Grave a nova versão do firmware** no ESP32.
2. Conecte o ESP32 na porta OBD2 do Siena 2016.
3. **Garantia de Ignição:** Certifique-se de que a chave do Siena está na **posição MAR (ON) com o painel aceso** (se o motor estiver ligado, melhor ainda!).
4. **Garantia de GND:** Confirme se o pino GND do ESP32 está conectado ao pino 4 ou 5 (Terra) da porta OBD2.
5. Ligue o monitor serial a 115200 bps e observe a mágica da autodetecção de velocidade e protocolo!
