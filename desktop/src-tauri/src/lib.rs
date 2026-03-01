use tauri::Manager;

mod vpn;

#[tauri::command]
async fn fetch_config(token: String) -> Result<serde_json::Value, String> {
    let url = format!("https://spicypepper.app/api/connect?token={}", token);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        Ok(json)
    } else {
        let json: serde_json::Value = resp.json().await.unwrap_or_default();
        Err(json["error"].as_str().unwrap_or("Unknown error").to_string())
    }
}

#[tauri::command]
async fn connect(config: serde_json::Value, app: tauri::AppHandle) -> Result<(), String> {
    vpn::start(config, app).await
}

#[tauri::command]
async fn disconnect(app: tauri::AppHandle) -> Result<(), String> {
    vpn::stop(app).await
}

#[tauri::command]
async fn get_status(app: tauri::AppHandle) -> String {
    vpn::status(app).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            fetch_config,
            connect,
            disconnect,
            get_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
