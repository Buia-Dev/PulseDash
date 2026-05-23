# 🤖 Atualização para IAs

> Este arquivo é um resumo técnico rápido para "sincronizar" outras IAs com o estado atual do projeto PulseDash sem precisar ler toda a documentação.

---

## 📅 Última Atualização: 2026-05-23
**Versão Atual:** v6.2 — **TESTADO NO CARRO** ✅

---

## ⚡ Status do Ambiente de Desenvolvimento

- **arduino-cli** instalado em `scratch/bin/arduino-cli.exe` — compila `.ino` direto pelo terminal.
- **Core ESP32:** `esp32:esp32@3.3.8` instalado em `AppData\Local\Arduino15`.
- **Java:** `C:\Program Files\Android\Android Studio\jbr\bin\java.exe` — usado para o Gradle.
- **Antigravity** consegue compilar APK e Firmware sem abrir nenhuma IDE.

---

## 🏗️ Arquitetura de Arquivos (v6.2)

```
gol_g1_dashboard/PulseDashESP/data/js/
├── state.js       — Sensores, CFG_DEF, LOCAL_IMAGES, SENSORS_CONFIG, ICONES_SVG
├── renderers.js   — Desenho Canvas: arcos, barras, agulhas, réguas, luzes espia
├── editor.js      — Editor drag-and-drop, FIELD_MAP, applyConfig, openPanel
├── main.js        — Loop rAF, OBD overlay, swapOrientation, variáveis globais
├── transport.js   — Bluetooth Serial nativo, saveToESP, loadFromESP, saveRecordes
├── perf.js        — Cronômetro 0-100, state machine, Top 5, histórico
└── trip.js        — Computador de bordo (distância, combustível, custo, timers)
```

**Regra de ouro:** A pasta `gol_g1_dashboard` é o LABORATÓRIO. A pasta `PulseDash v6.0` é o REPOSITÓRIO OFICIAL. Sempre sincronizar ao finalizar uma sessão de trabalho.

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
| `Script error. 0:0` ao conectar BT | WebView ES6 module isolation | ✅ RESOLVIDO |
| `_freqHz is not defined` no menu OBD | Variáveis perdidas na refatoração | ✅ RESOLVIDO |
| Relógios duplicam ao girar tela | `swapOrientation` limpava container inteiro | ✅ RESOLVIDO |
| Cores dos arcos voltavam ao salvar | `applyConfig` lia inputs `display:none` | ✅ RESOLVIDO |
| `}` faltando no `loop()` do .ino | Refatoração engoliu chave | ✅ RESOLVIDO |
| Ícones APK com XML corrompido | BOM UTF-8 nos arquivos XML | ✅ RESOLVIDO |

---

## 🗂️ Localização dos Arquivos Oficiais

| Arquivo | Localização |
|:---|:---|
| APK de Release | `scratch/APK/PulseDash_v6.2.apk` |
| Firmware `.bin` | `scratch/APK/Firmware/PulseDashESP_BT.ino.bin` |
| Código ESP32 | `scratch/PulseDash v6.0/PulseDashESP_BT/PulseDashESP_BT.ino` |
| Laboratório Web | `scratch/gol_g1_dashboard/PulseDashESP/data/` |
| Projeto Android | `scratch/PulseDash v6.0/PulseDashAPP/android/` |

---

**Dica para IA:** Sempre sincronizar `gol_g1_dashboard` → `PulseDash v6.0` ao finalizar sessão. Usar `npx cap sync android` antes de `gradlew assembleDebug`. JAVA_HOME = `C:\Program Files\Android\Android Studio\jbr`.
