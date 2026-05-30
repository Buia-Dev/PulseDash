const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'PulseDash', 'data');
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

  console.log('⚙️ Aplicando patches de aplicativo nativo...');

  // 1. Injeta capacitor.js no index.html (Única injeção necessária agora)
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

  // O main.js não recebe mais injeções regex via build-script!
  // A lógica de Bluetooth nativa agora vive nativamente no transport.js.
  
  console.log('🎉 Sincronização limpa concluída! Compilação pronta para Android.');
} catch (err) {
  console.error('❌ Erro na sincronização:', err);
  process.exit(1);
}
