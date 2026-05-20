'use strict';
import { ST, SENSORS_CONFIG, LOCAL_IMAGES, TIPOS_INFO } from './state.js';
import { saveToESP, toast, applyPageBg } from './main.js';

function mkWidget(w,pgIdx){
  w.pg = pgIdx;
  const layer=document.getElementById(`wl-${pgIdx}`); if(!layer) return;
  const div=document.createElement('div');
  div.className='widget'; div.id=`W-${w.id}`; div.style.left=w.x+'%'; div.style.top=w.y+'%';
  div.style.zIndex = w.tipo === 'imagem_pura' ? -100 : 1000 - (w.tamanho || 200); div.style.opacity = w.opacity ?? 1; 
  div.style.transform = `translate(-50%, -50%) rotate(${w.rotation||0}deg)`;

  let wW, wH, pad=80;
  if(w.tipo==='barra_pura' || w.tipo==='regua_pura'){
    let effCurv = w.rCurv || 0;
    // Intervalo 1–9°: muito pequeno para curvar sem explodir o canvas → trata como reto
    if (effCurv > 0 && effCurv < 10) effCurv = 0;
    // 360°: círculo fechado — usa o raio proporcional, canvas quadrado
    if (effCurv >= 360) effCurv = 360;
    const isV=( (w.direction==='v'||w.rDir==='v') && effCurv===0);
    if(effCurv === 0) {
      if(w.tipo==='barra_pura') { wW=isV?Math.max(pad,w.thickness):w.tamanho+pad; wH=isV?w.tamanho+pad:Math.max(pad,w.thickness); }
      else { wW = isV ? 100 : w.tamanho + 40; wH = isV ? w.tamanho + 40 : 100; }
    } else {
      const effCurvRad = effCurv * Math.PI / 180;
      const r = w.tamanho / effCurvRad;
      const margin = (w.rLabelOffset||10) + (w.rFontSz||12) + (w.rTickLen||15) + 30;
      if(effCurv >= 120) {
        // Ângulo grande: modo original. Canvas = diâmetro do círculo.
        wW = wH = Math.min(2000, Math.ceil((r + margin) * 2));
      } else {
        // Ângulo pequeno: raio enorme, usa corda para não explodir o canvas.
        const chord = 2 * r * Math.sin(effCurvRad / 2);
        wW = wH = Math.min(2000, Math.max(200, Math.ceil(chord + margin * 2)));
      }
    }
  } else if(w.tipo==='numero_puro'){ wW=w.tamanho; wH=w.tamanho*0.6; }
  else if(w.tipo==='imagem_pura'){ wW=wH=w.tamanho; }
  else { wW=wH=w.tamanho; }
  
  div.style.width=wW+'px'; div.style.height=wH+'px';
  if (w.tipo === 'imagem_pura') {
    div.innerHTML = `
      <div style="position:relative;width:100%;height:100%;">
        <svg width="0" height="0" style="position:absolute;">
          <filter id="tint-${w.id}">
            <feFlood flood-color="${w.cor||'#ffffff'}" />
            <feComposite in2="SourceGraphic" operator="in" result="mask" />
            <feComponentTransfer><feFuncA type="linear" slope="${w.corOp??0}" /></feComponentTransfer>
            <feBlend in2="SourceGraphic" mode="multiply" />
          </filter>
        </svg>
        <img src="${w.url||''}" style="position:absolute;top:0;left:0;display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;filter:url(#tint-${w.id});">
      </div>`;
  } else {
    div.innerHTML=`<canvas width="${wW*2}" height="${wH*2}" style="display:block;width:100%;height:100%"></canvas>`;
    ST.cvs[w.id]={ctx:div.querySelector('canvas').getContext('2d'), cW:wW*2, cH:wH*2};
    ST.cvs[w.id].ctx.scale(2,2);
  }

  const getXY = e => { let t = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e); return {x:t.clientX, y:t.clientY}; };

  div.onmousedown = div.ontouchstart = e => {
    if(!ST.editor) return;
    
    // Fecha o layer picker se estiver aberto
    closeLayerPicker();

    // --- MODO MOVER: arrasta direto ---
    if(ST.moving) {
      if(ST.sel !== w.id) selWidget(w.id, pgIdx);
      e.stopPropagation(); e.preventDefault();
      const start=getXY(e), sl=w.x, st=w.y;
      const dragList = [];
      dragList.push({w: w, sl: w.x, st: w.y, el: div});
      // Arrasta membros do grupo junto
      if(w.grupo && w.grupo > 0) {
        ST.cfg.paginas[pgIdx].widgets.forEach(cw => {
          if(cw.grupo === w.grupo && cw.id !== w.id) {
            dragList.push({w: cw, sl: cw.x, st: cw.y, el: document.getElementById(`W-${cw.id}`)});
          }
        });
      }
      const mv = ev => {
        const cur=getXY(ev);
        // Otimização Auto-Scale: Dividimos pela escala atual, e usamos a base fixa do painel (412x915)
        const dx = ((cur.x - start.x) / ST.scale) / 412 * 100;
        const dy = ((cur.y - start.y) / ST.scale) / 915 * 100;
        
        dragList.forEach(m => { m.w.x=m.sl+dx; m.w.y=m.st+dy; if(m.el){m.el.style.left=m.w.x+'%'; m.el.style.top=m.w.y+'%';} });
        const fx=document.getElementById('c-x'), fy=document.getElementById('c-y');
        if(ST.sel===w.id){ if(fx)fx.value=w.x.toFixed(1); if(fy)fy.value=w.y.toFixed(1); }
      };
      const up = () => { 
        document.removeEventListener('mousemove',mv); 
        document.removeEventListener('mouseup',up); 
        document.removeEventListener('touchmove',mv); 
        document.removeEventListener('touchend',up); 
        saveToESP(); // Salva a posição final após o término do arraste
      };
      document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up); document.addEventListener('touchmove',mv,{passive:false}); document.addEventListener('touchend',up);
      return;
    }

    // --- MODO SELEÇÃO: detecta sobreposição via elementsFromPoint ---
    const {x, y} = getXY(e);
    
    // Pega o retângulo INTEIRO do widget que foi clicado
    const clickedRect = div.getBoundingClientRect();
    
    // Encontra TODOS os widgets da página cujos retângulos se interceptam com o widget clicado
    // Isso funciona mesmo clicando no canto — qualquer sobreposição conta!
    const layer = document.getElementById(`wl-${pgIdx}`);
    const hits = [];
    if(layer) {
      layer.querySelectorAll('.widget').forEach(el => {
        const r = el.getBoundingClientRect();
        // Dois retângulos se interceptam se NÃO for verdade que um está completamente fora do outro
        const overlaps = !(r.right < clickedRect.left || 
                           r.left  > clickedRect.right || 
                           r.bottom < clickedRect.top  || 
                           r.top   > clickedRect.bottom);
        if(overlaps) {
          const wid = el.id.replace('W-', '');
          const found = ST.cfg.paginas[pgIdx].widgets.find(cw => cw.id === wid);
          if(found) hits.push(found);
        }
      });
    }
    
    if(hits.length >= 2) {
      // 2 ou mais widgets se sobrepondo: abre o Layer Picker
      e.stopPropagation();
      openLayerPicker(hits, x, y, pgIdx);
    } else {
      // Widget sem sobreposição: seleciona normalmente
      selWidget(w.id, pgIdx);
    }
  };
  layer.appendChild(div);
  ST.widgetMap.set(w.id, w);
}

function rmWidget(wid){ document.getElementById(`W-${wid}`)?.remove(); delete ST.cvs[wid]; ST.widgetMap.delete(wid); }
function toggleEditor(){ if(ST.editor) exitEditor(); else enterEditor(); }
function enterEditor(){ ST.editor=true; document.getElementById('fab').classList.add('on'); document.getElementById('ov-bar').classList.add('active'); document.querySelectorAll('.widget').forEach(el=>el.classList.add('em')); toast('MODO EDIÇÃO'); }
function exitEditor(){ closePanel(); closeLayerPicker(); ST.editor=false; document.getElementById('fab').classList.remove('on'); document.getElementById('ov-bar').classList.remove('active'); document.querySelectorAll('.widget').forEach(el=>el.classList.remove('em')); toast('LAYOUT SALVO'); }

// ================================================================
// ★ LAYER PICKER (Tabelinha de Sobreposição, inspirado no Figma) ★
// ================================================================

function openLayerPicker(widgets, x, y, pgIdx) {
  const picker = document.getElementById('layer-picker');
  if(!picker) return;

  let h = `<div class="lp-title">WIDGETS NESTE PONTO</div>`;
  widgets.forEach(w => {
    const info = TIPOS_INFO.find(t => t.id === w.tipo) || {ic:'⬜', nome: w.tipo};
    const grupoTag = w.grupo > 0 ? `<span class="lp-group-badge">🔗</span>` : '';
    h += `<div class="lp-item" data-wid="${w.id}" data-pg="${pgIdx}">
      <span class="lp-ic">${info.ic}</span>
      <span class="lp-nome">${info.nome}</span>
      ${grupoTag}
    </div>`;
  });
  h += `<div class="lp-divider"></div>`;
  h += `<button class="lp-join-btn" data-wids="[${widgets.map(ww=>`'${ww.id}'`).join(',')}]" data-pg="${pgIdx}">🔗 JUNTAR TODOS</button>`;

  picker.innerHTML = h;

  // Posiciona a tabelinha. Garante que não sai da tela.
  const pw = 200, ph = 50 + widgets.length * 48;
  const px = Math.min(x, window.innerWidth - pw - 10);
  const py = Math.min(y, window.innerHeight - ph - 10);
  picker.style.left = px + 'px';
  picker.style.top = py + 'px';
  picker.classList.add('open');

  // Fecha se clicar fora
  setTimeout(() => document.addEventListener('touchstart', closePickerOutside, {once: true}), 100);
  setTimeout(() => document.addEventListener('mousedown', closePickerOutside, {once: true}), 100);
}

function closePickerOutside(e) {
  const picker = document.getElementById('layer-picker');
  if(picker && !picker.contains(e.target)) closeLayerPicker();
  else {
    // Re-attach if click was inside
    setTimeout(() => document.addEventListener('touchstart', closePickerOutside, {once: true}), 100);
    setTimeout(() => document.addEventListener('mousedown', closePickerOutside, {once: true}), 100);
  }
}

function closeLayerPicker() {
  const picker = document.getElementById('layer-picker');
  if(picker) picker.classList.remove('open');
}

function joinGroup(widgetIds, pgIdx) {
  closeLayerPicker();
  const grupoId = Date.now();
  ST.cfg.paginas[pgIdx].widgets.forEach(w => {
    if(widgetIds.includes(w.id)) w.grupo = grupoId;
  });
  saveToESP();
  toast('🔗 GRUPO CRIADO!');
}

function separarWidget(wid, pgIdx) {
  const w = ST.cfg.paginas[pgIdx].widgets.find(x => x.id === wid);
  if(!w) return;
  w.grupo = 0;
  rmWidget(w.id); mkWidget(w, pgIdx); 
  selWidget(w.id, pgIdx); // Reabre o painel atualizado
  saveToESP();
  toast('✂️ SEPARADO DO GRUPO!');
}


function openBgMenu(){ 
  const pg=ST.cfg.paginas[ST.pg];
  let optStr = '<option value="">(Sem Fundo Preto)</option>';
  if (ST.imgList && ST.imgList.length > 0) {
    ST.imgList.forEach(img => {
      optStr += `<option value="${img}" ${pg.bg.img===img?'selected':''}>➔ ${img}</option>`;
    });
  }
  const selBg = document.getElementById('bg-url');
  if(selBg) selBg.innerHTML = optStr;
  
  document.getElementById('bg-size').value=pg.bg.size;
  document.getElementById('bgmenu').classList.add('open'); 
}
function closeBgMenu(){ document.getElementById('bgmenu').classList.remove('open'); }

function applyBg(){ 
  const pg=ST.cfg.paginas[ST.pg]; pg.bg.img=document.getElementById('bg-url').value; pg.bg.size=document.getElementById('bg-size').value; 
  applyPageBg(ST.pg); saveToESP();
}

// Função loadBgFile removida pois agora usamos dropdown com LOCAL_IMAGES

function selWidget(wid,pi){ 
  ST.sel=wid; ST.pg=pi;
  document.querySelectorAll('.widget').forEach(el=>el.classList.remove('sel', 'moving')); 
  const el = document.getElementById(`W-${wid}`);
  if(el) { el.classList.add('sel'); if(ST.moving) el.classList.add('moving'); }
  
  const w=ST.cfg.paginas[pi].widgets.find(x=>x.id===wid);
  if(w) {
    if(w.x > 50) document.getElementById('cpanel').classList.remove('right');
    else document.getElementById('cpanel').classList.add('right');
  }
  if(!ST.moving) openPanel(wid,pi); 
}

const FIELD_MAP = {
  'c-x':       (w, v) => w.x = parseFloat(v) || 0,
  'c-y':       (w, v) => w.y = parseFloat(v) || 0,
  'c-rot':     (w, v) => w.rotation = parseInt(v) || 0,
  'c-op':      (w, v) => w.opacity = parseFloat(v) / 100,
  'c-sensor':  (w, v) => w.sensor = v,
  'c-sensor-r':(w, v) => w.sensor = v,
  'c-cor':     (w, v) => w.cor = v,
  'c-cor2':    (w, v) => w.cor2 = v,
  'c-cor2-lim':(w, v) => w.cor2Lim = parseInt(v),
  'c-cor3':    (w, v) => w.cor3 = v,
  'c-cor3-lim':(w, v) => w.cor3Lim = parseInt(v),
  'c-sz':      (w, v) => w.tamanho = parseFloat(v),
  'c-thickness':(w, v) => w.thickness = parseFloat(v),
  'c-r-style': (w, v) => w.rStyle = parseInt(v),
  'c-r-font':  (w, v) => w.rFont = v,
  'c-r-fz':    (w, v) => w.rFontSz = parseFloat(v),
  'c-r-cor':   (w, v) => w.cor = v,
  'c-r-tl':    (w, v) => w.rTickLen = parseFloat(v),
  'c-r-thk':   (w, v) => w.rThick = parseFloat(v),
  'c-r-dens':  (w, v) => w.rDens = parseInt(v),
  'c-r-dir':   (w, v) => w.rDir = v,
  'c-r-min':   (w, v) => w.rMin = parseInt(v) || 0,
  'c-r-max':   (w, v) => w.rMax = Math.min(15000, parseInt(v) || 0),
  'c-r-sz':    (w, v) => w.tamanho = parseFloat(v),
  'c-r-curv':  (w, v) => w.rCurv = Math.min(360, parseInt(v)),
  'c-r-start': (w, v) => w.rStart = parseInt(v),
  'c-r-l-off': (w, v) => w.rLabelOffset = parseFloat(v),
  'c-r-l-side':(w, v) => w.rLabelSide = v,
  'c-r-l-cor': (w, v) => w.rLabelCor = v,
  'c-r-t-side':(w, v) => w.rTickSide = v,
  'c-tagulha': (w, v) => w.tagulha = parseInt(v),
  'c-linecap': (w, v) => w.lineCap = v,
  'c-font':    (w, v) => w.fontFamily = v,
  'c-max':     (w, v) => w.maxValor = parseInt(v) || 0,
  'c-min':     (w, v) => w.minValor = parseInt(v) || 0,
  'c-ai':      (w, v) => w.angIni = parseInt(v),
  'c-sw':      (w, v) => w.angSweep = parseInt(v),
  'c-unit':    (w, v) => w.unidade = v,
  'c-corr':    (w, v) => w.corr = parseInt(v),
  'c-unit-mode':(w, v) => w.unitMode = v,
  'c-divs':    (w, v) => w.divisores = parseInt(v),
  'c-spacing': (w, v) => w.spacing = parseFloat(v),
  'c-direction':(w, v) => w.direction = v,
  'c-img-url': (w, v) => w.url = v,
  'c-cor-op':  (w, v) => w.corOp = parseInt(v) / 100,
  'c-luz-sym': (w, v) => w.luzSym = v,
  'c-luz-trig':(w, v) => w.luzTrig = parseInt(v) || 0,
  'c-luz-inv': (w, v) => w.luzInvert = parseInt(v),
  'c-smooth-k':(w, v) => w.smoothK = parseInt(v)
};

function toggleMoveMode(){
  ST.moving = !ST.moving;
  const panel=document.getElementById('cpanel'), lockBtn=document.getElementById('mv-lock-btn'), selEl=document.getElementById(`W-${ST.sel}`);
  closeLayerPicker();
  if(!ST.moving){
    panel.classList.add('open'); 
    lockBtn.classList.remove('active'); 
    lockBtn.innerHTML = '<b>🔓</b><span>MOVER</span>';
    document.querySelectorAll('.widget').forEach(el=>el.classList.remove('moving')); 
    toast('TRAVADO'); 
  } else { 
    panel.classList.remove('open'); 
    lockBtn.classList.add('active'); 
    lockBtn.innerHTML = '🔒<span>TRAVAR</span>';
    if(selEl) selEl.classList.add('moving'); 
    toast('MODO ARRASTE'); 
  }
}

function toggleMultiMode() { /* Mantido vazio para compatibilidade, funcionalidade substituída pelo Layer Picker */ }

function closePanel(){ 
  if(ST.sel) { applyConfig(); saveToESP(); }
  ST.moving = false;
  document.getElementById('cpanel').classList.remove('open'); 
  const lockBtn=document.getElementById('mv-lock-btn');
  lockBtn.classList.remove('active');
  lockBtn.innerHTML = '<b>🔓</b><span>MOVER</span>';
  ST.sel=null; document.querySelectorAll('.widget').forEach(el=>el.classList.remove('sel', 'moving')); 
}

function buildSensorSelect(currentVal, id) {
  let h = `<select class="fsel" id="${id}">`;
  const grps = {};
  Object.values(SENSORS_CONFIG).forEach(s => {
    if(!grps[s.grp]) grps[s.grp] = [];
    grps[s.grp].push(s);
  });
  for(const gName in grps) {
    h += `<optgroup label="${gName}">`;
    grps[gName].forEach(s => {
      h += `<option value="${s.id}" ${currentVal === s.id ? 'selected' : ''}>${s.nome}</option>`;
    });
    h += `</optgroup>`;
  }
  return h + `</select>`;
}

function openPanel(wid,pi){
  const w=ST.cfg.paginas[pi].widgets.find(x=>x.id===wid); if(!w)return;
  
  const lockBtn = document.getElementById('mv-lock-btn');
  lockBtn.classList.add('active');
  lockBtn.innerHTML = '<b>🔓</b><span>MOVER</span>';

  const T = w.tipo; 
  const nomeW = TIPOS_INFO.find(x=>x.id===T)?.nome || 'WIDGET';
  document.getElementById('panel-title').innerText = 'AJUSTES: ' + nomeW.toUpperCase();
  let h = '';
  h += `<div class="csec">POSIÇÃO E TRANSFORM</div>
        <div class="fg"><label class="fl">Rotação: <span class="fv" id="vrot">${w.rotation||0}</span>°</label><input type="range" class="frange" id="c-rot" min="0" max="360" value="${w.rotation||0}"></div>
        <div class="fg"><label class="fl">Opacidade: <span class="fv" id="vop">${Math.round((w.opacity??1)*100)}</span>%</label><input type="range" class="frange" id="c-op" min="0" max="100" value="${Math.round((w.opacity??1)*100)}"></div>
        ${w.grupo > 0 ? `<button class="btn-separar" data-wid="${w.id}" data-pg="${pi}">✂️ SEPARAR DESTE GRUPO</button>` : ''}
        `;

  if(T==='regua_pura'){
    h += `<div class="csec">AJUSTES DA RÉGUA (VISUAL)</div>
      <div class="fg"><label class="fl">Estilo Traço</label><select class="fsel" id="c-r-style"><option value="0" ${w.rStyle==0?'selected':''}>🔆 Neon</option><option value="1" ${w.rStyle==1?'selected':''}>🛑 Encorpado</option><option value="2" ${w.rStyle==2?'selected':''}>💬 Pontos</option></select></div>
      <div class="fg"><label class="fl">Densidade Ticks</label><select class="fsel" id="c-r-dens"><option value="0" ${w.rDens==0?'selected':''}>Limpo (Só Números)</option><option value="1" ${w.rDens==1?'selected':''}>Baixa</option><option value="2" ${w.rDens==2?'selected':''}>Média</option><option value="5" ${w.rDens==5?'selected':''}>Alta</option><option value="10" ${w.rDens==10?'selected':''}>Detalhada</option></select></div>
      <div class="fg"><label class="fl">Comprimento Traço: <span class="fv" id="vtl">${w.rTickLen||15}</span></label><input type="range" class="frange" id="c-r-tl" min="5" max="50" value="${w.rTickLen||15}"></div>
      <div class="fg"><label class="fl">Espessura Linha: <span class="fv" id="vthk">${w.rThick||2}</span></label><input type="range" class="frange" id="c-r-thk" min="1" max="15" value="${w.rThick||2}"></div>
      <div class="fg"><label class="fl">Direção dos Traços</label><select class="fsel" id="c-r-t-side"><option value="outer" ${w.rTickSide==='outer'?'selected':''}>Para Fora</option><option value="inner" ${w.rTickSide==='inner'?'selected':''}>Para Dentro</option></select></div>
      <div class="fg"><label class="fl">Cor das Linhas</label><input type="color" class="fcol" id="c-r-cor" value="${w.cor}"></div>

      <div class="csec">TEXTO E ESCALA</div>
      <div class="fg"><label class="fl">Estilo Fonte</label><select class="fsel" id="c-r-font"><option value="Orbitron" ${w.rFont==='Orbitron'?'selected':''}>Orbitron</option><option value="Oxanium" ${w.rFont==='Oxanium'?'selected':''}>Oxanium</option><option value="Michroma" ${w.rFont==='Michroma'?'selected':''}>Michroma</option><option value="Teko" ${w.rFont==='Teko'?'selected':''}>Teko</option></select></div>
      <div class="fg"><label class="fl">Tamanho Fonte: <span class="fv" id="vfz">${w.rFontSz||12}</span>px</label><input type="range" class="frange" id="c-r-fz" min="6" max="30" value="${w.rFontSz||12}"></div>
      <div class="fg"><label class="fl">Cor dos Números</label><input type="color" class="fcol" id="c-r-l-cor" value="${w.rLabelCor||w.cor}"></div>
      <div class="fg"><label class="fl">Distância Texto: <span class="fv" id="vlrd">${w.rLabelOffset??10}</span>px</label><input type="range" class="frange" id="c-r-l-off" min="0" max="100" value="${w.rLabelOffset??10}"></div>
      <div class="fg"><label class="fl">Lado do Texto</label><select class="fsel" id="c-r-l-side"><option value="outer" ${w.rLabelSide==='outer'?'selected':''}>Externo</option><option value="inner" ${w.rLabelSide==='inner'?'selected':''}>Interno</option></select></div>
      <div class="fg-row" style="display:flex;gap:10px">
        <div style="flex:1"><label class="fl">Mínimo</label><input type="number" class="finp" id="c-r-min" value="${w.rMin||0}"></div>
        <div style="flex:1"><label class="fl">Máximo</label><input type="number" class="finp" id="c-r-max" value="${w.rMax||100}"></div>
      </div>

      <div class="csec">DIMENSÃO E POSIÇÃO</div>
      <div class="fg"><label class="fl">Comprimento Total: <span class="fv" id="vsz">${w.tamanho}</span>px</label><input type="range" class="frange" id="c-r-sz" min="150" max="1000" value="${w.tamanho}"></div>
      <div class="fg"><label class="fl">Ângulo/Curvatura: <span class="fv" id="vswr">${w.rCurv||0}</span>°</label><input type="range" class="frange" id="c-r-curv" min="0" max="360" value="${w.rCurv||0}"></div>
      <div class="fg"><label class="fl">Girar Régua: <span class="fv" id="vai">${w.rStart||0}</span>°</label><input type="range" class="frange" id="c-r-start" min="0" max="360" value="${w.rStart||0}"></div>
      <div class="fg" style="display:${w.rCurv===0?'block':'none'}"><label class="fl">Orientação</label><select class="fsel" id="c-r-dir"><option value="h" ${w.rDir==='h'?'selected':''}>Horizontal</option><option value="v" ${w.rDir==='v'?'selected':''}>Vertical</option></select></div>
      <div class="fg"><label class="fl">Sensor (Fonte de Dados)</label>
        ${buildSensorSelect(w.sensor, 'c-sensor-r')}
      </div>
    `;
  } else if(T === 'imagem_pura'){
    let optStr = '<option value="">(Nenhuma Selecionada)</option>';
    let customImgOption = '';
    
    // Se a imagem atual for um Base64 personalizado (não está na lista oficial)
    if (w.url && w.url.startsWith('data:image')) {
      customImgOption = `<option value="${w.url}" selected>➔ Imagem da Galeria</option>`;
    }
    
    if (ST.imgList && ST.imgList.length > 0) {
      ST.imgList.forEach(img => {
        optStr += `<option value="${img}" ${w.url===img?'selected':''}>➔ ${img}</option>`;
      });
    }

    h += `<div class="csec">AJUSTES DA IMAGEM LIVRE</div>
      <div class="fg">
        <label class="fl">Escolha o Relógio / Imagem</label>
        <select class="fsel" id="c-img-url">
          ${customImgOption}
          ${optStr}
        </select>
      </div>
      <div class="fg">
        <label class="fl" style="color: var(--cyan);">OU Imagem do Celular / PC</label>
        <input type="file" id="w-file-picker" accept="image/*" style="display: none;">
        <button class="pbtn pb-add" id="btn-trigger-w-picker" style="width: 100%; border: 1px dashed var(--cyan); background: transparent; color: var(--cyan);">📷 CARREGAR DA GALERIA</button>
      </div>
      <div class="fg"><label class="fl">Cor do Filtro (Overlay)</label><input type="color" class="fcol" id="c-r-cor" value="${w.cor||'#ffffff'}"></div>
      <div class="fg"><label class="fl">Intensidade do Filtro: <span class="fv" id="vopfiltro">${Math.round((w.corOp??0)*100)}</span>%</label><input type="range" class="frange" id="c-cor-op" min="0" max="100" value="${Math.round((w.corOp??0)*100)}"></div>
      <div class="fg"><label class="fl">Tamanho Base: <span class="fv" id="vsz">${w.tamanho}</span>px</label><input type="range" class="frange" id="c-sz" min="30" max="1500" value="${w.tamanho}"></div>
    `;
  } else if(T === 'luz_espia'){
    h += `<div class="csec">CONFIGURAÇÃO DA LUZ ESPIA</div>
      <div class="fg"><label class="fl">Símbolo Visual</label>
        <select class="fsel" id="c-luz-sym">
          <option value="oleo" ${w.luzSym==='oleo'?'selected':''}>🛢️ Óleo</option>
          <option value="bateria" ${w.luzSym==='bateria'?'selected':''}>🔋 Bateria</option>
          <option value="h2o" ${w.luzSym==='h2o'?'selected':''}>🌡️ Temperatura</option>
          <option value="combustivel" ${w.luzSym==='combustivel'?'selected':''}>⛽ Combustível</option>
          <option value="freio" ${w.luzSym==='freio'?'selected':''}>🛑 Exclamação (Freio)</option>
          <option value="alerta" ${w.luzSym==='alerta'?'selected':''}>⚠️ Perigo (Triângulo)</option>
          <option value="farol" ${w.luzSym==='farol'?'selected':''}>💡 Farol Alto / Luz</option>
          <option value="bolinha" ${w.luzSym==='bolinha'?'selected':''}>🔴 Círculo / Shift-Light</option>
          <option value="shift_seta" ${w.luzSym==='shift_seta'?'selected':''}>⬆️ Seta (Acima)</option>
        </select>
      </div>
      <div class="fg"><label class="fl">Sensor Analisado (Fonte)</label>
        ${buildSensorSelect(w.sensor, 'c-sensor')}
      </div>
      <div class="fg"><label class="fl">Aceso Quando Acima De: <span class="fv" id="vtrig">${w.luzTrig||80}</span>%</label><input type="range" class="frange" id="c-luz-trig" min="0" max="100" step="5" value="${w.luzTrig||80}"></div>
      <div class="fg"><label class="fl">Inverter Regra (Acende p/ Baixo)</label>
        <select class="fsel" id="c-luz-inv">
          <option value="0" ${w.luzInvert==0?'selected':''}>Acende quando ≥ (Maior que Limite)</option>
          <option value="1" ${w.luzInvert==1?'selected':''}>Acende quando ≤ (Menor que Limite)</option>
        </select>
      </div>
      <div class="fg-row" style="display:flex;gap:10px">
        <div style="flex:1"><label class="fl">Cor Acesa</label><input type="color" class="fcol" id="c-cor" value="${w.cor||'#ff0000'}"></div>
        <div style="flex:1"><label class="fl">Cor Apagada</label><input type="color" class="fcol" id="c-cor2" value="${w.cor2||'#333333'}"></div>
      </div>
      <div class="csec">DIMENSÃO</div>
      <div class="fg"><label class="fl">Tamanho Base: <span class="fv" id="vsz">${w.tamanho}</span>px</label><input type="range" class="frange" id="c-sz" min="30" max="400" value="${w.tamanho}"></div>
    `;
  } else {
    h += `<div class="csec">ESTILO E SENSOR</div>
      <div class="fg" style="display:${(T==='agulha_pura'?'block':'none')}"><label class="fl">Modelo Agulha</label><select class="fsel" id="c-tagulha"><option value="0" ${w.tagulha==0?'selected':''}>🔆 Neon Glow</option><option value="1" ${w.tagulha==1?'selected':''}>📍 Traço Fino</option><option value="2" ${w.tagulha==2?'selected':''}>🔺 Triângulo</option><option value="3" ${w.tagulha==3?'selected':''}>🔪 Ponta Cor</option></select></div>
      <div class="fg" style="display:${(T==='agulha_pura'?'block':'none')}"><label class="fl">Suavização Agulha: <span class="fv" id="vks">${w.smoothK??100}</span>%</label><input type="range" class="frange" id="c-smooth-k" min="1" max="100" value="${w.smoothK??100}"></div>
      <div class="fg" style="display:${(T==='numero_puro'?'block':'none')}"><label class="fl">Estilo Fonte</label><select class="fsel" id="c-font"><option value="Orbitron" ${w.fontFamily==='Orbitron'?'selected':''}>Orbitron</option><option value="Oxanium" ${w.fontFamily==='Oxanium'?'selected':''}>Oxanium</option><option value="Michroma" ${w.fontFamily==='Michroma'?'selected':''}>Michroma</option><option value="Teko" ${w.fontFamily==='Teko'?'selected':''}>Teko</option></select></div>
      <div class="fg" style="display:${(T==='arco_puro'?'block':'none')}"><label class="fl">Estilo das Pontas</label><select class="fsel" id="c-linecap"><option value="butt" ${w.lineCap==='butt'?'selected':''}>Reto</option><option value="round" ${w.lineCap==='round'?'selected':''}>Arredondado</option></select></div>
      <div class="fg"><label class="fl">Sensor</label>
        ${buildSensorSelect(w.sensor, 'c-sensor')}
      </div>
      <!-- Configurações Específicas v5.2 -->
      <div id="extra-sensor-cfg">
        ${w.sensor === 'speed' ? `
          <div class="fg"><label class="fl">Correção Velocímetro</label>
            <select class="fsel" id="c-corr">
              <option value="0" ${!w.corr?'selected':''}>REAL (GPS/ECU)</option>
              <option value="1" ${w.corr?'selected':''}>CORRIGIDA (+5%)</option>
            </select>
          </div>
        ` : ''}
        ${w.sensor === 'fuelLevel' ? `
          <div class="fg"><label class="fl">Exibição Combustível</label>
            <select class="fsel" id="c-unit-mode">
              <option value="%" ${w.unitMode==='%'?'selected':''}>PORCENTAGEM (%)</option>
              <option value="L" ${w.unitMode==='L'?'selected':''}>LITROS (Base 44L)</option>
            </select>
          </div>
        ` : ''}
      </div>
      <div class="fg" style="display:${T!=='barra_pura'?'block':'none'}"><label class="fl">Cor</label><input type="color" class="fcol" id="c-cor" value="${w.cor}"></div>
      <div class="fg" style="display:${(T==='barra_pura'?'block':'none')}">
        <label class="fl">🎨 3 ZONAS DE COR</label>
        <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
          <div style="flex:1;text-align:center">
            <div style="font-size:9px;color:#aaa;margin-bottom:4px">PONTA 1</div>
            <input type="color" class="fcol" id="c-cor3" value="${w.cor3||'#0088ff'}" style="width:100%">
          </div>
          <div style="flex:1;text-align:center">
            <div style="font-size:9px;color:#aaa;margin-bottom:4px">PRINCIPAL</div>
            <input type="color" class="fcol" id="c-cor" value="${w.cor}" style="width:100%">
          </div>
          <div style="flex:1;text-align:center">
            <div style="font-size:9px;color:#aaa;margin-bottom:4px">PONTA 2</div>
            <input type="color" class="fcol" id="c-cor2" value="${w.cor2||'#ff0000'}" style="width:100%">
          </div>
        </div>
      </div>
      <div class="fg" style="display:${(T==='barra_pura'?'block':'none')}"><label class="fl">Ponta 1 até: <span class="fv" id="vlim3">${w.cor3Lim??20}</span>%</label><input type="range" class="frange" id="c-cor3-lim" min="0" max="100" value="${w.cor3Lim??20}"></div>
      <div class="fg" style="display:${(T==='barra_pura'?'block':'none')}"><label class="fl">Ponta 2 a partir de: <span class="fv" id="vlim">${w.cor2Lim??80}</span>%</label><input type="range" class="frange" id="c-cor2-lim" min="0" max="100" value="${w.cor2Lim??80}"></div>
      <div class="fg"><label class="fl">Tamanho Base: <span class="fv" id="vsz">${w.tamanho}</span>px</label><input type="range" class="frange" id="c-sz" min="30" max="1500" value="${w.tamanho}"></div>
      <div class="fg" style="display:${(T==='barra_pura'?'block':'none')}"><label class="fl">Curvatura Angular (Anel): <span class="fv" id="vswr">${w.rCurv||0}</span>°</label><input type="range" class="frange" id="c-r-curv" min="0" max="360" value="${w.rCurv||0}"></div>
      <div class="fg" style="display:${(T==='barra_pura'?'block':'none')}"><label class="fl">Girar Barra Curvada: <span class="fv" id="vai2">${w.rStart||0}</span>°</label><input type="range" class="frange" id="c-r-start" min="0" max="360" value="${w.rStart||0}"></div>
      <div class="fg" style="display:${(T==='barra_pura'||T==='arco_puro'?'block':'none')}"><label class="fl">Grossura: <span class="fv" id="vthk">${w.thickness||8}</span></label><input type="range" class="frange" id="c-thickness" min="1" max="100" value="${w.thickness||8}"></div>
      <div class="fg" style="display:${(T==='barra_pura'?'block':'none')}"><label class="fl">Divisórias: <span class="fv" id="vdiv">${w.divisores||10}</span></label><input type="range" class="frange" id="c-divs" min="1" max="60" value="${w.divisores||10}"></div>
      <div class="fg" style="display:${(T==='barra_pura'?'block':'none')}"><label class="fl">Espaçamento: <span class="fv" id="vspc">${w.spacing??2}</span>px</label><input type="range" class="frange" id="c-spacing" min="0" max="20" value="${w.spacing??2}"></div>
      <div class="fg" style="display:${(T==='barra_pura'?'block':'none')}"><label class="fl">Orientação</label><select class="fsel" id="c-direction"><option value="h" ${w.direction==='h'?'selected':''}>Horizontal</option><option value="v" ${w.direction==='v'?'selected':''}>Vertical</option></select></div>
      <div class="fg-row" style="display:${(T==='agulha_pura'||T==='barra_pura'||T==='arco_puro')?'flex':'none'};gap:10px"><div style="flex:1"><label class="fl">Mínimo</label><input type="number" class="finp" id="c-min" value="${w.minValor??0}"></div><div style="flex:1"><label class="fl">Máximo</label><input type="number" class="finp" id="c-max" value="${w.maxValor??100}"></div></div>
      <div class="fg" style="display:${(T==='arco_puro'||T==='agulha_pura'?'block':'none')}"><label class="fl">Ângulo Início: <span class="fv" id="vai">${w.angIni||135}</span>°</label><input type="range" class="frange" id="c-ai" min="0" max="360" value="${w.angIni||135}"></div>
      <div class="fg" style="display:${(T==='arco_puro'||T==='agulha_pura'?'block':'none')}"><label class="fl">Ângulo Total: <span class="fv" id="vsw">${w.angSweep||270}</span>°</label><input type="range" class="frange" id="c-sw" min="1" max="360" value="${w.angSweep||270}"></div>
      <div class="fg" style="display:${(T==='numero_puro'?'block':'none')}"><label class="fl">Unidade</label><input type="text" class="finp" id="c-unit" value="${w.unidade||''}"></div>
    `;
  }
  document.getElementById('cfg-fields').innerHTML = h;
  document.getElementById('cpanel').classList.add('open');
}

function applyConfig(changedId){
  if(!ST.sel) return; const w=ST.cfg.paginas[ST.pg].widgets.find(x=>x.id===ST.sel); if(!w)return;
  const f = id => document.getElementById(id);
  
  if (changedId) {
    const fn = FIELD_MAP[changedId];
    const el = f(changedId);
    if (fn && el) {
      fn(w, el.value);
    }
  } else {
    Object.entries(FIELD_MAP).forEach(([id, fn]) => {
      const el = f(id);
      if(el) fn(w, el.value);
    });
  }

  // Lista de IDs de campos que exigem redimensionamento físico do canvas ou recriação DOM
  const needsRecreate = [
    'c-sz', 'c-r-sz', 'c-thickness', 'c-r-tl', 'c-r-thk', 'c-r-dens', 
    'c-r-curv', 'c-r-start', 'c-r-l-off', 'c-r-l-side', 'c-r-t-side', 
    'c-r-fz', 'c-divs', 'c-spacing', 'c-direction', 'c-r-dir', 
    'c-img-url', 'c-luz-sym', 'c-cor-op'
  ];

  const div = document.getElementById(`W-${w.id}`);
  if (changedId && !needsRecreate.includes(changedId) && div) {
    // Atualização rápida In-Place: muda apenas estilos CSS sem apagar o elemento DOM
    if (changedId === 'c-x' || changedId === 'c-y') {
      div.style.left = w.x + '%';
      div.style.top = w.y + '%';
    } else if (changedId === 'c-rot') {
      div.style.transform = `translate(-50%, -50%) rotate(${w.rotation||0}deg)`;
    } else if (changedId === 'c-op') {
      div.style.opacity = w.opacity ?? 1;
    }
    // Outros campos (cor, sensor, min/max, unidades) serão aplicados de forma transparente
    // no próximo ciclo de renderização a 60fps do Canvas.
  } else {
    // Mudança estrutural: remove e reconstrói o widget com o novo tamanho/tipo
    rmWidget(w.id); 
    mkWidget(w, ST.pg);
  }
}

function delWidget(){ 
  if(confirm('Excluir?')){ 
    const idx=ST.cfg.paginas[ST.pg].widgets.findIndex(x=>x.id===ST.sel); 
    if(idx>=0){ ST.cfg.paginas[ST.pg].widgets.splice(idx,1); rmWidget(ST.sel);} 
    ST.sel=null; ST.moving=false; 
    document.getElementById('cpanel').classList.remove('open'); 
    document.getElementById('mv-lock-btn').classList.remove('active'); 
    saveToESP(); 
  }
}

function openAddMenu(){
  const grid=document.getElementById('amgrid'); grid.innerHTML='';
  TIPOS_INFO.forEach(t=>{
    const d=document.createElement('div'); d.className='amitem'; d.innerHTML=`<div class="amicon">${t.ic}</div><div class="amname">${t.nome}</div>`;
    d.onclick=()=>{ 
        const id='w'+Date.now();
        const nw={id, tipo:t.id, sensor:'rpm', x:30, y:30, tamanho:(t.id==='numero_puro'?120:300), maxValor:100, minValor:0, angIni:(t.id==='regua_pura'?0:-90), angSweep:(t.id==='regua_pura'?0:270), cor:'#9b00ff', thickness:8, spacing:2, divisores:10, direction:'h', cor2:'#f00', cor2Lim:80, cor3:'#0088ff', cor3Lim:20, unidade:'RPM', fontFamily:'Orbitron', tagulha:0, opacity:1, rotation:0}; 
        if(t.id==='regua_pura') { Object.assign(nw, { rMin:0, rMax:100, rCurv:0, rStart:0, rStyle:0, rFont:'Orbitron', rFontSz:12, rTickLen:15, rDens:5, rThick:2, rDir:'h' }); }
        if(t.id==='numero_puro') nw.maxValor=8000;
        if(t.id==='barra_pura') nw.maxValor=100; // Barras: sensores comuns são 0-100%
        if(t.id==='imagem_pura') { nw.url='/flames.webp'; nw.tamanho=300; }
        if(t.id==='luz_espia') { Object.assign(nw, {luzSym:'alerta', luzTrig:80, luzInvert:0, cor:'#ff0000', cor2:'#333333', tamanho:60, sensor:'demo'}); }
        ST.cfg.paginas[ST.pg].widgets.push(nw); mkWidget(nw,ST.pg); closeAddMenu(); selWidget(id, ST.pg); 
    }; grid.appendChild(d);
  });document.getElementById('addmenu').classList.add('open');
}

function closeAddMenu(){document.getElementById('addmenu').classList.remove('open');}

export {
  mkWidget, rmWidget, toggleEditor, enterEditor, exitEditor,
  openLayerPicker, closeLayerPicker, joinGroup, separarWidget,
  openBgMenu, closeBgMenu, applyBg, selWidget, toggleMoveMode,
  toggleMultiMode, closePanel, openPanel, applyConfig, delWidget,
  openAddMenu, closeAddMenu
};
