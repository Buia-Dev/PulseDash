# ⚙️ PulseDash — Hub de Desenvolvimento

> **Versão Atual: v6.2** | Status: ✅ **TESTADO NO CARRO** | Protocolo: **CAN Bus 29-bit (TWAI) + Bluetooth Classic**

Bem-vindo à base de conhecimento central do **PulseDash**, o painel de instrumentos digital premium construído do zero para o **Onix 2026**, servindo também como plataforma universal para outros veículos.

O projeto evoluiu de uma ideia com ELM327 Bluetooth para um sistema de **leitura nativa direta da rede CAN do veículo** e transmissão via **Bluetooth Classic (RFCOMM)** para um App Android nativo (APK via Capacitor).

---

## 🧭 Índice do Projeto

### 🔧 Hardware & Firmware
- [[🔌 Sensores e Comunicação]]: Protocolo CAN 29-bit, endereços confirmados, PIDs ativos e scheduler de slots.
- [[🚀 Plano de Implementação ESP32-OBD2]]: Arquitetura do firmware v6.0, scheduler circular, Bluetooth RFCOMM.
- [[🔧 Hardware e Pinagem]]: SN65HVD230, OBD2 connector, pinos do ESP32, diagrama elétrico.

### 🖥️ Interface & Frontend
- [[🖥️ Interface e Widgets]]: Todos os tipos de medidores disponíveis (Arcos, Barras, Agulhas, Luzes Espia).
- [[🗂️ Estrutura de Arquivos]]: Modularização do código v6.0 — `state.js`, `renderers.js`, `editor.js`, `main.js`, `transport.js`.
- [[📱 App Android (APK)]]: Capacitor + Bluetooth Serial, build, instalação e arquitetura do app nativo.
- [[🚀 Animação de Inicialização]]: Sequência de Boot cinematográfico com rastros PCB e Neon.

### 📋 Gestão
- [[📝 Lista de Tarefas]]: Backlog atualizado — o que foi feito, o que falta e os próximos passos reais.
- [[🏆 Log de Conquistas]]: Registro das vitórias técnicas mais importantes do projeto.

---

## 📊 Estado Atual do Sistema (v6.2 — TESTADO NO CARRO)

| Componente | Status | Detalhe |
|:---|:---:|:---|
| Conexão CAN Bus | ✅ FUNCIONAL | 29-bit @ 500kbps, SN65HVD230 |
| Handshake ECU | ✅ FUNCIONAL | `0x18DB33F1` → `0x18DAF111` |
| Bluetooth Classic | ✅ FUNCIONAL | RFCOMM, nome `PULSESCAN` |
| RPM | ✅ FUNCIONAL | PID `0x0C`, 20Hz |
| Velocidade | ✅ FUNCIONAL | PID `0x0D`, 20Hz |
| Borboleta (TPS) | ✅ FUNCIONAL | PID `0x11`, ~6.6Hz |
| Pedal Real (APP) | ✅ FUNCIONAL | PID `0x49`, ~4Hz |
| Carga do Motor | ✅ FUNCIONAL | PID `0x04`, ~2Hz |
| MAP / Boost | ✅ FUNCIONAL* | PID `0x0B` + fallback virtual |
| MAF / Vazão Ar | ✅ FUNCIONAL | PID `0x10`, ~2Hz |
| Consumo (L/h) | ✅ FUNCIONAL* | PID `0x5E` + fallback Flex |
| Voltagem | ✅ FUNCIONAL | PID `0x42`, ~0.28Hz |
| Temp. Água | ✅ FUNCIONAL | PID `0x05`, ~0.28Hz |
| Catalisador | ✅ FUNCIONAL | PID `0x3C`, ~0.28Hz |
| Temp. Ar | ✅ FUNCIONAL | PID `0x46`, ~0.28Hz |
| Nível Combustível | ✅ FUNCIONAL | PID `0x2F` + Slosh Mitigation |
| Etanol % | ✅ FUNCIONAL | PID `0x52`, startup + 5min |
| Temp. Câmbio (UDS) | ✅ IMPLEMENTADO | Service 22, PID `0x1940` |
| Pressão Óleo (UDS) | ✅ IMPLEMENTADO | Service 22, PID `0x115C` |
| Temp. Óleo (UDS) | ✅ IMPLEMENTADO | Service 22, PID `0x1154` |
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
| **v6.2** | 2026-05-23 | **Testado no carro.** Correções críticas de UI, fontes maiores, botão ↔ no editor, firmware compilado via arduino-cli, bugs de JS corrigidos. |

---

**Tags:** #pulsedash #esp32 #canbus #onix2026 #obd2 #iot #automotivo #twai #bluetooth #android
