# 📱 App Android (APK)

> **Versão:** v6.4 | **Status:** ✅ TESTADO NO CARRO  
> **Framework:** Capacitor 6 + cordova-plugin-bluetooth-serial  
> **Referência:** [[⚙️ Painel de Controle (Home)]] | [[🔌 Sensores e Comunicação]]

---

## 🏗️ Arquitetura

```
PulseDashAPP/
├── www/                    ← Assets web copiados de PulseDash/PulseDashESP/data/
│   ├── index.html          ← HTML principal (handler de erros, cpanel, modais)
│   ├── style.css           ← Estilos (GPU compositing, fontes +2px vs v6.0)
│   └── js/
│       ├── state.js        ← Sensores, config default, SMOOTH_K
│       ├── main.js         ← Loop 60fps, OBD overlay, variáveis globais de freq
│       ├── renderers.js    ← Desenho Canvas (Lazy Render ativo)
│       ├── editor.js       ← Editor de layout drag-and-drop, applyConfig robusto
│       ├── utils.js        ← Utilidades puras (toast, utils math) - Fim do import circular
│       ├── transport.js    ← Bluetooth Serial nativo (initBluetoothSerial, subscribe)
│       ├── perf.js         ← Cronômetro 0-100, Top 5, histórico de performance
│       └── trip.js         ← Computador de bordo (distância, combustível, tempo)
├── android/                ← Projeto Android Studio (Gradle)
└── capacitor.config.json   ← Configuração do Capacitor
```

---

## 🔧 Como Buildar (Antigravity CLI)

O Antigravity agora compila o APK **sem abrir o Android Studio**:

```powershell
# 1. Copiar assets do laboratório para o www
Copy-Item -Path "PulseDash\PulseDashESP\data\*" -Destination "PulseDashAPP\www" -Force -Recurse

# 2. Sincronizar com o projeto Android nativo
cd PulseDashAPP; npx cap sync android

# 3. Compilar o APK
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd android; .\gradlew assembleDebug

# 4. Copiar APK para a pasta de releases
Copy-Item "app\build\outputs\apk\debug\app-debug.apk" "APK\PulseDash_v6.2.apk"
```

**APK de Release:** `C:\Users\Buia\.gemini\antigravity\scratch\APK\PulseDash_v6.2.apk`

---

## 📡 Comunicação Bluetooth

| Parâmetro | Valor |
|:---|:---|
| Protocolo | Bluetooth Classic (SPP / RFCOMM) |
| Nome do dispositivo ESP32 | `PULSESCAN` |
| Formato dos dados | JSON compactado, 1 linha por pacote (`\n`) |
| Frequência de transmissão | ~33Hz (30ms entre pacotes) |
| Delimitador | `\n` (subscribe via `bluetoothSerial.subscribe('\n', ...)`) |
| Auto-reconexão | Sim — `setTimeout(initBluetoothSerial, 4000~6000)` |

**Exemplo de pacote recebido (v6.2):**
```json
{"rpm":1450,"speed":0,"throttle":24,"pedal":20,"load":15,"fuelRate":1.2,"boost":35.2,"coolant":87,"catalyst":420,"ambient":28,"ethanol":72,"voltage":13.8,"fuelLevel":47,"transTemp":72,"oilPres":2.3,"oilTemp":88,"tripDist":0,"tripFuel":0.000,"tripTimeTot":0,"tripTimeDri":0,"obd_state":4}
```

---

## 🎨 Frontend (Canvas)

| Configuração | Valor | Motivo |
|:---|:---|:---|
| FPS | **60fps** | `requestAnimationFrame` sem throttle |
| GPU compositing | `will-change: transform` | Scroll de páginas na GPU |
| Smooth K — Carga | `0.12` | Inércia suave (era 1.0 = saltos) |
| Smooth K — RPM/Vel | `0.10` | Resposta rápida |
| Smooth K — Temps | `0.30` | Sensores lentos, sem oscilar |
| Fontes | **+2px** vs v6.0 | Melhor legibilidade no celular |

---

## 🐛 Bugs Corrigidos

### v6.0
| Bug | Sintoma | Fix |
|:---|:---|:---|
| MAP travado | Ponteiro parado em 193 kPa | Grava `-999` no timeout → fallback recalcula |
| Consumo travado | Sempre 1.0 L/h | Fallback estequiométrico Flex (MAF + Etanol) |
| Lag intermitente | Painel engasgava a cada ~1s | Timeout PID + 30fps cap |
| Linha 1px no topo | Borda piscando no topo da tela | `#ov-bar::after` removido |
| Carga com saltos | Agulha pulava em vez de deslizar | `SMOOTH_K.load: 1.0 → 0.12` |
| Starvation | Sensores lentos nunca eram lidos | Scheduler circular 10 slots |

### v6.2
| Bug | Sintoma | Fix |
|:---|:---|:---|
| Tela vermelha ao conectar BT | `Script error. Linha: 0:0` | Filtro no `window.onerror` ignora falsos positivos ES6 |
| Menu OBD crashava | `_freqHz is not defined` | Declaração das 4 variáveis globais no topo do `main.js` |
| Relógios duplicavam | Girar o celular dobrava os widgets | `swapOrientation` limpa camadas específicas |
| Cores dos arcos não salvavam | Reset de cor ao salvar | `applyConfig` ignora inputs `display:none` |
| Botão ↔ sumiu | Sem forma de trocar lado do editor | Restaurado no cabeçalho do `cpanel` |

### v6.3 / v6.4
| Bug | Sintoma | Fix |
|:---|:---|:---|
| Thermal Throttling | Celular superaquecia em minutos de uso | Remoção de `ctx.shadowBlur` (gargalo de GPU sem aceleração) e adição de Lazy Render (`abs(val - last) > 0.05`). |
| Silent Boot Crash | App travava de forma randômica logo na inicialização e o erro no console era mudo. | Extração de módulo circular. `main`, `trip` e `transport` referenciam `utils.js` agora para o `toast()`. |
| Falha ao salvar imagem custom | Nenhuma mensagem quando a base64 não cabia no localStorage | Adicionado `alert()` interceptando `QuotaExceededError`. |
| Widget não apagava (Ghosting) | Alterar o sensor no editor mantinha a agulha velha travada no visor | Limpeza forçada de `w._sv` e `w._lastDrawS` no `applyConfig()`. |

---

## 📲 Instalação no Celular

1. Transferir `PulseDash_v6.2.apk` para o celular
2. Permitir "Instalar de fontes desconhecidas" nas configurações
3. Instalar o APK
4. Parear o celular com o ESP32 via Bluetooth (nome: `PULSESCAN`)
5. Ligar a ignição do Onix → o app conecta automaticamente em ~3-5 segundos
6. Tocar no ícone de antena para abrir o menu OBD e verificar o status

---

**Links:** [[⚙️ Painel de Controle (Home)]] | [[🔌 Sensores e Comunicação]] | [[🗂️ Estrutura de Arquivos]]  
**Tags:** #android #apk #capacitor #bluetooth #canvas #pulsedash #app
