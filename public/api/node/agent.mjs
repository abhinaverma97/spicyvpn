import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import http from 'https';

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

// Ensure state file exists
if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, '');

function getStats() {
    const load = os.loadavg()[0];
    const cores = os.cpus().length;
    const cpu = ((load / cores) * 100).toFixed(1);
    const ram = (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(1);
    return { cpu, ram };
}

async function fetchMaster(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, MASTER);
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${KEY}`,
                'Content-Type': 'application/json'
            }
        };
        const req = http.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
                else resolve(JSON.parse(data));
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
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
        // 1. Fetch desired state from Master
        const data = await fetchMaster('/api/node/sync');
        const masterUsers = data.users || [];
        const masterTokens = masterUsers.map(u => u.token);

        // 2. Read local state
        const localTokens = fs.readFileSync(STATE_FILE, 'utf8').split('\n').filter(Boolean);
        
        // 3. Add new users
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
                } catch (e) {
                    console.error(`Failed to add ${user.token}`);
                }
                if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
            }
        }

        // 4. Remove old users
        for (const token of localTokens) {
            if (!masterTokens.includes(token)) {
                console.log(`[SYNC] Removing user: ${token}`);
                try {
                    execSync(`xray api rmu --server=${XRAY_API} -tag=vless-grpc "${token}"`);
                    const newState = fs.readFileSync(STATE_FILE, 'utf8').split('\n').filter(t => t !== token).join('\n');
                    fs.writeFileSync(STATE_FILE, newState + (newState ? '\n' : ''));
                } catch (e) {
                    console.error(`Failed to remove ${token}`);
                }
            }
        }

        // 5. Report Stats
        const { cpu, ram } = getStats();
        const trafficStats = getXrayStats();
        await fetchMaster('/api/node/report', 'POST', {
            cpuUsage: parseFloat(cpu),
            ramUsage: parseFloat(ram),
            trafficStats
        });

    } catch (err) {
        console.error('Loop error:', err.message);
    }
}

console.log('SpicyAgent Node.js Daemon started.');
setInterval(sync, 10000);
sync();
