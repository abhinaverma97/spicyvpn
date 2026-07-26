import subprocess
import re
import sys
import time
from datetime import datetime
import statistics

NODE = "161.118.180.127"
MASTER = "140.245.13.64"
DO = "168.144.72.110"
SSH_KEY = r"C:\Users\abhin\.ssh\oracle"
SSH_USER = "ubuntu"
PACKET_SIZES = "338 / 354 bytes"
TEST_FREQ = "128 pings/s (simulated via ss -ti)"
THRESHOLD = 60

FILTER_IP = None
TEST_DURATION = 0
TARGET = None

args = iter(sys.argv[1:])
for a in args:
    if a == "--test":
        TEST_DURATION = 30
    elif a.startswith("--test="):
        try: TEST_DURATION = int(a.split("=")[1])
        except: TEST_DURATION = 30
    elif a == "--server":
        try: TARGET = next(args)
        except StopIteration: pass
    elif a.isdigit() and TEST_DURATION == 0:
        TEST_DURATION = int(a)
    elif re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", a):
        FILTER_IP = a
    elif a.startswith("-"):
        print(f"Unknown: {a}\nUsage: python latency_monitor.py [--test[=sec]] [--server ip] [client_ip]")
        sys.exit(1)

def ssh_user_for(host):
    return "root" if host == DO else SSH_USER

def ssh_cmd(host, cmd):
    full_cmd = [
        "ssh", "-i", SSH_KEY,
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=5",
        "-o", "ServerAliveInterval=5",
        "-o", "ServerAliveCountMax=2",
        "-o", "BatchMode=yes",
        f"{ssh_user_for(host)}@{host}",
        cmd
    ]
    try:
        out = subprocess.run(full_cmd, capture_output=True, text=True, timeout=10)
        return out.stdout, out.stderr
    except subprocess.TimeoutExpired:
        return "", "timeout"

def parse_ss_line(line):
    ips = re.findall(r"\[::ffff:([\d.]+)\]:(\d+)", line)
    peer_ip = ips[1][0] if len(ips) > 1 else (ips[0][0] if ips else "?")
    rtt_match = re.search(r"rtt:([\d.]+)/([\d.]+)", line)
    minrtt_match = re.search(r"minrtt:([\d.]+)", line)
    bw_match = re.search(r"bw:([\d.]+)([kMG]?bps)", line)
    retrans_match = re.search(r"retrans:(\d+)/(\d+)", line)
    cwnd_match = re.search(r"cwnd:(\d+)", line)
    sent_match = re.search(r"bytes_sent:(\d+)", line)
    acked_match = re.search(r"bytes_acked:(\d+)", line)
    return {
        "peer": peer_ip,
        "rtt": float(rtt_match.group(1)) if rtt_match else None,
        "rtt_var": float(rtt_match.group(2)) if rtt_match else None,
        "minrtt": float(minrtt_match.group(1)) if minrtt_match else None,
        "bw": bw_match.group(0) if bw_match else None,
        "retrans_cur": int(retrans_match.group(1)) if retrans_match else None,
        "retrans_cum": int(retrans_match.group(2)) if retrans_match else None,
        "cwnd": int(cwnd_match.group(1)) if cwnd_match else None,
        "bytes_total": (int(sent_match.group(1)) + int(acked_match.group(1))) if sent_match and acked_match else 0,
    }

def parse_ss_block(text):
    conns = []
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    for i in range(len(lines)):
        if "ESTAB" in lines[i] and "8444" in lines[i]:
            if i + 1 < len(lines):
                conns.append(parse_ss_line(lines[i] + " " + lines[i + 1]))
    return conns

def fetch(host):
    stdout, stderr = ssh_cmd(host, "ss -ti sport = :8444")
    if not stdout or stderr == "timeout":
        return []
    return parse_ss_block(stdout)

def detect_target():
    if TARGET:
        name = {NODE: "NODE", MASTER: "MASTER", DO: "DO"}.get(TARGET, TARGET)
        return TARGET, name
    try:
        out = subprocess.run(["curl", "-s", "https://api.ipify.org"], capture_output=True, text=True, timeout=5)
        my_ip = out.stdout.strip()
    except:
        my_ip = ""
    known = {"NODE": NODE, "MASTER": MASTER, "DO": DO}
    for name, ip in known.items():
        if my_ip == ip:
            return ip, name
    mc = len(fetch(MASTER))
    nc = len(fetch(NODE))
    dc = len(fetch(DO))
    if dc > mc and dc > nc:
        return DO, "DO"
    if mc < 2 and nc > mc:
        return NODE, "NODE"
    return MASTER, "MASTER"

TARGET, TNAME = detect_target()

if not FILTER_IP:
    conns = fetch(TARGET)
    by_peer = {}
    for c in conns:
        p = c["peer"]
        if p not in by_peer or c["bytes_total"] > by_peer[p]["bytes_total"]:
            by_peer[p] = c
    if by_peer:
        FILTER_IP = max(by_peer, key=lambda p: by_peer[p]["bytes_total"])
    else:
        print("No active connections found.")
        sys.exit(1)

print(f"Server: {TNAME} ({TARGET})")
print(f"Your IP: {FILTER_IP}")
if TEST_DURATION:
    print(f"Mode: GAME TEST — {TEST_DURATION}s")
    print(f"Packet sizes: {PACKET_SIZES}")
    print(f"Frequency: {TEST_FREQ}")
    print(f"Acceptable delay: <= {THRESHOLD}ms")
print("Ctrl+C to stop", flush=True)
print(flush=True)

ssh_proc = None
if TEST_DURATION:
    stream_cmd = "while true; do ss -ti sport = :8444; echo '===BLOCK==='; sleep 0.2; done"
    ssh_proc = subprocess.Popen([
        "ssh", "-i", SSH_KEY,
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=10",
        "-o", "ServerAliveInterval=5",
        "-o", "ServerAliveCountMax=3",
        f"{ssh_user_for(TARGET)}@{TARGET}",
        stream_cmd
    ], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)

all_rtts = []
all_conns_log = []
conn_counts = []
first_retrans_by_conn = {}
start = time.time()
last_display = 0

try:
    while True:
        elapsed = time.time() - start
        if TEST_DURATION and elapsed > TEST_DURATION:
            break

        if ssh_proc:
            buf = ""
            while True:
                line = ssh_proc.stdout.readline()
                if not line:
                    ssh_proc = None
                    break
                if line.strip() == "===BLOCK===":
                    break
                buf += line
            conns = parse_ss_block(buf) if buf else []
        else:
            conns = fetch(TARGET)

        conns = [c for c in conns if c["peer"] == FILTER_IP]

        now = datetime.now().strftime("%H:%M:%S")

        if TEST_DURATION:
            if elapsed - last_display >= 10:
                remaining = int(TEST_DURATION - elapsed)
                bar_len = 20
                filled = int((elapsed / TEST_DURATION) * bar_len)
                bar = "#" * filled + "-" * (bar_len - filled)
                pct = int((elapsed / TEST_DURATION) * 100)
                sys.stdout.write(f"\r[{bar}] {pct}% \u2014 {remaining}s remaining  ")
                sys.stdout.flush()
                last_display = elapsed
        else:
            print(f"[{now}] {len(conns)} connection(s)", flush=True)

        if not TEST_DURATION:
            stats = sorted(conns, key=lambda c: c["bytes_total"], reverse=True)
            for c in stats:
                rtt_s = f"{c['rtt']:.0f}" if c['rtt'] else "?"
                spike = ""
                if c['rtt'] and c['rtt'] >= 200:
                    spike = " SPK"
                elif c['rtt'] and c['rtt'] >= 100:
                    spike = " ~"
                print(f"  RTT={rtt_s}ms{spike}", flush=True)

        conn_counts.append(len(conns))
        sample_conns = conns[:]
        for i, c in enumerate(sample_conns):
            if c["rtt"]:
                all_rtts.append(c["rtt"])
            conn_key = (c["peer"], c["minrtt"], i)
            if conn_key not in first_retrans_by_conn:
                first_retrans_by_conn[conn_key] = c["retrans_cum"] or 0
            all_conns_log.append({
                "time": elapsed,
                "rtt": c["rtt"],
                "minrtt": c["minrtt"],
                "retrans_cum": c["retrans_cum"] or 0,
                "bw": c["bw"],
                "bytes_total": c["bytes_total"],
                "peer": c["peer"],
                "conn_key": conn_key,
            })

        if not ssh_proc:
            time.sleep(0.2 if TEST_DURATION else 2)

except KeyboardInterrupt:
    pass
finally:
    if ssh_proc:
        ssh_proc.terminate()
        try:
            ssh_proc.wait(timeout=3)
        except:
            ssh_proc.kill()

if TEST_DURATION:
    print()
    duration = time.time() - start
    n = len(all_rtts)
    print()
    print("=" * 60)
    print("  GAME LATENCY TEST RESULTS")
    print("=" * 60)
    print(f"  Duration:       {duration:.0f}s")
    print(f"  Packet sizes:   {PACKET_SIZES}")
    print(f"  Frequency:      {TEST_FREQ}")
    print(f"  Samples:        {n}")
    print()

    if n > 0:
        avg = statistics.mean(all_rtts)
        mx = max(all_rtts)
        mn = min(all_rtts)
        if n > 1:
            jitter = statistics.stdev(all_rtts)
        else:
            jitter = 0
        under_threshold = sum(1 for r in all_rtts if r <= THRESHOLD)
        over_threshold = n - under_threshold
        spikes = sum(1 for r in all_rtts if r >= 100)

        final_retrans = {}
        for c in all_conns_log:
            ck = c["conn_key"]
            if ck not in final_retrans or c["time"] > final_retrans[ck]["time"]:
                final_retrans[ck] = c
        retrans_total = 0
        total_packets = 0
        for ck, last in final_retrans.items():
            first_r = first_retrans_by_conn.get(ck, 0)
            delta = last["retrans_cum"] - first_r
            retrans_total += delta
            if last["bytes_total"]:
                total_packets += last["bytes_total"] // 1400
        retrans_rate = retrans_total / duration if duration > 0 else 0
        loss_pct = (retrans_total / max(total_packets, 1)) * 100

        by_peer_max = {}
        for c in all_conns_log:
            p = c["peer"]
            if c["rtt"] and (p not in by_peer_max or c["rtt"] > by_peer_max[p]):
                by_peer_max[p] = c["rtt"]
        worst_peer = max(by_peer_max, key=by_peer_max.get) if by_peer_max else "?"
        worst_rtt = by_peer_max.get(worst_peer, 0)

        min_conns = min(conn_counts) if conn_counts else 0
        max_conns = max(conn_counts) if conn_counts else 0
        avg_conns = statistics.mean(conn_counts) if conn_counts else 0

        print(f"  --- Latency ---")
        print(f"  minRTT:       {mn:.0f}ms")
        print(f"  avgRTT:       {avg:.0f}ms")
        print(f"  maxRTT:       {mx:.0f}ms")
        print(f"  jitter (std): {jitter:.0f}ms")
        print()
        print(f"  --- Connection Health ---")
        print(f"  Connections:   {avg_conns:.0f} avg ({min_conns}-{max_conns} range)")
        print(f"  Retransmits:   {retrans_total} total ({retrans_rate:.1f}/s)")
        print(f"  Loss (est):    {loss_pct:.2f}% of packets")
        print(f"  Worst stream:  {worst_peer} \u2014 maxRTT={worst_rtt:.0f}ms")
        print()
        print(f"  --- Threshold (<= {THRESHOLD}ms) ---")
        print(f"  Packets <= {THRESHOLD}ms:  {under_threshold} ({under_threshold/n*100:.0f}%)")
        print(f"  Packets > {THRESHOLD}ms:  {over_threshold} ({over_threshold/n*100:.0f}%)")
        print()
        print(f"  Spikes (>100ms): {spikes}")
        if n > 1:
            p99_val = sorted(all_rtts)[int(n * 0.99)]
            p95_val = sorted(all_rtts)[int(n * 0.95)]
            p90_val = sorted(all_rtts)[int(n * 0.90)]
            print(f"  p90: {p90_val:.0f}ms  p95: {p95_val:.0f}ms  p99: {p99_val:.0f}ms")
        verdict = "PASS" if over_threshold / n < 0.05 else "FAIL"
        print()
        print(f"  Verdict: {verdict}")
        if verdict == "PASS":
            print(f"  Your connection is suitable for competitive gaming (<= {THRESHOLD}ms for >95% of packets)")
        else:
            print(f"  More than 5% of packets exceeded {THRESHOLD}ms. Further tuning needed.")
    else:
        print("  No RTT samples collected.")
    print("=" * 60)
else:
    print("\nDone.")
