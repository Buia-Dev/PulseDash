# 📱 App Android (APK)

> **Versão:** v7.0 | **Status:** ✅ COMPILADO E TESTADO  
> **Framework:** Capacitor 6 + cordova-plugin-bluetooth-serial  
> **Referência:** [[⚙️ Painel de Controle (Home)]] | [[🔌 Sensores e Comunicação]]

---

## 🏗️ Arquitetura

```
PulseDashAPP/
├── www/                    ← Assets web copiados de PulseDash/PulseDash/data/
│   ├── index.html          ← HTML principal (handler de erros, cpanel, modais)
│   ├── style.css           ← Estilos (GPU compositing, fontes +2px vs v6.0)
│   └── js/
│       ├── state.js        ← Sensores, config default, SMOOTH_K, SENSOR_MAP_BY_ID
│       ├── main.js         ← Loop 60fps, OBD overlay, terminal DTC auto-clear
│       ├── renderers.js    ← Desenho Canvas (Lazy Render ativo), 16 agulhas
│       ├── editor.js       ← Editor de layout drag-and-drop, optgroup
│       ├── utils.js        ← Funções utilitárias (toast) - Sem dependência circular
│       ├── transport.js    ← Bluetooth Serial nativo (JIT cache de formulas via Map)
│       ├── perf.js         ← Cronômetro 0-100, Top 5, histórico de performance
│       ├── profiles_db.js  ← Banco de dados com os 18 perfis do RealDash
│       └── trip.js         ← Computador de bordo (event delegation no histórico)
├── android/                ← Projeto Android Studio (Gradle)
└── capacitor.config.json   ← Configuração do Capacitor
```

---

## 🔧 Como Buildar (Antigravity CLI)

O Antigravity agora compila o APK **sem abrir o Android Studio**:

```powershell
# 1. Copiar assets do laboratório para o www (usando o script sync.js)
cd PulseDashAPP; node sync.js

# 2. Sincronizar com o projeto Android nativo (usando npx.cmd no Windows para evitar bloqueio ExecutionPolicy)
npx.cmd cap sync android

# 3. Compilar o APK usando Gradle Wrapper e o JDK do Android Studio
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd android; .\gradlew.bat assembleDebug

# 4. Copiar APK para a pasta de releases com a tag v7.0
Copy-Item "app\build\outputs\apk\debug\app-debug.apk" "..\APK\PulseDashV7.0.apk" -Force
```

**APK de Release:** `C:\Users\Buia\.gemini\antigravity\scratch\PulseDash\APK\PulseDashV7.0.apk`

---

## 📡 Comunicação Bluetooth

| Parâmetro | Valor |
|:---|:---|
| Protocolo | Bluetooth Classic (SPP / RFCOMM) |
| Nome do dispositivo ESP32 | `PULSESCAN` |
| Formato dos dados | Stream binário cru de **51 bytes** com checksum (20Hz) |
| Auto-reconexão | Sim — Backoff exponencial dinâmico de 4s a 30s |

**Estrutura do pacote de telemetria binária (51 bytes):**
- `[0..3]`: Headers de sincronização (`0x44, 0x33, 0x22, 0x11`)
- `[4]`: Tipo de pacote (`0x01` = Telemetria)
- `[5..22]`: P1 Sensores (RPM, Speed, TPS, Pedal, Load, FuelRate, Boost, Coolant, Catalyst, Ambient, Ethanol, Volt, FuelLevel)
- `[23..38]`: Dados de viagem (TripDist, TripFuel, TripTimeTot, TripTimeDri)
- `[39..47]`: P2 Sensores (oilPress, fuelPress, oilTemp, iat, egt (2 bytes), afr, lambda, timing)
- `[48]`: Estado da conexão OBD2 (`obd_state`)
- `[49]`: Duração do loop CAN (`loopMs`)
- `[50]`: Checksum (Soma simples mod 256 dos 50 bytes anteriores)

---

## 🎨 Frontend (Canvas)

| Configuração | Valor | Motivo |
|:---|:---|:---|
| FPS | **60fps** | `requestAnimationFrame` sem throttle |
| GPU compositing | `will-change: transform` | Scroll de páginas na GPU |
| JIT Formula Cache | **Map Local** | Cache em lookups das funções compiladas |
| Lazy Render | **Ativo** | Só repinta se variação do sensor for `> 0.05` |
| Fontes | **+2px** vs v6.0 | Melhor legibilidade no celular |

---

## 🐛 Bugs Corrigidos

### v6.3 / v6.4
| Bug | Sintoma | Fix |
|:---|:---|:---|
| Thermal Throttling | Celular superaquecia em minutos de uso | Remoção de `ctx.shadowBlur` (gargalo de GPU sem aceleração) e adição de Lazy Render. |
| Silent Boot Crash | App travava de forma randômica logo na inicialização | Extração de módulo circular. `main`, `trip` e `transport` referenciam `utils.js`. |
| Falha ao salvar imagem custom | Nenhuma mensagem quando a base64 não cabia no localStorage | Adicionado `alert()` interceptando `QuotaExceededError`. |
| Widget não apagava (Ghosting) | Alterar o sensor no editor mantinha a agulha velha travada no visor | Limpeza forçada de `w._sv` e `w._lastDrawS` no `applyConfig()`. |

### v6.9 (Fase de Agulhas e Release)
| Bug / Feature | Sintoma | Fix |
|:---|:---|:---|
| Ponteiros de ponta pequenos | Setas/halos eram difíceis de enxergar mesmo em escalas maiores | Aplicado ganho de escala de **35%** (`sf *= 1.35`) no renderizador de agulhas. |
| Agulhas bagunçadas no editor | Lista de 16 agulhas confusa e sem ordenação | Criado agrupamento dinâmico usando a tag `<optgroup>` (*Cor Variável*, *Cor Fixa*, *Pontas*). |
| Bloqueio ExecutionPolicy | Erro ao rodar `npx cap sync android` | Contornado executando via CMD com `npx.cmd cap sync android`. |

### v7.0 (Fase de Estabilização e JIT Cache)
| Bug / Feature | Sintoma | Fix |
|:---|:---|:---|
| Overhead JIT de Fórmulas | 420 compilações de strings/s travavam o WebView | Declarado `formulaCache` como `Map` para reutilizar as funções compiladas. |
| Lag de Gravação LittleFS | Gravação síncrona na Flash causava lag de até 80ms no bluetooth | Criada `fsTask` no Core 0 do ESP32 para gravações assíncronas em background. |
| Memory Leak no Histórico | Listeners de cliques no loop do histórico travavam o WebView | Implementada delegação de cliques estáticos no container pai `#trip-hist-list`. |
| Concorrência no DTC Console | Fechar e abrir o terminal misturava/encavalava as strings | Timers e resolves registrados e limpos via `clearDtcTimers()`. |
| Colisão de PIDs | Sensor de pressão de óleo lia dados de temp de óleo | PID padrão do `oilPress` remapeado de `"5c"` para `"00"`. |
| Google DTC Fixo | Pesquisa de erros sempre usava a marca Fiat | Substituído por busca dinâmica baseada na marca do perfil (`ST.car?.brand`). |

---

## 📲 Instalação no Celular

1. Transferir `PulseDashV7.0.apk` para o celular
2. Permitir "Instalar de fontes desconhecidas" nas configurações
3. Instalar o APK
4. Parear o celular com o ESP32 via Bluetooth (nome: `PULSESCAN`)
5. Ligar a ignição do Onix → o app conecta automaticamente em ~3-5 segundos
6. Tocar no ícone de antena para abrir o menu OBD e verificar o status

---

**Links:** [[⚙️ Painel de Controle (Home)]] | [[🔌 Sensores e Comunicação]] | [[🗂️ Estrutura de Arquivos]]  
**Tags:** #android #apk #capacitor #bluetooth #canvas #pulsedash #app #v70
