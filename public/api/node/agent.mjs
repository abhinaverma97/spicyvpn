import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';

const KEY_FILE = '/etc/spicyvpn/key';
const MASTER_FILE = '/etc/spicyvpn/master';
const STATE_FILE = '/etc/spicyvpn/state';
const XRAY_API = '127.0.0.1:10085';

console.log('🌶️ SpicyAgent Daemon starting (Master-Clone Robust Mode)...');

if (!fs.existsSync(KEY_FILE) || !fs.existsSync(MASTER_FILE)) {
    console.error('Fatal: Missing configuration files in /etc/spicyvpn/');
    process.exit(1);
}

const KEY = fs.readFileSync(KEY_FILE, 'utf8').trim();
const MASTER = fs.readFileSync(MASTER_FILE, 'utf8').trim();

if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, '');

let lastCpuStats = null;

function getStats() {
    try {
        const content = fs.readFileSync('/proc/stat', 'utf8');
        const line = content.split('\n').find(l => l.startsWith('cpu'));
        if (!line) return { cpu: "0.0", ram: "0.0" };
        const stats = line.trim().split(/\s+/).filter(x => x.length > 0 && !isNaN(x)).map(Number);
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
    } catch (e) { return { cpu: "0.0", ram: "0.0" }; }
}

async function fetchMaster(path, method = 'GET', body = null) {
    const url = MASTER.endsWith('/') ? MASTER.slice(0, -1) + path : MASTER + path;
    const res = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'SpicyAgent/1.0' },
        body: body ? JSON.stringify(body) : null
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    } catch (e) { return {}; }
}

async function sync() {
    try {
        // 1. Fetch State
        const data = await fetchMaster('/api/node/sync');
        const masterUsers = data.users || [];
        const masterTokens = masterUsers.map(u => u.token);
        const localTokens = fs.readFileSync(STATE_FILE, 'utf8').split('\n').filter(Boolean);
        const isDomainMode = !!data.nodeDomain;

        // 2. Incremental Sync
        // We use incremental adds but ALWAYS re-apply the full inbound wrapper
        // to ensure streamSettings (TLS/gRPC) are never stripped from Xray.
        
        const buildWrapper = (clients) => ({
            inbounds: [{
                port: 8444, 
                protocol: "vless", 
                tag: "vless-grpc",
                listen: isDomainMode ? "127.0.0.1" : "0.0.0.0",
                settings: { 
                    decryption: "none",
                    clients: clients
                },
                streamSettings: isDomainMode ? {
                    network: "grpc",
                    security: "none",
                    grpcSettings: { serviceName: "spicypepper-grpc" }
                } : {
                    network: "grpc",
                    security: "tls",
                    tlsSettings: {
                        alpn: ["h2"],
                        certificates: [{
                            certificateFile: "/usr/local/etc/xray/certs/cert.pem",
                            keyFile: "/usr/local/etc/xray/certs/key.pem"
                        }]
                    },
                    grpcSettings: { serviceName: "spicypepper-grpc" }
                }
            }]
        });

        // Add new users
        for (const user of masterUsers) {
            if (!localTokens.includes(user.token)) {
                console.log(`[SYNC] Adding user: ${user.token}`);
                const addJson = buildWrapper([{ id: user.uuid, email: user.token }]);
                const tmpFile = `/tmp/add_${user.token}.json`;
                fs.writeFileSync(tmpFile, JSON.stringify(addJson));
                try {
                    execSync(`xray api adu --server=${XRAY_API} ${tmpFile}`);
                    fs.appendFileSync(STATE_FILE, user.token + '\n');
                } catch (e) { console.error(`Add fail: ${user.token}`); }
                if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
            }
        }

        // Remove old users
        for (const token of localTokens) {
            if (!masterTokens.includes(token)) {
                console.log(`[SYNC] Removing user: ${token}`);
                try {
                    execSync(`xray api rmu --server=${XRAY_API} -tag=vless-grpc "${token}"`);
                    const newState = fs.readFileSync(STATE_FILE, 'utf8').split('\n').filter(t => t !== token).join('\n');
                    fs.writeFileSync(STATE_FILE, newState + (newState ? '\n' : ''));
                } catch (e) { console.error(`Rem fail: ${token}`); }
            }
        }

        // 4. Report Telemetry
        const { cpu, ram } = getStats();
        const trafficStats = getXrayStats();
        console.log(`[REPORT] CPU: ${cpu}% | RAM: ${ram}% | Users: ${masterUsers.length}`);
        await fetchMaster('/api/node/report', 'POST', { cpuUsage: parseFloat(cpu), ramUsage: parseFloat(ram), trafficStats });

    } catch (err) { console.error(`[!] Loop Error: ${err.message}`); }
}

getStats();
setTimeout(() => { sync(); setInterval(sync, 10000); }, 1500);
