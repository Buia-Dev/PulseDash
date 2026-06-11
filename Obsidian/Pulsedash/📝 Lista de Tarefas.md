# 📝 Lista de Tarefas (Backlog Atualizado)

> Última atualização: 2026-06-11  
> **Referência:** [[⚙️ Painel de Controle (Home)]]

---

## ✅ Concluído — Software (HTML/JS/CSS)

- [x] Unificar o código monstruoso do `index.html` em arquivos menores (v4.0).
- [x] Padronização matemática: sensores retornam valores **reais** (não mais escala 0-1024).
- [x] Separação em módulos: `state.js`, `renderers.js`, `editor.js`, `main.js`, `profiles_db.js` (v7.0).
- [x] Finalizar e refinar a Animação de Boot (PCB + Neon).
- [x] Implementar WebSocket (porta 81) para push de dados em tempo real (Wi-Fi).
- [x] Implementar PWA (manifest + service worker) para instalação no celular.
- [x] Dashboard responsivo — funciona em retrato e paisagem.
- [x] **Suavização Individual por Ponteiro (v5.4.1):** Slider de `smoothK` no editor para `agulha_pura`.
- [x] **Histórico 0-100 em Tela (v5.4.1):** Cronômetro com state machine + Top 5.
- [x] **App Android Nativo (v6.0):** Capacitor + `cordova-plugin-bluetooth-serial`. APK funcional.
- [x] **GPU Compositing (v6.0):** `will-change: transform` + `backface-visibility: hidden`.
- [x] **Computador de Bordo (v6.0):** Overlay com distância, vel. média, combustível, custo e timers.
- [x] **Agulhas Premium (v6.9):** 16 modelos premium organizados com `<optgroup>` e auto-escala 1.35x.

### ✅ Fase 1 a 4 — Refatorações, Otimização e Estabilidade
- [x] **Trip e Perf Isolados:** Extração lógica para `trip.js` e `perf.js`, e interface bluetooth/WS em `transport.js`.
- [x] **Sistema `orientations`:** Portrait e Landscape com layouts e renderização totalmente independentes.
- [x] **UDS Service 22 (PIDs GM):** `canSendUDS` + `canReadUDS` estruturados para testes de sensores.
- [x] **Slosh Mitigation:** Algoritmo EMA com modos Fast-Fill, Cruzeiro e Bloqueio Inercial.
- [x] **Fim do Thermal Throttling:** Remoção do `ctx.shadowBlur` do canvas e acréscimo de **Lazy Render** (`> 0.05` delta).
- [x] **Fim do Silent Boot Crash:** Criação de `utils.js` e remoção da dependência circular de imports ES6.
- [x] **Tratamento de Storage:** Try/catch alertando `QuotaExceededError` no IndexedDB da galeria.

### ✅ Fase 5 — JIT Cache & Refinamentos de Loop (v7.0)
- [x] **JIT Formula Cache:** Expressões em string compiladas apenas uma vez via Map local `formulaCache` em `transport.js` para evitar overhead JIT no WebView.
- [x] **PID Collision resolved:** PID do sensor `oilPress` remapeado de `"5c"` para `"00"` para evitar conflito com o PID do `oilTemp`.
- [x] **Delegação de Eventos:** Vinculação estática no container `#trip-hist-list` via `e.target.closest` no `trip.js` para matar vazamentos de memória.
- [x] **Google DTC Dinâmico:** Busca dinâmica baseada na marca do perfil do carro ativa (`ST.car?.brand || 'Fiat'`).
- [x] **Console DTC sem vazamentos:** Rastreamento de timers e resolves de digitação de console (`dtcTimers` e `dtcResolves`) cancelados no overlay close ou re-scan.

---

## ✅ Concluído — Hardware e Firmware

- [x] **Migração total para CAN Bus 29-bit nativo** (SN65HVD230 + TWAI).
- [x] Identificar endereçamento do Onix 2026: TX `0x18DB33F1` / RX `0x18DAF111`.
- [x] Implementar handshake robusto com 10 tentativas + Tester Present de 100ms.
- [x] Implementar recuperação automática de Bus-Off.
- [x] **Bluetooth Classic RFCOMM (v6.0):** JSON via `BluetoothSerial` (nome `PULSESCAN`).
- [x] **Expansão de 8 Sensores de Prioridade 2 (v7.0):** Pressão e temp de óleo, escape EGT, timing, mistura, lambda, etc. lidos via CAN e expostos.
- [x] **Aumento do Frame Binário (v7.0):** Redimensionamento do frame compacto de 42 para **51 bytes** a 20Hz.
- [x] **DTC sem delays bloqueantes (v7.0):** Removidos `vTaskDelay` síncronos na ESP32 no DTC scan/clear desconectado.
- [x] **Uptime Máximo / Sem Strings no Histórico (v7.0):** Montagem do histórico diário refatorada para buffer estático `char[1024]` e `snprintf` na ESP32.
- [x] **Task FS de Background no Core 0 (v7.0):** Todas as escritas LittleFS (viagens de 5km, motor desligado, sensor não suportado, escrita de histórico no dia, perfil do carro) movidas para background via FreeRTOS na `fsTask` no Core 0.

---

## 🔜 Em Progresso / Próximos Passos (Fase 6 - Robustez Nível 2)

### 🔬 Otimizações e Correções Críticas (Framwork Nível 2)
- [ ] **ISO-TP Multi-Frame (DTC Scan):** Implementar leitura de Consecutive Frames (`(r.data[0] & 0xF0) == 0x20`) e Flow Control (`0x30 0x00 0x00`) usando o ID Físico de envio da ECU para ler mais de 3 DTCs.
- [ ] **Tratamento de NRC 0x7F:** Tratar respostas `0x7F` na `canReadSensorRaw`. Se o subcódigo for `0x78` (Response Pending), pausar 10ms e estender o loop de timeout em mais 200ms. Para outros NRCs, retornar `-998`.
- [ ] **Desativação Imediata por NRC:** Ao ler `-998`, desabilitar o sensor permanentemente de imediato e enviar o JSON `{"cmd":"sensor_disabled","id":ID}`.
- [ ] **WakeLock no WebView:** Adquirir o WakeLock de tela na conexão de dados Bluetooth (`navigator.wakeLock.request('screen')`) e liberar na desconexão.
- [ ] **Indicador Visual de Sensor Degradado:** Tratar evento `'sensor_disabled'` no JS para esmaecer o gauge correspondente (grayscale e opacidade) com um pseudo-elemento ⚠️ amarelo de aviso.
- [ ] **Indicador Visual de Sinal Perdido (Gauges Congelados):** Se a conexão OBD ficar offline por mais de 3s (`obd_state != 4`), adicionar a classe `.gauge-stale` em todos os widgets para pulsar a borda em cor âmbar.
- [ ] **rxBuffer com Limite Máximo:** Impedir estouro de memória no WebView travando o acúmulo de bytes residuais em `MAX_BUFFER = 1024` bytes.
- [ ] **LittleFS Defensivo:** Alterar a montagem para `LittleFS.begin(false)` e só formatar em emergência. Avisar o App via JSON em caso de corrupção da Flash.
- [ ] **try/catch no saveRecordes:** Proteger a gravação de recordes contra `QuotaExceededError`.

### 🎨 Novos Estilos de Arcos & Barras (Fase de Planejamento)
- [x] **Criar página de visualização interativa:** Construir `bar_arc_preview.html` com 12 estilos e mockup integrado de cockpit.
- [x] **Refinar o equalizador e cores:** Adaptar o Equalizador Cyber Wave para ser reativo e adicionar degradê cônico real no Arco Segmentado Sci-Fi.
- [ ] **Criar Plano de Integração:** Esboçar a integração de novos arcos e barras no código de produção.
- [ ] **Codificar novos arcos/barras:** Implementar no app principal as opções selecionadas (Arco Crescente, Arco Cônico, Arco LED F1, Barra de Trapézios, Barra Chevron, Barra Cursor Laser, Barra Células de Fusão).

### 🚗 Projeto Futuro — Expansão K-Line (Caline) & Handshake Estendido
- [ ] **Despertar Elétrico (Linha K):** Sequências físicas de pulsação na GPIO configurada (Fast Init de 25ms LOW / 25ms HIGH e 5-Baud Init a 5 bps) no firmware.
- [ ] **Baudrate de Comunicação Dinâmico:** Negociação e reinicialização da porta serial para velocidades legadas (ex: 10400 bps / 9600 bps) na injeção.
- [ ] **Parser de Comandos K-Line do XML:** Mapear comandos como `atfi` (Fast Init) e `atal` (Active Line) para acionar as rotinas de hardware correspondentes na ESP32.
- [ ] **Escalonamento Suave:** Ajustar a fila do scheduler para lidar com timeouts longos da K-Line (50ms a 100ms) sem travar a thread de telemetria.

### 🔧 Melhorias Pós-Teste (v6.3)
- [ ] **Modo noturno automático:** Redução de brilho do canvas após 21h (via `unixTime` sincronizado pelo app).
- [ ] **Flash via `esptool` pelo Antigravity:** Gravar o `.bin` no ESP32 via USB sem nunca abrir o Arduino IDE.

### 🚗 Projeto Paralelo — Gol G1
- [ ] Montar circuito do optocoplador para captura de RPM via bobina de ignição.
- [ ] Integrar GPS para velocidade real (sem OBD2).
- [ ] Adaptar firmware para modo "carro antigo" sem CAN Bus.

### ❌ Testes Falhados e Arquivados
- [x] **PIDs UDS Service 22 (GM):** Temp. Câmbio (`0x1940`), Pressão Óleo (`0x115C`), Temp. Óleo (`0x1154`) — Desativados. O carro simplesmente não responde a estes requests na mesma rede ou eles exigem uma sessão de segurança diferente.
- [x] **Validar MAP físico:** PID `0x0B` não responde. Fallback virtual foi adotado definitivamente.

---

**Tags:** #tarefas #backlog #roadmap #pulsedash
