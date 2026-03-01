use std::process::{Child, Command};
use std::sync::Mutex;
use std::io::Write;
use tauri::Manager;

struct VpnState {
    process: Option<Child>,
    status: String,
}

static VPN_STATE: Mutex<Option<VpnState>> = Mutex::new(None);

fn build_xray_config(config: &serde_json::Value) -> String {
    let cfg = serde_json::json!({
        "log": { "loglevel": "warning" },
        "inbounds": [
            {
                "listen": "127.0.0.1",
                "port": 10808,
                "protocol": "socks",
                "settings": { "udp": true }
            },
            {
                "listen": "127.0.0.1",
                "port": 10809,
                "protocol": "http"
            }
        ],
        "outbounds": [
            {
                "protocol": "vless",
                "settings": {
                    "vnext": [
                        {
                            "address": config["server"],
                            "port": config["port"],
                            "users": [
                                {
                                    "id": config["uuid"],
                                    "flow": config["flow"],
                                    "encryption": "none"
                                }
                            ]
                        }
                    ]
                },
                "streamSettings": {
                    "network": "tcp",
                    "security": "reality",
                    "realitySettings": {
                        "serverName": config["sni"],
                        "fingerprint": config["fingerprint"],
                        "publicKey": config["publicKey"],
                        "shortId": config["shortId"]
                    }
                }
            },
            { "protocol": "freedom", "tag": "direct" }
        ]
    });
    cfg.to_string()
}

pub async fn start(config: serde_json::Value, app: tauri::AppHandle) -> Result<(), String> {
    let _ = stop(app.clone()).await;

    let xray_config = build_xray_config(&config);

    // Write config to a temp file in the system tmp dir
    let tmp_path = std::env::temp_dir().join("spicyvpn_config.json");
    {
        let mut f = std::fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
        f.write_all(xray_config.as_bytes()).map_err(|e| e.to_string())?;
    }

    // Find bundled xray sidecar
    let xray_path = app.path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("binaries")
        .join(if cfg!(windows) { "xray.exe" } else { "xray" });

    let child = Command::new(&xray_path)
        .arg("run")
        .arg("-config")
        .arg(&tmp_path)
        .spawn()
        .map_err(|e| format!("Failed to start xray: {}", e))?;

    let mut state = VPN_STATE.lock().unwrap();
    *state = Some(VpnState {
        process: Some(child),
        status: "connected".to_string(),
    });

    #[cfg(target_os = "windows")]
    set_system_proxy(true);
    #[cfg(target_os = "macos")]
    set_system_proxy_macos(true);

    Ok(())
}

pub async fn stop(_app: tauri::AppHandle) -> Result<(), String> {
    let mut state = VPN_STATE.lock().unwrap();
    if let Some(ref mut s) = *state {
        if let Some(ref mut child) = s.process {
            let _ = child.kill();
        }
        s.status = "disconnected".to_string();
        s.process = None;
    }

    #[cfg(target_os = "windows")]
    set_system_proxy(false);
    #[cfg(target_os = "macos")]
    set_system_proxy_macos(false);

    Ok(())
}

pub async fn status(_app: tauri::AppHandle) -> String {
    let state = VPN_STATE.lock().unwrap();
    if let Some(ref s) = *state {
        s.status.clone()
    } else {
        "disconnected".to_string()
    }
}

#[cfg(target_os = "windows")]
fn set_system_proxy(enable: bool) {
    if enable {
        let _ = Command::new("reg").args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "1", "/f"]).spawn();
        let _ = Command::new("reg").args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyServer", "/t", "REG_SZ", "/d", "127.0.0.1:10809", "/f"]).spawn();
    } else {
        let _ = Command::new("reg").args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "0", "/f"]).spawn();
    }
}

#[cfg(target_os = "macos")]
fn set_system_proxy_macos(enable: bool) {
    if enable {
        let _ = Command::new("networksetup").args(["-setsocksfirewallproxy", "Wi-Fi", "127.0.0.1", "10808"]).spawn();
        let _ = Command::new("networksetup").args(["-setsocksfirewallproxystate", "Wi-Fi", "on"]).spawn();
    } else {
        let _ = Command::new("networksetup").args(["-setsocksfirewallproxystate", "Wi-Fi", "off"]).spawn();
    }
}
