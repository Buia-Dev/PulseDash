# 🚀 Firmware ESP32 — Arquitetura v7.0

> **Arquivo:** `PulseDash/PulseDashESP_BT/PulseDashESP_BT.ino`  
> **Plataforma:** ESP32 DevKit v1 (240 MHz Dual Core)  
> **SDK:** Arduino 3.3.8 / ESP-IDF v5.5.4  
> **Compilação:** 85% flash, 12% RAM (via arduino-cli)

---

## 🎯 Objetivo (v7.0)

ESP32 atuando como **Gateway CAN Bus ➔ Bluetooth Classic**, lendo dados em tempo real da rede CAN (11 ou 29-bit) via driver TWAI e transmitindo telemetria binária de 51 bytes para o App Android via SPP/RFCOMM a 20Hz.

---

## 🛠️ Hardware

| Componente | Especificação | Status |
|:---|:---|:---:|
| MCU | ESP32 DevKit v1 (WROOM-32) | ✅ Em uso |
| Transceiver CAN | **SN65HVD230** (3.3V) | ✅ Em uso |
| Conector | OBD2 J1962 (16-pin macho) | ✅ Em uso |
| TX CAN | GPIO 17 | ✅ |
| RX CAN | GPIO 16 | ✅ |
| GND | **GND do chassi (pino 4/5 do OBD2)** | ⚠️ CRÍTICO |

---

## ⏱️ Scheduler Dinâmico de Polling (Core 0 — obdTask)

A `obdTask` roda no **Core 0** (prioridade 5) e gerencia a fila de requisições OBD2. O loop principal roda a cada 50ms (20Hz):
- **Sensores Fixos:** RPM e Velocidade são consultados em todos os loops (skipCount = 0).
- **Sensores Secundários:** O scheduler varre os contadores `skipCounter` dos sensores ativos e seleciona o que possui a maior taxa de atraso (`ratio = skipCounter / (skipCount + 1)`). Apenas **1 sensor secundário** é consultado por loop para manter o frame rate de 20Hz livre de atrasos de rede.

**Controle de timeouts e falhas:**
- Timeout de leitura CAN de 25ms por PID.
- Se o sensor falhar consecutivamente: 5 falhas ➔ cooldown de 30 segundos; 50 falhas ➔ desativação permanente da sessão e gravação em `/unsupported.dat` no LittleFS.
- Sensores já desativados em arquivo na Flash sofrem apenas 1 tentativa rápida no boot e são desativados de imediato caso falhem.

---

## ⚙️ Arquitetura Assíncrona Antilag (Core 0 — fsTask)

Para evitar quedas de conexão ou lag no polling do CAN, as escritas em disco na Flash do LittleFS foram delegadas para uma task secundária dedicada:
- **`fsTask` (Core 0, prioridade 1):** Roda em loop infinito monitorando flags de sinalização. Quando uma flag é ativada, a task realiza a gravação em disco correspondente.
- **Flags e buffers de transferência:**
  - `saveTripPending`: Grava o backup de viagem diário `/trip_current.json`.
  - `saveUnsupportedPending`: Grava a lista de sensores ausentes `/unsupported.dat`.
  - `saveHistPending`: Grava o histórico de 7 dias `/trip_hist.json`.
  - `saveConfigPending`: Grava o arquivo de configuração de perfil `/car_profile.cfg`.
- **Prevenção de Fragmentação de RAM:** A montagem do histórico de 7 dias utiliza exclusivamente arrays de caracteres de tamanho fixo em stack (`char histBuffer[1024]`) com manipulação clássica de strings C (`snprintf`, `strcat`, `memmove`), evitando vazamentos e instabilidade do heap.

---

## 📡 Bluetooth Classic (Core 1 — loop)

O loop do Arduino roda no **Core 1** e gerencia o rádio Bluetooth Classic. O rádio aguarda conexões sob o nome `PULSESCAN`.
- Transmite frames de **51 bytes** a 20Hz.
- O processamento de comandos recebidos (como `"sync"`, `"price"`, `"CFG;"`) é executado imediatamente no Core 1. A escrita das configs no LittleFS é enviada à `fsTask` no Core 0 de forma assíncrona.

**Layout do Frame Binário de 51 bytes:**
- `[0..3]`: Headers de sincronização (`0x44, 0x33, 0x22, 0x11`)
- `[4]`: Tipo de pacote (`0x01` = Telemetria)
- `[5..22]`: RPM, Speed, TPS, Pedal, Load, FuelRate, Boost, Coolant, Catalyst, Ambient, Ethanol, Volt, FuelLevel
- `[23..38]`: Dados de viagem integrados na ESP32 (TripDist, TripFuel, TripTimeTot, TripTimeDri)
- `[39..47]`: oilPress, fuelPress, oilTemp, iat, egt (2 bytes), afr, lambda, timing
- `[48]`: obd_state
- `[49]`: loopMs
- `[50]`: Checksum (Soma simples mod 256 dos 50 bytes anteriores)

---

**Links:** [[⚙️ Painel de Controle (Home)]] | [[🔌 Sensores e Comunicação]] | [[🔧 Hardware e Pinagem]]  
**Tags:** #firmware #esp32 #freertos #twai #canbus #bluetooth #scheduler #v70 #astask
