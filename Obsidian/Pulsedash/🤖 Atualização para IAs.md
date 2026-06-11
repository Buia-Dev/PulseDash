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
    ├── main.js       — Loop requestAnimationFrame, updateProfileOptions()
    ├── transport.js  — Bluetooth Serial RFCOMM (decoder binário + dynamic formula evaluator)
    ├── perf.js       — Cronômetro 0-100, state machine, Top 5
    ├── profiles_db.js — Banco de dados de 18 perfis OBD2/K-Line extraídos do RealDash
    └── trip.js       — Computador de bordo (timers, odômetro, boia slosh)
```

**Regra de ouro:** A pasta `PulseDash/PulseDash/data` é o LABORATÓRIO. A pasta `PulseDash/PulseDashAPP` é o REPOSITÓRIO OFICIAL. Sempre sincronizar rodando `node sync.js` e `npx.cmd cap sync android` na pasta do APP.

---

## 🔌 Firmware (PulseDashESP_BT.ino)

**Protocolo:** CAN Bus (TWAI) Dinâmico (Baudrate, IDs de TX/RX e PIDs configurados sob demanda via BT)  
**Módulo:** SN65HVD230 (TX=GPIO17, RX=GPIO16)  
**Bluetooth:** `BluetoothSerial SerialBT` → nome `PULSESCAN`  
**Transmissão:** Frame binário cru compacto de **42 bytes** a 20Hz via `SerialBT.write(buf, 42)`  

**Handshake e Configuração Dinâmica:**
- Ao conectar, o App envia a string `CFG;[baud];[can_type];[tx_id];[rx_id];[tester];[handshake];[speed_formula];[fuel_formula];[sensores...]`.
- A ESP32 salva o perfil na partição LittleFS (`/car_profile.cfg`) e reinicia o driver TWAI (Baudrate e Filtros).
- O parser suporta PIDs de 16-bit e Modos Customizados (01, 21, 22) baseados no comprimento do hex string (2, 4 ou 6 chars).

**Fila de Polling (Escalonador por skipCount):**
- Todo ciclo (50ms): Consulta o RPM dinâmico (`rpmPid` a `rpmMode`).
- Sensores Secundários: O scheduler seleciona o sensor mais atrasado e realiza no máximo 1 requisição secundária por loop. Sensores não suportados entram em cooldown de 30s.

**Compilação:**
```powershell
.\bin\arduino-cli.exe compile --fqbn esp32:esp32:esp32 "PulseDash v6.0\PulseDashESP_BT" --output-dir "APK\Firmware"
# Resultado: 85% flash, 12% RAM
```

---

## 📡 Protocolo de Comunicação App ↔ ESP32

**App → ESP32 (comandos):**
```text
CFG;500;29;18db33f1;18daf111;1;20;0;0;0d:1:0:0:0;11:1:2:0:1... // String de Configuração do veículo
{"cmd":"sync", "ts":1748000000}       // Sincroniza hora (Unix timestamp)
{"cmd":"price", "val":5.89}           // Sincroniza preço do combustível
{"cmd":"trip_hist"}                   // Solicita histórico de viagens
```

**ESP32 → App (frame de telemetria binária de 42 bytes):**
- `[0..3]`: Headers de sincronização (`0x44, 0x33, 0x22, 0x11`)
- `[4]`: Tipo de pacote (`0x01` = Telemetria)
- `[5..22]`: Bytes brutos de sensores (RPM, Speed, Throttle, Pedal, Load, FuelRate, Boost, Coolant, Catalyst, Ambient, Ethanol, Volt, FuelLevel)
- `[23..38]`: Dados reais de viagem integrados na ESP32 (TripDist, TripFuel, TripTimeTot, TripTimeDri)
- `[39]`: Estado da conexão OBD2 (`obd_state`)
- `[40]`: Duração do loop CAN (`loopMs`)
- `[41]`: Checksum (Soma simples mod 256 dos 41 bytes anteriores)

---

## 🐛 Bugs Conhecidos / Resolvidos em v7.0

| Bug | Causa | Status |
|:---|:---|:---:|
| `Script error. 0:0` ao conectar BT | WebView ES6 module isolation | ✅ RESOLVIDO (v6.2) |
| Relógios duplicam ao girar tela | `swapOrientation` limpava container inteiro | ✅ RESOLVIDO (v6.2) |
| Thermal Throttling e Lags no uso | Overhead de `ctx.shadowBlur` na CPU do mobile | ✅ RESOLVIDO (v6.3) |
| Silent Boot Crash | Dependência circular de ES6 Modules resolvida com `utils.js` | ✅ RESOLVIDO (v6.4) |
| Seleção impossível de widgets | Z-index bagunçado no clique; mudamos para colisão de área | ✅ RESOLVIDO (v6.5) |
| Lag brutal na animação de Start | `drop-shadow` em máscara de texto travava a GPU móvel | ✅ RESOLVIDO (v6.6) |

---

## 🗂️ Localização dos Arquivos Oficiais

| Arquivo | Localização |
|:---|:---|
| APK de Release | `scratch/PulseDash/APK/PulseDashV6.9.apk` |
| Firmware `.bin` | `scratch/PulseDash/APK/Firmware/PulseDashESP_BT.ino.bin` |
| Código ESP32 | `scratch/PulseDash/PulseDashESP_BT/PulseDashESP_BT.ino` |
| Laboratório Web | `scratch/PulseDash/PulseDash/data/` |
| Projeto Android | `scratch/PulseDash/PulseDashAPP/android/` |

---

**Dica para IA:** Para sincronizar e buildar:
1. Vá até `PulseDashAPP` e rode `node sync.js`.
2. Rode `npx.cmd cap sync android` (usar `.cmd` no Windows).
3. Vá até `PulseDashAPP/android` e rode `$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'; .\gradlew.bat assembleDebug`.
4. Copie o APK gerado de `app/build/outputs/apk/debug/app-debug.apk` para `APK/PulseDashV6.9.apk`.
