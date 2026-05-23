# 🏆 Log de Conquistas

> Registro das vitórias técnicas mais importantes. Cada entrada aqui custou horas de debug, testes no carro e determinação. Não é programador, mas resolve! 💪

---

## 🥇 A Grande Conquista — CAN Bus Nativo (2026-05-16)

**O que foi:** Descartamos completamente o ELM327 Bluetooth e implementamos leitura **direta** da rede CAN do Onix 2026 usando o driver TWAI nativo do ESP32 com o módulo SN65HVD230.

**Por que é difícil:** O Onix 2026 usa um **Security Gateway** da GM que ignora frames CAN de 11-bit (padrão). Somente o endereçamento **Extended de 29-bit** com o endereço específico `0x18DB33F1` consegue comunicação.

**O momento:** Após horas de debug com logs de "ECU em silêncio", a tela mostrou:
```
[CAN] Handshake OK! ECU detectada: 0x18daf111
[CAN] ★ ONLINE! Dashboard ativo.
```

**Dados confirmados em tempo real:**
- Temperatura: **35°C** (motor frio) → **90°C** (temperatura normal)
- Acelerador: mudou de **43% → 26%** conforme o pedal foi liberado
- RPM máximo registrado: **6.418 RPM**
- Velocidade máxima registrada: **115 km/h**

---

## 🥈 Descoberta do GND do Chassi (2026-05)

**O que foi:** Semanas de frustração com "Driver OK mas sem resposta da ECU". O motivo era simples mas invisível: faltava conectar o **GND do pino 4/5 do OBD2** ao GND do ESP32.

**Lição:** Em sistemas CAN, o GND é a referência para os níveis de tensão diferencial (CAN-H e CAN-L). Sem ele, o transceiver literalmente não "vê" os bits.

---

## 🥉 Curto CAN-H/CAN-L (2026-05)

**O que foi:** Mesmo com o GND conectado, o driver entrava em Bus-Off imediato. A causa foi um curto físico nas pistas da PCB do conector OBD2 que havíamos adquirido.

**Solução:** Raspagem manual das pistas de cobre com uma chave de fenda até o curto desaparecer. Depois disso, o barramento estabilizou.

---

## 🎖️ Modularização do Frontend (v4.0)

**O que foi:** O arquivo `index.html` tinha crescido para quase 60KB com todo o CSS e JS embutido — impossível de manter. Dividimos em `state.js`, `renderers.js`, `editor.js` e `main.js`.

**Resultado:** Cada arquivo tem uma responsabilidade única. O código ficou 10x mais fácil de editar.

---

## 🎖️ PWA Funcional no Celular

**O que foi:** O dashboard agora pode ser instalado como app na tela inicial do celular (iOS e Android). Funciona com ícone personalizado, tela cheia sem barra do navegador e cache offline via Service Worker.

**Resultado:** Experiência idêntica a um app nativo sem precisar publicar na App Store.

---

## 🎖️ WebSocket em Tempo Real (v4.1 → v5.0)

**O que foi:** Migramos do polling HTTP (requisição a cada 1 segundo) para **WebSocket** (porta 81). O ESP32 empurra os dados automaticamente a cada 100ms.

**Resultado:** Os ponteiros do dashboard ficaram "vivos" — sem o salto brusco de 1 em 1 segundo.

---

## 🎖️ Integração e Ativação Plena das Ferramentas MCP (2026-05-20)

**O que foi:** Diagnosticamos e eliminamos os gargalos de execução nos servidores MCP integrados à IDE. Criamos a pasta global NPM em `AppData\Roaming\npm`, atualizamos o Node.js para **v24.15.0** e ativamos o Docker Desktop para o `github-mcp-server`.

**Resultado:** Ambos os servidores MCP estão 100% ativos, permitindo o pair-programming de IA no mais alto nível de engenharia.

---

## 🎖️ v6.2 — Sessão Épica de 3 Fases (2026-05-23)

Esta sessão foi a mais importante e produtiva do projeto. Dividida em 3 fases de implementação.

---

### ⚡ Fase 1 — Análise Claude + Refatoração Arquitetural

**O que foi:** O Claude deu uma nota **9.6/10** ao projeto e indicou o caminho para prepará-lo para o APK. Executamos todas as suas sugestões de alta prioridade:

**Extração de módulos de `main.js` (era 1.035 linhas → agora modular):**
- `trip.js` — Todo o Computador de Bordo (TRIP: distância, combustível, custo, timers)
- `perf.js` — Cronômetro 0-100 com state machine (IDLE→WAIT_STOP→READY→RUNNING→DONE), Top 5, histórico
- `transport.js` — Camada de abstração de comunicação (Bluetooth Serial nativo vs. WebSocket)

**Sistema de Orientações (Portrait/Landscape independentes):**
- Criado o objeto `orientations: { portrait: [...], landscape: [...] }` no estado global
- Cada orientação tem seu próprio layout de widgets completamente independente
- `swapOrientation()` refeito para limpar apenas camadas específicas, eliminando duplicação

**Correção do bug `w._sv` (suavização):**
- `saveToESP()` agora deleta `w._sv` antes de serializar a config
- `applyConfig()` limpa o `_sv` ao trocar de sensor para evitar suavização de valor errado

**UDS Service 22 (PIDs Proprietários GM):**
- `canReadUDS()` implementado para Temp. Câmbio (`0x1940`), Pressão Óleo (`0x115C`), Temp. Óleo (`0x1154`)
- `canSendUDS()` com frame correto de 8 bytes e endereço físico `0x18DA11F1`

**Fallback de Consumo Flex Estequiométrico:**
- Quando PID `0x5E` falha, calcula via MAF + Etanol%:
  - AFR dinâmico: `14.7*(1-eth) + 9.0*eth`
  - Densidade real: `737*(1-eth) + 789*eth` g/L
  - Resultado em L/h correto para qualquer mistura E0-E100

**Slosh Mitigation (mitigação de balanço do tanque):**
- 3 modos: Fast-Fill (abastecimento), Bloqueio Inercial (frenagem/aceleração), Suavização lenta (cruzeiro)
- Algoritmo EMA com pesos diferentes por cenário

---

### 🐛 Fase 2 — Debug de UI e Build do APK

**O que foi:** Série de bugs visuais e de build foram identificados e corrigidos:

**Ícones do APK com XML corrompido:**
- `ic_launcher.xml` e `ic_launcher_round.xml` tinham BOM UTF-8 que causava `XMLStreamException`
- Recriados do zero com XML limpo e layer-list correto

**Imagens personalizadas da galeria:**
- Usuário pode adicionar imagens da galeria do celular como fundo de relógio
- `LOCAL_IMAGES` expandido com suporte a `pulsedash_custom_images` no localStorage
- Mover, redimensionar e deletar imagens customizadas funcionando

**Duplicação de relógios ao girar o celular:**
- `swapOrientation()` chamava `innerHTML = ''` no container inteiro
- Corrigido para limpar apenas `wl-0`, `wl-1`, etc. (camadas específicas)

**Cores dos arcos/agulhas não salvavam:**
- `applyConfig()` pegava valores de inputs ocultos (`display:none`) e sobrescrevia as cores corretas
- Corrigido com filtro `if (input.offsetParent !== null)` antes de ler o valor

**Fontes +2px em tudo:**
- Script varreu `style.css` e incrementou em 2px todos os `font-size` do menu, overlays e etiquetas

**Botão ↔ no Editor:**
- Restaurado no cabeçalho do `#cpanel`
- `document.getElementById('cpanel').classList.toggle('right')` — alterna lado instantaneamente

---

### 🔧 Fase 3 — Compilação, Correção de Runtime e Teste no Carro

**O que foi:** Integração do `arduino-cli`, correção dos últimos bugs de runtime e validação final em pista.

**`arduino-cli` integrado ao Antigravity:**
- Download e configuração do core `esp32:esp32@3.3.8`
- Correção do `}` faltando no final da função `loop()` (engolido numa refatoração)
- Compilação bem-sucedida: **1.119.484 bytes (85% do flash)**, 42.136 bytes RAM (12%)
- Firmware `.bin` gerado em `APK/Firmware/PulseDashESP_BT.ino.bin`

**Bug `Script error. Linha: 0:0` (tela vermelha ao conectar BT):**
- Falso positivo do Android WebView ao carregar módulos ES6 com `import/export`
- O `window.onerror` recebia o evento sem arquivo, linha ou stack (segurança do browser)
- Fix: `if (e.message === 'Script error.' || (!e.filename && e.lineno === 0)) return;`

**Bug `_freqHz is not defined` (crash no menu OBD):**
- Variáveis `_freqHz`, `_freqCounter`, `_freqTimer`, `_blinkTimer` foram perdidas numa refatoração
- Declaradas no escopo global do `main.js`

**Repositório oficial sincronizado:**
- `PulseDashESP_BT/` contém apenas o `PulseDashESP_BT.ino` (sem pasta `data` do LittleFS)
- `APK/` contém `PulseDash_v6.2.apk` e `Firmware/PulseDashESP_BT.ino.bin`

**✅ TESTE NO CARRO — RESULTADO:** `"ja ta lendo certim"` — Buia, 2026-05-23

---

## 📊 Linha do Tempo do Projeto

```
[v1-v2] Canvas + Widgets simulados (sem hardware)
   ↓
[v3.x]  Integração ELM327 Bluetooth — funcionou mas com alta latência
   ↓
[v4.0]  Modularização JS + WebSocket + PWA
   ↓
[v5.0]  ★ MIGRAÇÃO TOTAL para CAN Bus 29-bit nativo
   ↓
[v5.1]  Otimizações de performance (100ms timeout, 20ms delay, 10 tentativas)
   ↓
[v5.4.1] Suavização por ponteiro, cronômetro 0-100
   ↓
[v6.0]  App Android nativo + Bluetooth Classic RFCOMM + Scheduler 10 slots
   ↓
[v6.2]  ★ SESSÃO ÉPICA: 3 fases — Arquitetura + Debug UI + Compilação CLI
         ★ PRIMEIRA SAÍDA DE RUA — Leitura confirmada no Onix 2026
```

---

**Links:** [[⚙️ Painel de Controle (Home)]] | [[📝 Lista de Tarefas]]  
**Tags:** #conquistas #historico #milestones #canbus #pulsedash
