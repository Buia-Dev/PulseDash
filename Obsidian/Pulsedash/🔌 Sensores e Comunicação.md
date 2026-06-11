# 🔌 Sensores e Comunicação (CAN Bus + Bluetooth Edition)

> **Protocolo CAN:** CAN Bus 29-bit Extended Frame @ 500kbps (ou 11-bit padrão)  
> **Módulo CAN:** SN65HVD230 (TX=GPIO17, RX=GPIO16)  
> **Comunicação App:** Stream binário de 51 bytes via Bluetooth Classic RFCOMM (nome: `PULSESCAN`)
> **Veículo Alvo:** Onix 2026 (GM Security Gateway) / Multimarcas (Universal)

---

## 📡 Fluxo de Dados (v7.0)

```
┌─────────────────┐     CAN H/L      ┌───────────────────┐   BT RFCOMM   ┌──────────────────┐
│  ECU do Carro   │ ───────────────► │  SN65HVD230       │ ────────────► │  PulseDash APK   │
│  (11 ou 29-bit) │    500kbps       │  + ESP32 TWAI      │  51 bytes @   │  (Canvas 60fps)  │
│                 │                  │  (Core 0 Polling) │  20Hz (20ms)  │  (JIT Cache)     │
└─────────────────┘                  └───────────────────┘               └──────────────────┘
```

**Endereços Confirmados (Onix 2026 — 29-bit Extended):**

| Direção | Endereço | Descrição |
|:---|:---|:---|
| **TX (Request)** | `0x18DB33F1` | Broadcast OBD2 padrão SAE J1979 |
| **RX (Response)** | `0x18DAF111` | Resposta da ECU do Onix 2026 |

> ⚠️ **CRÍTICO:** O Onix 2026 **ignora frames de 11-bit**. Apenas o **modo Extended (29-bit)** funciona. Outros veículos (ex: Honda Fit) usam 11-bit padrão com PIDs genéricos OBD2.

---

## 🎛️ Sensores Confirmados (v7.0 — Todos Funcionais)

### Prioridade 1 (Consultados a 20Hz / Lidos a cada loop)
| Sensor | targetId | PID | Fórmula de Conversão | Status |
|:---|:---:|:---:|:---|:---:|
| **RPM** | 37 | `0x0C` | `((A*256)+B)/4` | ✅ OK |
| **Velocidade** | 81 | `0x0D` | `A` (km/h) | ✅ OK |

### Sensores Secundários (Scheduler Dinâmico baseado em `skipCount`)
| Sensor | targetId | PID Padrão | Fórmula OBD2 | Grupo | Status |
|:---|:---:|:---:|:---|:---|:---:|
| **Borboleta (TPS)** | 42 | `0x11` | `A*100/255` (%) | MOTOR | ✅ OK |
| **Pedal Real (APP)** | 49 | `0x49` | `A*100/255` (%) | MOTOR | ✅ OK |
| **Carga do Motor** | 100 | `0x04` | `A*100/255` (%) | MOTOR | ✅ OK |
| **MAP / Boost** | 31 | `0x0B` | `A` (kPa) | MOTOR | ✅ OK* |
| **MAF / Vazão Ar** | 16 | `0x10` | `((A*256)+B)/100` | MOTOR | ✅ OK |
| **Consumo (L/h)** | 236 | `0x5E` | `((A*256)+B)/20` | MOTOR | ✅ OK* |
| **Voltagem** | 12 | `0x42` | `((A*256)+B)/1000` (V) | SISTEMA | ✅ OK |
| **Temp. Água** | 14 | `0x05` | `A-40` (°C) | TEMPERATURA | ✅ OK |
| **Catalisador** | 38 | `0x3C` | `((A*256)+B)/10-40` (°C) | TEMPERATURA | ✅ OK |
| **Temp. Ar Externo** | 173 | `0x46` | `A-40` (°C) | TEMPERATURA | ✅ OK |
| **Nível Combustível** | 170 | `0x2F` | `A*100/255` (%) | SISTEMA | ✅ OK |
| **Etanol %** | 284 | `0x52` | `A*100/255` (%) | MOTOR | ✅ OK |

> \* MAP (`0x0B`) e Consumo (`0x5E`): quando a ECU não responde, o app usa **fallback virtual** calculado via TPS + Carga + RPM.

### Prioridade 2 (Novos Sensores Estendidos UDS / OBD2)
| Sensor | targetId | PID Padrão | Fórmula OBD2 | Grupo | Status |
|:---|:---:|:---:|:---|:---|:---:|
| **Pressão de Óleo** | 150 | `0x00` | `A/10` (bar) | MOTOR | ✅ OK |
| **Pressão Combust.** | 139 | `0x0A` | `A` (kPa) | MOTOR | ✅ OK |
| **Temp. Óleo** | 151 | `0x5C` | `A-40` (°C) | TEMPERATURA | ✅ OK |
| **Temp. Admissão IAT**| 27 | `0x0F` | `A-40` (°C) | TEMPERATURA | ✅ OK |
| **Temp. Escape EGT** | 96 | `0x78` | `(A*256)+B` (°C) | TEMPERATURA | ✅ OK |
| **Mistura AFR** | 54 | `0x44` | `A/10` (AFR) | PERFORMANCE | ✅ OK |
| **Sensor Lambda** | 166 | `0x24` | `A/100` (λ) | PERFORMANCE | ✅ OK |
| **Ponto de Ignição** | 35 | `0x0E` | `(A-128)/2` (°) | PERFORMANCE | ✅ OK |

---

## ⏱️ Scheduler Dinâmico de Polling (Fase 5 / v7.0)

O scheduler circular antigo de 10 slots fixos foi substituído por um **scheduler dinâmico baseado em skipCount**:
- O App envia o valor de `skipCount` adequado para cada sensor na string de configuração `CFG;...`.
- RPM e Velocidade têm `skipCount = 0` (são lidos em todos os ciclos de polling).
- Sensores prioritários (como Pedal e TPS) têm `skipCount = 2` ou `3` (lidos a cada 3 ou 4 ciclos).
- Sensores médios (como MAF e MAP) têm `skipCount = 9` (lidos a cada 10 ciclos).
- Sensores lentos (como Água, Voltagem, Catalisador, Nível de Combustível) têm `skipCount = 99` (lidos a cada 100 ciclos).
- O etanol tem `skipCount = 5999` (lido apenas a cada 5 minutos).

**Cooldown de Sensores Ausentes:**
- Se um sensor falhar consecutivamente por 5 vezes, ele entra em cooldown por 30s.
- Se acumular **50 falhas**, ele é desabilitado permanentemente na sessão (`cooldownUntil = 0xFFFFFFFF`) e salvo em `/unsupported.dat` na Flash do LittleFS.
- Nos boots/reconexões seguintes, a ESP32 tenta ler o sensor ausente apenas **1 vez**. Se falhar, é desativado na hora pela sessão, eliminando lag de timeouts na telemetria.

---

## 🔗 Handshake Dinâmico e Tester Present

O handshake agora é dinâmico a partir do perfil configurado:
- Envia o handshake definido pelo perfil (ex: UDS `10 03` ou OBD2 `01 00`).
- Se houver `testerPresent` configurado (`1` ou `0`), o firmware envia o frame `3E 00` a cada 2 segundos para manter a sessão de diagnóstico aberta na ECU.

---

**Links:** [[⚙️ Painel de Controle (Home)]] | [[🚀 Plano de Implementação ESP32-OBD2]] | [[🔧 Hardware e Pinagem]]  
**Tags:** #canbus #obd2 #esp32 #twai #pids #onix2026 #sensores #bluetooth #scheduler #uds #v70
