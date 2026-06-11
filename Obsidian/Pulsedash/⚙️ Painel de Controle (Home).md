# ⚙️ PulseDash — Hub de Desenvolvimento

> **Versão Atual: v7.0** | Status: ✅ **TESTADO E COMPILADO** | Protocolo: **CAN Bus 29-bit (TWAI) + Bluetooth Classic**

Bem-vindo à base de conhecimento central do **PulseDash**, o painel de instrumentos digital premium construído do zero para o **Onix 2026**, servindo também como plataforma universal para outros veículos.

O projeto evoluiu de uma ideia com ELM327 Bluetooth para um sistema de **leitura nativa direta da rede CAN do veículo** e transmissão via **Bluetooth Classic (RFCOMM)** para um App Android nativo (APK via Capacitor).

---

## 🧭 Índice do Projeto

### 🔧 Hardware & Firmware
- [[🔌 Sensores e Comunicação]]: Protocolo CAN 29-bit, endereços confirmados, PIDs ativos e scheduler dinâmico.
- [[🚀 Plano de Implementação ESP32-OBD2]]: Arquitetura do firmware v7.0, scheduler dinâmico, fsTask antilag no Core 0.
- [[🔧 Hardware e Pinagem]]: SN65HVD230, OBD2 connector, pinos do ESP32, diagrama elétrico.

### 🖥️ Interface & Frontend
- [[🖥️ Interface e Widgets]]: Todos os tipos de medidores disponíveis (Arcos, Barras, Agulhas, Luzes Espia).
- [[🗂️ Estrutura de Arquivos]]: Modularização do código v7.0 — `state.js`, `renderers.js`, `editor.js`, `main.js`, `transport.js`, `profiles_db.js`.
- [[📱 App Android (APK)]]: Capacitor + Bluetooth Serial, build, instalação e arquitetura do app nativo.
- [[🚀 Animação de Inicialização]]: Sequência de Boot cinematográfico com rastros PCB e Neon.

### 📋 Gestão
- [[📝 Lista de Tarefas]]: Backlog atualizado — o que foi feito, o que falta e os próximos passos reais.
- [[🏆 Log de Conquistas]]: Registro das vitórias técnicas mais importantes do projeto.

---

## 📊 Estado Atual do Sistema (v7.0 — COMPILADO)

| Componente | Status | Detalhe |
|:---|:---:|:---|
| Conexão CAN Bus | ✅ FUNCIONAL | 29-bit @ 500kbps, SN65HVD230 |
| Handshake ECU | ✅ FUNCIONAL | `0x18DB33F1` → `0x18DAF111` |
| Bluetooth Classic | ✅ FUNCIONAL | RFCOMM, nome `PULSESCAN` |
| RPM | ✅ FUNCIONAL | PID `0x0C`, 20Hz |
| Velocidade | ✅ FUNCIONAL | PID `0x0D`, 20Hz |
| Borboleta (TPS) | ✅ FUNCIONAL | PID `0x11`, dinâmico |
| Pedal Real (APP) | ✅ FUNCIONAL | PID `0x49`, dinâmico |
| Carga do Motor | ✅ FUNCIONAL | PID `0x04`, dinâmico |
| MAP / Boost | ✅ FUNCIONAL* | PID `0x0B` + fallback virtual |
| MAF / Vazão Ar | ✅ FUNCIONAL | PID `0x10`, dinâmico |
| Consumo (L/h) | ✅ FUNCIONAL* | PID `0x5E` + fallback Flex |
| Voltagem | ✅ FUNCIONAL | PID `0x42`, lento |
| Temp. Água | ✅ FUNCIONAL | PID `0x05`, lento |
| Catalisador | ✅ FUNCIONAL | PID `0x3C`, lento |
| Temp. Ar | ✅ FUNCIONAL | PID `0x46`, lento |
| Nível Combustível | ✅ FUNCIONAL | PID `0x2F` + Slosh Mitigation |
| Etanol % | ✅ FUNCIONAL | PID `0x52`, startup + lento |
| Pressão Óleo (P2) | ✅ FUNCIONAL | PID estendido `0x00` (resolvida colisão) |
| Temp. Óleo (P2) | ✅ FUNCIONAL | PID estendido `0x5C` |
| Pressão Combust. (P2) | ✅ FUNCIONAL | PID estendido `0x0A` |
| Temp. Escape EGT (P2) | ✅ FUNCIONAL | PID estendido `0x78` (2 bytes) |
| Mistura AFR (P2) | ✅ FUNCIONAL | PID estendido `0x44` |
| Lambda (P2) | ✅ FUNCIONAL | PID estendido `0x24` |
| Timing Ignição (P2) | ✅ FUNCIONAL | PID estendido `0x0E` |
| Temp. Admissão IAT (P2)| ✅ FUNCIONAL | PID estendido `0x0F` |
| App Android (APK) | ✅ FUNCIONAL | Capacitor + Bluetooth Serial |
| Canvas 60fps | ✅ FUNCIONAL | requestAnimationFrame nativo |
| Editor de Widgets | ✅ FUNCIONAL | Drag-and-drop, cores, tamanhos |
| Imagens Personalizadas | ✅ FUNCIONAL | Galeria → relógio de fundo |
| Compilação CLI | ✅ FUNCIONAL | `arduino-cli` integrado ao Antigravity |

> \* MAP e Consumo usam fallback estequiométrico Flex (MAF + Etanol%) quando a ECU não retorna o PID físico.

---

## 🏁 Histórico de Versões (Resumo)

| Versão | Data | Mudança Principal |
|:---|:---:|:---|
| **v1-v3** | 2026-05 | Apenas frontend (Canvas + Widgets). Dados simulados. |
| **v4.0** | 2026-05 | Modularização do JS. ELM327 Bluetooth como fonte de dados. |
| **v5.0** | 2026-05-16 | **Migração Total** para CAN Bus nativo (TWAI). Descartado o ELM327. |
| **v5.1** | 2026-05 | Timeout 100ms, handshake 10 tentativas, LED status, `vTaskDelay` 20ms. |
| **v5.4.1** | 2026-05 | Suavização individual por ponteiro, cronômetro 0-100, histórico. |
| **v6.0** | 2026-05-20 | **App Android nativo (APK).** Bluetooth Classic RFCOMM. Scheduler circular 10 slots. Canvas 30fps. 15 sensores confirmados. |
| **v6.2** | 2026-05-23 | **Testado no carro.** Otimizações de UI e compilação CLI. UDS 22 testado sem sucesso. |
| **v6.3** | 2026-05-24 | Remoção do *shadowBlur* para fim do thermal throttling no Android e adição de Lazy Render. |
| **v6.4** | 2026-05-27 | Criação do *utils.js* (quebra de import circular), reset manual do painel, e alertas de storage cheio. |
| **v6.5-v6.6**| 2026-05-30 | Collision test de Z-index exato, scroll fixo no editor, dropdown de inércia e novos sensores (turbo, MAF, etc.). |
| **v6.7-v6.8**| 2026-06-08 | Integração de 16 agulhas categorizadas (Cor Variável, Fixa e Pontas), optgroup no editor e auto-escala 1.35x nas pontas. |
| **v6.9** | 2026-06-09 | Sincronização de assets, Capacitor sync, compilação debug via JBR Gradle e lançamento do APK v6.9. |
| **v7.0** | 2026-06-11 | **Universalização e JIT Cache.** Frame binário de 51 bytes. 8 novos sensores de Prioridade 2 ativos. Escritas no LittleFS 100% assíncronas via `fsTask` no Core 0 (viagem, não suportados, configs, dia). JIT Cache de formulas em Map local, event delegation no histórico e fim de delays bloqueantes na ESP32. Lançamento do APK v7.0. |

---

**Tags:** #pulsedash #esp32 #canbus #onix2026 #obd2 #iot #automotivo #twai #bluetooth #android
