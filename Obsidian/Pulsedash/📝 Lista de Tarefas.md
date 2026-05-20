# 📝 Lista de Tarefas (Backlog Atualizado)

> Última atualização: 2026-05-18  
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
- [x] **Histórico 0-100 em Tela (v5.4.1):** Lógica do cronômetro arisco acionado a 0 km/h e tabela visual.

## ✅ Concluído — Hardware e Firmware

- [x] ~~Decidir modelo da injeção: OBD2 via ELM327 Bluetooth.~~ **DESCARTADO.**
- [x] **Migração total para CAN Bus 29-bit nativo** (SN65HVD230 + TWAI).
- [x] Identificar endereçamento do Onix 2026: TX `0x18DB33F1` / RX `0x18DAF111`.
- [x] Implementar handshake robusto com 10 tentativas agressivas.
- [x] Implementar recuperação automática de Bus-Off.
- [x] Sistema de log LittleFS (`btlog.txt`) com EcoLog CSV de viagem.
- [x] Linguagem de LED para diagnóstico em campo (sem monitor serial).
- [x] Validar RPM real: **confirmar leitura a 6.230 RPM** (teste em pista).
- [x] Validar Velocidade: **confirmar 115 km/h** em teste real.
- [x] Validar Temperatura: subida de **24°C → 90°C** durante aquecimento confirmada.
- [x] Validar Tensão: **12.xx V** (motor off) → **14.xx V** (motor on/alternador).
- [x] **Firmware v5.4.1 Estabilizado:** Implementados PIDs `0x49` (Pedal), `0x11` (Borboleta), `0x52` (Etanol), `0x0B` (Boost), `0x04` (Carga) e filtro EMA para Combustível (Amostragem 1Hz).

## ✅ Concluído — Compras (BOM)

- [x] ~~ELM327 Bluetooth~~ — descartado.
- [x] **SN65HVD230** (Módulo CAN 3.3V) — adquirido e em uso.
- [x] **Conector OBD2 J1962** — adquirido e soldado.
- [x] GPS para velocidade (Gol G1 — projeto paralelo) — adquirido.
- [x] Optocoplador para RPM via bobina (Gol G1) — adquirido.

---

## 🔜 Em Progresso / Próximos Passos

### 🔧 Firmware & JS (v5.5 - Foco Atual)
- [ ] **Escalonador Triplo Intercalado:** Separar o loop de CAN do ESP32 em fatias (VIP 60ms / Médio 1s / Lento 5s).
- [ ] **Etanol Inteligente:** Mudar a leitura do Etanol (`0x52`) para startup-once + atualização lenta a cada 5min.
- [ ] **Correção de Wheelspin no 0-100:** Alterar tolerância de aborto para queda brusca de 15 km/h.
- [ ] **Persistência física no ESP32:** Criar rotas HTTP `/perf` (GET/POST) e salvar o Top 5 no LittleFS como `/perf.txt` (texto puro ordenado por menor tempo).

### 🖥️ Computador de Bordo & Sensores Estendidos (v6.0 - Próxima Grande Fase)
- [ ] **Módulo de Estatísticas de Viagem:** Tela overlay estilo do app ELM com cards glassmorphism de Distância, Vel. Média, Combustível gasto (L), Consumo Médio (km/L), Custos e Tempos (Sem gráficos).
- [ ] **Zero Overload CAN:** Implementar integração matemática das viagens no JS usando variáveis existentes (Speed VIP e Fuel Rate 1s).
- [ ] **Fallback Dinâmico de Consumo:** Lógica Flex-Fuel inteligente baseada no **MAF + Etanol** caso o PID `0x5E` retorne zero.
- [ ] **PIDs Proprietários GM Service 22:** Adicionar Temperatura do Câmbio (`221940`), Pressão do Óleo (`22115C`), Temp. Óleo (`221154`) e Ângulo do Volante (`222411`).
- [ ] **Widget de TPMS Visual:** Chassi do carro na tela mostrando a pressão dos 4 pneus ao vivo no painel.
- [ ] **Widget de Volante Virtual:** Volante em neon no Canvas que gira de acordo com o `Steering Angle` lido da rede do carro.

### 📱 Transição para App Nativo APK (v7.0 - Visão Futura)
- [ ] **Bluetooth SPP (Classic BT):** Migrar comunicação de rede local Wi-Fi para canal de Bluetooth serial para liberação da rede 4G/5G do celular.
- [ ] **Widget de Força G Físico (CAN Sniffing):** Capturar os frames de broadcast nativos da EBCM/ABS (ex: ID `0x1F5`) contendo a aceleração lateral e longitudinal calibrada de fábrica no centro do chassi (sem ruído de suporte de celular e com impacto zero de tráfego CAN).

### 🚗 Projeto Paralelo — Gol G1
- [ ] Montar circuito do optocoplador para captura de RPM via bobina.
- [ ] Integrar GPS para velocidade real.
- [ ] Adaptar firmware do ESP32 para modo "carro antigo" (sem OBD2).

---

**Tags:** #tarefas #backlog #roadmap #pulsedash
