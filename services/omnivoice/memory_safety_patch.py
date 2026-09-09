"""Runtime source patch for OmniVoice memory/failure safety.

This file is intentionally idempotent: it patches server.py before the service
starts, without changing the existing voice/profile or engine implementation.
"""
from pathlib import Path

SERVER = Path(__file__).resolve().parent / "server.py"
source = SERVER.read_text(encoding="utf-8")

# 1) Add imports/constants and RSS helpers.
old = "import base64\nimport cgi\nimport json\nimport os\nimport signal\n"
new = "import base64\nimport cgi\nimport gc\nimport http.client\nimport json\nimport os\nimport signal\n"
if old in source and "import http.client" not in source:
    source = source.replace(old, new, 1)

old = "NUM_STEPS = max(4, min(32, int(os.environ.get('OMNIVOICE_NUM_STEPS', '16'))))\n\njobs = {}\n"
new = "NUM_STEPS = max(4, min(32, int(os.environ.get('OMNIVOICE_NUM_STEPS', '16'))))\nMEMORY_GUARD_MB = int(os.environ.get('OMNIVOICE_MEMORY_GUARD_MB', '850'))\nENGINE_HTTP_TIMEOUT = int(os.environ.get('OMNIVOICE_ENGINE_TIMEOUT', '900'))\n\njobs = {}\n"
if old in source and "MEMORY_GUARD_MB" not in source:
    source = source.replace(old, new, 1)

old = "def http_json(url, payload=None, timeout=30):\n    data = None\n    headers = {}\n    method = 'GET'\n    if payload is not None:\n        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')\n        headers['Content-Type'] = 'application/json'\n        method = 'POST'\n    req = urllib.request.Request(url, data=data, headers=headers, method=method)\n    with urllib.request.urlopen(req, timeout=timeout) as response:\n        return response.status, response.read(), response.headers\n"
new = """class EngineUnavailableError(RuntimeError):\n    pass\n\n\ndef _rss_mb(pid):\n    try:\n        text = Path(f'/proc/{pid}/status').read_text(encoding='utf-8', errors='ignore')\n        for line in text.splitlines():\n            if line.startswith('VmRSS:'):\n                return int(line.split()[1]) / 1024.0\n    except Exception:\n        return 0.0\n    return 0.0\n\n\ndef current_rss_mb():\n    total = _rss_mb(os.getpid())\n    if engine_process is not None and engine_process.poll() is None:\n        total += _rss_mb(engine_process.pid)\n    return total\n\n\ndef memory_guard():\n    rss = current_rss_mb()\n    if rss >= MEMORY_GUARD_MB:\n        raise EngineUnavailableError(\n            f'OmniVoice is temporarily busy due to high memory usage ({rss:.0f} MB); retry shortly'\n        )\n    return rss\n\n\ndef http_json(url, payload=None, timeout=30):\n    data = None\n    headers = {}\n    method = 'GET'\n    if payload is not None:\n        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')\n        headers['Content-Type'] = 'application/json'\n        method = 'POST'\n    req = urllib.request.Request(url, data=data, headers=headers, method=method)\n    try:\n        with urllib.request.urlopen(req, timeout=timeout) as response:\n            return response.status, response.read(), response.headers\n    except (http.client.RemoteDisconnected, ConnectionResetError, BrokenPipeError) as exc:\n        raise EngineUnavailableError(f'Engine disconnected while calling {url}: {exc}') from exc\n\n\ndef synthesize_native_with_recovery(payload, max_retries=1, timeout=ENGINE_HTTP_TIMEOUT):\n    last_err = None\n    for attempt in range(max_retries + 1):\n        started = time.time()\n        rss_before = current_rss_mb()\n        print(f'[Engine] synthesis_call_start attempt={attempt + 1} rss_mb={rss_before:.1f} url={ENGINE_URL}/v1/audio/speech')\n        try:\n            result = http_json(f'{ENGINE_URL}/v1/audio/speech', payload, timeout=timeout)\n            print(f'[Engine] synthesis_call_end attempt={attempt + 1} status={result[0]} bytes={len(result[1])} duration_ms={(time.time() - started) * 1000:.0f} rss_mb={current_rss_mb():.1f}')\n            return result\n        except EngineUnavailableError as exc:\n            last_err = exc\n            print(f'[Engine] synthesis_call_failed attempt={attempt + 1} duration_ms={(time.time() - started) * 1000:.0f} rss_mb={current_rss_mb():.1f} error={exc}')\n            if attempt < max_retries:\n                time.sleep(1.5 * (attempt + 1))\n    raise EngineUnavailableError(f'Engine disconnected after {max_retries + 1} attempts: {last_err}')\n"""
if old in source and "def synthesize_native_with_recovery" not in source:
    source = source.replace(old, new, 1)

# 2) Replace the direct synthesis call with the fail-fast wrapper and ensure
#    memory is collected after each completed job.
old = "            status, data, _ = http_json(f'{ENGINE_URL}/v1/audio/speech', payload, timeout=900)\n"
new = "            memory_guard()\n            status, data, _ = synthesize_native_with_recovery(payload, max_retries=1, timeout=ENGINE_HTTP_TIMEOUT)\n"
if old in source:
    source = source.replace(old, new, 1)

old = "            print(f'[OmniVoice] Generated {job_id} ({len(data)} bytes) in {time.time() - float(read_job(job_id).get(\"started_at\", time.time())):.1f}s')\n    except Exception as exc:\n"
new = "            print(f'[OmniVoice] Generated {job_id} ({len(data)} bytes) in {time.time() - float(read_job(job_id).get(\"started_at\", time.time())):.1f}s')\n            del data\n            gc.collect()\n    except EngineUnavailableError as exc:\n        traceback.print_exc()\n        save_job(job_id, {'status': 'failed', 'error': str(exc), 'retryable': True, 'failed_at': time.time()})\n        print(f'[OmniVoice] Job {job_id} failed cleanly: {exc}')\n    except Exception as exc:\n"
if old in source:
    source = source.replace(old, new, 1)

# 3) Make /generate reject when another synthesis is active or memory is high.
old = "                profile = read_profile(profile_id)\n                if not profile:\n                    self._json(404, {'error': 'Profile not found'})\n                    return\n                job_id = uuid.uuid4().hex\n"
new = "                profile = read_profile(profile_id)\n                if not profile:\n                    self._json(404, {'error': 'Profile not found'})\n                    return\n                if generation_lock.locked():\n                    self._json(503, {'error': 'Voice generation is busy; retry shortly', 'retryable': True})\n                    return\n                try:\n                    rss = memory_guard()\n                except EngineUnavailableError as exc:\n                    self._json(503, {'error': str(exc), 'retryable': True})\n                    return\n                print(f'[Engine] generation_preflight rss_mb={rss:.1f} guard_mb={MEMORY_GUARD_MB}')\n                job_id = uuid.uuid4().hex\n"
if old in source:
    source = source.replace(old, new, 1)

# 4) Avoid retaining large audio bytes longer than necessary on completed jobs.
#    The engine response itself is still produced by the native process; this
#    cleanup specifically removes the Python-side duplicate buffer promptly.
if source == SERVER.read_text(encoding="utf-8"):
    raise SystemExit("memory safety patch found no applicable source changes")

SERVER.write_text(source, encoding="utf-8")
print('[Memory Safety] server.py patched successfully')
