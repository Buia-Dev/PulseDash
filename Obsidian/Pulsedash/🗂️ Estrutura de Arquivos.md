# 🗂️ Estrutura de Arquivos (v7.0)

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
│           ├── state.js       ← Definições de agulhas, sensores e ST
│           ├── renderers.js   ← Motor Canvas com auto-escala (sf)
│           ├── editor.js      ← Seletor Figma-like com <optgroup>
│           ├── utils.js       ← Funções utilitárias puras (toast)
│           ├── main.js        ← Loop principal requestAnimationFrame (30fps cap)
│           ├── transport.js   ← Bluetooth Serial e JIT cache de formulas
│           ├── perf.js        ← Cronômetro de performance 0-100
│           ├── profiles_db.js ← Banco de dados de 18 perfis OBD2/UDS
│           └── trip.js        ← Computador de bordo (event delegation no histórico)
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
│   ├── PulseDashV7.0.apk      ← APK compilado da versão atual v7.0
│   └── Firmware/              ← Firmware .bin compilado para gravação
│
├── Obsidian/                  ← Documentação Obsidian (esta base de conhecimento)
│   └── Pulsedash/             ← Notas organizadas
```

> **Regra de ouro:** `PulseDash/PulseDash/data` é o laboratório de assets. O build deve ser sincronizado com o `PulseDashAPP` rodando `node sync.js` seguido por `npx.cmd cap sync android` na pasta `PulseDashAPP/`. O APK final é gerado por `.\gradlew.bat assembleDebug` e movido para `APK/`.

---

## 🖥️ Módulos JS (v7.0)

### `state.js` — O Cérebro
- `SENSORS_CONFIG`: todos os sensores, unidades e agrupamentos.
- `ST`: estado global (página, dados ECU, editor, smooth, disabledSensors).
- `CFG_DEF`: layout padrão de fábrica dos widgets.

### `renderers.js` — A Força Bruta
Canvas API puro:
- `drawArcoPuro()`, `drawBarraPura()`, `drawAgulhaPura()`, `drawReguaPura()`.
- `drawLuzEspia()`, `drawNumeroPuro()`. Sem shadowBlur para evitar superaquecimento.

### `editor.js` — O Estúdio
- Drag-and-drop, grupos, cores, dropdown agrupado com `<optgroup>`.

### `utils.js` — O Utilitário
- Armazena a função `toast()`. Resolveu as dependências circulares de ES6.

### `main.js` — O Coração
- Loop `requestAnimationFrame` throttled a **30fps** (33ms budget).
- Terminal DTC e cancelamento automático de timers de animação.

### `transport.js` — A Comunicação
- Bluetooth Serial nativo, parse de telemetria binária de 51 bytes.
- **JIT Cache:** Map local `formulaCache` para lookup rápido de fórmulas de sensores.

### `perf.js` — O Cronômetro
- State machine 0-100, split automático de tempos e histórico Top 5.

### `profiles_db.js` — Banco de Perfis
- Coleção de 18 perfis do RealDash estruturados para universalização de PIDs.

### `trip.js` — O Computador de Bordo
- Odômetro de viagem, integração de consumo em L/h, e delegação estática de cliques no histórico.

---

## ⚙️ Firmware: `PulseDashESP_BT.ino`

| Seção / Task | Responsabilidade |
|:---|:---|
| `canInit()` | Inicializa driver TWAI (Baudrate e Filtros) |
| `canReadSensorRaw()` | Envia requisição OBD2/UDS e trata NRCs (0x7F com 0x78 pending) |
| `obdTask()` | **Core 0 (prioridade 5):** Handshake + scheduler circular por skipCount dinâmico |
| `fsTask()` | **Core 0 (prioridade 1):** Escrita assíncrona na Flash via LittleFS (Antilag) |
| `loop()` | **Core 1 (prioridade 1):** Processa comandos Bluetooth e sincroniza dados |

---

**Links:** [[⚙️ Painel de Controle (Home)]] | [[🖥️ Interface e Widgets]] | [[🚀 Plano de Implementação ESP32-OBD2]]  
**Tags:** #estrutura #arquivos #modularizacao #firmware #frontend #android #capacitor #v70
