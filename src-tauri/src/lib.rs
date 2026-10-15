mod ai;
mod info;
mod pty;
mod settings_file;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(pty::PtyState::default())
        .setup(|app| {
            settings_file::start_watcher(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty::spawn_shell,
            pty::write_to_pty,
            pty::resize_pty,
            pty::kill_pty,
            ai::suggest_command,
            ai::has_api_key,
            ai::set_api_key,
            ai::clear_api_key,
            info::git_info,
            info::env_info,
            pty::set_prompt_mode,
            info::available_shells,
            settings_file::read_settings,
            settings_file::write_settings,
            settings_file::settings_path,
            settings_file::reveal_settings,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o cairn");
}
