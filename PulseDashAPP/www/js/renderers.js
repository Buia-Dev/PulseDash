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
  
  if(tipo===0) { 
    ctx.strokeStyle = '#000'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r*0.22, 0); ctx.lineTo(r*.97, 0); ctx.stroke();
    ctx.strokeStyle = cor; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-r*0.2, 0); ctx.lineTo(r*.95, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fillStyle='#000'; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,8,0,Math.PI*2); ctx.fillStyle=cor; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.strokeStyle=cor; ctx.lineWidth=1.5; ctx.stroke();
  }
  else if(tipo===1) { ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(r*.95, 0);ctx.strokeStyle=cor;ctx.lineWidth=3;ctx.stroke(); }
  else if(tipo===2) { ctx.beginPath();ctx.moveTo(0,7);ctx.lineTo(r*.95,0);ctx.lineTo(0,-7);ctx.fillStyle=cor;ctx.fill(); }
  else { ctx.beginPath();ctx.moveTo(0,6);ctx.lineTo(r*.9,0);ctx.lineTo(0,-6);ctx.fillStyle='#333';ctx.fill(); ctx.beginPath();ctx.moveTo(r*.65,3);ctx.lineTo(r*.95, 0);ctx.lineTo(r*.65, -3);ctx.fillStyle=cor;ctx.fill(); }
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
    const isV=(w.direction==='v'), totalSz=(isV?H:W)-10, segSz=(totalSz-(divs-1)*spc)/Math.max(1,divs);
    for(let i=0; i<divs; i++){
      const segPos = (i+0.5)/divs;
      const cor = segPos < (w.cor3Lim??20)/100 ? (w.cor3||'#0088ff')
                : segPos > (w.cor2Lim??80)/100  ? (w.cor2||'#ff0000')
                : (w.cor||'#0fa');
      const active=(i/divs)<p;
      ctx.save(); ctx.globalAlpha=active?1.0:0.15; ctx.fillStyle=cor; 
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
  
  // Lazy Render: Repinta apenas se houve mudança matemática real ou se estivermos editando
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
