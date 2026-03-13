use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;
use std::sync::Mutex;
use tauri::State;

struct VpnProcess(Mutex<Option<CommandChild>>);

#[tauri::command]
async fn start_vpn(app: tauri::AppHandle, config_path: String, state: State<'_, VpnProcess>) -> Result<(), String> {
    let mut vpn_proc = state.0.lock().unwrap();
    
    // Kill existing process if running
    if let Some(child) = vpn_proc.take() {
        let _ = child.kill();
    }

    let sidecar_command = app.shell().sidecar("hysteria").map_err(|e| e.to_string())?;
    let (mut rx, child) = sidecar_command
        .args(["-c", &config_path])
        .spawn()
        .map_err(|e| e.to_string())?;

    // Store the child to manage it later
    *vpn_proc = Some(child);

    // Monitoring thread for logs
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    println!("VPN STDOUT: {}", String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    eprintln!("VPN STDERR: {}", String::from_utf8_lossy(&line));
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn stop_vpn(state: State<'_, VpnProcess>) -> Result<(), String> {
    let mut vpn_proc = state.0.lock().unwrap();
    if let Some(child) = vpn_proc.take() {
        child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(VpnProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![start_vpn, stop_vpn])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
