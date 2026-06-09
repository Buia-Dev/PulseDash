# 🗂️ Estrutura de Arquivos (v6.4)

> O projeto PulseDash é dividido em dois sistemas: o **Firmware ESP32** e o **App Android (APK via Capacitor)**.

---

## 📂 Estrutura Raiz do Repositório (Consolidado)

```
PulseDash/                     ← Pasta raiz do repositório
├── PulseDash/                 ← Pasta de código do Dashboard (Laboratório)
│   └── data/                  ← Assets da aplicação web
│       ├── index.html         ← Estrutura do dashboard + modais
│       ├── style.css          ← Identidade visual (60fps, GPU compositing)
│       ├── manifest.json      ← Configurações PWA
│       ├── sw.js              ← Service Worker (cache offline)
│       ├── needle_preview.html ← Preview e catálogo das 16 agulhas
│       ├── bar_arc_preview.html ← Preview dos 10 novos estilos de arcos/barras
│       └── js/
│           ├── state.js       ← Definições de agulhas (NEEDLES_CONFIG) e sensores
│           ├── renderers.js   ← Motor Canvas com auto-escala (sf) e rendering logic
│           ├── editor.js      ← Seletor Figma-like com <optgroup>
│           ├── utils.js       ← Funções utilitárias puras (toast, math)
│           ├── main.js        ← Loop principal requestAnimationFrame
│           ├── transport.js   ← Bluetooth Serial e WebSocket fallback
│           ├── perf.js        ← Cronômetro de performance 0-100
│           └── trip.js        ← Computador de bordo (timings, odômetro)
│
├── PulseDashAPP/              ← Projeto Capacitor (Android)
│   ├── www/                   ← Assets compilados e sincronizados
│   ├── android/               ← Projeto Android Studio (Gradle)
│   ├── sync.js                ← Script de sync, injeção do capacitor.js
│   └── package.json           ← Comandos de sync e build
│
├── PulseDashESP_BT/           ← Pasta de firmware do carro
│   └── PulseDashESP_BT.ino    ← Firmware ESP32 (CAN 29-bit + Bluetooth SPP)
│
├── APK/                       ← Pasta de distribuição dos executáveis
│   ├── PulseDashV6.9.apk      ← APK compilado da versão atual v6.9
│   └── Firmware/              ← Firmware .bin compilado para gravação
│
├── Obsidian/                  ← Documentação Obsidian (esta base de conhecimento)
│   └── Pulsedash/             ← Notas organizadas
```

> **Regra de ouro:** `PulseDash/PulseDash/data` é o laboratório de assets. O build deve ser sincronizado com o `PulseDashAPP` rodando `node sync.js` seguido por `npx.cmd cap sync android` na pasta `PulseDashAPP/`. O APK final é gerado por `.\gradlew.bat assembleDebug` e movido para `APK/`.

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
