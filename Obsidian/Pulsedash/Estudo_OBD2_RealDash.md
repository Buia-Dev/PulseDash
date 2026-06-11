# 📚 Estudo OBD2 & CAN - RealDash GitHub (Referências para o PulseScan)

Este documento centraliza os aprendizados extraídos do repositório oficial [RealDash-extras](https://github.com/janimm/RealDash-extras), especificamente focados na comunicação OBD2 e CAN, visando a arquitetura e expansão do **PulseScan**.

---

## 1. Arquitetura XML do RealDash para OBD2

A comunicação OBD2 via adaptadores compatíveis com ELM327 é feita através de descrições em arquivos XML. Esta lógica é excelente para usarmos no nosso app (ou no PulseScan) para permitir a **leitura dinâmica de novos veículos** sem precisar recompilar código.

O arquivo XML é estruturado basicamente em duas seções:
*   `<init>`: Lista de comandos de inicialização.
*   `<rotation>` (implícito ou por comandos repetidos): Lista de PIDs a serem escaneados continuamente.

### A. A Sessão de Inicialização (`<init>`)

Quando o aplicativo conecta ao scanner, ele envia uma sequência de configuração. Os comandos abaixo são o "padrão ouro" deles para configurar o ELM327 (que podem nos inspirar a configurar o L9637D e o chip CAN):
*   `ATD`: Set para defaults.
*   `ATZ`: Reset geral.
*   `ATAT1`: Adaptive Timing (ajuste automático de timing, muito bom para K-Line antigo).
*   `ATST62`: Set timeout para comunicação (reduz lag esperando resposta nula).
*   `ATSP0`: Set Protocol to Auto (Deixa o chip achar a rede).
*   `ATE0`, `ATL0`, `ATS0`: Echo Off, Linefeeds Off, Spaces Off (Vital para o microcontrolador não engasgar parseando strings com espaços).
*   `ATH1`: Headers On (Recebe o ID de quem enviou, vital para ler CAN/K-Line e saber se é da ECU principal ou câmbio).
*   `0100` e `0120`: Estes são PIDs (Mode 1, PID 00 e 20) que retornam "PIDs suportados". Serve como handshake com o carro para não ficar pedindo o que o carro não tem.

### B. Escaneamento e Otimização (`<command>`)

O aprendizado mais valioso aqui para nosso controle de **lag** (que estávamos debatendo) é como o RealDash trata a rotatividade (polling) dos dados:

```xml
<command send="010c" skipCount="0" targetId="37" conversion="V/4"></command>
```

*   **`send`**: O PID sendo requisitado. No caso, `010C` (RPM).
*   **`skipCount`**: **OURO PURO!** Eles definem um número de vezes para *pular* o envio desse comando no loop de repetição.
    *   Exemplo: Para RPM (`010C`), `skipCount="0"` (Lê todo loop, prioridade máxima).
    *   Para Temperatura (ex: `0105`), `skipCount="60"` (Pula 60 loops antes de pedir de novo). **Isso libera banda no barramento e evita lag nos dados rápidos.**
*   **`conversion`**: Fórmula matemática aplicada direto no parser. `V/4` para o RPM (onde V é o valor inteiro dos 2 bytes retornados).
*   **`targetId` / `name`**: Mapeamento para qual gauge do painel ele vai preencher.

---

## 2. PIDs Específicos e Montadoras

O repositório contém arquivos preciosos para carros que fogem do OBD2 genérico:
*   **GM LS (realdash_obd2_gm_ls.xml)**: Contém PIDs específicos estendidos da linha GM, que usam headers diferenciados para injetar requisições diretas na injeção LS.
*   **Fiat Pre-CAN**: K-Line puro, protocolos antigos usando timings customizados.
*   **Toyota / Nissan / Volvo**: Protocolos MUT, JDM e ISO9141 específicos.

**O que aprendemos com isso:**
Se um carro não for lido pelo PulseScan genérico, nós não precisamos de "hardware novo". Nós precisaremos criar uma camada de *Profile* (Perfil) no aplicativo PulseDash, onde o usuário seleciona "Onix 2026" e o aplicativo envia um "pacote JSON de configuração" para o ESP32 informando o "Baudrate", o "Header/Filter" e os "PIDs exatos" daquele carro, inspirados nesses XMLs.

---

## 3. RealDash CAN Protocol (DIY Devices)

Eles criaram um protocolo serial focado em hardwares caseiros e dispositivos aftermarket, que é extremente parecido com o que estamos estruturando.

### A Estrutura de Frames (Tag '44')
O protocolo deles tenta simular a rede CAN diretamente por Serial/Bluetooth.

*   O dispositivo manda um header fixo de 8 bytes, e logo depois 8 bytes de dados:
    *   4 bytes de sincronização: `0x44, 0x33, 0x22, 0x11` (isso garante que se um byte for perdido, o parser recupere a sincronia na próxima mensagem - muito inteligente para Bluetooth/Serial).
    *   4 bytes contendo o CAN ID (Little Endian).
    *   8 bytes do payload (exatamente os 8 bytes que vêm do barramento CAN).

### Porque o deles funciona e o nosso via JSON é diferente:
*   Eles mandam tudo em **Binário (Raw bytes)**. É extremamente leve. Nós estamos usando WebSockets enviando objetos **JSON** `{ rpm: 3000, speed: 60 }`.
*   O JSON é muito fácil de ler no Canvas JS, porém gasta muito mais processamento no ESP32 para concatenar strings (`String()`) e gasta muito mais bytes no buffer de Wi-Fi/Bluetooth do que enviar em binário puro e parsear os bytes no JavaScript usando `DataView` ou `ArrayBuffer`.

---

## 🚀 Conclusão e Próximos Passos para o PulseScan

1.  **Skip Polling System:** O software do ESP32/L9637D *precisa* ter uma estrutura de prioridade. PIDs como RPM, TPS, MAP e Velocidade = prioridade 0 (consulta sem parar). Temperatura de água, ar, tensão de bateria = prioridade 10 (consulta 1 vez a cada 10 ciclos). Isso vai **eliminar 90% do lag residual**.
2.  **Arquitetura Baseada em Perfis (XML/JSON de Carros):** Fazer o PulseScan *burro* e o app *inteligente*. O app baixa os "XMLs/Perfis" de carros da nuvem/memória local, e injeta o perfil na memória do PulseScan na hora de conectar. Assim, um único aparelho servirá pra tudo e lerá a velocidade máxima.
3.  **Parsing Binário:** Num futuro próximo de otimização pesada (v6.0+), o ESP32 deixará de enviar JSON e passará a enviar `ArrayBuffer` binário direto via Websocket para o aplicativo.
