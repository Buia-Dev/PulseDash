# 🗂️ Estrutura de Arquivos (v5.1)

> O projeto PulseDash é dividido em dois sistemas independentes: o **Firmware ESP32** e o **Frontend Dashboard**.

---

## 📂 Estrutura Raiz do Repositório

```
gol_g1_dashboard/
├── PulseDashESP/              ← Firmware principal (Arduino IDE)
│   ├── PulseDashESP.ino       ← Código ESP32 v5.1 (CAN + WebServer)
│   └── data/                  ← Arquivos do LittleFS (upload via IDE)
│       ├── index.html         ← Esqueleto do dashboard
│       ├── style.css          ← Identidade visual completa
│       ├── manifest.json      ← PWA config (instalação no celular)
│       ├── sw.js              ← Service Worker (cache offline)
│       ├── icon-192.png       ← Ícone PWA pequeno
│       ├── icon-512.png       ← Ícone PWA grande
│       └── js/
│           ├── state.js       ← Estado global, sensores, config padrão
│           ├── renderers.js   ← Motor de renderização Canvas
│           ├── editor.js      ← Painel de edição e movimentação
│           └── main.js        ← Boot, loop principal, WebSocket
│
├── CAN_OBD2_Test/             ← Código de diagnóstico (confirmou 29-bit)
│   └── CAN_OBD2_Test.ino
│
├── CAN_Sniffer/               ← Modo LISTEN_ONLY (diagnóstico passivo)
│   └── CAN_Sniffer.ino
│
├── UART_Loopback_Test/        ← Teste de continuidade física dos cabos
│   └── UART_Loopback_Test.ino
│
└── Obsidian/                  ← Esta base de conhecimento
    └── Pulsedash/
```

---

## 🖥️ Frontend: `data/` (Servido pelo LittleFS)

### `index.html`
Esqueleto bruto. Contém:
- A `<div id="splash">` com a [[🚀 Animação de Inicialização|Animação de Boot]].
- A `<div id="app">` e os `<canvas>` das páginas.
- O modal do painel de edição (estrutura HTML dos controles).
- Importação dos scripts JS em ordem: `state.js` → `renderers.js` → `editor.js` → `main.js`.

### `style.css`
A identidade visual completa:
- **Tipografia:** Orbitron, Rajdhani, Oxanium, Teko (Google Fonts via CDN ou embed).
- **Variáveis:** `--roxo` e `--verde` controlam o tema neon/glow global.
- **Keyframes:** Animações dos meteoros, fade-in/out do splash, pulso do logo.

### `/js/state.js` — O Cérebro
- **`SENSORS_CONFIG`:** Dicionário com todos os sensores existentes, unidades e agrupamentos de leitura.
- **`ST`** (State Tree): Objeto global com número de página atual, dados recebidos da ECU, estado do editor, etc.
- **`CFG_DEF`:** Configuração padrão de fábrica dos widgets (usado no factory reset).

### `/js/renderers.js` — A Força Bruta
Exclusivamente funções de Canvas API:
- `drawArcoPuro()` — Arco com glow neon.
- `drawBarraPura()` — Barra linear ou curva com divisores.
- `drawAgulhaPura()` — 4 estilos de ponteiro.
- `drawReguaPura()` — Escala numérica auto-ajustável.
- `drawLuzEspia()` — Ícones de alerta SVG vetoriais.
- `drawNumeroPuro()` — Valor digital grande com fontes de cockpit.

### `/js/editor.js` — O Estúdio
- Constante `FIELD_MAP` com mapeamento de >40 propriedades configuráveis dos widgets.
- Gerencia `touchmove` / `mousemove` para arrastar widgets na tela.
- Controla o painel lateral de configurações em tempo real.

### `/js/main.js` — O Coração
- Roda `init()` após o splash de boot.
- Conecta ao WebSocket (porta 81) para receber telemetria em tempo real.
- Fallback para polling HTTP (`/dados`) a cada 1s se WebSocket falhar.
- Dispara o loop eterno `requestAnimationFrame` para renderização a 60fps.

---

## ⚙️ Firmware: `PulseDashESP.ino`

O arquivo único de firmware tem **~650 linhas** e está organizado em seções:

| Seção | Responsabilidade |
|:---|:---|
| `#include` e `#define` | Libs e constantes globais (pinos, WiFi, tamanhos) |
| `SensorData struct` | Container atômico de todos os valores de sensor |
| `canInit()` | Inicializa o driver TWAI |
| `canSendOBD()` | Envia frame CAN de requisição de PID |
| `canReadSensor()` | Envia PID e aguarda resposta (timeout 100ms) |
| `ledBlink()` | Linguagem de LED para diagnóstico |
| `obdTask()` | **Task FreeRTOS (Core 0):** Handshake + loop de leitura + EcoLog |
| `handleDados()` | HTTP GET `/dados` — JSON dos sensores |
| `handleBtConnect()` | HTTP GET `/bt/connect` — Liga/desliga CAN |
| `handleBtStatus()` | HTTP GET `/bt/status` — Estado do sistema |
| `setup()` | Boot: Serial, LittleFS, WiFi, rotas HTTP, WebSocket, task |
| `loop()` | **Core 1:** WebServer, WebSocket push 100ms, reconexão WiFi |

---

## 🔧 Arquivos de Diagnóstico (Histórico)

Estes arquivos foram usados durante o processo de investigação e **não precisam ser mantidos** no ESP32. São referências históricas:

| Arquivo | Para que serviu |
|:---|:---|
| `UART_Loopback_Test.ino` | Testou continuidade física dos fios do OBD2 |
| `CAN_Sniffer.ino` | Modo LISTEN_ONLY para espionar o barramento |
| `CAN_OBD2_Test.ino` | **CHAVE:** Foi aqui que confirmamos o endereço 29-bit `0x18DB33F1` |

---

**Links:** [[⚙️ Painel de Controle (Home)]] | [[🖥️ Interface e Widgets]] | [[🚀 Plano de Implementação ESP32-OBD2]]  
**Tags:** #estrutura #arquivos #modularizacao #firmware #frontend
