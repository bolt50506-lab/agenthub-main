import os
import runpy
import shutil
import signal
import threading
import time
from pathlib import Path

import server

_original_synthesize = server.synthesize_native_with_recovery
_original_encode_reference_rvq = server.encode_reference_rvq
_recovery_lock = threading.Lock()

def _cgroup_snapshot():
    result = {}
    for name in ('memory.current', 'memory.peak', 'memory.max', 'memory.events'):
        path = Path('/sys/fs/cgroup') / name
        try: result[name] = path.read_text(encoding='utf-8').strip()
        except Exception: pass
    return result

def _log_engine_exit(process, reason):
    if process is None: return
    rc = process.poll()
    if rc is None: return
    signal_name = None
    if rc < 0:
        try: signal_name = signal.Signals(-rc).name
        except ValueError: signal_name = f'SIG{-rc}'
    print('[Launcher] native engine exit diagnostics:', {'reason': reason, 'pid': process.pid, 'returncode': rc, 'signal': signal_name, 'cgroup': _cgroup_snapshot()})

def _engine_is_alive():
    process = server.engine_process
    return process is not None and process.poll() is None

def _prepare_profile_store():
    volume_dir = Path('/app/profiles'); runtime_dir = server.PROFILE_DIR
    volume_dir.mkdir(parents=True, exist_ok=True)
    if runtime_dir == volume_dir: return
    runtime_dir.parent.mkdir(parents=True, exist_ok=True)
    if runtime_dir.is_symlink(): runtime_dir.unlink()
    elif runtime_dir.exists():
        for item in runtime_dir.iterdir():
            target = volume_dir / item.name
            if item.is_file() and not target.exists(): shutil.copy2(item, target)
        shutil.rmtree(runtime_dir)
    runtime_dir.symlink_to(volume_dir, target_is_directory=True)
    print(f'[Launcher] profile store mapped to persistent volume: {runtime_dir} -> {volume_dir}')

def _safe_start_engine():
    _prepare_profile_store()
    try:
        runpy.run_path(str(server.BASE_DIR / 'bootstrap_voice.py'), run_name='__omnivoice_bootstrap__')
        server.cleanup_memory('post_bootstrap_asr_cleanup')
    except Exception as exc:
        print(f'[Launcher] voice bootstrap skipped: {exc}')
    try:
        server.start_engine()
    except RuntimeError as exc:
        if str(exc) != 'Existing Ali profile is missing': raise
        print('[Launcher] legacy Ali profile missing; continuing without default Ali voice')
        try: server.register_all_profiles()
        except Exception as register_exc: print(f'[Launcher] optional profile registration failed: {register_exc}')

def _safe_encode_reference_rvq(reference_wav, profile_id):
    with server.engine_lock:
        was_running = _engine_is_alive()
        if was_running:
            print(f'[Launcher] profile RVQ maintenance: stopping native engine before codec encode profile={profile_id} rss_mb={server.current_rss_mb():.1f}')
            server.stop_engine()
        try:
            result = _original_encode_reference_rvq(reference_wav, profile_id)
            print(f'[Launcher] profile RVQ encode completed profile={profile_id} rss_mb={server.current_rss_mb():.1f}')
            return result
        finally:
            if was_running:
                print(f'[Launcher] profile RVQ maintenance: restarting native engine profile={profile_id}')
                server.start_engine()
                print(f'[Launcher] profile RVQ maintenance: native engine restored profile={profile_id} rss_mb={server.current_rss_mb():.1f}')

server.encode_reference_rvq = _safe_encode_reference_rvq

def _recover_and_retry(payload, timeout):
    with _recovery_lock:
        print(f'[Launcher] engine recovery requested voice={payload.get("voice")}')
        server.restart_engine('synthesis_engine_unavailable')
        return _original_synthesize(payload, max_retries=0, timeout=timeout)

def synthesize_with_engine_recovery(payload, max_retries=1, timeout=server.ENGINE_HTTP_TIMEOUT):
    try: return _original_synthesize(payload, max_retries=max_retries, timeout=timeout)
    except server.EngineUnavailableError as exc:
        if max_retries < 1: raise
        print(f'[Launcher] synthesis unavailable; restarting native engine before retry: {exc}')
        return _recover_and_retry(payload, timeout)

server.synthesize_native_with_recovery = synthesize_with_engine_recovery

def watchdog():
    while True:
        time.sleep(5)
        try:
            process = server.engine_process
            if process is not None and process.poll() is not None:
                _log_engine_exit(process, 'watchdog_detected_dead_engine')
                with _recovery_lock:
                    if server.engine_process is process and process.poll() is not None: server.restart_engine('watchdog_engine_dead')
            elif process is None:
                with _recovery_lock:
                    if server.engine_process is None: server.restart_engine('watchdog_missing_process_handle')
        except Exception as exc: print(f'[Launcher] watchdog recovery failed: {exc}')

signal.signal(signal.SIGTERM, server.shutdown)
signal.signal(signal.SIGINT, server.shutdown)
_safe_start_engine()
threading.Thread(target=watchdog, daemon=True, name='omnivoice-engine-watchdog').start()
print(f'[OmniVoice] Native service listening on {server.HOST}:{server.PORT}')
server.ThreadingHTTPServer((server.HOST, server.PORT), server.Handler).serve_forever()
