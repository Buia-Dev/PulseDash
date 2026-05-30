# 🚗 Scan de Diagnóstico e Mapeamento — Honda Fit 2011/12

Esta nota documenta os resultados reais obtidos na varredura OBD2 realizada no **Honda Fit 2011/12 Flex (Segunda Geração - GE)** do amigo do Buia no dia **28 de Maio de 2026**. Esses dados servem como base para futuras expansões e calibrações de sensores no PulseDash.

---

## 🔌 Resumo da Conectividade e Barramento

* **Protocolo Detectado:** `ISO 15765-4 (CAN 29-bit Extended / 500kbps)`
* **Mapeamento de PIDs:** **34 sensores padrão ativos** respondidos com sucesso no Modo 01.
* **ID Físico da ECU:** `0x18DAF111` (ECU de Injeção Primária)
* **ID Físico do Scanner:** `0x18DA11F1`

---

## 📊 Lista Exata de PIDs Suportados pelo Honda Fit 2011/12

O Honda Fit 2011/12 respondeu positivamente para a seguinte lista de sensores no protocolo SAE J1979:

| PID | Nome / Descrição do Sensor | Leitura Bruta (RAW) | Valor Traduzido |
| :--- | :--- | :--- | :--- |
| **0x01** | Status dos monitores OBD | `0x00 0x05 0x61 0x21` | Diagnósticos OK |
| **0x03** | Status do sistema de combustível | `0x02 0x00` | Loop Fechado (Closed Loop) |
| **0x04** | Carga calculada do motor | `0x33` a `0x38` | ~20% a 22% de carga |
| **0x05** | Temperatura da água (Coolant) | `0x7C` | **82 °C a 84 °C** (Motor quente) |
| **0x06** | Short Term Fuel Trim (Ajuste Curto) | `0x7E` | **-1.5%** (Mistura excelente) |
| **0x0B** | MAP (Pressão do coletor) | `0x19` | **24 a 25 kPa** (Vácuo saudável) |
| **0x0C** | Rotação do motor (RPM) | `0xB0 0x11` | **701 a 730 RPM** (Marcha lenta) |
| **0x0D** | Velocidade do veículo | `0x00` | **0 km/h** (Parado) |
| **0x0E** | Ponto de Ignição (Timing Advance) | `0x80` | Ignição ativa padrão |
| **0x0F** | Temperatura do ar de admissão (IAT) | `0x52` | Temperatura ambiente / coletor |
| **0x10** | MAF (Fluxo de massa de ar) | `0x00 0x90` | **1.45 a 1.73 g/s** (Normal) |
| **0x11** | Posição da borboleta (Throttle) | `0x24` | **14.1% a 14.5%** (Marcha lenta) |
| **0x15** | Sonda Lambda Pós-Catalisador | `0x8B 0x7E` | **0.57V a 0.81V** (Oscilando) |
| **0x1F** | Tempo de funcionamento do motor | `0x00 0x5D` | ~1 a 2 minutos ligado |
| **0x2F** | Nível do Tanque de Combustível | `0xDD` | **86.7%** (Tanque cheio) |
| **0x3C** | Temperatura do Catalisador | `0x03 0xF0` | **48.6 °C a 63.8 °C** (Muito fria!) |
| **0x42** | Tensão do módulo de controle (Bateria) | `0x37 0xDC` | **14.13 V a 14.32 V** (Alternador OK) |

---

## 🚨 Diagnóstico Técnico: Erro de Catalisador (P0420)

O veículo acendeu a luz de injeção indicando falha no sistema do catalisador. Cruzando os dados de telemetria reais coletados no log, chegamos ao seguinte diagnóstico:

### 1. Catalisador Inoperante ou Ausente
* **Análise:** A temperatura do catalisador no log foi medida em apenas **63.8 °C**, com o motor já a **84 °C**. A catálise é uma reação química exotérmica e a temperatura de trabalho de um catalisador saudável é de **350 °C a 600 °C**.
* **Diagnóstico:** O catalisador não está gerando calor químico. Ou o elemento catalítico está saturado/desgastado/removido, ou o sensor de temperatura do escapamento está travado/danificado.

### 2. Oscilação da Sonda Lambda Pós-Catalisador (Sonda 2)
* **Análise:** A leitura de tensão da Sonda 2 (PID `0x15`) flutuou continuamente de **0.81 V** para **0.57 V** em marcha lenta.
* **Diagnóstico:** Em um sistema saudável, a Sonda 2 deve ficar estável e travada (geralmente entre 0.6V e 0.7V). A flutuação contínua prova que os gases e o oxigênio estão passando direto pela cerâmica do catalisador sem nenhuma filtragem, o que faz a ECU do carro acusar o código de erro de eficiência de catálise.

### 3. Integridade do Motor Perfeita
* **Análise:** O Ajuste de Combustível a Curto Prazo (Short Term Fuel Trim - PID `0x06`) ficou cravado em apenas **-1.5%** (quase 0%).
* **Diagnóstico:** O motor não tem problemas de mistura rica/pobre, bicos travados ou entradas de ar falso. O motor queima perfeitamente; a falha é puramente na peça do catalisador ou na sonda pós-catalisador.

---

## 🚀 Plano de Ação para Implementação Futura no PulseDash

Quando formos estender o aplicativo PulseDash para suportar o Honda Fit do seu amigo ou outros veículos semelhantes, devemos:
1. **Adotar CAN de 29 bits** (Extended ID), já que a ECU dele responde no mesmo barramento físico do Onix.
2. **Utilizar os mesmos PIDs** de RPM, MAP, Borboleta, Temperatura da Água e Voltagem mapeados aqui, mudando apenas os limites estéticos das barras no painel (ex: o Honda Fit tem corte de giro diferente do Onix).
3. **Mapeamento de VIN:** Usar a função `enviarOBDFisico` que implementamos no firmware de varredura para garantir que o Chassi seja lido de forma privada pela ECU `0x18DAF111` sem timeouts.
