import os
import runpy
import shutil
import signal
import threading
import time
from pathlib import Path

import server


_original_synthesize = server.synthesize_native_with_recovery
_recovery_lock = threading.Lock()


def _engine_is_alive():
    process = server.engine_process
    return process is not None and process.poll() is None


def _prepare_profile_store():
    # Railway's persistent volume is mounted at /app/profiles. The server's
    # historical /data/omnivoice/profiles path must point at that volume so
    # cloned profiles survive container restarts and redeploys.
    volume_dir = Path('/app/profiles')
    runtime_dir = server.PROFILE_DIR
    volume_dir.mkdir(parents=True, exist_ok=True)
    if runtime_dir == volume_dir:
        return
    runtime_dir.parent.mkdir(parents=True, exist_ok=True)
    if runtime_dir.is_symlink():
        runtime_dir.unlink()
    elif runtime_dir.exists():
        for item in runtime_dir.iterdir():
            target = volume_dir / item.name
            if item.is_file() and not target.exists():
                shutil.copy2(item, target)
        shutil.rmtree(runtime_dir)
    runtime_dir.symlink_to(volume_dir, target_is_directory=True)
    print(f'[Launcher] profile store mapped to persistent volume: {runtime_dir} -> {volume_dir}')


def _safe_start_engine():
    _prepare_profile_store()

    # Restore the persisted legacy Ali profile when bootstrap material is
    # available, but never let a missing voice take the whole HTTP service down.
    try:
        runpy.run_path(str(server.BASE_DIR / 'bootstrap_voice.py'), run_name='__omnivoice_bootstrap__')
    except Exception as exc:
        print(f'[Launcher] voice bootstrap skipped: {exc}')

    try:
        server.start_engine()
    except RuntimeError as exc:
        if str(exc) != 'Existing Ali profile is missing':
            raise
        print('[Launcher] legacy Ali profile missing; continuing without default Ali voice')
        try:
            server.register_all_profiles()
        except Exception as register_exc:
            print(f'[Launcher] optional profile registration failed: {register_exc}')


def _recover_and_retry(payload, timeout):
    with _recovery_lock:
        print(f'[Launcher] engine recovery requested voice={payload.get("voice")}')
        server.restart_engine('synthesis_engine_unavailable')
        return _original_synthesize(payload, max_retries=0, timeout=timeout)


def synthesize_with_engine_recovery(payload, max_retries=1, timeout=server.ENGINE_HTTP_TIMEOUT):
    try:
        return _original_synthesize(payload, max_retries=max_retries, timeout=timeout)
    except server.EngineUnavailableError as exc:
        if max_retries < 1:
            raise
        print(f'[Launcher] synthesis unavailable; restarting native engine before retry: {exc}')
        return _recover_and_retry(payload, timeout)


server.synthesize_native_with_recovery = synthesize_with_engine_recovery


def watchdog():
    while True:
        time.sleep(5)
        try:
            if not _engine_is_alive():
                print('[Launcher] native engine is not running; restarting')
                with _recovery_lock:
                    if not _engine_is_alive():
                        server.restart_engine('watchdog_engine_dead')
        except Exception as exc:
            print(f'[Launcher] watchdog recovery failed: {exc}')


signal.signal(signal.SIGTERM, server.shutdown)
signal.signal(signal.SIGINT, server.shutdown)

_safe_start_engine()
threading.Thread(target=watchdog, daemon=True, name='omnivoice-engine-watchdog').start()
print(f'[OmniVoice] Native service listening on {server.HOST}:{server.PORT}')
server.ThreadingHTTPServer((server.HOST, server.PORT), server.Handler).serve_forever()
