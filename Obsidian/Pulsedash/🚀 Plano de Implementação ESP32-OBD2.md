# 🚀 Plano de Implementação: Firmware ESP32 v5.5

> **Arquivo:** `PulseDashESP/PulseDashESP.ino`  
> **Plataforma:** ESP32 DevKit v1 (ESP32-D0WD-Q5, Rev 3.01, 240 MHz)  
> **SDK:** Arduino 3.3.8 / ESP-IDF v5.5.4  
> **Esquema de Partição:** `huge_app` (App: 3MB, SPIFFS/LittleFS: 896KB)

---

## 🎯 Objetivo Atual (v5.5)

O ESP32 funciona como um **Gateway CAN→Wi-Fi**, conectando diretamente à rede CAN do veículo via driver TWAI nativo e disponibilizando os dados em tempo real. Na versão v5.5, o firmware implementa o **Escalonador Triplo Intercalado (Staggered Scheduler)** e a API física de recordes `/perf` para o cronômetro.

> ❌ **Sem Stuttering no RPM** — O loop de alta frequência CAN é blindado de qualquer latência.
> ✅ **Escalonador por Slots** — No máximo 1 sensor auxiliar é lido por ciclo do loop de CAN.
> ✅ **API /perf (LittleFS)** — Salvamento definitivo de arquivo de texto compactado `/perf.txt` no ESP32.

---

## 🛠️ Hardware Necessário

| Componente | Especificação | Status |
|:---|:---|:---:|
| MCU | ESP32 DevKit v1 (WROOM-32) | ✅ Em uso |
| Transceiver CAN | **SN65HVD230** (plaquinha azul, 3.3V) | ✅ Em uso |
| Conector | OBD2 J1962 (16-pin macho) | ✅ Em uso |
| Alimentação | 12V OBD2 (Pin 16) → regulador 3.3V | ✅ Em uso |

---

## 📐 Arquitetura do Firmware (Core 0 - obdTask)

O loop de leitura CAN executa fatias de tempo inteligentes para manter o jitter de transmissão abaixo de 15ms.

```
Frequência Rápida (VIP - ~60ms):
[RPM] -> [Speed] -> [Throttle] -> [Pedal] ──► Loop VIP (Sempre executado)

Frequência Média (1s) & Lenta (5s) (Slot Intercalado):
[VIP Cycle] -> [Slot Livre: Lê no MÁXIMO 1 sensor auxiliar] -> [VIP Cycle]
```

### Divisão de Slots do Escalonador (v5.5):
1. **Loop VIP (~60ms):** RPM (`0x0C`), Speed (`0x0D`), Throttle (`0x11`), Pedal (`0x49`).
2. **Loop Médio (1s):** Combustível (`0x2F`), Consumo (`0x5E`), Carga do Motor (`0x04`).
3. **Loop Lento (5s):** Temp. Água (`0x05`), Temp. Ambiente (`0x46`), Voltagem (`0x42`), Catalisador (`0x3C`), Boost (`0x0B`).
4. **Loop Ultra-Lento (Startup + 5min):** Etanol % (`0x52`) lido apenas uma vez no handshake OK e verificado a cada 300 segundos.

---

## ⏱️ Timings e Performance (v5.5)

| Parâmetro | Valor v5.1 | Valor v5.5 | Melhoria |
|:---|:---:|:---:|:---:|
| Jitter de RPM | ~120ms (pico) | **<15ms** | Sem micro-lag ou stuttering |
| Frequência PIDs VIP | ~5-8Hz | **~15-18Hz** | Ponteiros ultra-fluidos a 60fps |
| Slots de Escrita LittleFS | 1 Log (5s) | **1 Log + Top 5** | Sem travar a tarefa CAN principal |

---

## 💾 Sistema de Log & Recordes (LittleFS)

O firmware gerencia dois tipos de arquivos de texto persistentes na partição flash:

### 1. EcoLog (Telemetria CSV - `/btlog.txt`)
- Registra parâmetros a cada **5 segundos** em formato compacto.
- Limite: **600KB** com rotação de segurança.

### 2. Rank Top 5 Cronômetro (`/perf.txt` [Novo])
- Armazena os 5 melhores tempos de 0-100 km/h.
- Formato compactado para economizar flash: `DD/MM/YY 0a50 SS.XXX 0a100 SS.XXX`
- Manipulado pelo JS do dashboard e salvo via POST no ESP32.

---

## 🌐 Rotas HTTP Disponíveis (v5.5)

| Rota | Método | Descrição |
|:---|:---:|:---|
| `/` | GET | Dashboard principal (index.html) |
| `/dados` | GET | JSON com todos os sensores |
| `/bt/connect` | GET | Liga/desliga leitura CAN |
| `/bt/status` | GET | Estado atual + heap + uptime |
| `/log` | GET | Arquivo de log raw (texto) |
| `/console` | GET | Log formatado em HTML (auto-refresh 5s) |
| `/config` | GET/POST | Configurações dos widgets (JSON) |
| `/perf` | GET/POST | **[Novo]** Recupera/sobrescreve o ranking de recordes Top 5 |
| `/heap` | GET | Informações de memória |

---

## ⚠️ Desafios Técnicos Resolvidos na v5.5
- **Lag nos ponteiros:** Resolvido com o **Escalonador Intercalado por Slots**. A CPU nunca lê mais do que 1 PID auxiliar por ciclo VIP.
- **Cancelamento por Wheelspin:** Mudança da sensibilidade de aborto para queda brusca de 15 km/h no JS para aguentar destracionamento forte na largada.

---

**Links:** [[⚙️ Painel de Controle (Home)]] | [[🔌 Sensores e Comunicação]] | [[🔧 Hardware e Pinagem]]  
**Tags:** #firmware #esp32 #freertos #twai #canbus #littlefs #webserver #top5
