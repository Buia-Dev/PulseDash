'use strict';

const DTC_DICTIONARY = {
  // P00xx - Medição de Combustível e Ar, Controle de Emissões Auxiliares
  "P0001": "Controle do Regulador de Volume de Combustível - Circuito Aberto",
  "P0002": "Controle do Regulador de Volume de Combustível - Faixa/Desempenho",
  "P0010": "Atuador do Comando de Válvulas (Admissão) - Circuito Aberto (Banco 1)",
  "P0011": "Posição do Comando de Válvulas Avançada (Admissão) (Banco 1)",
  "P0012": "Posição do Comando de Válvulas Atrasada (Admissão) (Banco 1)",
  "P0016": "Correlação Posição Virabrequim/Comando Válvulas (Banco 1, Sensor A)",
  "P0030": "Circuito de Aquecimento do Sensor de O2 (Banco 1, Sensor 1)",
  "P0031": "Circuito de Aquecimento do Sensor de O2 Baixo (Banco 1, Sensor 1)",
  "P0032": "Circuito de Aquecimento do Sensor de O2 Alto (Banco 1, Sensor 1)",
  "P0036": "Circuito de Aquecimento do Sensor de O2 (Banco 1, Sensor 2)",
  "P0037": "Circuito de Aquecimento do Sensor de O2 Baixo (Banco 1, Sensor 2)",
  "P0038": "Circuito de Aquecimento do Sensor de O2 Alto (Banco 1, Sensor 2)",
  "P0087": "Pressão da Linha/Sistema de Combustível - Muito Baixa",
  "P0088": "Pressão da Linha/Sistema de Combustível - Muito Alta",
  "P0090": "Atuador do Regulador de Pressão de Combustível 1 - Circuito Aberto",

  // P01xx - Medição de Combustível e Ar
  "P0100": "Falha no Circuito do Sensor de Fluxo de Ar (MAF)",
  "P0101": "Sensor de Fluxo de Ar (MAF) - Problema de Faixa/Desempenho",
  "P0102": "Sensor de Fluxo de Ar (MAF) - Baixa Entrada no Circuito",
  "P0103": "Sensor de Fluxo de Ar (MAF) - Alta Entrada no Circuito",
  "P0105": "Falha no Circuito do Sensor de Pressão Coletor (MAP)",
  "P0106": "Sensor de Pressão Coletor (MAP) - Problema de Faixa/Desempenho",
  "P0107": "Sensor de Pressão Coletor (MAP) - Sinal de Entrada Baixo",
  "P0108": "Sensor de Pressão Coletor (MAP) - Sinal de Entrada Alto",
  "P0110": "Falha no Circuito do Sensor de Temp. do Ar de Admissão (IAT)",
  "P0111": "Sensor de Temp. do Ar (IAT) - Problema de Faixa/Desempenho",
  "P0112": "Sensor de Temp. do Ar (IAT) - Entrada Baixa no Circuito",
  "P0113": "Sensor de Temp. do Ar (IAT) - Entrada Alta no Circuito",
  "P0115": "Falha no Circuito do Sensor de Temp. da Água do Motor (ECT)",
  "P0116": "Sensor de Temp. da Água (ECT) - Faixa/Desempenho do Circuito",
  "P0117": "Sensor de Temp. da Água (ECT) - Sinal de Entrada Baixo",
  "P0118": "Sensor de Temp. da Água (ECT) - Sinal de Entrada Alto",
  "P0120": "Falha no Circuito do Sensor de Posição da Borboleta/Pedal (TPS) 'A'",
  "P0121": "Sensor de Posição da Borboleta (TPS) 'A' - Faixa/Desempenho",
  "P0122": "Sensor de Posição da Borboleta (TPS) 'A' - Entrada Baixa",
  "P0123": "Sensor de Posição da Borboleta (TPS) 'A' - Entrada Alta",
  "P0130": "Circuito do Sensor de O2 (Banco 1, Sensor 1) - Falha Geral",
  "P0131": "Circuito do Sensor de O2 (Banco 1, Sensor 1) - Tensão Baixa",
  "P0132": "Circuito do Sensor de O2 (Banco 1, Sensor 1) - Tensão Alta",
  "P0133": "Circuito do Sensor de O2 (Banco 1, Sensor 1) - Resposta Lenta",
  "P0134": "Circuito do Sensor de O2 (Banco 1, Sensor 1) - Nenhuma Atividade",
  "P0135": "Circuito do Aquecedor do Sensor de O2 (Banco 1, Sensor 1) - Falha",
  "P0136": "Circuito do Sensor de O2 (Banco 1, Sensor 2) - Falha Geral",
  "P0137": "Circuito do Sensor de O2 (Banco 1, Sensor 2) - Tensão Baixa",
  "P0138": "Circuito do Sensor de O2 (Banco 1, Sensor 2) - Tensão Alta",
  "P0140": "Circuito do Sensor de O2 (Banco 1, Sensor 2) - Nenhuma Atividade",
  "P0141": "Circuito do Aquecedor do Sensor de O2 (Banco 1, Sensor 2) - Falha",
  "P0170": "Mau Funcionamento do Ajuste de Combustível (Banco 1)",
  "P0171": "Ajuste de Combustível Muito Pobre (Mistura Pobre - Banco 1)",
  "P0172": "Ajuste de Combustível Muito Rico (Mistura Rica - Banco 1)",
  "P0190": "Falha no Circuito do Sensor de Pressão do Combustível (FRP)",
  "P0191": "Sensor de Pressão do Combustível (FRP) - Faixa/Desempenho",

  // P02xx - Medição de Combustível e Ar (Circuito do Injetor)
  "P0200": "Falha no Circuito dos Injetores de Combustível - Geral",
  "P0201": "Falha no Circuito do Injetor do Cilindro 1",
  "P0202": "Falha no Circuito do Injetor do Cilindro 2",
  "P0203": "Falha no Circuito do Injetor do Cilindro 3",
  "P0204": "Falha no Circuito do Injetor do Cilindro 4",
  "P0205": "Falha no Circuito do Injetor do Cilindro 5",
  "P0206": "Falha no Circuito do Injetor do Cilindro 6",
  "P0217": "Condição de Superaquecimento do Motor",
  "P0219": "Condição de Rotação Excessiva do Motor (Over-Rev)",
  "P0220": "Circuito do Sensor de Posição da Borboleta/Pedal 'B' - Falha",
  "P0221": "Sensor de Posição da Borboleta/Pedal 'B' - Faixa/Desempenho",
  "P0222": "Sensor de Posição da Borboleta/Pedal 'B' - Entrada Baixa",
  "P0223": "Sensor de Posição da Borboleta/Pedal 'B' - Entrada Alta",
  "P0230": "Circuito Primário da Bomba de Combustível - Falha Geral",
  "P0231": "Circuito Secundário da Bomba de Combustível - Tensão Baixa",
  "P0232": "Circuito Secundário da Bomba de Combustível - Tensão Alta",
  "P0234": "Condição de Sobressaturação/Sobrecarga do Turbocompressor",
  "P0235": "Sensor de Pressão de Sobrealimentação (Turbo) 'A' - Falha",
  "P0299": "Subalimentação de Pressão do Turbocompressor / Supercharger",

  // P03xx - Sistema de Ignição ou Falha de Ignição
  "P0300": "Falha de Ignição Múltipla/Aleatória Detectada (Misfire)",
  "P0301": "Falha de Combustão/Ignição Detectada no Cilindro 1",
  "P0302": "Falha de Combustão/Ignição Detectada no Cilindro 2",
  "P0303": "Falha de Combustão/Ignição Detectada no Cilindro 3",
  "P0304": "Falha de Combustão/Ignição Detectada no Cilindro 4",
  "P0305": "Falha de Combustão/Ignição Detectada no Cilindro 5",
  "P0306": "Falha de Combustão/Ignição Detectada no Cilindro 6",
  "P0324": "Sistema de Controle de Detonação - Erro Interno",
  "P0325": "Falha no Circuito do Sensor de Detonação 1 (KS - Banco 1)",
  "P0326": "Sensor de Detonação 1 (KS) - Faixa/Desempenho (Banco 1)",
  "P0327": "Sensor de Detonação 1 (KS) - Entrada Baixa no Circuito",
  "P0328": "Sensor de Detonação 1 (KS) - Entrada Alta no Circuito",
  "P0330": "Falha no Circuito do Sensor de Detonação 2 (Banco 2)",
  "P0335": "Falha no Circuito do Sensor de Posição do Virabrequim (CKP)",
  "P0336": "Sensor de Rotação (CKP) - Faixa/Desempenho do Circuito",
  "P0339": "Circuito do Sensor de Rotação (CKP) - Sinal Intermitente",
  "P0340": "Falha no Circuito do Sensor de Posição do Comando (CMP)",
  "P0341": "Sensor de Fase (CMP) - Faixa/Desempenho do Circuito",
  "P0342": "Sensor de Fase (CMP) - Entrada Baixa no Circuito",
  "P0343": "Sensor de Fase (CMP) - Entrada Alta no Circuito",
  "P0351": "Bobina de Ignição 'A' (Primário/Secundário) - Falha no Circuito",
  "P0352": "Bobina de Ignição 'B' (Primário/Secundário) - Falha no Circuito",
  "P0353": "Bobina de Ignição 'C' (Primário/Secundário) - Falha no Circuito",
  "P0354": "Bobina de Ignição 'D' (Primário/Secundário) - Falha no Circuito",

  // P04xx - Controles de Emissão Auxiliares
  "P0400": "Falha no Fluxo de Recirculação dos Gases de Escape (EGR)",
  "P0401": "Fluxo de EGR Detectado como Insuficiente",
  "P0402": "Fluxo de EGR Detectado como Excessivo",
  "P0403": "Circuito de Controle da Válvula EGR - Falha",
  "P0420": "Eficiência do Catalisador Abaixo do Limite (Banco 1)",
  "P0430": "Eficiência do Catalisador Abaixo do Limite (Banco 2)",
  "P0440": "Falha Geral no Sistema de Controle de Emissões Evaporativas (EVAP)",
  "P0441": "Sistema EVAP - Fluxo de Purga Incorreto",
  "P0442": "Sistema EVAP - Vazamento Pequeno Detectado",
  "P0443": "Circuito da Válvula de Controle de Purga do EVAP (Canister) - Falha",
  "P0444": "Válvula de Purga do EVAP - Circuito Aberto",
  "P0445": "Válvula de Purga do EVAP - Curto-Circuito",
  "P0455": "Sistema EVAP - Vazamento Grande/Grave Detectado",
  "P0460": "Falha no Circuito do Sensor de Nível de Combustível",
  "P0461": "Sensor de Nível de Combustível - Faixa/Desempenho",
  "P0462": "Sensor de Nível de Combustível - Tensão Baixa",
  "P0463": "Sensor de Nível de Combustível - Tensão Alta",

  // P05xx - Controles de Velocidade do Veículo e Marcha Lenta
  "P0500": "Falha no Sensor de Velocidade do Veículo (VSS)",
  "P0501": "Sensor de Velocidade do Veículo (VSS) - Faixa/Desempenho",
  "P0502": "Sensor de Velocidade do Veículo (VSS) - Sinal de Entrada Baixo",
  "P0503": "Sensor de Velocidade do Veículo (VSS) - Intermitente/Errático",
  "P0505": "Falha no Sistema de Controle do Ar de Marcha Lenta (IAC/Corretor)",
  "P0506": "Controle de Rotação da Marcha Lenta - Abaixo do Esperado",
  "P0507": "Controle de Rotação da Marcha Lenta - Acima do Esperado",
  "P0511": "Circuito de Controle de Ar de Marcha Lenta - Falha",
  "P0550": "Falha no Circuito do Sensor de Pressão da Direção Hidráulica",
  "P0560": "Tensão do Sistema de Bateria - Tensão Incorreta",
  "P0562": "Tensão do Sistema de Bateria - Baixa/Insuficiente",
  "P0563": "Tensão do Sistema de Bateria - Alta/Excessiva",

  // P06xx - Computador (ECU) e Saídas Auxiliares
  "P0601": "Erro de Checksum da Memória Interna do Módulo de Controle (ECU)",
  "P0602": "Erro de Programação do Módulo de Controle (ECU)",
  "P0603": "Erro de Memória KA (Keep Alive Memory) do Módulo de Controle",
  "P0604": "Erro de RAM do Módulo de Controle Interno (ECU)",
  "P0605": "Erro de ROM (Memória Flash) do Módulo de Controle Interno",
  "P0606": "Falha de Processamento no Processador Interno do Módulo (ECU)",
  "P0627": "Circuito de Controle do Relé da Bomba de Combustível - Aberto",
  "P0628": "Circuito de Controle do Relé da Bomba de Combustível - Baixo",
  "P0629": "Circuito de Controle do Relé da Bomba de Combustível - Alto",
  "P0650": "Circuito da Lâmpada de Diagnóstico (MIL/Injeção) - Falha",

  // P07xx a P09xx - Transmissão/Câmbio Automático e Embreagem
  "P0700": "Sistema de Controle de Transmissão - Solicitação MIL da ECU",
  "P0702": "Sistema de Controle de Transmissão - Elétrico/Eletrônico",
  "P0705": "Circuito do Sensor de Faixa de Transmissão (Inibidor/Interruptor PNP)",
  "P0706": "Sensor de Faixa de Transmissão - Problema de Faixa/Desempenho",
  "P0710": "Circuito do Sensor de Temp. do Fluido de Transmissão - Falha",
  "P0715": "Falha no Circuito do Sensor de Velocidade de Entrada/Turbina",
  "P0720": "Falha no Circuito do Sensor de Velocidade de Saída",
  "P0730": "Relação de Marcha Incorreta (Patinando/Erro de Relação)",
  "P0731": "Relação Incorreta de Marcha 1",
  "P0732": "Relação Incorreta de Marcha 2",
  "P0733": "Relação Incorreta de Marcha 3",
  "P0734": "Relação Incorreta de Marcha 4",
  "P0740": "Circuito da Embreagem do Conversor de Torque (TCC) - Falha",
  "P0741": "Circuito TCC - Desempenho ou Travado Desligado",
  "P0750": "Solenoide de Mudança 'A' - Falha Geral",
  "P0753": "Solenoide de Mudança 'A' - Circuito Elétrico",
  "P0755": "Solenoide de Mudança 'B' - Falha Geral",
  "P0758": "Solenoide de Mudança 'B' - Circuito Elétrico",
  "P0812": "Circuito de Entrada de Marcha Ré - Falha",
  "P0900": "Atuador da Embreagem - Circuito Aberto",

  // U0xxx / U1xxx / U2xxx - Rede de Comunicação (Rede CAN, Módulos, etc.)
  "U0001": "Barramento de Comunicação CAN de Alta Velocidade - Falha",
  "U0002": "Barramento CAN - Desempenho/Faixa de Comunicação",
  "U0100": "Perda de Comunicação com o Módulo de Controle do Motor (ECU)",
  "U0101": "Perda de Comunicação com o Módulo de Controle da Transmissão (TCM)",
  "U0104": "Perda de Comunicação com o Módulo de Piloto Automático",
  "U0115": "Perda de Comunicação com o Módulo ECM/ECU Auxiliar",
  "U0121": "Perda de Comunicação com o Módulo do Sistema de Freio ABS",
  "U0140": "Perda de Comunicação com o Módulo da Carroceria (BCM/Body)",
  "U0155": "Perda de Comunicação com o Módulo do Painel de Instrumentos (IPC)",
  "U0164": "Perda de Comunicação com o Módulo de Aquecimento/Ar Condicionado",
  "U0208": "Perda de Comunicação com o Módulo de Ajuste do Banco (Motorista)",
  "U0401": "Dados Inválidos Recebidos do Módulo de Controle do Motor (ECU)",
  "U0402": "Dados Inválidos Recebidos do TCM (Controle de Transmissão)",
  "U0415": "Dados Inválidos Recebidos do ABS (Freio Antibloqueio)"
};

/**
 * Traduz um código de falha (DTC) e retorna sua descrição.
 * Caso o código não esteja na base específica, aplica um fallback baseado na categoria.
 * @param {string} code Código de falha formatado (ex: P0115, U0100, B1022)
 * @returns {string} Descrição em português brasileiro.
 */
export function translateDTC(code) {
  if (!code) return "Código inválido ou inexistente.";
  
  const cleanCode = code.trim().toUpperCase();
  
  // 1. Busca direta no dicionário principal
  if (DTC_DICTIONARY[cleanCode]) {
    return DTC_DICTIONARY[cleanCode];
  }
  
  // 2. Fallbacks de categoria com base no prefixo
  const letter = cleanCode.charAt(0);
  const range = cleanCode.substring(1, 3);
  
  if (letter === 'P') {
    const isManufacturer = cleanCode.charAt(1) === '1' || cleanCode.charAt(1) === '2' || cleanCode.charAt(1) === '3';
    
    if (isManufacturer) {
      return "Código de falha específico da montadora (Motor ou Transmissão). Consulte os detalhes online para ver o comportamento exato nesta marca.";
    }
    
    // Fallback genérico P0xxx por famílias
    switch (range) {
      case '00':
        return "Controle de Medição de Ar/Combustível e Dispositivos de Emissões Auxiliares.";
      case '01':
        return "Medição de Combustível e Ar (Circuito de Sensores: MAF, MAP, ECT, TPS, Sonda Lambda).";
      case '02':
        return "Medição de Combustível e Ar (Circuito de Atuadores: Injetores, Bomba de Combustível, Turbo).";
      case '03':
        return "Falhas de Ignição / Combustão ou Circuitos de Sensores de Rotação/Fase (CKP, CMP) e Velas.";
      case '04':
        return "Controles Auxiliares de Emissões (Catalisador, Válvula EGR, Válvula de Purga do Canister).";
      case '05':
        return "Controles de Velocidade do Veículo, Marcha Lenta (Atuador IAC) e Auxiliares do Sistema.";
      case '06':
        return "Circuitos de Módulos Auxiliares, Processamento Interno do Módulo de Controle (ECU) ou Lâmpada MIL.";
      case '07':
      case '08':
      case '09':
        return "Sistema de Transmissão (Câmbio Automático, Sensores de Velocidade de Entrada/Saída, Solenoides de Marcha).";
      default:
        return "Falha genérica no sistema do Motor ou Transmissão (Powertrain).";
    }
  } 
  
  if (letter === 'U') {
    return "Falha de Comunicação em Rede. Geralmente indica perda de mensagens de dados entre módulos no barramento CAN ou K-Line.";
  }
  
  if (letter === 'B') {
    return "Falha no sistema de Carroceria (Body). Afeta componentes como airbags, climatizador, vidros, travas e painel elétrico.";
  }
  
  if (letter === 'C') {
    return "Falha no sistema de Chassi. Afeta freios ABS, controle de tração, sensores de roda, direção elétrica/hidráulica.";
  }
  
  return "Código de falha desconhecido. Recomendado realizar a pesquisa estendida no Google para obter detalhes técnicos.";
}
