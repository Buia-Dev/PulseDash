import re

log_path = r"C:\Users\Buia\.gemini\antigravity\scratch\gol_g1_dashboard\carro velho\log.txt"

with open(log_path, 'r') as f:
    content = f.read()

# Commands usually start with '>' followed by '01' (OBD Mode 1) or UDS commands
# Let's find all instances of '>' followed by alphanumeric characters
matches = re.findall(r'>([0-9A-Fa-f]+)', content)

commands = set()
for m in matches:
    # ELM commands are typically 4 hex chars for Mode 01 (e.g. 010C, 010D)
    # or they could be longer for UDS (e.g. 221154)
    # Let's see what lengths we have
    if len(m) >= 4:
        cmd = m[:4]
        if cmd.startswith("01"):
            commands.add(cmd)
        elif m.startswith("22") and len(m) >= 6:
            commands.add(m[:6])
        else:
            commands.add(m)

print("Unique commands detected in ELM log:")
for c in sorted(commands):
    # Check if there is a response in the log following this command
    # A typical response for Mode 01 PID XX looks like: 41 XX ...
    # We can check if "41" + PID exists in the log to confirm it succeeded
    pid = c[2:4] if c.startswith("01") else ""
    success = False
    if pid:
        resp_pattern = "41" + pid
        if resp_pattern in content:
            success = True
    elif c.startswith("22"):
        # UDS response usually starts with 62 + UDS PID
        uds_pid = c[2:6]
        resp_pattern = "62" + uds_pid
        if resp_pattern in content:
            success = True
    else:
        success = "Unknown"
        
    print(f"Command: {c} | Success: {success}")
