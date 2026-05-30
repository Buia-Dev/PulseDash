# 🗂️ Estrutura de Arquivos (v6.4)

> O projeto PulseDash é dividido em dois sistemas: o **Firmware ESP32** e o **App Android (APK via Capacitor)**.

---

## 📂 Estrutura Raiz do Repositório (Laboratório)

```
PulseDash/
├── PulseDashESP/              ← Assets web do dashboard (Laboratório)
│   └── data/                  ← Copiado para o APK via sync.js
│       ├── index.html         ← Estrutura do dashboard + modais
│       ├── style.css          ← Identidade visual (30fps, GPU compositing)
│       ├── manifest.json      ← PWA config
│       ├── sw.js              ← Service Worker (cache offline)
│       ├── icon-192.png       ← Ícone PWA
│       ├── icon-512.png       ← Ícone PWA
│       └── js/
│           ├── state.js       ← Estado global, SENSORS_CONFIG, CFG_DEF
│           ├── renderers.js   ← Motor Canvas: arcos, barras, agulhas, luzes
│           ├── editor.js      ← Editor drag-and-drop, FIELD_MAP
│           ├── utils.js       ← Funções utilitárias puras (toast, conversores)
│           ├── main.js        ← Loop rAF 30fps, OBD overlay, orientação
│           ├── transport.js   ← Bluetooth Serial, saveToESP, loadFromESP
│           ├── perf.js        ← Cronômetro 0-100, state machine, Top 5
│           └── trip.js        ← Computador de bordo (dist, fuel, timers)
│
├── CAN_OBD2_Test/             ← Diagnóstico histórico (confirmou 29-bit)
├── CAN_Sniffer/               ← Modo LISTEN_ONLY
├── UART_Loopback_Test/        ← Teste de continuidade física
└── Obsidian/                  ← Esta base de conhecimento
    └── Pulsedash/
```

---

## 📂 Repositório Oficial (PulseDash v6.0)

```
PulseDash v6.4/                ← REPOSITÓRIO OFICIAL
├── PulseDashESP_BT/
│   └── PulseDashESP_BT.ino   ← Firmware ESP32 (CAN + Bluetooth RFCOMM)
├── PulseDashAPP/              ← Projeto Capacitor (Android)
│   ├── www/                   ← Assets sincronizados do laboratório
│   ├── android/               ← Projeto Android Studio (Gradle)
│   ├── sync.js                ← Script de sync + patches BT
│   └── package.json
└── app-debug.apk              ← APK mais recente (debug)
```

> **Regra de ouro:** `PulseDash` é o LABORATÓRIO. `PulseDash v6.4` é o REPOSITÓRIO OFICIAL. Sempre rodar `npm run android-sync` + `gradlew assembleDebug` ao finalizar sessão.

---

## 🖥️ Módulos JS (v6.2)

### `state.js` — O Cérebro
- `SENSORS_CONFIG`: todos os sensores, unidades e agrupamentos
- `ST`: estado global (página, dados ECU, editor, smooth)
- `CFG_DEF`: layout padrão de fábrica dos widgets

### `renderers.js` — A Força Bruta
Canvas API puro:
- `drawArcoPuro()`, `drawBarraPura()`, `drawAgulhaPura()`, `drawReguaPura()`
- `drawLuzEspia()`, `drawNumeroPuro()`, `drawEconometroClassico()`

### `editor.js` — O Estúdio
- `FIELD_MAP` com +40 propriedades configuráveis
- Drag-and-drop, grupos, layer picker, applyConfig

### `utils.js` — O Utilitário
- Armazena as funções puras independentes (`toast()`, helpers genéricos)
- Criado para quebrar a importação circular entre main, trip e transport

### `main.js` — O Coração
- Loop `requestAnimationFrame` throttled a **30fps** (33ms budget)
- Overlay OBD2, pill de status, frequência BT
- `swapOrientation()` para portrait/landscape independentes

### `transport.js` — A Comunicação
- Bluetooth Serial nativo (`cordova-plugin-bluetooth-serial`)
- WebSocket fallback (Wi-Fi)
- `saveToESP()`, `loadFromESP()`, `saveRecordes()`

### `perf.js` — O Cronômetro
- State machine: IDLE → WAIT_STOP → READY → RUNNING → DONE
- Split automático em 50, 100 km/h
- Top 5 persistido no localStorage

### `trip.js` — O Computador de Bordo
- Timers acumulados localmente (dt = 0.5s via setInterval 2Hz)
- Distância: delta do odômetro físico (PID `0x31`) desde `initialOdometer`
- Fallback por integração de velocidade se odômetro indisponível
- Consumo integrado via `fuelRate` (L/h → L)

---

## ⚙️ Firmware: `PulseDashESP_BT.ino`

| Seção | Responsabilidade |
|:---|:---|
| `canInit()` | Inicializa driver TWAI 29-bit @ 500kbps |
| `canSendOBD()` | Envia frame CAN de requisição de PID |
| `canReadSensor()` | Envia PID e aguarda resposta (timeout 12ms) |
| `obdTask()` | **Core 0:** Handshake + scheduler circular 10 slots |
| `loop()` | **Core 1:** JSON a 20Hz via `SerialBT.println()` |

---

**Links:** [[⚙️ Painel de Controle (Home)]] | [[🖥️ Interface e Widgets]] | [[🚀 Plano de Implementação ESP32-OBD2]]  
**Tags:** #estrutura #arquivos #modularizacao #firmware #frontend #android #capacitor
