# 🔌 Sensores e Comunicação (CAN Bus + Bluetooth Edition)

> **Protocolo CAN:** CAN Bus 29-bit Extended Frame @ 500kbps  
> **Módulo CAN:** SN65HVD230 (plaquinha azul)  
> **Comunicação App:** Bluetooth Classic RFCOMM (nome: `PulseScan`)
> **Veículo Alvo:** Onix 2026 (GM Security Gateway)

---

## 📡 Fluxo de Dados (v6.0)

```
┌─────────────────┐     CAN H/L      ┌───────────────────┐   BT RFCOMM   ┌──────────────────┐
│  Onix 2026 ECU  │ ───────────────► │  SN65HVD230       │ ────────────► │  PulseDash APK   │
│  (Rede CAN FD)  │    500kbps       │  + ESP32 TWAI      │  Bluetooth   │  (Canvas 30fps)  │
└─────────────────┘                  └───────────────────┘               └──────────────────┘
```

**Endereços Confirmados (Onix 2026 — 29-bit Extended):**

| Direção | Endereço | Descrição |
|:---|:---|:---|
| **TX (Request)** | `0x18DB33F1` | Broadcast OBD2 padrão SAE J1979 |
| **RX (Response)** | `0x18DAF111` | Resposta da ECU do Onix 2026 |

> ⚠️ **CRÍTICO:** O Onix 2026 **ignora frames de 11-bit**. Apenas o **modo Extended (29-bit)** funciona.

---

## 🎛️ Sensores Confirmados (v6.0 — Todos Funcionais)

| Sensor | PID | Fórmula | Slot/Freq | Status |
|:---|:---:|:---|:---:|:---:|
| **RPM** | `0x0C` | `((A*256)+B)/4` | Todo ciclo / 20Hz | ✅ OK |
| **Velocidade** | `0x0D` | `A` (km/h) | Todo ciclo / 20Hz | ✅ OK |
| **Borboleta (TPS)** | `0x11` | `A*100/255` (%) | Slots 0,4,8 / ~6.6Hz | ✅ OK |
| **Pedal Real (APP)** | `0x49` | `A*100/255` (%) | Slots 2,6 / ~4Hz | ✅ OK |
| **Carga do Motor** | `0x04` | `A*100/255` (%) | Slot 1 / ~2Hz | ✅ OK |
| **MAP / Boost** | `0x0B` | `A` (kPa) | Slot 3 / ~2Hz | ✅ OK* |
| **MAF / Vazão Ar** | `0x10` | `((A*256)+B)/100` | Slot 5 / ~2Hz | ✅ OK |
| **Consumo (L/h)** | `0x5E` | `((A*256)+B)/20` | Slot 7 / ~2Hz | ✅ OK* |
| **Voltagem** | `0x42` | `((A*256)+B)/1000` (V) | Slot lento 0 / ~0.28Hz | ✅ OK |
| **Temp. Água** | `0x05` | `A-40` (°C) | Slot lento 1 / ~0.28Hz | ✅ OK |
| **Catalisador** | `0x3C` | `((A*256)+B)/10-40` (°C) | Slot lento 2 / ~0.28Hz | ✅ OK |
| **Temp. Ar Externo** | `0x46` | `A-40` (°C) | Slot lento 3 / ~0.28Hz | ✅ OK |
| **Nível Combustível** | `0x2F` | `A*100/255` (%) | Slot lento 4 / ~0.28Hz | ✅ OK |
| **Odômetro (Trip)** | `0x31` | `(A*256)+B` (km) | Slot lento 5 / ~0.28Hz | ✅ OK |
| **Etanol %** | `0x52` | `A*100/255` (%) | Slot lento 6 / ~0.28Hz | ✅ OK |

> \* MAP (`0x0B`) e Consumo (`0x5E`): quando a ECU não responde, o app usa **fallback virtual** calculado via throttle + load + RPM. Recalcula a cada ciclo, nunca congela.

### ❌ Sensores Removidos (Não Suportados via OBD Modo 01)
- `Temp. Óleo` (`oilTemp`) — requer PID proprietário GM Service 22
- `Pressão Óleo` (`oilPres`) — idem
- `Temp. Câmbio` (`transTemp`) — idem
- `Potenciômetro` (test) — hardwired, não via OBD

---

## ⏱️ Scheduler Circular de 10 Slots (v6.0)

```
Ciclo: 50ms (20Hz)
Cada ciclo: RPM + Speed (sempre) + 1 sensor do slot atual

Slot 0 → Borboleta    Slot 5 → MAF
Slot 1 → Carga        Slot 6 → Pedal
Slot 2 → Pedal        Slot 7 → Consumo
Slot 3 → MAP/Boost    Slot 8 → Borboleta
Slot 4 → Borboleta    Slot 9 → Sensor Lento (rotaciona entre 7 sensores)
```

**Anti-starvation:** Antes do scheduler de slots, o código usava `if/else if` em cadeia. Borboleta e Pedal dominavam todos os ciclos, impedindo que Carga, MAP e sensores lentos fossem lidos. O scheduler circular garante que exatamente 1 sensor secundário é lido por ciclo, sem bloqueios.

**Timeout por PID:** 12ms (reduzido de 25ms para evitar que 3 leituras/ciclo excedam 50ms).

---

## 🔗 Handshake OBD2

```
1. [ESP32] Envia Tester Present: {02 3E 00}  → aguarda 100ms para ECU acordar
2. [ESP32] Envia: {02 01 00}                 → solicita PIDs suportados
3. [ECU]   Responde: {06 41 00 ...}          → handshakeOk = true
4. [ESP32] Tester Present a cada 2s          → mantém sessão ativa
```
10 tentativas antes de reiniciar o driver TWAI.

---

## 📊 Dados Reais Capturados em Teste

```csv
tempo(s), rpm,  speed, throttle, coolant, voltage, fuel
5,        1359, 0,     23.9,     24,      11.62,   47
40,       1409, 0,     23.5,     30,      13.23,   46   ← Motor aquecendo
400,      3888, 86,    83.9,     87,      13.80,   23   ← 86 km/h
1250,     3280, 113,   42.4,     86,      12.62,   20   ← Máxima: 115 km/h
```

---

**Links:** [[⚙️ Painel de Controle (Home)]] | [[🚀 Plano de Implementação ESP32-OBD2]] | [[🔧 Hardware e Pinagem]]  
**Tags:** #canbus #obd2 #esp32 #twai #pids #onix2026 #sensores #bluetooth #scheduler
