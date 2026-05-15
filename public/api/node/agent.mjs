import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';

const KEY_FILE = '/etc/spicyvpn/key';
const MASTER_FILE = '/etc/spicyvpn/master';
const STATE_FILE = '/etc/spicyvpn/state';
const XRAY_API = '127.0.0.1:10085';

if (!fs.existsSync(KEY_FILE) || !fs.existsSync(MASTER_FILE)) {
    console.error('Missing configuration files.');
    process.exit(1);
}

const KEY = fs.readFileSync(KEY_FILE, 'utf8').trim();
const MASTER = fs.readFileSync(MASTER_FILE, 'utf8').trim();

if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, '');

let lastCpuStats = null;

function getStats() {
    try {
        const stats = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].split(/\s+/).slice(1).map(Number);
        const idle = stats[3] + stats[4]; // idle + iowait
        const total = stats.reduce((a, b) => a + b, 0);

        let cpu = "0.0";
        if (lastCpuStats) {
            const idleDiff = idle - lastCpuStats.idle;
            const totalDiff = total - lastCpuStats.total;
            if (totalDiff > 0) {
                cpu = Math.min(100, Math.max(0, (1 - (idleDiff / totalDiff)) * 100)).toFixed(1);
            }
        }
        lastCpuStats = { idle, total };

        const ram = (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(1);
        return { cpu, ram };
    } catch (e) {
        return { cpu: "0.0", ram: "0.0" };
    }
}

async function fetchMaster(path, method = 'GET', body = null) {
    const url = MASTER.endsWith('/') ? MASTER.slice(0, -1) + path : MASTER + path;
    const res = await fetch(url, {
        method,
        headers: {
            'Authorization': `Bearer ${KEY}`,
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : null
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function getXrayStats() {
    try {
        const output = execSync(`xray api statsquery --server=${XRAY_API}`).toString();
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
        console.log(`[${new Date().toISOString()}] Pulse...`);
        
        // 1. Sync
        const data = await fetchMaster('/api/node/sync');
        const masterUsers = data.users || [];
        const masterTokens = masterUsers.map(u => u.token);
        const localTokens = fs.readFileSync(STATE_FILE, 'utf8').split('\n').filter(Boolean);
        
        for (const user of masterUsers) {
            if (!localTokens.includes(user.token)) {
                console.log(`[SYNC] Adding user: ${user.token}`);
                const addJson = {
                    inbounds: [{
                        port: 8444, protocol: "vless", tag: "vless-grpc",
                        settings: { clients: [{ id: user.uuid, email: user.token }] }
                    }]
                };
                const tmpFile = `/tmp/add_${user.token}.json`;
                fs.writeFileSync(tmpFile, JSON.stringify(addJson));
                try {
                    execSync(`xray api adu --server=${XRAY_API} ${tmpFile}`);
                    fs.appendFileSync(STATE_FILE, user.token + '\n');
                } catch (e) { console.error(`Add fail: ${user.token}`); }
                if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
            }
        }

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

        // 2. Report
        const { cpu, ram } = getStats();
        const trafficStats = getXrayStats();
        await fetchMaster('/api/node/report', 'POST', {
            cpuUsage: parseFloat(cpu),
            ramUsage: parseFloat(ram),
            trafficStats
        });

    } catch (err) {
        console.error('Pulse Error:', err.message);
    }
}

console.log('SpicyAgent Node.js Daemon started.');
setInterval(sync, 10000);
sync();
