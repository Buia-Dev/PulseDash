# 🚀 Firmware ESP32 — Arquitetura v6.4

> **Arquivo:** `PulseDash/PulseDashESP_BT/PulseDashESP_BT.ino`  
> **Plataforma:** ESP32 DevKit v1 (240 MHz Dual Core)  
> **SDK:** Arduino 3.3.8 / ESP-IDF v5.5.4  
> **Compilação:** 85% flash, 12% RAM (via arduino-cli)

---

## 🎯 Objetivo (v6.4)

ESP32 como **Gateway CAN Bus → Bluetooth Classic**, lendo dados nativamente da rede CAN do Onix 2026 via driver TWAI e transmitindo JSON para o App Android via RFCOMM a 20Hz.

---

## 🛠️ Hardware

| Componente | Especificação | Status |
|:---|:---|:---:|
| MCU | ESP32 DevKit v1 (WROOM-32) | ✅ Em uso |
| Transceiver CAN | **SN65HVD230** (plaquinha azul, 3.3V) | ✅ Em uso |
| Conector | OBD2 J1962 (16-pin macho) | ✅ Em uso |
| TX CAN | GPIO 17 | ✅ |
| RX CAN | GPIO 16 | ✅ |
| GND | **GND do chassi (pinos 4/5 do OBD2)** | ⚠️ CRÍTICO |

---

## ⏱️ Scheduler Circular de 10 Slots (Core 0)

Ciclo: **50ms (20Hz)**. A cada ciclo: RPM + Speed sempre + 1 sensor do slot atual.

```
Slot 0 → Borboleta (0x11)          Slot 5 → MAF (0x10)
Slot 1 → Carga (0x04)              Slot 6 → Pedal (0x49)
Slot 2 → Pedal (0x49)              Slot 7 → Consumo (0x5E)
Slot 3 → MAP/Boost (0x0B)          Slot 8 → Borboleta (0x11)
Slot 4 → Borboleta (0x11)          Slot 9 → Sensor Lento (rotaciona 7 sensores)
```

**Slot 9 — Sensores Lentos (~0.28Hz cada):**
```
slowIndex 0 → Voltagem (0x42)
slowIndex 1 → Temp. Água (0x05)
slowIndex 2 → Catalisador (0x3C)
slowIndex 3 → Temp. Ar (0x46)
slowIndex 4 → Nível Combustível (0x2F)
slowIndex 5 → Odômetro Trip (0x31)
slowIndex 6 → Etanol % (0x52)
```

**Timeout por PID:** 12ms (evita que 3 leituras/ciclo excedam 50ms).  
**Anti-starvation:** Substituiu o `if/else if` em cadeia que bloqueava sensores lentos.

---

## 📡 Bluetooth

| Parâmetro | Valor |
|:---|:---|
| Biblioteca | `BluetoothSerial.h` |
| Nome | `PulseScan` |
| Formato | JSON linha por linha via `SerialBT.println()` |
| Frequência TX | 20Hz (loop Core 1) |

**JSON transmitido:**
```json
{"rpm":1450,"speed":30,"throttle":24,"pedal":20,"load":35,"boost":95.2,"coolant":87,"catalyst":350,"ambient":28,"fuelLevel":47,"ethanol":72,"voltage":13.8,"fuelRate":3.2,"tripDist":28641,"maf":12.5,"obd_state":4}
```

> ⚠️ `tripDist` = km totais do odômetro do carro (PID 0x31), **não** km da viagem atual. O app calcula o delta subtraindo `initialOdometer`.

---

## 🔗 Handshake OBD2

```
1. Tester Present (0x3E 0x00) → aguarda 100ms
2. Solicita PIDs suportados (PID 0x00)
3. Aguarda resposta por 800ms
4. 10 tentativas → reinicia driver se falhar
5. Tester Present a cada 2s (mantém sessão ativa)
```

---

## 💻 Compilação via arduino-cli

```powershell
# Caminho do arduino-cli:
scratch/bin/arduino-cli.exe

# Compilar:
.\bin\arduino-cli.exe compile --fqbn esp32:esp32:esp32 "PulseDash\PulseDashESP_BT" --output-dir "APK\Firmware"

# Resultado: 85% flash, 12% RAM
# Binário: APK/Firmware/PulseDashESP_BT.ino.bin
```

---

## ⚠️ Desafios Técnicos Resolvidos

| Problema | Solução |
|:---|:---|
| ECU ignorava frames 11-bit | Usar Extended 29-bit (`0x18DB33F1`) |
| Bus-Off imediato | Curto físico nas pistas do PCB do conector OBD2 — raspagem manual |
| Sem resposta da ECU | Faltava GND do chassi (pinos 4/5 OBD2) |
| Starvation de sensores | Substituído if/else if por scheduler circular 10 slots |
| Lag de ciclo (>50ms) | Timeout de PID reduzido de 25ms para 12ms |
| MAP/Consumo congelados | Fallback recalcula via throttle+load+RPM a cada ciclo |

---

**Links:** [[⚙️ Painel de Controle (Home)]] | [[🔌 Sensores e Comunicação]] | [[🔧 Hardware e Pinagem]]  
**Tags:** #firmware #esp32 #freertos #twai #canbus #bluetooth #scheduler #v64
