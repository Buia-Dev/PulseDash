# 📱 App Android (APK)

> **Versão:** v6.0 | **Status:** ✅ FUNCIONAL  
> **Framework:** Capacitor 6 + cordova-plugin-bluetooth-serial  
> **Referência:** [[⚙️ Painel de Controle (Home)]] | [[🔌 Sensores e Comunicação]]

---

## 🏗️ Arquitetura

```
PulseDashAPP/
├── www/                    ← Assets web copiados de gol_g1_dashboard/PulseDashESP/data/
│   ├── index.html          ← HTML principal (patches injetados pelo sync.js)
│   ├── style.css           ← Estilos (30fps, GPU compositing, sem 1px bug)
│   └── js/
│       ├── state.js        ← Sensores, config default, SMOOTH_K
│       ├── main.js         ← Loop 30fps, WebSocket/BT fallback, computador de bordo
│       ├── renderers.js    ← Desenho Canvas (arcos, barras, agulhas, luzes espia)
│       └── editor.js       ← Editor de layout drag-and-drop
├── android/                ← Projeto Android Studio (Gradle)
└── sync.js                 ← Script que copia assets e injeta patches BT
```

---

## 🔧 Como o Sync Funciona

O `npm run android-sync` executa o `sync.js`, que:
1. Copia todos os arquivos de `gol_g1_dashboard/PulseDashESP/data/` → `www/`
2. Injeta `capacitor.js` no `index.html`
3. Injeta o inicializador condicional de Bluetooth no `main.js` via Regex
4. Anexa as funções `initBluetoothSerial()` e `readBluetoothLoop()` ao final do `main.js`
5. Roda `npx cap sync android` para copiar para o projeto Android

**Comando completo de build:**
```powershell
# No diretório PulseDashAPP:
npm run android-sync

# No diretório android/:
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
.\gradlew.bat assembleDebug --quiet
```

**APK gerado:** `android/app/build/outputs/apk/debug/app-debug.apk`  
**APK copiado:** `PulseDash v6.0/app-debug.apk`

---

## 📡 Comunicação Bluetooth

| Parâmetro | Valor |
|:---|:---|
| Protocolo | Bluetooth Classic (SPP / RFCOMM) |
| Nome do dispositivo ESP32 | `PulseScan` |
| Formato dos dados | JSON compactado, 1 linha por pacote |
| Frequência | 20Hz (50ms entre pacotes) |
| Fallback | Se BT cair, tenta WebSocket Wi-Fi |

**Exemplo de pacote recebido:**
```json
{"rpm":1450,"speed":0,"throttle":24,"pedal":20,"load":15,"boost":35.2,"coolant":87,"catalyst":420,"ambient":28,"fuelLevel":47,"ethanol":72,"voltage":13.8,"fuelRate":1.2,"tripDist":0,"maf":8.5,"obd_state":4}
```

---

## 🎨 Frontend (Canvas)

| Configuração | Valor | Motivo |
|:---|:---|:---|
| FPS | **30fps** | Metade da carga de CPU — celulares lentos |
| Throttle | 33ms entre frames | `ts - lastRenderTs < 33` |
| GPU compositing | `will-change: transform` | Scroll de páginas na GPU |
| Smooth K — Carga | `0.12` | Inércia suave (era 1.0 = saltos) |
| Smooth K — RPM/Vel | `0.10` | Resposta rápida |
| Smooth K — Temps | `0.30` | Sensores lentos, sem oscilar |

---

## 🐛 Bugs Corrigidos na v6.0

| Bug | Sintoma | Fix |
|:---|:---|:---|
| MAP travado | Ponteiro parado em 193 kPa | Grava `-1` no timeout → fallback recalcula sempre |
| Consumo travado | Sempre 1.0 L/h | Mesmo fix do MAP |
| Lag intermitente | Painel engasgava a cada ~1s | Timeout PID 25ms→12ms + 30fps cap |
| Linha 1px no topo | Borda piscando no topo da tela | `#ov-bar::after` removido |
| Carga com saltos | Agulha pulava em vez de deslizar | `SMOOTH_K.load: 1.0 → 0.12` |
| Starvation | Sensores lentos nunca eram lidos | Scheduler circular 10 slots |

---

## 📲 Instalação no Celular

1. Transferir `app-debug.apk` para o celular
2. Permitir "Instalar de fontes desconhecidas" nas configurações
3. Instalar o APK
4. Parear o celular com o ESP32 via Bluetooth (nome: `PulseScan`)
5. Abrir o app → tocar no botão de conexão BT
6. Ligar a ignição do Onix → aguardar handshake (~3-5 segundos)

---

**Links:** [[⚙️ Painel de Controle (Home)]] | [[🔌 Sensores e Comunicação]] | [[🗂️ Estrutura de Arquivos]]  
**Tags:** #android #apk #capacitor #bluetooth #canvas #pulsedash #app
