mod ai;
mod info;
mod pty;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(pty::PtyState::default())
        .invoke_handler(tauri::generate_handler![
            pty::spawn_shell,
            pty::write_to_pty,
            pty::resize_pty,
            pty::kill_pty,
            ai::suggest_command,
            ai::has_api_key,
            ai::set_api_key,
            ai::clear_api_key,
            info::git_branch,
            info::available_shells,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o cairn");
}
