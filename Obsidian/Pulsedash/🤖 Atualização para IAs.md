# 🤖 Atualização para IAs

> Este arquivo é um resumo técnico rápido para "sincronizar" outras IAs com o estado atual do projeto PulseDash sem precisar ler toda a documentação.

---

## 📅 Última Atualização: 2026-06-11
**Versão Atual:** v7.0 — **UNIVERSAL OBD2 & BINARY TELEMETRY** ✅

---

## ⚡ Status do Ambiente de Desenvolvimento

- **arduino-cli** instalado em `scratch/bin/arduino-cli.exe` — compila `.ino` direto pelo terminal.
- **Core ESP32:** `esp32:esp32@3.3.8` instalado em `AppData\Local\Arduino15`.
- **Java:** `C:\Program Files\Android\Android Studio\jbr\bin\java.exe` — usado para o Gradle.
- **Antigravity** consegue compilar APK e Firmware sem abrir nenhuma IDE.

---

## 🏗️ Arquitetura de Arquivos (v7.0)

```
PulseDash/PulseDash/data/
    ├── index.html        — Layout de widgets, modal de configuração de veículo (#car-overlay)
    ├── bar_arc_preview.html — Preview de 10 novos conceitos de arcos e barras
    ├── needle_preview.html  — Preview e catálogo das 16 agulhas
    └── js/
        ├── state.js      — Sensores, CONFIG, agulhas, ST.car (dados de marca/modelo/perfil)
        ├── renderers.js  — Canvas Rendering, auto-escala (sf), 16 agulhas
        ├── editor.js     — Editor drag-and-drop, dropdown agrupado com <optgroup>
        ├── main.js       — Loop requestAnimationFrame (30fps cap), terminal DTC
        ├── transport.js  — Bluetooth Serial nativo (JIT cache de fórmulas via Map)
        ├── perf.js       — Cronômetro 0-100, state machine, Top 5
        ├── profiles_db.js — Banco de dados de 18 perfis OBD2/K-Line
        └── trip.js       — Computador de bordo (timers, delegação estática de cliques no histórico)
```

**Regra de ouro:** A pasta `PulseDash/PulseDash/data` é o LABORATÓRIO. A pasta `PulseDash/PulseDashAPP` é o REPOSITÓRIO OFICIAL. Sempre sincronizar rodando `node sync.js` e `npx.cmd cap sync android` na pasta do APP.

---

## 🔌 Firmware (PulseDashESP_BT.ino)

**Protocolo:** CAN Bus (TWAI) Dinâmico (Baudrate, IDs de TX/RX e PIDs configurados sob demanda via BT)  
**Módulo:** SN65HVD230 (TX=GPIO17, RX=GPIO16)  
**Bluetooth:** `BluetoothSerial SerialBT` → nome `PULSESCAN`  
**Transmissão:** Frame binário cru compacto de **51 bytes** a 20Hz via `SerialBT.write(buf, 51)`  

**Arquitetura Antilag (fsTask no Core 0):**
- As escritas lentas no LittleFS (salvamento de viagem, sensores não suportados, escrita de histórico no dia, perfil do carro) foram desacopladas do fluxo principal de telemetria. Elas rodam de forma assíncrona no Core 0 via flags (`saveTripPending`, `saveUnsupportedPending`, `saveHistPending`, `saveConfigPending`), liberando o loop CAN.
- Zeros strings dinâmicas no caminho de histórico: montagem em RAM do JSON de histórico de 7 dias refeita com buffer estático `char[1024]` e `snprintf` para extinguir a fragmentação do heap da ESP32.

**Handshake e Configuração Dinâmica:**
- Ao conectar, o App envia a string `CFG;[baud];[can_type];[tx_id];[rx_id];[tester];[handshake];[speed_formula];[fuel_formula];[sensores...]`.
- A ESP32 salva o perfil na partição LittleFS via `fsTask` e reinicia o driver TWAI (Baudrate e Filtros).
- O parser suporta PIDs de 16-bit e Modos Customizados (01, 21, 22) baseados no comprimento do hex string (2, 4 ou 6 chars).

**Fila de Polling (Escalonador por skipCount dinâmico):**
- RPM e Speed são consultados a cada ciclo (50ms). Os demais sensores secundários rodam com base nos contadores de pulo (`skipCount`) do perfil ativo.
- Sensores indisponíveis (50 falhas ou falha no boot) são gravados em `/unsupported.dat` na Flash e desligados da fila permanente da sessão.

---

## 📡 Protocolo de Comunicação App ↔ ESP32

**App → ESP32 (comandos):**
```text
CFG;500;29;18db33f1;18daf111;1;20;0;0;0d:1:0:0:0;11:1:2:0:1... // String de Configuração do veículo
{"cmd":"sync", "ts":1748000000}       // Sincroniza hora (Unix timestamp) e dispara histórico
{"cmd":"price", "val":5.89}           // Sincroniza preço do combustível
{"cmd":"trip_hist"}                   // Solicita histórico de viagens
```

**ESP32 → App (frame de telemetria binária de 51 bytes):**
- `[0..3]`: Headers de sincronização (`0x44, 0x33, 0x22, 0x11`)
- `[4]`: Tipo de pacote (`0x01` = Telemetria)
- `[5..22]`: P1 Sensores (RPM, Speed, TPS, Pedal, Load, FuelRate, Boost, Coolant, Catalyst, Ambient, Ethanol, Volt, FuelLevel)
- `[23..38]`: Dados de viagem integrados na ESP32 (TripDist, TripFuel, TripTimeTot, TripTimeDri)
- `[39..47]`: P2 Sensores (oilPress, fuelPress, oilTemp, iat, egt (2 bytes), afr, lambda, timing)
- `[48]`: Estado da conexão OBD2 (`obd_state`)
- `[49]`: Duração do loop CAN (`loopMs`)
- `[50]`: Checksum (Soma simples mod 256 dos 50 bytes anteriores)

---

## 🐛 Bugs Resolvidos em v7.0

| Bug | Causa | Status |
|:---|:---|:---:|
| `new Function()` JIT lag | Compilação de fórmulas dos sensores a 420x/s causava lag no WebView | ✅ RESOLVIDO (v7.0 - formulaCache Map) |
| Latência LittleFS no loop | Writes síncronos de arquivos travavam a serial por até 80ms | ✅ RESOLVIDO (v7.0 - fsTask no Core 0) |
| Vazamento no histórico | Criação iterativa de event listeners em trip history travava a RAM | ✅ RESOLVIDO (v7.0 - Event delegation) |
| Concorrência de digitação | Fechar e reabrir console de DTC acumulava e encavalava textos | ✅ RESOLVIDO (v7.0 - dtcTimers auto-clear) |
| Colisão de PIDs | Sensor de pressão de óleo lia dados errados de temp. de óleo | ✅ RESOLVIDO (v7.0 - PID default 00) |
| Brand hardcoded "Fiat" | Google DTC sempre buscava pela marca Fiat | ✅ RESOLVIDO (v7.0 - ST.car?.brand) |
| `QuotaExceededError` no DB | WebView quebrava ao salvar fotos por estouro de cota | ✅ RESOLVIDO (v7.0 - try/catch alert) |

---

## 🗂️ Localização dos Arquivos Oficiais

| Arquivo | Localização |
|:---|:---|
| APK de Release | `scratch/PulseDash/APK/PulseDashV7.0.apk` |
| Código ESP32 | `scratch/PulseDash/PulseDashESP_BT/PulseDashESP_BT.ino` |
| Laboratório Web | `scratch/PulseDash/PulseDash/data/` |
| Projeto Android | `scratch/PulseDash/PulseDashAPP/android/` |
