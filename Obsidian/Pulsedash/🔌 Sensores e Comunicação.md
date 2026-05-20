# 🔌 Sensores e Comunicação (CAN Bus Edition)

> **Protocolo Atual:** CAN Bus 29-bit Extended Frame @ 500kbps  
> **Módulo CAN:** SN65HVD230 (plaquinha azul)  
> **Veículo Alvo:** Onix 2026 (GM Security Gateway)

A mágica do PulseDash agora acontece via **CAN Bus nativo**, lendo os dados diretamente da rede do veículo através do driver TWAI do ESP32, sem nenhum intermediário (ELM327 foi abandonado).

> **Ver hardware:** [[🔧 Hardware e Pinagem]]  
> **Ver firmware:** [[🚀 Plano de Implementação ESP32-OBD2]]

---

## 📡 Fluxo de Dados Real

```
┌─────────────────┐     CAN H/L      ┌───────────────┐    JSON/WS    ┌──────────────────┐
│  Onix 2026 ECU  │ ───────────────► │  SN65HVD230   │ ────────────► │  PulseDash App   │
│  (Rede CAN FD)  │    500kbps       │  + ESP32 TWAI  │   Wi-Fi LAN  │  (Canvas HTML5)  │
└─────────────────┘                  └───────────────┘               └──────────────────┘
```

**Endereços Confirmados (Onix 2026 — 29-bit Extended):**

| Direção | Endereço | Descrição |
|:---|:---|:---|
| **TX (Request)** | `0x18DB33F1` | Broadcast OBD2 padrão SAE J1979 |
| **RX (Response)** | `0x18DAF111` | Resposta da ECU do Onix 2026 |

> ⚠️ **CRÍTICO:** O Onix 2026 **ignora frames de 11-bit** (endereçamento padrão). Apenas o **modo Extended (29-bit)** com o endereço `0x18DB33F1` consegue comunicação.

---

## 🎛️ Sensores Ativos (PIDs Confirmados em Pista)

| Sensor | PID | Fórmula | Frequência | Status |
|:---|:---:|:---|:---:|:---:|
| **RPM** | `0x0C` | `((A*256)+B)/4` | ~8 Hz | ✅ OK |
| **Velocidade** | `0x0D` | `A` (km/h) | ~8 Hz | ✅ OK (Real/Corr) |
| **Borboleta (TPS)** | `0x11` | `A*100/255` (%) | ~8 Hz | ✅ OK |
| **Pedal Real (APP)** | `0x49` | `A*100/255` (%) | ~8 Hz | 🛠️ Planejado v5.2 |
| **Temperatura Água** | `0x05` | `A-40` (°C) | ~0.1 Hz | ✅ OK |
| **Tensão ECU** | `0x42` | `((A*256)+B)/1000` (V) | ~0.1 Hz | ✅ OK |
| **Nível Combustível** | `0x2F` | `A*100/255` (%) | **1.0 Hz** | ✅ Suavizado v5.2 |
| **Consumo Instant.** | `0x5E` | `((A*256)+B)/20` (L/h) | ~2 Hz | 🛠️ Planejado v5.2 |
| **Carga do Motor** | `0x04` | `A*100/255` (%) | ~5 Hz | 🛠️ Planejado v5.2 |
| **Pressão MAP (Boost)**| `0x0B` | `A` (kPa) | ~5 Hz | 🛠️ Planejado v5.2 |
| **Etanol %** | `0x52` | `A*100/255` (%) | ~0.5 Hz | 🛠️ Planejado v5.2 |
| **Temp. Catalisador** | `0x3C` | `((A*256)+B)/10-40` (°C) | ~0.5 Hz | 🛠️ Planejado v5.2 |
| **Força G** | `N/A` | Calculado (GPS/Acc) | 60 Hz | 🔜 Backlog |

### 🏎️ Widget Especial: Força G (G-Circle)
O sensor de Força G será implementado visualmente com um widget de "Círculo de Atrito":
- **Visual:** Uma bolinha branca que se desloca do centro conforme a aceleração.
- **Efeito Trail:** A bolinha deixará um rastro (fumaça/trail) que desaparece gradualmente.
- **Diferencial:** Permite analisar a transição de frenagem para curva (Trail Braking).

---

## 🔗 Protocolo e Handshake

### Sequência de Conexão (Handshake Agressivo v5.1)

O firmware tenta **10 vezes** antes de desistir e reiniciar o driver:

```
1. [ESP32] Envia: 0x18DB33F1 → {02 01 00 ...}   (PID 0x00: suporte)
2. [ECU]   Responde: 0x18DAF111 ← {06 41 00 ...} (Bitmap de PIDs suportados)
3. [ESP32] handshakeOk = true → Inicia loop de leitura
4. [ESP32] Tester Present: {02 3E 00} a cada 2 segundos (mantém sessão ativa)
```

### Frequências de Leitura (v5.1)

- **PIDs Rápidos (RPM, Speed, Throttle):** Loop a cada **20ms** (timeout 100ms por PID).
- **PIDs Lentos (Temp, Volt, Fuel, Ambient):** A cada **10 ciclos rápidos** (~10 segundos).

---

## 📊 Dados Reais Capturados em Teste

Trecho do log capturado em viagem real (`btlog.txt`):

```csv
tempo(s), rpm, speed(km/h), throttle(%), coolant(°C), voltage(V), fuel(%)
5,    1359, 0,  23.9, 24, 11.62, 47
40,   1409, 0,  23.5, 30, 13.23, 46   ← Motor aquecendo
400,  3888, 86, 83.9, 87, 13.80, 23   ← Alta rotação (86 km/h!)
1250, 3280, 113,42.4, 86, 12.62, 20   ← Velocidade máxima registrada: 115 km/h!
```

> **Nota:** A velocidade máxima registrada em teste foi **115 km/h** a **3.323 RPM**.

---

**Links:** [[⚙️ Painel de Controle (Home)]] | [[🚀 Plano de Implementação ESP32-OBD2]] | [[🔧 Hardware e Pinagem]]  
**Tags:** #canbus #obd2 #esp32 #twai #pids #onix2026 #sensores
