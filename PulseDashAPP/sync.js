const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'PulseDashESP', 'data');
const destDir = path.join(__dirname, 'www');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    // Cria a pasta mãe se não existir
    const parentDir = path.dirname(dest);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

console.log('🔄 Sincronizando assets de:', srcDir);
console.log('🔄 Destino:', destDir);

try {
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  copyRecursiveSync(srcDir, destDir);
  console.log('✅ Assets copiados com sucesso!');

  // ==============================================================
  // ★ PATCHING SYSTEM: ADAPTA O SITE PARA APP NATIVO BLUETOOTH ★
  // ==============================================================
  console.log('⚙️ Aplicando patches de aplicativo nativo...');

  // 1. Injeta capacitor.js no index.html
  const indexPath = path.join(destDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    let indexHtml = fs.readFileSync(indexPath, 'utf8');
    indexHtml = indexHtml.replace(
      '<!-- SCRIPTS LOAD -->',
      '<!-- SCRIPTS LOAD -->\n  <script src="capacitor.js"></script>'
    );
    fs.writeFileSync(indexPath, indexHtml, 'utf8');
    console.log('  [index.html] capacitor.js injetado.');
  }

  // 2. Injeta detecção e funções do Bluetooth Serial no js/main.js
  const mainJsPath = path.join(destDir, 'js', 'main.js');
  if (fs.existsSync(mainJsPath)) {
    let mainJs = fs.readFileSync(mainJsPath, 'utf8');

    // Substitui a inicialização padrão no init() para suportar Bluetooth Serial condicionalmente
    const targetInit = '  initWebSocket();';
    const replacementInit = `  document.addEventListener('deviceready', () => {
    console.log("[SYS] deviceready disparado! Inicializando Bluetooth...");
    if (typeof window.bluetoothSerial !== 'undefined') {
      initBluetoothSerial();
    } else {
      initWebSocket();
    }
  });
  setTimeout(() => {
    if (typeof window.bluetoothSerial === 'undefined' && !ws && !wsReconnectTimer) {
      console.log("[SYS] deviceready nao disparou, assumindo modo navegador.");
      initWebSocket();
    }
  }, 1000);`;

    if (mainJs.includes(targetInit)) {
      mainJs = mainJs.replace(targetInit, replacementInit);
      console.log('  [js/main.js] Inicializador condicional Bluetooth injetado.');
    } else {
      // Tenta uma versão alternativa com CRLF
      const alternateInit = '\r\n  initWebSocket();';
      const alternateReplacementInit = '\r\n' + replacementInit;
      if (mainJs.includes(alternateInit)) {
        mainJs = mainJs.replace(alternateInit, alternateReplacementInit);
        console.log('  [js/main.js] Inicializador condicional Bluetooth injetado (CRLF).');
      } else {
        console.warn('  ⚠️ [js/main.js] Não foi possível encontrar a inicialização padrão do WebSocket para substituir.');
      }
    }

    // Código do Bluetooth Serial nativo que será anexado ao final do main.js
    const btCode = `

// ==============================================================
// ★ CAPACITOR BLUETOOTH SERIAL INTEGRATION (PulseDash v5.5) ★
// ==============================================================
function initBluetoothSerial() {
  console.log("[BT] Iniciando conexão Bluetooth...");
  toast("🔎 PROCURANDO PULSESCAN...");
  
  if (typeof window.bluetoothSerial === 'undefined') {
    console.error("[BT] Plugin bluetoothSerial não disponível.");
    return;
  }

  // Garante que o Bluetooth está ativado no celular
  window.bluetoothSerial.isEnabled(() => {
    // Bluetooth ativo, lista dispositivos pareados
    window.bluetoothSerial.list((devices) => {
      console.log("[BT] Dispositivos pareados encontrados:", devices.length);
      const target = devices.find(d => {
        const name = (d.name || "").toUpperCase();
        return name.includes("PULSESCAN") || name.includes("PULSEDASH") || name.includes("BUIUBER") || name.includes("ESP32");
      });
      
      if (target) {
        connectToDevice(target.id || target.address);
      } else {
        console.log("[BT] PulseScan não encontrado nos pareados. Tentando primeiro dispositivo ou avisando...");
        toast("❌ PAREIE O PULSESCAN VIA BLUETOOTH");
        setTimeout(initBluetoothSerial, 6000);
      }
    }, (err) => {
      console.error("[BT] Erro ao listar pareados:", err);
      setTimeout(initBluetoothSerial, 5000);
    });
  }, () => {
    // Bluetooth desativado, solicita ativação ao usuário
    toast("🔌 ATIVE O BLUETOOTH DO CELULAR");
    window.bluetoothSerial.showBluetoothSettings();
    setTimeout(initBluetoothSerial, 6000);
  });
}

function connectToDevice(address) {
  console.log("[BT] Conectando ao endereço:", address);
  toast("🔌 CONECTANDO AO PULSESCAN...");
  
  window.bluetoothSerial.connect(address, () => {
    console.log("[BT] Conectado com sucesso!");
    toast("⚡ TELEMETRIA ONLINE (BT)");
    
    ST.dados.obd_state = 4;
    updateBtButton(4);
    updateOverlay(4, true);
    
    // Escuta dados linha por linha finalizadas com caractere de nova linha '\\n'
    window.bluetoothSerial.subscribe('\\n', (data) => {
      try {
        const j = JSON.parse(data.trim());
        const oldState = ST.dados.obd_state;
        Object.assign(ST.dados, j);
        if (j.rpm !== undefined) _freqCounter++;
        
        if (j.obd_state !== undefined) {
          updateBtButton(j.obd_state);
          if (j.obd_state !== oldState) {
            updateOverlay(j.obd_state, true);
          } else {
            if (document.getElementById('obd-overlay').classList.contains('open')) {
              const dFreq = document.getElementById('step-freq-detail');
              if (dFreq) dFreq.textContent = \`\${_freqHz} Hz\`;
            }
          }
        }
      } catch (err) {
        // Ignora pacotes cortados
      }
    }, (err) => {
      console.error("[BT] Assinatura serial falhou:", err);
      toast("❌ CONEXÃO DE DADOS PERDIDA");
      initBluetoothSerial();
    });
  }, (err) => {
    console.log("[BT] Falha na conexão. Retentando em 4s...", err);
    toast("❌ CONEXÃO BT FALHOU");
    setTimeout(initBluetoothSerial, 4000);
  });
}
`;

    mainJs += btCode;
    fs.writeFileSync(mainJsPath, mainJs, 'utf8');
    console.log('  [js/main.js] Funções de suporte Bluetooth serial anexadas.');
  }

  console.log('🎉 Patches aplicados com sucesso! Compilação pronta para Android.');
} catch (err) {
  console.error('❌ Erro na sincronização ou patching:', err);
  process.exit(1);
}
