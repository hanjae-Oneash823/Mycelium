// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}


use tauri::Manager;
use std::fs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            // 1. Get the path to the user's Documents directory
            let mut db_dir = app.path().document_dir()
                .expect("Failed to get user's Documents directory");
            db_dir.push("O-neash-data");
            // 2. Create the directory if it doesn't exist
            fs::create_dir_all(&db_dir)
                .expect("Failed to create O-neash-data directory in Documents");
            println!("Database directory ready at: {:?}", db_dir);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
