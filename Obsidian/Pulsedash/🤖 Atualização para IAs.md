# 🤖 Atualização para IAs

> Este arquivo é um resumo técnico rápido para "sincronizar" outras IAs com o estado atual do projeto PulseDash sem precisar ler toda a documentação.

---

## 📅 Última Atualização: 2026-06-09
**Versão Atual:** v6.9 — **COLEÇÃO DE AGULHAS & NATIVE BUILD** ✅

---

## ⚡ Status do Ambiente de Desenvolvimento

- **arduino-cli** instalado em `scratch/bin/arduino-cli.exe` — compila `.ino` direto pelo terminal.
- **Core ESP32:** `esp32:esp32@3.3.8` instalado em `AppData\Local\Arduino15`.
- **Java:** `C:\Program Files\Android\Android Studio\jbr\bin\java.exe` — usado para o Gradle.
- **Antigravity** consegue compilar APK e Firmware sem abrir nenhuma IDE.

---

## 🏗️ Arquitetura de Arquivos (v6.9)

```
PulseDash/PulseDash/data/
├── index.html        — Layout de widgets, modais, handling de erros
├── bar_arc_preview.html — Preview de 10 novos conceitos de arcos e barras
├── needle_preview.html  — Preview e catálogo das 16 agulhas
└── js/
    ├── state.js      — Sensores, CONFIG, agulhas (NEEDLES_CONFIG)
    ├── renderers.js  — Canvas Rendering, auto-escala (sf), 16 agulhas
    ├── editor.js     — Editor drag-and-drop, dropdown agrupado com <optgroup>
    ├── main.js       — Loop requestAnimationFrame
    ├── transport.js  — Bluetooth Serial RFCOMM e WebSocket fallback
    ├── perf.js       — Cronômetro 0-100, state machine, Top 5
    └── trip.js       — Computador de bordo (timers, odômetro, boia slosh)
```

**Regra de ouro:** A pasta `PulseDash/PulseDash/data` é o LABORATÓRIO. A pasta `PulseDash/PulseDashAPP` é o REPOSITÓRIO OFICIAL. Sempre sincronizar rodando `node sync.js` e `npx.cmd cap sync android` na pasta do APP.

---

## 🔌 Firmware (PulseDashESP_BT.ino)

**Protocolo:** CAN Bus 29-bit Extended @ 500kbps  
**Módulo:** SN65HVD230 (TX=GPIO17, RX=GPIO16)  
**Bluetooth:** `BluetoothSerial SerialBT` → nome `PULSESCAN`  
**Transmissão:** JSON linha por linha a ~33Hz via `SerialBT.println(buf)`  

**Endereços Onix 2026:**
- TX Request: `0x18DB33F1`
- RX Response: `0x18DAF111`
- UDS TX: `0x18DA11F1` → UDS RX: `0x18DAF111`

**Scheduler de 10 slots (50ms/ciclo):**
- Todo ciclo: RPM (`0x0C`) + Speed (`0x0D`)
- `loopCount % 2 == 0`: Borboleta (`0x11`) ou Pedal (`0x49`) alternados
- `loopCount % 10 == 0`: Carga (`0x04`) ou MAP (`0x0B`) alternados
- `loopCount % 2 == 1`: `slowIndex` rotaciona entre 10 sensores lentos (Fuel Rate, Coolant, TripDist, Volt, Ambient, Catalyst, FuelLevel, TransTemp, OilPres, OilTemp)
- Etanol: startup + cada 5min (300s)

**Compilação:**
```powershell
.\bin\arduino-cli.exe compile --fqbn esp32:esp32:esp32 "PulseDash v6.0\PulseDashESP_BT" --output-dir "APK\Firmware"
# Resultado: 85% flash, 12% RAM
```

---

## 📡 Protocolo de Comunicação App ↔ ESP32

**App → ESP32 (comandos):**
```json
{"cmd":"sync", "ts":1748000000}       // Sincroniza hora (Unix timestamp)
{"cmd":"perf", "payload":[...]}        // Salva Top 5 no LittleFS
{"cmd":"trip_reset"}                   // Zera o computador de bordo
```

**ESP32 → App (telemetria, ~33Hz):**
```json
{"rpm":1450,"speed":0,"throttle":24,"pedal":20,"load":15,"fuelRate":1.2,"boost":35.2,"coolant":87,"catalyst":420,"ambient":28,"ethanol":72,"voltage":13.8,"fuelLevel":47,"transTemp":72,"oilPres":2.3,"oilTemp":88,"tripDist":0,"tripFuel":0.000,"tripTimeTot":0,"tripTimeDri":0,"obd_state":4}
```

---

## 🐛 Bugs Conhecidos / Resolvidos em v6.2

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
