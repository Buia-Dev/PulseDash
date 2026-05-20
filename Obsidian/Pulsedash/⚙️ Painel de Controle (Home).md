# 🏎️ PulseDash — Hub de Desenvolvimento

> **Versão Atual: v5.1** | Status: ✅ **OPERACIONAL** | Protocolo: **CAN Bus 29-bit (TWAI)**

Bem-vindo à base de conhecimento central do **PulseDash**, o painel de instrumentos digital premium construído do zero para o **Onix 2026**, servindo também como plataforma universal para outros veículos.

O projeto evoluiu de uma ideia com ELM327 Bluetooth para um sistema de **leitura nativa direta da rede CAN do veículo**, eliminando qualquer intermediário e alcançando latência real abaixo de 20ms.

---

## 🧭 Índice do Projeto

### 🔧 Hardware & Firmware
- [[🔌 Sensores e Comunicação]]: Protocolo CAN 29-bit, endereços confirmados, PIDs ativos e fluxo de dados real.
- [[🚀 Plano de Implementação ESP32-OBD2]]: Arquitetura do firmware v5.1, tarefas FreeRTOS, logging e recuperação de bus-off.
- [[🔧 Hardware e Pinagem]]: SN65HVD230, OBD2 connector, pinos do ESP32, diagrama elétrico.

### 🖥️ Interface & Frontend
- [[🖥️ Interface e Widgets]]: Todos os tipos de medidores disponíveis (Arcos, Barras, Agulhas, Luzes Espia).
- [[🗂️ Estrutura de Arquivos]]: Modularização do código v5.0 — `state.js`, `renderers.js`, `editor.js`, `main.js`.
- [[🚀 Animação de Inicialização]]: Sequência de Boot cinematográfico com rastros PCB e Neon.

### 📋 Gestão
- [[📝 Lista de Tarefas]]: Backlog atualizado — o que foi feito, o que falta e os próximos passos reais.
- [[🏆 Log de Conquistas]]: Registro das vitórias técnicas mais importantes do projeto.

---

## 📊 Estado Atual do Sistema (v5.1)

| Componente | Status | Detalhe |
|:---|:---:|:---|
| Conexão CAN Bus | ✅ FUNCIONAL | 29-bit @ 500kbps, SN65HVD230 |
| Handshake ECU | ✅ FUNCIONAL | `0x18DB33F1` → `0x18DAF111` |
| Leitura RPM | ✅ FUNCIONAL | PID `0x0C`, taxa ~5-8 Hz |
| Leitura Velocidade | ✅ FUNCIONAL | PID `0x0D`, `0-255 km/h` |
| Temperatura Água | ✅ FUNCIONAL | PID `0x05`, confirmado `35°C~90°C` |
| Acelerador (Throttle) | ✅ FUNCIONAL | PID `0x11`, responsivo ao pedal |
| Tensão da Bateria | ✅ FUNCIONAL | PID `0x42`, `12.xx~14.xx V` |
| Wi-Fi Dashboard | ✅ FUNCIONAL | SSID `BuiUber`, IP `192.168.x.x` |
| Log em Flash | ✅ FUNCIONAL | LittleFS, `EcoLog` a cada 5s |
| WebSocket Telemetria | ✅ FUNCIONAL | Porta 81, push a cada 100ms |
| Recuperação Bus-Off | ✅ FUNCIONAL | Auto-recovery sem hard reset |

---

## 🏁 Histórico de Versões (Resumo)

| Versão | Mudança Principal |
|:---|:---|
| **v1-v3** | Apenas frontend (Canvas + Widgets). Dados simulados. |
| **v4.0** | Modularização do JS. ELM327 Bluetooth como fonte de dados. |
| **v5.0** | **Migração Total** para CAN Bus nativo (TWAI). Descartado o ELM327. |
| **v5.1** | Timeout de 100ms, handshake com 10 tentativas, LED status, `vTaskDelay` 20ms. |

---

**Tags:** #pulsedash #esp32 #canbus #onix2026 #obd2 #iot #automotivo #twai
