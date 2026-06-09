'use strict';
import { ST, ICONES_SVG } from './state.js';

function P(v,mn,mx){ return Math.max(0,Math.min(1,(v-mn)/(mx-mn))); }

function lerS(w) {
  let val = 0;
  if (w.sensor === 'demo') {
    // Sensor de teste puro com velocidade de oscilação específica para este widget (w.demoSpeed)
    const ts = performance.now();
    const speedFactor = ((w.demoSpeed || 50) / 1000) * 1.5;
    const demoVal = Math.abs(((ts * speedFactor) % 200) - 100);
    const min = w.minValor || 0;
    const max = w.maxValor || 100;
    val = min + (max - min) * (demoVal / 100);
  } else {
    // v5.4: Suavização Individual (Inércia da Agulha)
    const raw = ST.dados[w.sensor] ?? 0;
    if (w.smoothK !== undefined && w.smoothK < 100) {
      const k = w.smoothK / 100;
      w._sv = (w._sv ?? raw) + (raw - (w._sv ?? raw)) * k;
      val = w._sv;
    } else {
      val = ST.smooth[w.sensor] ?? 0; // Padrão global
    }
  }

  // Lógica v5.2: Correções e Conversões
  if (w.sensor === 'speed' && w.corr) {
    val *= 1.05; // Correção de +5% (bater com o painel)
  }
  if (w.sensor === 'fuelLevel' && w.unitMode === 'L') {
    val = (val / 100) * 44; // Conversão para Litros (Tanque Onix 44L)
  }
  return val;
}

function drawAgulha(ctx, w, ang, r, cx, cy) {
  const tipo = w.tagulha || 0, cor = w.cor || '#fff';
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
  
  let sf = r / 138;
  if (tipo === 11 || tipo >= 26) {
    sf *= 1.35; // Aumenta o tamanho padrão de todos os ponteiros de ponta em 35%
  }
  
  if (tipo === 0) {
    // TIPO 0: Neon Glow (Original)
    ctx.strokeStyle = '#000'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r*0.22, 0); ctx.lineTo(r*.97, 0); ctx.stroke();
    ctx.strokeStyle = cor; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-r*0.2, 0); ctx.lineTo(r*.95, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*2); ctx.fillStyle='#000'; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,9,0,Math.PI*2); ctx.fillStyle=cor; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*2); ctx.strokeStyle=cor; ctx.lineWidth=1.5; ctx.stroke();
  }
  else if (tipo === 1) {
    // TIPO 1: Traço Fino (Original)
    ctx.beginPath(); ctx.moveTo(-r*0.1, 0); ctx.lineTo(r*.95, 0); ctx.strokeStyle = cor; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,6,0,Math.PI*2); ctx.fillStyle=cor; ctx.fill();
  }
  else if (tipo === 2) {
    // TIPO 2: Triângulo (Original)
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(r*.95, 0); ctx.lineTo(0, -6); ctx.fillStyle = cor; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,9,0,Math.PI*2); ctx.fillStyle='#000'; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,9,0,Math.PI*2); ctx.strokeStyle=cor; ctx.lineWidth=1.5; ctx.stroke();
  }
  else if (tipo === 3) {
    // TIPO 3: Ponta Cor (Original)
    ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(r*.88, 0); ctx.lineTo(0, -5); ctx.fillStyle = '#222'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(r*.82, 3.5); ctx.lineTo(r*.95, 0); ctx.lineTo(r*.82, -3.5); ctx.fillStyle = cor; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,8,0,Math.PI*2); ctx.fillStyle='#111'; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,8,0,Math.PI*2); ctx.strokeStyle=cor; ctx.lineWidth=1.5; ctx.stroke();
  }
  else if (tipo === 5) {
    // TIPO 5: Halo / Flutuante LFA
    ctx.strokeStyle = '#000'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r*0.48, 0); ctx.lineTo(r*0.95, 0); ctx.stroke();
    ctx.strokeStyle = cor; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r*0.5, 0); ctx.lineTo(r*0.93, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,r*0.15,0,Math.PI*2); ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=1.5; ctx.stroke();
  }
  else if (tipo === 6) {
    // TIPO 6: Esqueleto GT3
    ctx.strokeStyle = cor; ctx.lineWidth = 1.8; ctx.fillStyle = cor;
    ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(r*0.8, 1); ctx.lineTo(r*0.8, -1); ctx.lineTo(0, -5); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r*0.8, 2); ctx.lineTo(r*0.96, 0); ctx.lineTo(r*0.8, -2); ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,9,0,Math.PI*2); ctx.fillStyle='#000'; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,7,0,Math.PI*2); ctx.strokeStyle=cor; ctx.lineWidth=1.5; ctx.stroke();
  }
  else if (tipo === 7) {
    // TIPO 7: Lâmina Laser
    const grad = ctx.createLinearGradient(0, 0, r*0.95, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.3, cor);
    grad.addColorStop(1, cor);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(r*0.95, 0.5); ctx.lineTo(r*0.95, -0.5); ctx.lineTo(0, -4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(r*0.4, 0); ctx.lineTo(r*0.94, 0); ctx.stroke();
  }
  else if (tipo === 8) {
    // TIPO 8: Retrô Cromo (Fixo)
    ctx.strokeStyle = '#151515'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(r*0.75, 0); ctx.stroke();
    ctx.strokeStyle = '#ff4500'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(r*0.73, 0); ctx.lineTo(r*0.95, 0); ctx.stroke();
    const radGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, 18);
    radGrad.addColorStop(0, '#ffffff');
    radGrad.addColorStop(0.2, '#cccccc');
    radGrad.addColorStop(0.6, '#333333');
    radGrad.addColorStop(0.9, '#888888');
    radGrad.addColorStop(1, '#111111');
    ctx.beginPath(); ctx.arc(0,0,18,0,Math.PI*2); ctx.fillStyle=radGrad; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,18,0,Math.PI*2); ctx.strokeStyle='#000'; ctx.lineWidth=1; ctx.stroke();
  }
  else if (tipo === 11) {
    // TIPO 11: Setinha Externa
    const arrowLen = 13 * sf;
    const arrowWidth = 4 * sf;
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.moveTo(r * 0.95, 0);
    ctx.lineTo(r * 0.95 - arrowLen, arrowWidth);
    ctx.lineTo(r * 0.95 - arrowLen, -arrowWidth);
    ctx.closePath();
    ctx.fill();
  }
  else if (tipo === 13) {
    // TIPO 13: Audi RS Red (Fixo)
    ctx.strokeStyle = '#ff003c'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r*0.15, 0); ctx.lineTo(r*0.95, 0); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r*0.88, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,15,0,Math.PI*2); ctx.fillStyle='#111'; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,15,0,Math.PI*2); ctx.strokeStyle='#ff003c'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,5,0,Math.PI*2); ctx.fillStyle='#444'; ctx.fill();
  }
  else if (tipo === 14) {
    // TIPO 14: Subaru STI Orange (Fixo)
    ctx.strokeStyle = '#ff6200'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-r*0.2, 0); ctx.lineTo(r*0.96, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,14,0,Math.PI*2); ctx.fillStyle='#111'; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,9,0,Math.PI*2); ctx.strokeStyle='#ff0066'; ctx.lineWidth=2; ctx.stroke();
  }
  else if (tipo === 15) {
    // TIPO 15: Mercedes-AMG White (Fixo)
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(-r*0.1, 0); ctx.lineTo(r*0.95, 0); ctx.stroke();
    const radGrad = ctx.createRadialGradient(-2, -2, 1, 0, 0, 16);
    radGrad.addColorStop(0, '#ffffff');
    radGrad.addColorStop(0.3, '#dddddd');
    radGrad.addColorStop(0.8, '#555555');
    radGrad.addColorStop(1, '#222222');
    ctx.beginPath(); ctx.arc(0,0,15,0,Math.PI*2); ctx.fillStyle=radGrad; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,15,0,Math.PI*2); ctx.strokeStyle='#777'; ctx.lineWidth=1.2; ctx.stroke();
  }
  else if (tipo === 20) {
    // TIPO 20: Corvette Yellow (Fixo)
    ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-r*0.18, 0); ctx.lineTo(r*0.95, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,13,0,Math.PI*2); ctx.fillStyle='#1c1c1c'; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,13,0,Math.PI*2); ctx.strokeStyle='#333'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,4,0,Math.PI*2); ctx.fillStyle='#aaa'; ctx.fill();
  }
  else if (tipo === 25) {
    // TIPO 25: Carbon Hex-Arrow (Fixo)
    ctx.strokeStyle = '#222'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(r*0.8, 0); ctx.stroke();
    ctx.strokeStyle = '#444'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(r*0.75, 0); ctx.stroke();
    ctx.fillStyle = '#ff0000';
    ctx.beginPath(); ctx.moveTo(r*0.78, 5); ctx.lineTo(r*0.96, 0); ctx.lineTo(r*0.78, -5); ctx.lineTo(r*0.82, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(r*0.78, 5); ctx.lineTo(r*0.96, 0); ctx.lineTo(r*0.78, -5); ctx.lineTo(r*0.82, 0); ctx.closePath(); ctx.stroke();
    ctx.save();
    ctx.fillStyle = '#0f0f15'; ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = Math.cos(angle) * 12;
      const y = Math.sin(angle) * 12;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  else if (tipo === 26) {
    // TIPO 26: Double Ring Arrow
    const arrowLen = 16 * sf;
    const arrowWidth = 6 * sf;
    ctx.strokeStyle = cor; ctx.lineWidth = 1.5 * sf;
    ctx.beginPath(); ctx.arc(0, 0, r*0.9, -0.06 * sf, 0.06 * sf); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r*0.82, -0.06 * sf, 0.06 * sf); ctx.stroke();
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.moveTo(r * 0.94, 0);
    ctx.lineTo(r * 0.94 - arrowLen, arrowWidth);
    ctx.lineTo(r * 0.94 - arrowLen + (4 * sf), 0);
    ctx.lineTo(r * 0.94 - arrowLen, -arrowWidth);
    ctx.closePath();
    ctx.fill();
  }
  else if (tipo === 27) {
    // TIPO 27: Halo Dot
    const dotRadius = 3 * sf;
    const haloRadius = 8 * sf;
    ctx.save();
    ctx.strokeStyle = cor; ctx.lineWidth = 1.5 * sf;
    ctx.beginPath(); ctx.arc(r*0.88, 0, haloRadius, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = cor; ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.arc(r*0.88, 0, haloRadius, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(r*0.88, 0, dotRadius, 0, Math.PI*2); ctx.fill();
  }
  else if (tipo === 28) {
    // TIPO 28: Chevron Sweep
    ctx.fillStyle = cor;
    const c1Len = 11 * sf;
    const c1Width = 4.5 * sf;
    ctx.beginPath();
    ctx.moveTo(r * 0.95, 0);
    ctx.lineTo(r * 0.95 - c1Len, c1Width);
    ctx.lineTo(r * 0.95 - c1Len + (4 * sf), 0);
    ctx.lineTo(r * 0.95 - c1Len, -c1Width);
    ctx.closePath(); ctx.fill();
    
    const c2Len = 9 * sf;
    const c2Width = 3.5 * sf;
    ctx.save(); ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(r * 0.86, 0);
    ctx.lineTo(r * 0.86 - c2Len, c2Width);
    ctx.lineTo(r * 0.86 - c2Len + (3 * sf), 0);
    ctx.lineTo(r * 0.86 - c2Len, -c2Width);
    ctx.closePath(); ctx.fill(); ctx.restore();
    
    const c3Len = 7 * sf;
    const c3Width = 2.5 * sf;
    ctx.save(); ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(r * 0.79, 0);
    ctx.lineTo(r * 0.79 - c3Len, c3Width);
    ctx.lineTo(r * 0.79 - c3Len + (2 * sf), 0);
    ctx.lineTo(r * 0.79 - c3Len, -c3Width);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  else if (tipo === 29) {
    // TIPO 29: Crosshair Radar
    const crossRadius = 7 * sf;
    const crossLineLen = 10 * sf;
    ctx.strokeStyle = cor; ctx.lineWidth = 1.5 * sf;
    ctx.beginPath(); ctx.arc(r * 0.88, 0, crossRadius, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r * 0.88 - crossLineLen, 0); ctx.lineTo(r * 0.88 + crossLineLen, 0);
    ctx.moveTo(r * 0.88, -crossLineLen); ctx.lineTo(r * 0.88, crossLineLen);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(r * 0.88, 0, 2 * sf, 0, Math.PI * 2); ctx.fill();
  }
  else if (tipo === 30) {
    // TIPO 30: Laser Dot Trail
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(r * 0.92, 0, 4 * sf, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.fillStyle = cor; ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.arc(r * 0.92, 0, 9 * sf, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.fillStyle = cor; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(r * 0.84, 0, 3 * sf, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.fillStyle = cor; ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(r * 0.77, 0, 2 * sf, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  else if (tipo === 31) {
    // TIPO 31: Diamond Prism
    const prismLen = 17 * sf;
    const prismWidth = 4 * sf;
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.moveTo(r * 0.95, 0);
    ctx.lineTo(r * 0.95 - prismLen / 2, prismWidth);
    ctx.lineTo(r * 0.95 - prismLen, 0);
    ctx.closePath(); ctx.fill();
    ctx.save(); ctx.fillStyle = cor; ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(r * 0.95, 0);
    ctx.lineTo(r * 0.95 - prismLen / 2, -prismWidth);
    ctx.lineTo(r * 0.95 - prismLen, 0);
    ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8 * sf;
    ctx.beginPath();
    ctx.moveTo(r * 0.95, 0);
    ctx.lineTo(r * 0.95 - prismLen / 2, prismWidth);
    ctx.lineTo(r * 0.95 - prismLen, 0);
    ctx.lineTo(r * 0.95 - prismLen / 2, -prismWidth);
    ctx.closePath(); ctx.stroke();
  }
  else if (tipo === 32) {
    // TIPO 32: Arc Bracket
    const bracketRadius = r * 0.94;
    const bracketWidth = 2 * sf;
    const bracketSpan = 0.06 * sf;
    ctx.strokeStyle = cor; ctx.lineWidth = bracketWidth;
    ctx.beginPath();
    ctx.arc(0, 0, bracketRadius, -bracketSpan, bracketSpan);
    ctx.stroke();
    
    const aStart = -bracketSpan, aEnd = bracketSpan;
    const x1 = Math.cos(aStart) * bracketRadius, y1 = Math.sin(aStart) * bracketRadius;
    const x2 = Math.cos(aEnd) * bracketRadius, y2 = Math.sin(aEnd) * bracketRadius;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(Math.cos(aStart) * (bracketRadius - 6 * sf), Math.sin(aStart) * (bracketRadius - 6 * sf));
    ctx.moveTo(x2, y2); ctx.lineTo(Math.cos(aEnd) * (bracketRadius - 6 * sf), Math.sin(aEnd) * (bracketRadius - 6 * sf));
    ctx.stroke();
    
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.moveTo(bracketRadius - 2 * sf, 0);
    ctx.lineTo(bracketRadius - 8 * sf, 3 * sf);
    ctx.lineTo(bracketRadius - 8 * sf, -3 * sf);
    ctx.closePath(); ctx.fill();
  }
  else {
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(r * 0.9, 0); ctx.lineTo(0, -6); ctx.fillStyle = '#333'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(r * 0.65, 3); ctx.lineTo(r * 0.95, 0); ctx.lineTo(r * 0.65, -3); ctx.fillStyle = cor; ctx.fill();
  }
  ctx.restore();

  // Guias visuais de início e fim de curso no modo edição (Verde e Vermelho)
  if(ST.editor && ST.sel === w.id) {
    const startAng = (w.angIni||135)*Math.PI/180;
    const endAng = startAng + (w.angSweep||270)*Math.PI/180;
    
    // Ponto de início (Verde)
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(startAng);
    ctx.fillStyle = '#00ff88';
    ctx.beginPath(); ctx.arc(r * 0.95, 0, 5, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // Ponto de fim (Vermelho)
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(endAng);
    ctx.fillStyle = '#ff3355';
    ctx.beginPath(); ctx.arc(r * 0.95, 0, 5, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// v6.1: Sem shadowBlur pesado nos arcos (Thermal Throttling fix)
function drawArcoPuro(ctx,w,S,W,H){
  const cx=W/2,cy=H/2,r=Math.min(W,H)*.38, ai=w.angIni*Math.PI/180,sw=w.angSweep*Math.PI/180;
  const p=P(S, w.minValor||0, w.maxValor||100);
  ctx.lineCap = w.lineCap || 'butt';
  ctx.beginPath();ctx.arc(cx,cy,r,ai,ai+sw);ctx.strokeStyle='rgba(255,255,255,0.05)';ctx.lineWidth=w.thickness||8;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,r,ai,ai+sw*p);ctx.strokeStyle=w.cor;ctx.lineWidth=w.thickness||8;ctx.stroke();
  ctx.lineCap = 'butt';
}

// v6.1: Sem shadowBlur pesado nas barras (Thermal Throttling fix)
function drawBarraPura(ctx,w,S,W,H){
  const p=P(S, w.minValor||0, w.maxValor||100), divs=(w.divisores||10), spc=w.spacing??2, thk=w.thickness||10;
  if (!(w.rCurv > 0)) {
    const isV=(w.direction==='v'), totalSz=(isV?H:W)-10;
    
    if (spc === 0 && divs > 1) {
      // DESENHO CONTÍNUO SÓLIDO (Sem Loop) - Mata as linhas de anti-aliasing permanentemente
      const key = `${W}_${H}_${isV}_${w.cor}_${w.cor2}_${w.cor3}_${w.cor2Lim}_${w.cor3Lim}`;
      if (!w._cachedGrad || w._cachedGradKey !== key) {
        const grad = ctx.createLinearGradient(
          isV ? 0 : 5, isV ? (H-5) : 0, 
          isV ? 0 : (5+totalSz), isV ? 5 : 0
        );
        const c3L = Math.max(0, Math.min(1, (w.cor3Lim??20)/100));
        const c2L = Math.max(0, Math.min(1, (w.cor2Lim??80)/100));
        
        grad.addColorStop(0, w.cor3||'#0088ff');
        grad.addColorStop(c3L, w.cor3||'#0088ff');
        grad.addColorStop(Math.min(1, c3L + 0.001), w.cor||'#0fa');
        grad.addColorStop(c2L, w.cor||'#0fa');
        grad.addColorStop(Math.min(1, c2L + 0.001), w.cor2||'#ff0000');
        grad.addColorStop(1, w.cor2||'#ff0000');
        
        w._cachedGrad = grad;
        w._cachedGradKey = key;
      }
      const grad = w._cachedGrad;
      
      const px = isV ? (W/2-thk/2) : 5;
      const py = isV ? 5 : (H/2-thk/2);
      const pw = isV ? thk : totalSz;
      const ph = isV ? totalSz : thk;
      
      // Fundo (apagado)
      ctx.save(); ctx.globalAlpha = 0.15; ctx.fillStyle = grad;
      ctx.fillRect(px, py, pw, ph); ctx.restore();
      
      // Frente (aceso) com máscara de recorte (clipping)
      const fillSz = totalSz * p;
      ctx.save(); ctx.globalAlpha = 1.0; ctx.fillStyle = grad;
      ctx.beginPath();
      if (isV) {
        ctx.rect(px, H - 5 - fillSz, pw, fillSz);
      } else {
        ctx.rect(px, py, fillSz, ph);
      }
      ctx.clip();
      ctx.fillRect(px, py, pw, ph);
      ctx.restore();
    } else {
      // DESENHO EM BLOCOS (Com espaçamento)
      const segSz=(totalSz-(divs-1)*spc)/Math.max(1,divs);
      for(let i=0; i<divs; i++){
        const segPos = (i+0.5)/divs;
        const cor = segPos < (w.cor3Lim??20)/100 ? (w.cor3||'#0088ff')
                  : segPos > (w.cor2Lim??80)/100  ? (w.cor2||'#ff0000')
                  : (w.cor||'#0fa');
        const active=(i/divs)<p;
        ctx.save(); ctx.globalAlpha=active?1.0:0.15; ctx.fillStyle=cor; 
        
        const px = isV ? (W/2-thk/2) : (5+i*(segSz+spc));
        const py = isV ? (H-5-(i+1)*(segSz+spc)) : (H/2-thk/2);
        const pw = isV ? thk : segSz;
        const ph = isV ? segSz : thk;
        
        ctx.fillRect(px, py, pw, ph); ctx.restore();
      }
    }
  } else {
    const sweep = w.rCurv * Math.PI / 180;
    const ai = (w.rStart || 0) * Math.PI / 180;
    const r = w.tamanho / sweep;
    const gapAng = spc / Math.max(r, 1);
    const totalGapAng = gapAng * (Math.max(1, divs) - 1);
    const segAng = (sweep - totalGapAng) / Math.max(1, divs);
    
    ctx.save(); ctx.translate(W/2, H/2);
    ctx.lineWidth = thk; ctx.lineCap = 'butt';
    let curA = ai;
    for(let i=0; i<divs; i++){
      const segPos = (i+0.5)/divs;
      const cor = segPos < (w.cor3Lim??20)/100 ? (w.cor3||'#0088ff')
                : segPos > (w.cor2Lim??80)/100  ? (w.cor2||'#ff0000')
                : (w.cor||'#0fa');
      const active=(i/divs)<p;
      ctx.save(); ctx.globalAlpha=active?1.0:0.15; ctx.strokeStyle=cor;
      ctx.beginPath(); ctx.arc(0,0, r, curA, curA + Math.max(0.01, segAng)); ctx.stroke();
      ctx.restore();
      curA += segAng + gapAng;
    }
    ctx.restore();
  }
}

function drawNumeroPuro(ctx, w, S, W, H) {
  let vStr = Math.round(S).toString();
  let unit = w.unidade || '';

  // Precisão decimal para casos específicos v5.2 / v6.4 (Consumo Instantâneo, Turbo, Lambda, etc.)
  if (w.sensor === 'turbo' || w.sensor === 'lambda') {
    vStr = S.toFixed(2);
  } else if (w.sensor === 'voltage' || w.sensor === 'fuelRate' || w.sensor === 'instCons' || 
             w.sensor === 'afr' || w.sensor === 'oilPress' || w.sensor === 'fuelPress' || w.sensor === 'maf' ||
             (w.sensor === 'fuelLevel' && w.unitMode === 'L')) {
    vStr = S.toFixed(1);
    if (w.sensor === 'fuelLevel' && w.unitMode === 'L') unit = 'LITROS';
  }

  ctx.fillStyle = w.cor || '#fff';
  ctx.font = `bold ${Math.floor(W * 0.25)}px '${w.fontFamily || 'Orbitron'}'`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(vStr, W / 2, H / 2);
  
  ctx.fillStyle = '#666';
  ctx.font = `${Math.floor(W * 0.08)}px Rajdhani`;
  ctx.fillText(unit, W / 2, H / 2 + W * 0.15);
}

function getAutoInterval(max) {
  if(max <= 20) return 1; if(max <= 50) return 5; if(max <= 120) return 10; if(max <= 320) return 20; if(max <= 700) return 50; if(max <= 1600) return 100; if(max <= 4000) return 500; return 1000;
}

function drawReguaPura(ctx, w, W, H) {
  const minV = w.rMin || 0, maxV = w.rMax || 100, sweep = w.rCurv || 0;
  const isV = (w.rDir === 'v' && sweep === 0);
  const len = w.tamanho || 300, thk = w.rThick || 2, tStyle = w.rStyle || 0;
  const cor = w.cor || '#fff', font = w.rFont || 'Orbitron', fSize = w.rFontSz || 12;
  const tLen = w.rTickLen || 15, tDens = w.rDens || 5;
  const rStartRad = (w.rStart || 0) * Math.PI / 180;
  const sweepRad = sweep * Math.PI / 180;
  const rGlobal = sweep > 0 ? (len / sweepRad) : 0;

  ctx.save(); ctx.translate(W/2, H/2);

  // MODO HÍBRIDO:
  const smallAngle = (sweep > 0 && sweep < 120);
  if(smallAngle) {
    const midA = rStartRad + sweepRad / 2;
    ctx.translate(-Math.cos(midA) * rGlobal, -Math.sin(midA) * rGlobal);
  }

  ctx.strokeStyle = cor; ctx.fillStyle = cor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const step = getAutoInterval(maxV);
  const totalVal = maxV - minV;
  const numSteps = Math.ceil(totalVal / (step / tDens));
  const realSubStep = totalVal / numSteps;

  for(let i = 0; i <= numSteps; i++) {
    const val = minV + i * realSubStep;
    const isEnd = (i === numSteps);
    if ((i % (tDens || 1) === 0 || isEnd) && !isEnd && (maxV - val) < (step * 0.3)) continue;

    const p = (val - minV) / (totalVal || 1);
    let x, y, angle = 0;
    if(sweep === 0) {
      const offset = (p - 0.5) * len;
      if(isV) { x = 0; y = offset; } else { x = offset; y = 0; }
      angle = isV ? 0 : -Math.PI/2;
    } else {
      const curA = rStartRad + p * sweepRad;
      x = Math.cos(curA) * rGlobal; y = Math.sin(curA) * rGlobal; angle = curA;
    }

    const side = (w.rLabelSide === 'inner' ? -1 : 1);
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.lineWidth = (i % (tDens || 1) === 0 || isEnd) ? thk : thk/2;
    ctx.fillStyle = cor; ctx.strokeStyle = cor;
    if(w.rDens >= 1 && (w.rDens > 1 || (i % (tDens || 1) === 0 || isEnd))) {
      if(tStyle === 2) { ctx.beginPath(); ctx.arc(0,0,((i % (tDens || 1) === 0 || isEnd)?thk*1.5:thk*0.6),0,Math.PI*2); ctx.fill(); }
      else { const tSide = (w.rTickSide === 'inner' ? -1 : 1); const actualTLen = ((i % (tDens || 1) === 0 || isEnd) ? tLen : tLen * 0.6) * tSide; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(actualTLen, 0); ctx.stroke(); }
    }
    ctx.restore();

    if(i % (tDens || 1) === 0 || isEnd) {
      ctx.font = `bold ${fSize}px '${font}'`; ctx.fillStyle = w.rLabelCor || cor;
      const labelDist = ((w.rLabelOffset??10) + fSize/2 + tLen/2) * side;
      let tx, ty;
      if(sweep === 0) {
        if(isV){tx = x + labelDist; ty = y;} else {tx = x; ty = y + labelDist;}
      } else {
        const curA = rStartRad + p * sweepRad;
        tx = Math.cos(curA) * (rGlobal + labelDist); ty = Math.sin(curA) * (rGlobal + labelDist);
      }
      ctx.fillText(Math.round(val), tx, ty);
    }
  }
  ctx.restore();
}



function drawLuzEspia(ctx, w, S, W, H) {
  const p = P(S, w.minValor||0, w.maxValor||100), thresh = (w.luzTrig||80)/100;
  const trigger = (w.luzInvert==1) ? (p <= thresh) : (p >= thresh);
  ctx.save(); ctx.translate(W/2, H/2);
  const icon = ICONES_SVG[w.luzSym] || ICONES_SVG['alerta'];
  const scale = (Math.min(W, H) * 0.8) / icon.vB;
  ctx.scale(scale, scale); ctx.translate(-icon.vB/2, -icon.vB/2);
  const corAcesa = w.cor || '#ff0000', corApagada = w.cor2 || '#333333';
  ctx.fillStyle = trigger ? corAcesa : corApagada;
  if(!trigger) { ctx.globalAlpha = 0.4; }
  ctx.fill(new Path2D(icon.path)); ctx.restore();
}

function renderWidget(ctx,w,cW,cH,t){
  if(!w)return;
  let S=lerS(w);
  
  if (!ST.editor) {
    if (Math.abs(S - (w._lastDrawS ?? -9999)) < 0.05) {
      return; 
    }
  }
  w._lastDrawS = S;

  ctx.clearRect(0,0,cW,cH); 
  if(w.tipo==='arco_puro') drawArcoPuro(ctx,w,S,cW,cH);
  else if(w.tipo==='barra_pura') drawBarraPura(ctx,w,S,cW,cH);
  else if(w.tipo==='numero_puro') drawNumeroPuro(ctx,w,S,cW,cH);
  else if(w.tipo==='regua_pura') drawReguaPura(ctx,w,cW,cH);
  else if(w.tipo==='luz_espia') drawLuzEspia(ctx,w,S,cW,cH);
  else if(w.tipo==='agulha_pura') drawAgulha(ctx,w,(w.angIni||135)*Math.PI/180 + ((w.angSweep||270)*Math.PI/180)*P(S, w.minValor||0, w.maxValor||100), Math.min(cW,cH)*.46, cW/2, cH/2);
}

export { renderWidget };
