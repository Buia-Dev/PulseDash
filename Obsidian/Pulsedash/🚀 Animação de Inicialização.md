# 🚀 Animação de Inicialização (Boot)

> Para garantir uma sensação *premium* ao abrir o app, o PulseDash roda uma sequência cinematográfica que serve a um propósito duplo: **Estética** e **Esconder a Latência da Conexão CAN**.

---

## 🎭 A Sequência de Boot

1. **O Esconderijo:** A `div` do dashboard principal (`#app`) fica oculta. O usuário vê apenas uma tela preta (`#splash`).
2. **O Letreiro:** O logotipo *PULSEDASH* surge gradualmente com efeito de fade-in + glow roxo.
3. **O Efeito Circuito (PCB):** Vários caminhos de luz (como trilhas de placa de circuito impressa em neon) percorrem a tela. Efeito feito com `SVG` + `stroke-dasharray` animado (efeito "meteoro").
4. **O Pulso:** O logo dá um "pulso" (zoom in → zoom out rápido) em sincronia com o fim dos rastros.
5. **A Revelação:** Após ~3,5 segundos, a `#splash` faz `fade-out` e o dashboard já está com dados recebidos, "pulando para a vida" de forma fluida.

---

## 🤔 Por que isso é útil com CAN Bus?

Com a migração para **CAN Bus nativo** (v5.0), o tempo de conexão mudou:

| Protocolo | Tempo de Handshake Típico |
|:---|:---|
| ELM327 Bluetooth (antigo) | 3 a 5 segundos |
| **CAN Bus Nativo v5.0** | ~1 a 2 segundos (10 tentativas × 800ms) |
| **CAN Bus Nativo v5.1** | **<1 segundo** (quando ECU já está ativa) |

A animação de **3,5 segundos** ainda é suficiente para esconder esse tempo de inicialização. Quando o splash desaparece, os dados já estão chegando pelo WebSocket.

---

## 🎨 Implementação Técnica

```css
/* Keyframe dos meteoros PCB */
@keyframes meteoro {
  0%   { stroke-dashoffset: 1000; opacity: 0; }
  10%  { opacity: 1; }
  100% { stroke-dashoffset: 0;    opacity: 0; }
}

/* Pulso do logo */
@keyframes pulso {
  0%, 100% { transform: scale(1); }
  50%       { transform: scale(1.08); }
}
```

```javascript
// Em main.js: após o timeout do splash
setTimeout(() => {
  document.getElementById('splash').style.opacity = '0';
  setTimeout(() => {
    document.getElementById('splash').style.display = 'none';
  }, 600);
}, 3500);
```

---

## 🔗 Relação com a Conexão CAN

O `main.js` inicia a conexão WebSocket **durante** a animação, não depois. Isso significa que:

1. Splash inicia (t=0s)
2. WebSocket conecta ao ESP32 (t≈0.1s)
3. ESP32 faz handshake CAN com ECU (t≈0.2~1.0s)
4. Dados começam a chegar via WebSocket (t≈1.0~2.0s)
5. Splash desaparece (t=3.5s) → Dashboard já tem dados reais

---

**Links:** [[⚙️ Painel de Controle (Home)]] | [[🖥️ Interface e Widgets]] | [[🗂️ Estrutura de Arquivos]]  
**Tags:** #animacao #boot #splash #ux #canbus #websocket
