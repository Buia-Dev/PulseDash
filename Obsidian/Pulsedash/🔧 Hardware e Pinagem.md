# 🔧 Hardware e Pinagem

> Este documento detalha toda a fiação física entre o ESP32, o módulo SN65HVD230 e o conector OBD2 do veículo.

**Ver protocolo:** [[🔌 Sensores e Comunicação]]  
**Ver firmware:** [[🚀 Plano de Implementação ESP32-OBD2]]

---

## 🧩 Componentes

| Componente | Modelo / Especificação | Tensão |
|:---|:---|:---:|
| MCU | ESP32 DevKit v1 (WROOM-32) | 3.3V |
| Transceiver CAN | **SN65HVD230** (módulo azul) | 3.3V |
| Conector OBD2 | J1962 Macho (16 pinos) | 12V |
| Regulador de Tensão | AMS1117 3.3V (ou similar) | 12V→3.3V |

> ⚠️ O SN65HVD230 é o módulo correto para 3.3V. **Não use o MCP2515 ou TJA1050** sem adaptação de nível lógico — eles são 5V e vão danificar o ESP32.

---

## 🔌 Pinagem do Conector OBD2 (J1962)

```
OBD2 Conector (Visão frontal — lado dos pinos)
 +-------------------------------------+
 |  1   2   3   4   5   6   7   8      |
 |  9  10  11  12  13  14  15  16      |
 +-------------------------------------+
```

| Pino OBD2 | Função | Conectar em |
|:---:|:---|:---|
| **4** | GND (Chassi) | GND do ESP32 (**OBRIGATÓRIO**) |
| **5** | GND (Sinal) | GND do ESP32 |
| **6** | **CAN-H** | Pino `CANH` do SN65HVD230 |
| **14** | **CAN-L** | Pino `CANL` do SN65HVD230 |
| **16** | +12V (Bateria) | Entrada do regulador 3.3V |

> ⚠️ **CRÍTICO — GND do Chassi (Pino 4/5):** Sem conectar o GND do OBD2 ao GND do ESP32, o sinal CAN não tem referência e **nenhuma comunicação acontece**. Este foi o principal problema de hardware durante os testes.

---

## 🔗 Conexão: SN65HVD230 → ESP32

| SN65HVD230 | ESP32 (GPIO) | Descrição |
|:---:|:---:|:---|
| `VCC` | `3.3V` | Alimentação |
| `GND` | `GND` | Terra comum |
| `TX` / `D` | **GPIO 17** | TX do TWAI (CAN_TX_PIN) |
| `RX` / `R` | **GPIO 16** | RX do TWAI (CAN_RX_PIN) |
| `CANH` | OBD2 Pino 6 | Linha CAN High |
| `CANL` | OBD2 Pino 14 | Linha CAN Low |

---

## 📋 Diagrama de Conexão (Texto)

```
OBD2 Port           SN65HVD230            ESP32
(Onix 2026)         (Modulo Azul)         (DevKit v1)

Pin 6 (CANH) ------  CANH
Pin14 (CANL) ------  CANL
                          TX (D)  --------  GPIO 17
                          RX (R)  --------  GPIO 16
                          VCC     --------  3.3V
Pin 4  (GND) ----------  GND     --------  GND
Pin 5  (GND) ----------
Pin16 (+12V) -- [AMS1117 3.3V] ----------  VIN
```

---

## ⚡ Alimentação

O ESP32 pode ser alimentado de duas formas:
1. **Via USB** (durante desenvolvimento/teste na mesa).
2. **Via OBD2 Pino 16 (12V)** → Regulador 3.3V → Pino `VIN` ou `3.3V` do ESP32 (no carro).

> O pino 16 do OBD2 tem corrente suficiente para o ESP32 + SN65HVD230. Não é necessário fonte externa.

---

## 🧪 Histórico de Problemas de Hardware

| Problema | Sintoma | Solução |
|:---|:---|:---|
| GND do chassi faltando | Driver inicia mas ECU nunca responde | Soldar fio no pino 4 ou 5 do OBD2 ao GND |
| Curto CAN-H / CAN-L | Bus-Off imediato após iniciar | Raspagem de pistas na PCB do conector OBD2 |
| GPIO queimado (antigo) | Pino D4/RX2 não respondia ao TWAI | Migração para GPIO 17/16 |
| Pinos invertidos | Driver inicia mas sem comunicação | Trocar TX/RX no #define do código |

---

**Links:** [[⚙️ Painel de Controle (Home)]] | [[🔌 Sensores e Comunicação]] | [[🚀 Plano de Implementação ESP32-OBD2]]  
**Tags:** #hardware #pinagem #esp32 #sn65hvd230 #obd2 #eletrica #can
