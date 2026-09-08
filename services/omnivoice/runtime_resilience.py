from pathlib import Path
import re

path = Path('/app/server.py')
s = path.read_text(encoding='utf-8')

helper = r'''

def restart_engine():
    global engine_process
    with engine_lock:
        old = engine_process
        if old is not None and old.poll() is None:
            print('[OmniVoice] Restarting native engine after synthesis connection failure')
            try:
                old.terminate()
                old.wait(timeout=10)
            except Exception:
                try:
                    old.kill()
                    old.wait(timeout=5)
                except Exception:
                    pass
        engine_process = None
        start_engine()


def synthesize_native_with_recovery(payload):
    try:
        return http_json(f'{ENGINE_URL}/v1/audio/speech', payload, timeout=900)
    except Exception as exc:
        message = str(exc)
        recoverable = (
            isinstance(exc, (ConnectionError, TimeoutError, urllib.error.URLError))
            or 'Remote end closed connection without response' in message
            or 'Connection reset by peer' in message
            or 'Broken pipe' in message
        )
        if not recoverable:
            raise
        print(f'[OmniVoice] Native engine connection failed: {message}; restarting engine and retrying once')
        restart_engine()
        return http_json(f'{ENGINE_URL}/v1/audio/speech', payload, timeout=900)
'''

if 'def synthesize_native_with_recovery(' not in s:
    marker = '\ndef language_value(language):\n'
    if marker not in s:
        raise SystemExit('language_value marker not found')
    s = s.replace(marker, helper + marker, 1)

old = "status, data, _ = http_json(f'{ENGINE_URL}/v1/audio/speech', payload, timeout=900)"
new = "status, data, _ = synthesize_native_with_recovery(payload)"
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise SystemExit('native synthesis call not found')

path.write_text(s, encoding='utf-8')
print('[OmniVoice Resilience] Native engine restart/retry patch applied.')
