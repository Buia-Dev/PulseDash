'use strict';
import { ST, ICONES_SVG } from './state.js';

function P(v,mn,mx){ return Math.max(0,Math.min(1,(v-mn)/(mx-mn))); }

function lerS(w) {
  let val = 0;
  if (w.sensor === 'demo') {
    const min = w.minValor || 0;
    const max = w.maxValor || 100;
    const pct = (Math.sin(ST.demoT || 0) + 1) / 2;
    val = min + (max - min) * pct;
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
  
  if(tipo===0) { 
    ctx.strokeStyle = '#000'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r*0.22, 0); ctx.lineTo(r*.97, 0); ctx.stroke();
    ctx.shadowBlur = 15; ctx.shadowColor = cor; ctx.strokeStyle = cor; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-r*0.2, 0); ctx.lineTo(r*.95, 0); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fillStyle='#000'; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,8,0,Math.PI*2); ctx.fillStyle=cor; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.strokeStyle=cor; ctx.lineWidth=1.5; ctx.stroke();
  }
  else if(tipo===1) { ctx.shadowBlur = 10; ctx.shadowColor = cor; ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(r*.95, 0);ctx.strokeStyle=cor;ctx.lineWidth=3;ctx.stroke(); }
  else if(tipo===2) { ctx.shadowBlur = 15; ctx.shadowColor = cor; ctx.beginPath();ctx.moveTo(0,7);ctx.lineTo(r*.95,0);ctx.lineTo(0,-7);ctx.fillStyle=cor;ctx.fill(); }
  else { ctx.shadowBlur = 15; ctx.shadowColor = cor; ctx.beginPath();ctx.moveTo(0,6);ctx.lineTo(r*.9,0);ctx.lineTo(0,-6);ctx.fillStyle='#333';ctx.fill(); ctx.beginPath();ctx.moveTo(r*.65,3);ctx.lineTo(r*.95, 0);ctx.lineTo(r*.65, -3);ctx.fillStyle=cor;ctx.fill(); }
  ctx.restore();

  // Guia visual de fim de curso no modo edição
  if(ST.editor && ST.sel === w.id) {
    const endAng = (w.angIni||135)*Math.PI/180 + (w.angSweep||270)*Math.PI/180;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(endAng);
    ctx.fillStyle = '#ff0000';
    ctx.shadowBlur = 10; ctx.shadowColor = '#ff0000';
    ctx.beginPath(); ctx.arc(r * 0.95, 0, 5, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

function drawArcoPuro(ctx,w,S,W,H){
  const cx=W/2,cy=H/2,r=Math.min(W,H)*.38, ai=w.angIni*Math.PI/180,sw=w.angSweep*Math.PI/180;
  const p=P(S, w.minValor||0, w.maxValor||100);
  ctx.lineCap = w.lineCap || 'butt';
  ctx.beginPath();ctx.arc(cx,cy,r,ai,ai+sw);ctx.strokeStyle='rgba(255,255,255,0.05)';ctx.lineWidth=w.thickness||8;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,r,ai,ai+sw*p);ctx.strokeStyle=w.cor;ctx.lineWidth=w.thickness||8;ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawBarraPura(ctx,w,S,W,H){
  const p=P(S, w.minValor||0, w.maxValor||100), divs=(w.divisores||10), spc=w.spacing??2, thk=w.thickness||10;
  if (!(w.rCurv > 0)) {
    const isV=(w.direction==='v'), totalSz=(isV?H:W)-10, segSz=(totalSz-(divs-1)*spc)/Math.max(1,divs);
    for(let i=0; i<divs; i++){
      const segPos = (i+0.5)/divs;
      const cor = segPos < (w.cor3Lim??20)/100 ? (w.cor3||'#0088ff')
                : segPos > (w.cor2Lim??80)/100  ? (w.cor2||'#ff0000')
                : (w.cor||'#0fa');
      const active=(i/divs)<p;
      ctx.save(); ctx.globalAlpha=active?1.0:0.15; ctx.fillStyle=cor; 
      if(active){ctx.shadowBlur=10; ctx.shadowColor=cor;}
      const x=isV?(W/2-thk/2):(5+i*(segSz+spc)), y=isV?(H-5-(i+1)*(segSz+spc)):(H/2-thk/2);
      ctx.fillRect(x,y,isV?thk:segSz,isV?segSz:thk); ctx.restore();
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
      if(active){ctx.shadowBlur=10; ctx.shadowColor=cor;}
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

  // Precisão decimal para casos específicos v5.2
  if (w.sensor === 'voltage' || w.sensor === 'fuelRate' || 
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
  // sweep >= 120°: modo original (centro do círculo = centro do canvas).
  //   Canvas = diâmetro completo. rStart gira como roda. Números acompanham.
  // sweep < 120°: raio muito grande, canvas ficaria enorme.
  //   Centraliza o arco no canvas para não sumir nem vazar pra fora do widget.
  const smallAngle = (sweep > 0 && sweep < 120);
  if(smallAngle) {
    const midA = rStartRad + sweepRad / 2;
    // Offset baseado no meio do arco: mantém o arco centrado no canvas
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
      // Ambos os modos usam rStart no ângulo: números sempre acompanham o arco
      const curA = rStartRad + p * sweepRad;
      x = Math.cos(curA) * rGlobal; y = Math.sin(curA) * rGlobal; angle = curA;
    }

    const side = (w.rLabelSide === 'inner' ? -1 : 1);
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.lineWidth = (i % (tDens || 1) === 0 || isEnd) ? thk : thk/2;
    ctx.fillStyle = cor; ctx.strokeStyle = cor;
    if(w.rDens >= 1 && (w.rDens > 1 || (i % (tDens || 1) === 0 || isEnd))) {
      if(tStyle === 2) { ctx.beginPath(); ctx.arc(0,0,((i % (tDens || 1) === 0 || isEnd)?thk*1.5:thk*0.6),0,Math.PI*2); ctx.fill(); }
      else { const tSide = (w.rTickSide === 'inner' ? -1 : 1); const actualTLen = ((i % (tDens || 1) === 0 || isEnd) ? tLen : tLen * 0.6) * tSide; if(tStyle === 0){ctx.shadowBlur = 10; ctx.shadowColor = cor;} ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(actualTLen, 0); ctx.stroke(); }
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





function drawEconometroClassico(ctx, w, S, W, H) {
  const cx = W / 2, cy = H / 2;
  const r = Math.min(W, H) * 0.38;
  const ai = 140 * Math.PI / 180;
  const sw = 260 * Math.PI / 180;
  const p = P(S, 0, 100); // 0 a 100% economia
  
  // Desenha os dois setores de fundo (Ecológico e Power)
  const ecoSweep = sw * 0.6; // 60% Ecológico
  
  ctx.save();
  ctx.lineCap = 'round';
  
  // Fundo Ecológico (Ciano apagado)
  ctx.beginPath();
  ctx.arc(cx, cy, r, ai, ai + ecoSweep);
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
  ctx.lineWidth = 16;
  ctx.stroke();
  
  // Fundo Power (Violeta apagado)
  ctx.beginPath();
  ctx.arc(cx, cy, r, ai + ecoSweep, ai + sw);
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.08)';
  ctx.lineWidth = 16;
  ctx.stroke();
  
  // Desenha o preenchimento aceso com base em p
  const currentSweep = sw * p;
  
  ctx.shadowBlur = 12;
  if (currentSweep <= ecoSweep) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, ai, ai + currentSweep);
    ctx.strokeStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.lineWidth = 16;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, ai, ai + ecoSweep);
    ctx.strokeStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.lineWidth = 16;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(cx, cy, r, ai + ecoSweep, ai + currentSweep);
    ctx.strokeStyle = '#8b5cf6';
    ctx.shadowColor = '#8b5cf6';
    ctx.lineWidth = 16;
    ctx.stroke();
  }
  
  ctx.restore();
  
  ctx.save();
  ctx.translate(cx, cy);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#666';
  ctx.font = '11px Rajdhani';
  ctx.fillText('ECO', Math.cos(ai - 0.1) * (r + 20), Math.sin(ai - 0.1) * (r + 20));
  ctx.fillText('POWER', Math.cos(ai + sw + 0.1) * (r + 22), Math.sin(ai + sw + 0.1) * (r + 22));
  ctx.restore();
  
  const agulhaAng = ai + sw * p;
  drawAgulha(ctx, { tagulha: 0, cor: '#ff0055' }, agulhaAng, r * 1.05, cx, cy);
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
  if(trigger) { ctx.shadowBlur = 15; ctx.shadowColor = corAcesa; } else { ctx.globalAlpha = 0.4; }
  ctx.fill(new Path2D(icon.path)); ctx.restore();
}

function renderWidget(ctx,w,cW,cH,t){
  ctx.clearRect(0,0,cW,cH); if(!w)return;
  let S=lerS(w);
  if(w.tipo==='arco_puro') drawArcoPuro(ctx,w,S,cW,cH);
  else if(w.tipo==='barra_pura') drawBarraPura(ctx,w,S,cW,cH);
  else if(w.tipo==='numero_puro') drawNumeroPuro(ctx,w,S,cW,cH);
  else if(w.tipo==='regua_pura') drawReguaPura(ctx,w,cW,cH);
  else if(w.tipo==='luz_espia') drawLuzEspia(ctx,w,S,cW,cH);
  else if(w.tipo==='econometro_classico') drawEconometroClassico(ctx,w,S,cW,cH);
  else if(w.tipo==='agulha_pura') drawAgulha(ctx,w,(w.angIni||135)*Math.PI/180 + ((w.angSweep||270)*Math.PI/180)*P(S, w.minValor||0, w.maxValor||100), Math.min(cW,cH)*.46, cW/2, cH/2);
}

export { renderWidget };
