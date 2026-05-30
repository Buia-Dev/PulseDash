const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, 'carro velho', 'log.txt');
const content = fs.readFileSync(logPath, 'utf8');

const matches = content.match(/>([0-9A-Fa-f]+)/g) || [];

const commands = new Set();
for (let m of matches) {
    m = m.substring(1); // remove '>'
    if (m.length >= 4) {
        const cmd = m.substring(0, 4);
        if (cmd.startsWith("01")) {
            commands.add(cmd);
        } else if (m.startsWith("22") && m.length >= 6) {
            commands.add(m.substring(0, 6));
        } else {
            commands.add(m);
        }
    }
}

console.log("Unique commands detected in ELM log:");
const sortedCmds = Array.from(commands).sort();
for (const c of sortedCmds) {
    let success = false;
    if (c.startsWith("01")) {
        const pid = c.substring(2, 4);
        const respPattern = "41" + pid;
        if (content.includes(respPattern)) {
            success = true;
        }
    } else if (c.startsWith("22")) {
        const udsPid = c.substring(2, 6);
        const respPattern = "62" + udsPid;
        if (content.includes(respPattern)) {
            success = true;
        }
    } else {
        success = "Unknown";
    }
    console.log(`Command: ${c} | Success: ${success}`);
}
