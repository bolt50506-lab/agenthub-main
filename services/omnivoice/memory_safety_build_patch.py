"""Build-time source patch for OmniVoice memory/failure safety.

This script runs during Docker image build, never at container startup. It
patches the checked-in server.py copy inside the image and fails the build if
an expected source shape is missing, preventing silent runtime corruption.
"""
from pathlib import Path

SERVER = Path('/app/server.py')
source = SERVER.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'[Memory Safety Build] {label}: expected 1 match, found {count}')
    source = source.replace(old, new, 1)

replace_once(
    "import base64\nimport cgi\nimport json\nimport os\nimport signal\n",
    "import base64\nimport cgi\nimport gc\nimport http.client\nimport json\nimport os\nimport signal\n",
    'imports',
)

replace_once(
    "NUM_STEPS = max(4, min(32, int(os.environ.get('OMNIVOICE_NUM_STEPS', '16'))))\n\njobs = {}\n",
    "NUM_STEPS = max(4, min(32, int(os.environ.get('OMNIVOICE_NUM_STEPS', '16'))))\nMEMORY_GUARD_MB = int(os.environ.get('OMNIVOICE_MEMORY_GUARD_MB', '850'))\nENGINE_HTTP_TIMEOUT = int(os.environ.get('OMNIVOICE_ENGINE_TIMEOUT', '900'))\n\njobs = {}\n",
    'memory constants',
)

replace_once(
    "def http_json(url, payload=None, timeout=30):\n    data = None\n    headers = {}\n    method = 'GET'\n    if payload is not None:\n        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')\n        headers['Content-Type'] = 'application/json'\n        method = 'POST'\n    req = urllib.request.Request(url, data=data, headers=headers, method=method)\n    with urllib.request.urlopen(req, timeout=timeout) as response:\n        return response.status, response.read(), response.headers\n",
    """class EngineUnavailableError(RuntimeError):
    pass


def _rss_mb(pid):
    try:
        text = Path(f'/proc/{pid}/status').read_text(encoding='utf-8', errors='ignore')
        for line in text.splitlines():
            if line.startswith('VmRSS:'):
                return int(line.split()[1]) / 1024.0
    except Exception:
        return 0.0
    return 0.0


def current_rss_mb():
    total = _rss_mb(os.getpid())
    if engine_process is not None and engine_process.poll() is None:
        total += _rss_mb(engine_process.pid)
    return total


def memory_guard():
    rss = current_rss_mb()
    if rss >= MEMORY_GUARD_MB:
        raise EngineUnavailableError(
            f'OmniVoice is temporarily busy due to high memory usage ({rss:.0f} MB); retry shortly'
        )
    return rss


def http_json(url, payload=None, timeout=30):
    data = None
    headers = {}
    method = 'GET'
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        headers['Content-Type'] = 'application/json'
        method = 'POST'
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, response.read(), response.headers
    except (http.client.RemoteDisconnected, ConnectionResetError, BrokenPipeError) as exc:
        raise EngineUnavailableError(f'Engine disconnected while calling {url}: {exc}') from exc


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


def synthesize_native_with_recovery(payload, max_retries=1, timeout=ENGINE_HTTP_TIMEOUT):
    last_err = None
    for attempt in range(max_retries + 1):
        started = time.time()
        rss_before = current_rss_mb()
        fn_name = 'http_json'
        print(f'[Memory Safety] synthesis call resolved to: {fn_name}')
        print(f'[Engine] synthesis_call_start attempt={attempt + 1} rss_mb={rss_before:.1f} url={ENGINE_URL}/v1/audio/speech')
        try:
            result = http_json(f'{ENGINE_URL}/v1/audio/speech', payload, timeout=timeout)
            print(f'[Engine] synthesis_call_end attempt={attempt + 1} status={result[0]} bytes={len(result[1])} duration_ms={(time.time() - started) * 1000:.0f} rss_mb={current_rss_mb():.1f}')
            return result
        except EngineUnavailableError as exc:
            last_err = exc
            print(f'[Engine] synthesis_call_failed attempt={attempt + 1} duration_ms={(time.time() - started) * 1000:.0f} rss_mb={current_rss_mb():.1f} error={exc}')
            if attempt < max_retries:
                print('[OmniVoice] Native engine connection failed; restarting engine and retrying once')
                restart_engine()
                continue
    raise EngineUnavailableError(f'Engine disconnected after {max_retries + 1} attempts: {last_err}')
""",
    'native HTTP/recovery helpers',
)

replace_once(
    "            status, data, _ = http_json(f'{ENGINE_URL}/v1/audio/speech', payload, timeout=900)\n",
    "            memory_guard()\n            status, data, _ = synthesize_native_with_recovery(payload, max_retries=1, timeout=ENGINE_HTTP_TIMEOUT)\n",
    'native synthesis call',
)

replace_once(
    "            print(f'[OmniVoice] Generated {job_id} ({len(data)} bytes) in {time.time() - float(read_job(job_id).get(\"started_at\", time.time())):.1f}s')\n    except Exception as exc:\n        traceback.print_exc()\n        save_job(job_id, {'status': 'failed', 'error': str(exc)})\n",
    "            print(f'[OmniVoice] Generated {job_id} ({len(data)} bytes) in {time.time() - float(read_job(job_id).get(\"started_at\", time.time())):.1f}s')\n            del data\n            gc.collect()\n    except EngineUnavailableError as exc:\n        traceback.print_exc()\n        save_job(job_id, {'status': 'failed', 'error': str(exc), 'retryable': True, 'failed_at': time.time()})\n        print(f'[OmniVoice] Job {job_id} failed cleanly: {exc}')\n    except Exception as exc:\n        traceback.print_exc()\n        save_job(job_id, {'status': 'failed', 'error': str(exc)})\n",
    'clean job failure handling',
)

replace_once(
    "                profile = read_profile(profile_id)\n                if not profile:\n                    self._json(404, {'error': 'Profile not found'})\n                    return\n                job_id = uuid.uuid4().hex\n",
    "                profile = read_profile(profile_id)\n                if not profile:\n                    self._json(404, {'error': 'Profile not found'})\n                    return\n                if generation_lock.locked():\n                    self._json(503, {'error': 'Voice generation is busy; retry shortly', 'retryable': True})\n                    return\n                try:\n                    rss = memory_guard()\n                except EngineUnavailableError as exc:\n                    self._json(503, {'error': str(exc), 'retryable': True})\n                    return\n                print(f'[Engine] generation_preflight rss_mb={rss:.1f} guard_mb={MEMORY_GUARD_MB}')\n                job_id = uuid.uuid4().hex\n",
    '/generate preflight guard',
)

SERVER.write_text(source, encoding='utf-8')
print('[Memory Safety Build] server.py patched successfully at image build time')
