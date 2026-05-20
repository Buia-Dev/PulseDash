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

**O que foi:** Diagnosticamos e eliminamos os gargalos de execução nos servidores MCP integrados à IDE. Criamos a pasta global NPM em `AppData\Roaming\npm` (que causava o erro `ENOENT` e bloqueava o `npx`), atualizamos o Node.js global no Windows do Buia para a versão LTS ultra-moderna **v24.15.0** (corrigindo incompatibilidades do `chrome-devtools-mcp`) e ativamos o Docker Desktop para subir o contêiner oficial `github-mcp-server`.

**Resultado:** Ambos os servidores MCP estão 100% ativos, operacionais e respondendo sem latência, permitindo o pair-programming de IA no mais alto nível de engenharia para o PulseDash.

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
```

---

**Links:** [[⚙️ Painel de Controle (Home)]] | [[📝 Lista de Tarefas]]  
**Tags:** #conquistas #historico #milestones #canbus #pulsedash
