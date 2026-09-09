import signal
import threading
import time

import server


_original_synthesize = server.synthesize_native_with_recovery
_recovery_lock = threading.Lock()


def _engine_is_alive():
    process = server.engine_process
    return process is not None and process.poll() is None


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

server.start_engine()
threading.Thread(target=watchdog, daemon=True, name='omnivoice-engine-watchdog').start()
print(f'[OmniVoice] Native service listening on {server.HOST}:{server.PORT}')
server.ThreadingHTTPServer((server.HOST, server.PORT), server.Handler).serve_forever()
