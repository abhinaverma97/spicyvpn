const MARZBAN_API_URL = process.env.MARZBAN_API_URL || "http://127.0.0.1:8001/api";
const MARZBAN_USERNAME = process.env.MARZBAN_USERNAME || "admin";
const MARZBAN_PASSWORD = process.env.MARZBAN_PASSWORD || "SpicyAdmin123!";

export function sanitizeUsername(email: string): string {
  const name = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  return name.substring(0, 32) || 'user_' + Math.random().toString(36).substring(7);
}

export async function getMarzbanToken(): Promise<string> {
  const params = new URLSearchParams();
  params.append('grant_type', 'password');
  params.append('username', MARZBAN_USERNAME);
  params.append('password', MARZBAN_PASSWORD);

  const res = await fetch(`${MARZBAN_API_URL}/admin/token`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) throw new Error('Failed to authenticate with Marzban');
  const data = await res.json();
  return data.access_token;
}

export async function getMarzbanUser(username: string) {
  const token = await getMarzbanToken();
  const res = await fetch(`${MARZBAN_API_URL}/user/${username}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'accept': 'application/json'
    }
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch user from Marzban');
  return res.json();
}

export async function getMarzbanUsers() {
  const token = await getMarzbanToken();
  const res = await fetch(`${MARZBAN_API_URL}/users`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'accept': 'application/json'
    }
  });

  if (!res.ok) throw new Error('Failed to fetch users from Marzban');
  const data = await res.json();
  const users = data.users || [];
  if (users.length > 0) {
    console.log("Marzban User Example:", JSON.stringify(users[0]));
  }
  return users;
}

export async function createMarzbanUser(username: string) {
  const token = await getMarzbanToken();
  const dataLimit = 35 * 1073741824; 
  const expire = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);

  const payload = {
    username: username,
    proxies: {"vless": {"flow": "xtls-rprx-vision"}},
    inbounds: {"vless": ["SpicyVPN"]},
    expire: expire,
    data_limit: dataLimit,
    data_limit_reset_strategy: "no_reset",
    status: "active",
    note: "Created via Next.js Dashboard"
  };

  const res = await fetch(`${MARZBAN_API_URL}/user`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Marzban Create User Error:", err);
    throw new Error('Failed to create user in Marzban');
  }
  return res.json();
}