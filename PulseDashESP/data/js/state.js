'use strict';

const ST = {
  pg: 0, editor: false, sel: null, moving: false, cfg: null,
  dados: {}, smooth: {},
  cvs: {}, demoT: 0, wakeLock: null, imgList: [],
  fetching: false,
  booting: true, // Bloqueia UI durante animação
  widgetMap: new Map(), // Lookup O(1) de widgets
  scale: 1 // Usado para o Auto-Scale responsivo
};

const LOCAL_IMAGES = [
  'relogios/flames.webp',
  'relogios/gavioes.webp',
  'relogios/pikachu.webp'
];

const SENSORS_CONFIG = {
  demo:       { id: 'demo',       nome: '🤖 MODO DEMO',      unit: '',      grp: 'VIRTUAL' },
  rpm:        { id: 'rpm',        nome: '🏎️ RPM',            unit: 'RPM',   grp: 'MOTOR' },
  speed:      { id: 'speed',      nome: '🏁 VELOCIDADE',      unit: 'KM/H',  grp: 'MOTOR' },
  throttle:   { id: 'throttle',   nome: '🦋 BORBOLETA',       unit: '%',     grp: 'MOTOR' },
  pedal:      { id: 'pedal',      nome: '🦶 PEDAL REAL',      unit: '%',     grp: 'MOTOR' },
  load:       { id: 'load',       nome: '💪 CARGA MOTOR',     unit: '%',     grp: 'MOTOR' },
  fuelRate:   { id: 'fuelRate',   nome: '⛽ CONSUMO',         unit: 'L/h',    grp: 'MOTOR' },
  boost:      { id: 'boost',      nome: '🐌 MAP/PRES. ADM',   unit: 'kPa',   grp: 'MOTOR' },
  coolant:    { id: 'coolant',    nome: '🌡️ ÁGUA',           unit: '°C',    grp: 'TEMPERATURA' },
  catalyst:   { id: 'catalyst',   nome: '🔥 CATALISADOR',     unit: '°C',    grp: 'TEMPERATURA' },
  ambient:    { id: 'ambient',    nome: '☀️ AR EXTERNO',      unit: '°C',    grp: 'TEMPERATURA' },
  ethanol:    { id: 'ethanol',    nome: '🌽 ETANOL',          unit: '%',     grp: 'MOTOR' },
  voltage:    { id: 'voltage',    nome: '🔋 VOLTAGEM ECU',    unit: 'V',     grp: 'SISTEMA' },
  fuelLevel:  { id: 'fuelLevel',  nome: '⛽ NÍVEL COMBUSTÍVEL', unit: '%',   grp: 'SISTEMA' },

  // Novos sensores estendidos v6.0 (GM UDS & OBD2)
  tripDist:   { id: 'tripDist',   nome: '📏 ODÔMETRO TOTAL',   unit: 'KM',    grp: 'SISTEMA' },

  // Computador de bordo & Virtuais v6.0
  econometer: { id: 'econometer', nome: '📊 ECONOMÔMETRO',    unit: '%',     grp: 'VIRTUAL' },
  tripDistance: { id: 'tripDistance', nome: '📏 VIAGEM DISTÂN.', unit: 'KM',  grp: 'VIAGEM' },
  tripFuel:   { id: 'tripFuel',   nome: '⛽ VIAGEM VOL.',     unit: 'L',     grp: 'VIAGEM' },
  tripAvgSpeed: { id: 'tripAvgSpeed', nome: '🏁 VIAGEM V. MÉD.', unit: 'KM/H',grp: 'VIAGEM' },
  tripAvgCons: { id: 'tripAvgCons', nome: '📊 VIAGEM CONS.',    unit: 'KM/L',  grp: 'VIAGEM' },
  tripCost:   { id: 'tripCost',   nome: '💸 VIAGEM CUSTO',    unit: 'R$',    grp: 'VIAGEM' },
  tripTimeTotal: { id: 'tripTimeTotal', nome: '⏱️ TEMPO TOTAL',  unit: 'min',   grp: 'VIAGEM' }
};

const ICONES_SVG = {
  oleo: { vB: 24, path: "M22,12.5C22,12.5 24,14.67 24,16A2,2 0 0,1 22,18A2,2 0 0,1 20,16C20,14.67 22,12.5 22,12.5M6,6H10A1,1 0 0,1 11,7A1,1 0 0,1 10,8H9V10H11C11.74,10 12.39,10.4 12.73,11L19.24,7.24L22.5,9.13C23,9.4 23.14,10 22.87,10.5C22.59,10.97 22,11.14 21.5,10.86L19.4,9.65L15.75,15.97C15.41,16.58 14.75,17 14,17H5A2,2 0 0,1 3,15V12A2,2 0 0,1 5,10H7V8H6A1,1 0 0,1 5,7A1,1 0 0,1 6,6M5,12V15H14L16.06,11.43L12.6,13.43L11.69,12H5M0.38,9.21L2.09,7.5C2.5,7.11 3.11,7.11 3.5,7.5C3.89,7.89 3.89,8.5 3.5,8.91L1.79,10.62C1.4,11 0.77,11 0.38,10.62C0,10.23 0,9.6 0.38,9.21Z" },
  bateria: { vB: 24, path: "M 3 8 h 18 v 12 H 3 Z M 5 4 h 4 v 4 H 5 Z M 15 4 h 4 v 4 H 15 Z M 5 13 h 4 v 2 H 5 Z M 14 13 h 6 v 2 h -6 Z M 16 11 h 2 v 6 h -2 Z" },
  h2o: { vB: 24, path: "M 10 14 V 4 C 10 2.9 10.9 2 12 2 C 13.1 2 14 2.9 14 4 V 14 A 4 4 0 1 1 10 14 Z M 14 6 h 2 v 1 h -2 Z M 14 9 h 2 v 1 h -2 Z M 14 12 h 2 v 1 h -2 Z M 4 20 l 2 -1 l 2 1 l 2 -1 l 2 1 l 2 -1 l 2 1 l 2 -1 l 2 1 v 2 H 4 Z" },
  motor: { vB: 24, path: "M 6 10 l 2 -3 h 8 l 2 3 h 3 v 7 h -3 l -1 2 h -6 l -1 -2 h -4 v -7 Z M 2 11 h 2 v 5 h -2 Z M 21 12 h 2 v 3 h -2 Z M 10 5 h 4 v 2 h -4 Z" },
  combustivel: { vB: 24, path: "M18,10A1,1 0 0,1 17,9A1,1 0 0,1 18,8A1,1 0 0,1 19,9A1,1 0 0,1 18,10M12,10H6V5H12M19.77,7.23L19.78,7.22L16.06,3.5L15,4.56L17.11,6.67C16.17,7 15.5,7.93 15.5,9A2.5,2.5 0 0,0 18,11.5C18.36,11.5 18.69,11.42 19,11.29V18.5A1,1 0 0,1 18,19.5A1,1 0 0,1 17,18.5V14C17,12.89 16.1,12 15,12H14V5C14,3.89 13.1,3 12,3H6C4.89,3 4,3.89 4,5V21H14V13.5H15.5V18.5A2.5,2.5 0 0,0 18,21A2.5,2.5 0 0,0 20.5,18.5V9C20.5,8.31 20.22,7.68 19.77,7.23Z" },
  freio: { vB: 24, path: "M12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2ZM12 20C7.6 20 4 16.4 4 12C4 7.6 7.6 4 12 4C16.4 4 20 7.6 20 12C20 16.4 16.4 20 12 20ZM11 7H13V13H11V7ZM11 15H13V17H11V15Z" },
  alerta: { vB: 24, path: "M1 21H23L12 2L1 21ZM12 5.8L19.5 19H4.5L12 5.8ZM11 10H13V14H11V10ZM11 16H13V18H11V16Z" },
  farol: { vB: 24, path: "M10 21H14A6 6 0 0 0 14 9H10V21ZM12 11A4 4 0 0 1 12 19V11Z M3 11H8V13H3V11Z M5 7H9V9H5V7Z M5 15H9V17H5V15Z" },
  bolinha: { vB: 24, path: "M12 4A8 8 0 1 0 12 20A8 8 0 1 0 12 4Z" },
  shift_seta: { vB: 24, path: "M12 4L4 12H9V20H15V12H20L12 4Z" }
};

const TIPOS_INFO = [
  {id:'arco_puro', nome:'Arco', ic:'⭕'},
  {id:'barra_pura', nome:'Barra', ic:'📊'},
  {id:'agulha_pura', nome:'Agulha', ic:'📍'},
  {id:'numero_puro', nome:'Número', ic:'🔢'},
  {id:'regua_pura', nome:'Régua', ic:'📏'},
  {id:'imagem_pura', nome:'Imagem Livre', ic:'🖼️'},
  {id:'luz_espia', nome:'Luz (Alerta)', ic:'🚨'},
  {id:'econometro_classico', nome:'Economômetro', ic:'⚡'}
];

const CFG_DEF = {
  paginas: [
    { 
      bg:{img:'',size:'cover'}, 
      widgets:[
        { id:'w1', tipo:'arco_puro', x:50, y:45, tamanho:400, cor:'#00f2ff', thickness:20, sensor:'demo', rotation:0, angIni:140, angSweep:260, lineCap:'round', opacity:1 },
        { id:'w2', tipo:'regua_pura', x:50, y:45, tamanho:690, cor:'#ffffff', sensor:'demo', rStart:140, rCurv:260, rStyle:0, rFont:'Orbitron', rFontSz:16, rTickLen:25, rThick:3, rDens:5, rLabelOffset:20, rLabelSide:'outer', rTickSide:'inner', opacity:1 },
        { id:'w3', tipo:'agulha_pura', x:50, y:45, tamanho:360, cor:'#ff0055', sensor:'demo', rotation:0, angIni:140, angSweep:260, tagulha:0, opacity:1 },
        { id:'w4', tipo:'barra_pura', x:50, y:88, tamanho:320, cor:'#00ff88', thickness:15, sensor:'demo', rotation:0, direction:'h', divisores:15, spacing:3, cor2:'#ff0000', cor2Lim:80, opacity:1 },
        { id:'w5', tipo:'numero_puro', x:50, y:45, tamanho:140, cor:'#ffffff', sensor:'demo', rotation:0, fontFamily:'Orbitron', unidade:'KM/H', opacity:1, maxValor:100, minValor:0 }
      ] 
    },
    { bg:{img:'',size:'cover'}, widgets:[] },
    { bg:{img:'',size:'cover'}, widgets:[] }
  ]
};

// Inicialização dinâmica do estado de dados
Object.keys(SENSORS_CONFIG).forEach(k => {
  ST.dados[k] = 0;
  ST.smooth[k] = 0;
});

export { ST, LOCAL_IMAGES, SENSORS_CONFIG, ICONES_SVG, TIPOS_INFO, CFG_DEF };
