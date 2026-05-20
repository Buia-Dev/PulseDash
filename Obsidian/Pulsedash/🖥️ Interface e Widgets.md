# 🖥️ Interface e Widgets

> O frontend do **PulseDash** é renderizado 100% utilizando a **API de Canvas do HTML5**. Isso garante performance consistente mesmo em tablets com hardware modesto no carro.

**Ver estrutura de arquivos:** [[🗂️ Estrutura de Arquivos]]  
**Ver renderizadores:** `data/js/renderers.js`

---

## 🧱 Sistema de Páginas

O dashboard suporta **múltiplas páginas** (atualmente 2 páginas configuradas). A troca de página:
- Em **modo retrato** (celular em pé): Botão visível na interface.
- Em **modo paisagem** (celular deitado): A troca de página funciona corretamente — todos os widgets da página anterior saem de tela completamente.

> ⚠️ **Bug antigo corrigido:** Ao girar o celular e trocar de página, o gauge da página 1 não sumia. Isso foi corrigido para garantir que ao trocar de página em qualquer orientação, a tela ativa seja limpa.

---

## 🧱 Tipos de Widgets

Cada widget é um elemento independente na tela, pode pertencer a **Grupos de Movimentação** (para mover vários juntos) e tem configurações individuais salvas em JSON no LittleFS (`/config.json`).

---

### ⭕ Arco Puro (`arco_puro`)
Anel parcial (ou completo) que se preenche conforme o valor do sensor. Renderizado com `arc()` e `shadowBlur` para o efeito neon.

**Propriedades:**
| Prop | Descrição |
|:---|:---|
| `angIni` | Onde o arco começa (em graus) |
| `angSweep` | Quantos graus o arco preenche no total |
| `thickness` | Espessura da linha neon |
| `lineCap` | `butt` (reto) ou `round` (arredondado) |
| `corPrimaria` | Cor principal (ex: `#00ff88`) |
| `corBg` | Cor do fundo/track do arco |

---

### 📊 Barra Pura (`barra_pura`)
Barra preenchível com divisores (blocos). Única por ter **duas formas de renderização**:

1. **Linear:** Vertical (`v`) ou Horizontal (`h`).
2. **Curva (Angular):** Ativada quando `rCurv` > 0. Segue a curvatura de um `arco_puro`.

**Uso típico:** Barra de RPM curva abaixo do conta-giros, barra de boost.

---

### 📍 Agulha Pura (`agulha_pura`)
O ponteiro clássico de conta-giros e velocímetro.

**Estilos Disponíveis (`tagulha`):**
| ID | Estilo |
|:---:|:---|
| 0 | **Neon Glow** — Brilhante e oca (padrão premium) |
| 1 | **Traço Fino** — Minimalista |
| 2 | **Triângulo** — Clássica estilo racing |
| 3 | **Ponta Colorida** — Base cinza escuro, ponta na cor do sensor |

---

### 📏 Régua Pura (`regua_pura`)
A escala numérica que fica ao redor dos arcos.

**Inteligência de Renderização (`getAutoInterval`):**  
O algoritmo calcula dinamicamente o intervalo entre marcações para evitar sobreposição:
- 8000 RPM → marca de **1000 em 1000**
- 100 km/h → marca de **10 em 10**
- 14.9V → marca de **0.5 em 0.5**

---

### 🚨 Luz Espia (`luz_espia`)
Indicadores de alerta em formato de ícone vetorial desenhado por `Path2D`.

**Recursos:**
- Suporta **lógica invertida** (ex: pressão de óleo baixa acende a luz).
- Múltiplos ícones nativos: motor, bateria, temperatura, combustível, etc.
- Cor personalizada quando ativada vs. inativa.

---

### 🔢 Número Puro (`numero_puro`)
Exibe o valor do sensor como número digital grande — estilo odômetro ou display de cockpit.

**Uso típico:** Velocidade no centro do velocímetro, RPM digital, tensão.

---

## 🎨 Fontes e Identidade Visual

| Fonte | Uso |
|:---|:---|
| **Orbitron** | Números grandes, valores de RPM/velocidade |
| **Rajdhani** | Labels, legendas dos widgets |
| **Oxanium** | Interface do painel de edição |
| **Teko** | Textos secundários compactos |

**Variáveis CSS globais:**
```css
--roxo: #8b5cf6;   /* Neon roxo — usado em boosts e elementos de destaque */
--verde: #00ff88;  /* Verde neon — cor primária dos arcos e agulhas */
```

---

## 📱 Responsividade

O dashboard adapta automaticamente o tamanho de todos os widgets usando `devicePixelRatio` e escalas relativas ao tamanho da tela. Funciona em:

- ✅ Celular em modo **retrato** (vertical)
- ✅ Celular em modo **paisagem** (horizontal)
- ✅ Tablet (qualquer orientação)
- ✅ Instalado como **PWA** (ícone na tela inicial)

---

**Links:** [[⚙️ Painel de Controle (Home)]] | [[🗂️ Estrutura de Arquivos]] | [[🚀 Animação de Inicialização]]  
**Tags:** #frontend #canvas #widgets #ui #dashboard #pwa
