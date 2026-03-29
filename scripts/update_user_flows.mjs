const MARZBAN_API_URL = "http://127.0.0.1:8001/api";
const MARZBAN_USERNAME = "admin";
const MARZBAN_PASSWORD = "SpicyAdmin123!";

async function getToken() {
  const params = new URLSearchParams();
  params.append('grant_type', 'password');
  params.append('username', MARZBAN_USERNAME);
  params.append('password', MARZBAN_PASSWORD);

  const res = await fetch(`${MARZBAN_API_URL}/admin/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  return data.access_token;
}

async function updateAllUsers() {
  const token = await getToken();
  
  const usersRes = await fetch(`${MARZBAN_API_URL}/users`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await usersRes.json();
  const users = data.users || [];

  console.log(`Found ${users.length} users. Updating flows...`);

  for (const user of users) {
    if (user.proxies && user.proxies.vless) {
      console.log(`Updating user: ${user.username}`);
      
      const payload = {
        proxies: {
          vless: {
            flow: "xtls-rprx-vision"
          }
        }
      };

      const updateRes = await fetch(`${MARZBAN_API_URL}/user/${user.username}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (updateRes.ok) {
        console.log(`✅ Success for ${user.username}`);
      } else {
        console.log(`❌ Failed for ${user.username}: ${await updateRes.text()}`);
      }
    }
  }
}

updateAllUsers().catch(console.error);