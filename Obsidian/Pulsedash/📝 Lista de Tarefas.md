# 📝 Lista de Tarefas (Backlog Atualizado)

> Última atualização: 2026-05-23  
> **Referência:** [[⚙️ Painel de Controle (Home)]]

---

## ✅ Concluído — Software (HTML/JS/CSS)

- [x] Unificar o código monstruoso do `index.html` em arquivos menores (v4.0).
- [x] Padronização matemática: sensores retornam valores **reais** (não mais escala 0-1024).
- [x] Separação em módulos: `state.js`, `renderers.js`, `editor.js`, `main.js`.
- [x] Finalizar e refinar a Animação de Boot (PCB + Neon).
- [x] Implementar WebSocket (porta 81) para push de dados em tempo real.
- [x] Implementar PWA (manifest + service worker) para instalação no celular.
- [x] Dashboard responsivo — funciona em retrato e paisagem.
- [x] **Suavização Individual por Ponteiro (v5.4.1):** Slider de `smoothK` no editor para `agulha_pura`.
- [x] **Histórico 0-100 em Tela (v5.4.1):** Cronômetro com state machine + Top 5.
- [x] **App Android Nativo (v6.0):** Capacitor + `cordova-plugin-bluetooth-serial`. APK funcional.
- [x] **GPU Compositing (v6.0):** `will-change: transform` + `backface-visibility: hidden`.
- [x] **Computador de Bordo (v6.0):** Overlay com distância, vel. média, combustível, custo e timers.

### ✅ Fase 1 — Refatoração Arquitetural (v6.2 / 2026-05-23)
- [x] **Extração `trip.js`:** Computador de Bordo (TRIP) extraído de `main.js` para módulo próprio.
- [x] **Extração `perf.js`:** Cronômetro 0-100 com state machine e Top 5 extraídos para módulo próprio.
- [x] **Criação `transport.js`:** Camada de abstração Bluetooth Serial / WebSocket. `initTransport()`, `saveToESP()`, `loadFromESP()`, `saveRecordes()`.
- [x] **Sistema `orientations` (Portrait/Landscape independentes):** Cada orientação tem layout de widgets completamente separado.
- [x] **Correção `w._sv` na serialização:** `saveToESP()` deleta `w._sv` antes de salvar. `applyConfig()` limpa ao trocar sensor.
- [x] **UDS Service 22 (PIDs GM):** `canSendUDS()` + `canReadUDS()` — Temp. Câmbio, Pressão Óleo, Temp. Óleo.
- [x] **Fallback Consumo Flex:** MAF + Etanol% → AFR dinâmico + densidade real → L/h correto para E0-E100.
- [x] **Slosh Mitigation:** EMA com 3 modos (Fast-Fill, Bloqueio Inercial, Cruzeiro lento) para boia de combustível.
- [x] **Etanol no Startup + 5min:** Leitura única no handshake OK + atualização periódica em background.
- [x] **Scheduler 10 slots reformulado:** `loopCount % 2` e `% 10` para distribuição de sensores sem starvation.

### ✅ Fase 2 — Debug de UI e Build APK (v6.2 / 2026-05-23)
- [x] **Fix ícones APK:** `ic_launcher.xml` e `ic_launcher_round.xml` corrompidos por BOM UTF-8 — recriados do zero.
- [x] **Imagens personalizadas:** Galeria do celular → fundo de relógio no dashboard.
- [x] **Fix duplicação de relógios ao girar:** `swapOrientation` limpa camadas `wl-N` específicas em vez de limpar `innerHTML` do container inteiro.
- [x] **Fix cores dos arcos não salvavam:** `applyConfig` ignora inputs com `display:none` (campos de outras abas sobrescreviam as cores).
- [x] **Fontes +2px globais:** Todos os `font-size` do `style.css` aumentados em 2px para legibilidade mobile.
- [x] **Botão ↔ no Editor:** Restaurado no cabeçalho do `#cpanel` — alterna lado esquerdo/direito instântaneamente.
- [x] **Build APK pelo Antigravity:** `gradlew assembleDebug` com `JAVA_HOME` do Android Studio — sem abrir a IDE.

### ✅ Fase 3 — Compilação CLI e Bugs de Runtime (v6.2 / 2026-05-23)
- [x] **`arduino-cli` integrado:** Instalado, configurado `esp32:esp32@3.3.8`, compila `.ino` direto pelo terminal.
- [x] **Fix `}` faltando no `loop()`:** Chave de fechamento engolida na refatoração — compilador detectou e corrigimos.
- [x] **Firmware validado:** `PulseDashESP_BT.ino.bin` — 1.119.484 bytes (85% flash), 42.136 bytes RAM (12%).
- [x] **Fix `Script error. Linha: 0:0`:** Falso positivo do Android WebView com módulos ES6 — filtro no `window.onerror`.
- [x] **Fix `_freqHz is not defined`:** Variáveis globais de frequência declaradas no topo do `main.js`.
- [x] **Repositório oficial sincronizado:** `PulseDashESP_BT/` só contém o `.ino`. `APK/` com APK + Firmware.
- [x] **✅ TESTE NO CARRO:** Leitura confirmada no Onix 2026 — "ja ta lendo certim" (2026-05-23).

## ✅ Concluído — Hardware e Firmware

- [x] **Migração total para CAN Bus 29-bit nativo** (SN65HVD230 + TWAI).
- [x] Identificar endereçamento do Onix 2026: TX `0x18DB33F1` / RX `0x18DAF111`.
- [x] Implementar handshake robusto com 10 tentativas + Tester Present de 100ms.
- [x] Implementar recuperação automática de Bus-Off.
- [x] Validar RPM: até **6.230 RPM** confirmado.
- [x] Validar Velocidade: **115 km/h** confirmado.
- [x] **Bluetooth Classic RFCOMM (v6.0):** JSON a 20Hz via `BluetoothSerial` (nome `PULSESCAN`).
- [x] **UDS Service 22 (v6.2):** Temp. Câmbio (`0x1940`), Pressão Óleo (`0x115C`), Temp. Óleo (`0x1154`).

## ✅ Concluído — Compras (BOM)

- [x] **SN65HVD230** (Módulo CAN 3.3V) — adquirido e em uso.
- [x] **Conector OBD2 J1962** — adquirido e soldado.

---

## 🔜 Em Progresso / Próximos Passos

### 🧪 Testes de Campo (Em andamento — dias seguintes)
- [ ] **Validar MAP físico em movimento:** PID `0x0B` retorna valor real ou sempre usa fallback virtual?
- [ ] **Validar Consumo físico em movimento:** PID `0x5E` vs cálculo estequiométrico Flex — qual é mais preciso?
- [ ] **Validar UDS em movimento:** Temp. Câmbio, Pressão e Temp. Óleo respondendo andando?
- [ ] **Estabilidade do Bluetooth:** O app reconecta automaticamente após o carro desligar e a ESP reiniciar?
- [ ] **Slosh Mitigation em curvas:** O algoritmo mantém o ponteiro de combustível estável em curvas fortes?

### 🔧 Melhorias Pós-Teste (v6.3)
- [ ] **Modo noturno automático:** Redução de brilho do canvas após 21h (via `unixTime` sincronizado pelo app).
- [ ] **PIDs alternativos GM:** Investigar PIDs proprietários para MAP e Consumo caso os padrão `0x0B`/`0x5E` sempre usem fallback.
- [ ] **Flash via `esptool` pelo Antigravity:** Gravar o `.bin` no ESP32 via USB sem nunca abrir o Arduino IDE.

### 📱 Transição (v7.0 - Visão Futura)
- [ ] **Widget de Força G Físico:** CAN sniffing da EBCM/ABS (ID `0x1F5`).
- [ ] **APK de produção assinada:** Keystore próprio + `assembleRelease` para publicação.

### 🚗 Projeto Paralelo — Gol G1
- [ ] Montar circuito do optocoplador para captura de RPM via bobina de ignição.
- [ ] Integrar GPS para velocidade real (sem OBD2).
- [ ] Adaptar firmware para modo "carro antigo" sem CAN Bus.

---

**Tags:** #tarefas #backlog #roadmap #pulsedash
