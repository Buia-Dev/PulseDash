# 🤖 Atualizações para IAs

> Este arquivo é um resumo técnico rápido para "sincronizar" outras IAs com o estado atual do projeto PulseDash sem precisar ler toda a documentação.

---

## 📅 Última Atualização: 2026-05-20
**Versão Atual:** v5.4.1 (Estável em Pista) → **v5.5 (Em Planejamento Ativo)**

### ⚡ Status do Ambiente de IA & MCP (Novo)
- **Servidores MCP:** Ativos e integrados à IDE! O `github-mcp-server` está rodando em segundo plano via Docker e o `chrome-devtools-mcp` opera perfeitamente sob o Node.js v24.15.0. 
- **NPM Fix:** Estrutura de pastas globais criada e restrições de script contornadas.

### 🛠️ Estado Atual do Firmware (v5.4.1 Estável)
- **Protocolo:** CAN Bus 29-bit nativo (TWAI) instalada e operando. ELM327 Bluetooth removido 100%.
- **Endereço Onix 2026:** TX `0x18DB33F1` / RX `0x18DAF111` @ 500kbps.
- **PIDs Ativos:** RPM (`0x0C`), Velocidade (`0x0D`), Borboleta (`0x11`), Pedal Real (`0x49`), Combustível (`0x2F` com filtro EMA 1Hz), Carga do Motor (`0x04`), Boost (`0x0B`), Catalisador (`0x3C`), Voltagem (`0x42`) e Etanol (`0x52`).
- **Suavização Individual:** Slider `smoothK` ativo no editor para widgets do tipo `agulha_pura` no JS.


---

## 🚀 Plano para a v5.5 (Próxima Fase Imediata)

1.  **Escalonador Triplo Intercalado de CAN:**
    *   Para evitar jitter e engasgos nos ponteiros VIP de alta frequência, criaremos slots dinâmicos de leitura na `obdTask` (Core 0), garantindo que **no máximo 1 sensor auxiliar** seja lido por loop principal.
    *   *VIP (A cada ~60ms):* RPM, Speed, Throttle, Pedal.
    *   *Médio (1s):* Fuel Level, Fuel Rate (Consumo), Load (Carga do Motor).
    *   *Lento (5s):* Coolant, Ambient, Voltage, Catalyst, Boost.
    *   *Ultra-Lento (Startup + 5min):* Etanol % (`0x52`) lido apenas uma vez no handshake OK e verificado a cada 5min.

2.  **Ajuste do Aborto de Largada (0-100):**
    *   Aumentar tolerância de frenagem de 2 km/h para **15 km/h** no JS para aguentar destracionamento (cantada de pneu) na arrancada. Adicionar reset ao parar totalmente.

3.  **Persistência Física do Rank Top 5 no ESP32 (`LittleFS`):**
    *   Criar rotas HTTP `/perf` (GET/POST) no ESP32.
    *   O JS lê, ordena por menor tempo e grava no arquivo `/perf.txt` no ESP32 como texto simples compacto: `DD/MM/YY 0a50 SS.XXX 0a100 SS.XXX`.
    *   Manter a exibição da puxada "Atual" no dashboard web mesmo que ela não qualifique para o Top 5.

---

## 🔮 Roteiro para a v6.0 (Computador de Bordo e PIDs GM)

1.  **Computador de Bordo (Trip Computer):**
    *   Tela de estatísticas sem gráficos com cards translúcidos de Distância, Vel. Média, Combustível gasto (L), Consumo Médio (km/L), Custos de viagem e Tempos.
    *   **Cálculo Otimizado:** Distância integrada via Speed VIP. Combustível integrado apenas no tick de 1s (médio) do Fuel Rate, com **zero overload na CAN**.
    *   **Consumo Flex Fallback:** Caso a vazão do PID `0x5E` retorne zero, calcula via **MAF (PID `0x10`) + Etanol %** ajustando a estequiometria (AFR) e densidade real do combustível.
2.  **PIDs Proprietários GM Service 22:**
    *   Monitoramento avançado via cabeçalho `7E0`: Temperatura de Câmbio (`221940`), Pressão de Óleo (`22115C`), Temp. Óleo (`221154`) e Ângulo do Volante (`222411`).

---

**Dica para a IA:** Respeite a integridade do código sem placeholders. Mantenha a otimização extrema no Core 0 do ESP32 para evitar latência CAN.
