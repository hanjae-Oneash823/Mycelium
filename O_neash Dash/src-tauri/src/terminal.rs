use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

const SCROLLBACK_CAP_BYTES: usize = 256 * 1024;

struct TerminalHandle {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    scrollback: Arc<Mutex<VecDeque<u8>>>,
}

#[derive(Default)]
pub struct TerminalState(Mutex<HashMap<String, TerminalHandle>>);

fn append_scrollback(buf: &Arc<Mutex<VecDeque<u8>>>, data: &[u8]) {
    let mut sb = buf.lock().unwrap();
    sb.extend(data.iter().copied());
    let overflow = sb.len().saturating_sub(SCROLLBACK_CAP_BYTES);
    if overflow > 0 {
        sb.drain(0..overflow);
    }
}

#[tauri::command]
pub fn spawn_terminal(
    app: AppHandle,
    state: State<TerminalState>,
    cwd: Option<String>,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = CommandBuilder::new(shell);
    let working_dir = cwd
        .or_else(|| std::env::var("HOME").ok())
        .unwrap_or_else(|| "/".to_string());
    cmd.cwd(working_dir);

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();
    let scrollback = Arc::new(Mutex::new(VecDeque::<u8>::new()));

    let handle = TerminalHandle {
        master: pair.master,
        writer,
        child,
        scrollback: scrollback.clone(),
    };
    state.0.lock().unwrap().insert(id.clone(), handle);

    let event_id = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = &buf[..n];
                    append_scrollback(&scrollback, chunk);
                    let text = String::from_utf8_lossy(chunk).to_string();
                    let _ = app.emit(&format!("terminal:{event_id}:data"), text);
                }
                Err(_) => break,
            }
        }
    });

    Ok(id)
}

#[tauri::command]
pub fn terminal_snapshot(state: State<TerminalState>, id: String) -> Result<String, String> {
    let terminals = state.0.lock().unwrap();
    let handle = terminals.get(&id).ok_or("terminal not found")?;
    let sb = handle.scrollback.lock().unwrap();
    Ok(String::from_utf8_lossy(&sb.iter().copied().collect::<Vec<u8>>()).to_string())
}

#[tauri::command]
pub fn write_terminal(state: State<TerminalState>, id: String, data: String) -> Result<(), String> {
    let mut terminals = state.0.lock().unwrap();
    let handle = terminals.get_mut(&id).ok_or("terminal not found")?;
    handle.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resize_terminal(state: State<TerminalState>, id: String, rows: u16, cols: u16) -> Result<(), String> {
    let terminals = state.0.lock().unwrap();
    let handle = terminals.get(&id).ok_or("terminal not found")?;
    handle
        .master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kill_terminal(state: State<TerminalState>, id: String) -> Result<(), String> {
    let mut terminals = state.0.lock().unwrap();
    if let Some(mut handle) = terminals.remove(&id) {
        let _ = handle.child.kill();
    }
    Ok(())
}
