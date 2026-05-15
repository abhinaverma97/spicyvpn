import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';

const KEY_FILE = '/etc/spicyvpn/key';
const MASTER_FILE = '/etc/spicyvpn/master';
const XRAY_API = '127.0.0.1:10085';

console.log('🌶️ SpicyAgent Daemon starting (High-Performance Batch Mode)...');

if (!fs.existsSync(KEY_FILE) || !fs.existsSync(MASTER_FILE)) {
    console.error('Fatal: Missing configuration files in /etc/spicyvpn/');
    process.exit(1);
}

const KEY = fs.readFileSync(KEY_FILE, 'utf8').trim();
const MASTER = fs.readFileSync(MASTER_FILE, 'utf8').trim();

let lastCpuStats = null;

function getStats() {
    try {
        const content = fs.readFileSync('/proc/stat', 'utf8');
        const line = content.split('\n').find(l => l.startsWith('cpu'));
        if (!line) return { cpu: "0.0", ram: "0.0" };

        const stats = line.trim().split(/\s+/)
            .filter(x => x.length > 0 && !isNaN(x))
            .map(Number);

        const idle = stats[3] + stats[4]; 
        const total = stats.reduce((a, b) => a + b, 0);

        let cpu = "0.0";
        if (lastCpuStats) {
            const idleDiff = idle - lastCpuStats.idle;
            const totalDiff = total - lastCpuStats.total;
            if (totalDiff > 0) {
                const usage = (1 - (idleDiff / totalDiff)) * 100;
                cpu = Math.min(100, Math.max(0, usage)).toFixed(1);
            }
        }
        lastCpuStats = { idle, total };

        const ram = (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(1);
        return { cpu, ram };
    } catch (e) {
        console.error('Stats Collection Error:', e.message);
        return { cpu: "0.0", ram: "0.0" };
    }
}

async function fetchMaster(path, method = 'GET', body = null) {
    const url = MASTER.endsWith('/') ? MASTER.slice(0, -1) + path : MASTER + path;
    const res = await fetch(url, {
        method,
        headers: {
            'Authorization': `Bearer ${KEY}`,
            'Content-Type': 'application/json',
            'User-Agent': 'SpicyAgent/1.0'
        },
        body: body ? JSON.stringify(body) : null
    });
    
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Master responded with ${res.status}: ${text.slice(0, 50)}`);
    }
    return res.json();
}

function getXrayStats() {
    try {
        const output = execSync(`xray api statsquery --server=${XRAY_API}`, { timeout: 2000 }).toString();
        const data = JSON.parse(output);
        if (!data.stat) return {};
        const stats = {};
        for (const item of data.stat) {
            if (item.name.startsWith('user>>>')) {
                const parts = item.name.split('>>>');
                const token = parts[1];
                const type = parts[3];
                if (!stats[token]) stats[token] = { uplink: 0, downlink: 0 };
                stats[token][type] = parseInt(item.value) || 0;
            }
        }
        return stats;
    } catch (e) {
        return {};
    }
}

async function sync() {
    try {
        // 1. Fetch entire desired fleet state from Master
        const data = await fetchMaster('/api/node/sync');
        const masterUsers = data.users || [];
        
        // 2. Perform Single Batch Update to Xray
        // This replaces the entire user list and re-applies full TLS/gRPC settings
        // to prevent "Security Stripping" and massive CPU spikes from process spawning.
        const syncPayload = {
            inbounds: [{
                port: 8444,
                protocol: "vless",
                tag: "vless-grpc",
                settings: { 
                    decryption: "none",
                    clients: masterUsers.map(u => ({ id: u.uuid, email: u.token }))
                },
                streamSettings: {
                    network: "grpc",
                    security: "tls",
                    tlsSettings: {
                        alpn: ["h2"],
                        certificates: [{
                            certificateFile: "/usr/local/etc/xray/certs/cert.pem",
                            keyFile: "/usr/local/etc/xray/certs/key.pem"
                        }]
                    },
                    grpcSettings: {
                        serviceName: "spicypepper-grpc"
                    }
                }
            }]
        };

        const tmpFile = '/tmp/xray_sync.json';
        fs.writeFileSync(tmpFile, JSON.stringify(syncPayload));
        try {
            // Using 'adu' with a full inbound JSON overwrites the tag correctly in one go
            execSync(`xray api adu --server=${XRAY_API} ${tmpFile}`);
        } catch (e) {
            console.error('[!] Xray Batch Sync Failed:', e.message);
        }
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);

        // 3. Report Telemetry
        const { cpu, ram } = getStats();
        const trafficStats = getXrayStats();
        
        console.log(`[REPORT] CPU: ${cpu}% | RAM: ${ram}% | Users: ${masterUsers.length}`);
        
        await fetchMaster('/api/node/report', 'POST', {
            cpuUsage: parseFloat(cpu),
            ramUsage: parseFloat(ram),
            trafficStats
        });

    } catch (err) {
        console.error(`[!] Sync Cycle Failed: ${err.message}`);
    }
}

// Warm up CPU stats
getStats();

// High-performance loop
setTimeout(() => {
    sync();
    setInterval(sync, 10000);
}, 1500);
