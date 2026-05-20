# 📝 Lista de Tarefas (Backlog Atualizado)

> Última atualização: 2026-05-20  
> **Referência:** [[⚙️ Painel de Controle (Home)]]

---

## ✅ Concluído — Software (HTML/JS/CSS)

- [x] Unificar o código monstruoso do `index.html` em arquivos menores (v4.0).
- [x] Restaurar barra curva (`rCurv`) e inclinações nas configurações do Painel.
- [x] Padronização matemática: sensores retornam valores **reais** (não mais escala 0-1024).
- [x] Separação em módulos: `state.js`, `renderers.js`, `editor.js`, `main.js`.
- [x] Finalizar e refinar a Animação de Boot (PCB + Neon).
- [x] Implementar WebSocket (porta 81) para push de dados em tempo real.
- [x] Implementar PWA (manifest + service worker) para instalação no celular.
- [x] Dashboard 100% responsivo — funciona em retrato e paisagem.
- [x] **Suavização Individual por Ponteiro (v5.4.1):** Slider de `smoothK` apenas para `agulha_pura` no editor.
- [x] **Histórico 0-100 em Tela (v5.4.1):** Lógica do cronômetro acionado a 0 km/h e tabela visual.
- [x] **App Android Nativo (v6.0):** Capacitor + `cordova-plugin-bluetooth-serial`. APK gerado e funcional.
- [x] **Canvas 30fps (v6.0):** Throttle de 33ms no loop de render — reduz 50% de CPU em celulares lentos.
- [x] **GPU Compositing (v6.0):** `will-change: transform` + `backface-visibility: hidden` no pages-wrap.
- [x] **Fix bug 1px topo (v6.0):** Removido `#ov-bar::after` que vazava 1px animado no topo da tela.
- [x] **Smooth K da Carga (v6.0):** Corrigido de `1.0` (sem inércia) para `0.12` — agulha fluida.
- [x] **Computador de Bordo (v6.0):** Overlay com distância, vel. média, combustível, custo e timers.
- [x] **Remoção de sensores incompatíveis (v6.0):** `oilTemp`, `oilPres`, `transTemp`, `test` removidos.
- [x] **Remoção de widgets legados (v6.0):** `volante_virtual` e `tpms_neon` removidos.

## ✅ Concluído — Hardware e Firmware

- [x] **Migração total para CAN Bus 29-bit nativo** (SN65HVD230 + TWAI).
- [x] Identificar endereçamento do Onix 2026: TX `0x18DB33F1` / RX `0x18DAF111`.
- [x] Implementar handshake robusto com 10 tentativas + Tester Present de 100ms.
- [x] Implementar recuperação automática de Bus-Off.
- [x] Validar RPM: até **6.230 RPM** confirmado.
- [x] Validar Velocidade: **115 km/h** confirmado.
- [x] **Bluetooth Classic RFCOMM (v6.0):** ESP32 transmite JSON a 20Hz via `BluetoothSerial` (nome `PulseScan`).
- [x] **Scheduler Circular de 10 Slots (v6.0):** Elimina starvation do `if/else if` em cadeia.
- [x] **Timeout de PID 12ms (v6.0):** Reduzido de 25ms para evitar que 3 leituras/ciclo excedam 50ms.
- [x] **Fallback MAP e Consumo (v6.0):** Recalcula dinamicamente via throttle+load+RPM quando PID retorna -999.

## ✅ Concluído — Compras (BOM)

- [x] **SN65HVD230** (Módulo CAN 3.3V) — adquirido e em uso.
- [x] **Conector OBD2 J1962** — adquirido e soldado.

---

## 🔜 Em Progresso / Próximos Passos

### 🔧 Firmware & Sensores (v6.1)
- [ ] **Teste MAP físico andando:** Confirmar se PID `0x0B` retorna valor real em movimento ou sempre usa fallback.
- [ ] **Teste Consumo físico andando:** Confirmar PID `0x5E` em movimento.
- [ ] **Etanol Inteligente:** Leitura no startup-once + atualização a cada 5min.

### 📱 App (v6.1)
- [ ] **Investigar PIDs alternativos GM:** Para MAP e Consumo caso os padrão não funcionem.
- [ ] **Modo turno noturno:** Redução automática de brilho do canvas após 21h.

### 📱 Transição (v7.0 - Visão Futura)
- [ ] **Widget de Força G Físico:** CAN sniffing da EBCM/ABS (ID `0x1F5`).
- [ ] **PIDs Proprietários GM Service 22:** Temp. Câmbio, Pressão Óleo, Ângulo Volante.

### 🚗 Projeto Paralelo — Gol G1
- [ ] Montar circuito do optocoplador para captura de RPM via bobina.
- [ ] Integrar GPS para velocidade real.
- [ ] Adaptar firmware para modo "carro antigo" (sem OBD2).

---

**Tags:** #tarefas #backlog #roadmap #pulsedash
