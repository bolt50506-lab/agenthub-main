import base64
import cgi
import ctypes
import gc
import http.client
import json
import os
import signal
import subprocess
import threading
import time
import traceback
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import psutil
import soundfile as sf

HOST = os.environ.get('HOST', '0.0.0.0')
PORT = int(os.environ.get('PORT', '7860'))
SERVICE_SECRET = os.environ.get('AGENTHUB_WEBHOOK_SECRET', '')
MAX_REFERENCE_SECONDS = 10
MAX_TEXT_CHARS = 5000
MEMORY_GUARD_MB = int(os.environ.get('OMNIVOICE_MEMORY_GUARD_MB', '850'))
ENGINE_HTTP_TIMEOUT = int(os.environ.get('OMNIVOICE_ENGINE_TIMEOUT', '900'))
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path('/data/omnivoice') if Path('/data').exists() else BASE_DIR
PROFILE_DIR = DATA_DIR / 'profiles'
OUTPUT_DIR = DATA_DIR / 'outputs'
JOB_DIR = DATA_DIR / 'jobs'
MODEL_DIR = DATA_DIR / 'models'
PROFILE_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
JOB_DIR.mkdir(parents=True, exist_ok=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)

ENGINE_PORT = int(os.environ.get('OMNIVOICE_ENGINE_PORT', '8080'))
ENGINE_URL = f'http://127.0.0.1:{ENGINE_PORT}'
ENGINE_BIN = os.environ.get('OMNIVOICE_ENGINE_BIN', '/opt/omnivoice/bin/tts-server')
CODEC_BIN = os.environ.get('OMNIVOICE_CODEC_BIN', '/opt/omnivoice/bin/omnivoice-codec')
MODEL_PATH = os.environ.get('OMNIVOICE_GGUF_MODEL', str(MODEL_DIR / 'omnivoice-base-Q4_K_M.gguf'))
CODEC_PATH = os.environ.get('OMNIVOICE_GGUF_CODEC', str(MODEL_DIR / 'omnivoice-tokenizer-Q4_K_M.gguf'))
ALI_PROFILE_ID = '8fbf738572e14231b793c1d7651dc331'
VOICE_NAME = 'ali'
NUM_STEPS = max(4, min(32, int(os.environ.get('OMNIVOICE_NUM_STEPS', '16'))))

jobs = {}
engine_process = None
engine_lock = threading.RLock()
generation_lock = threading.Lock()


class EngineUnavailableError(RuntimeError):
    pass


def _rss_mb(pid=None):
    try:
        return psutil.Process(pid or os.getpid()).memory_info().rss / (1024 * 1024)
    except (psutil.Error, OSError):
        return 0.0


def current_rss_mb():
    total = _rss_mb()
    if engine_process is not None and engine_process.poll() is None:
        total += _rss_mb(engine_process.pid)
    return total


def malloc_trim():
    try:
        libc = ctypes.CDLL('libc.so.6')
        libc.malloc_trim(0)
    except Exception:
        pass


def cleanup_memory(label):
    gc.collect()
    malloc_trim()
    print(f'[Memory] cleanup label={label} rss_mb={current_rss_mb():.1f}')


def memory_guard():
    rss = current_rss_mb()
    if rss >= MEMORY_GUARD_MB:
        raise MemoryError(f'Voice generation temporarily unavailable: memory usage is {rss:.1f} MB (guard {MEMORY_GUARD_MB} MB)')
    return rss


def job_path(job_id):
    return JOB_DIR / f'{job_id}.json'


def save_job(job_id, job):
    jobs[job_id] = job
    tmp = job_path(job_id).with_suffix('.tmp')
    tmp.write_text(json.dumps(job, ensure_ascii=False), encoding='utf-8')
    tmp.replace(job_path(job_id))


def read_job(job_id):
    if job_id in jobs:
        return jobs[job_id]
    path = job_path(job_id)
    if path.exists():
        try:
            job = json.loads(path.read_text(encoding='utf-8'))
            jobs[job_id] = job
            return job
        except Exception:
            return None
    return None


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
        raise EngineUnavailableError(f'Native OmniVoice engine disconnected: {exc}') from exc


def voice_name_for_profile(profile_id):
    if profile_id == ALI_PROFILE_ID:
        return VOICE_NAME
    safe = ''.join(ch if ch.isalnum() else '_' for ch in str(profile_id))
    return f'voice_{safe[:48]}'


def synthesize_native_with_recovery(payload, max_retries=1, timeout=ENGINE_HTTP_TIMEOUT):
    last_error = None
    for attempt in range(max_retries + 1):
        started = time.time()
        print(f'[Engine] synthesis_call_start attempt={attempt + 1} voice={payload.get("voice")} rss_mb={current_rss_mb():.1f}')
        try:
            with engine_lock:
                status, data, headers = http_json(f'{ENGINE_URL}/v1/audio/speech', payload, timeout=timeout)
            print(f'[Engine] synthesis_call_end attempt={attempt + 1} status={status} bytes={len(data)} elapsed_ms={(time.time() - started) * 1000:.0f} rss_mb={current_rss_mb():.1f}')
            return status, data, headers
        except (EngineUnavailableError, TimeoutError, urllib.error.URLError) as exc:
            last_error = exc
            print(f'[Engine] synthesis_call_failed attempt={attempt + 1} error={exc} rss_mb={current_rss_mb():.1f}')
            if attempt < max_retries:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise EngineUnavailableError(f'Native OmniVoice engine unavailable: {exc}') from exc
    raise EngineUnavailableError(f'Native OmniVoice engine unavailable: {last_error}')


def wait_for_engine(timeout=300):
    deadline = time.time() + timeout
    last_error = None
    while time.time() < deadline:
        if engine_process is not None and engine_process.poll() is not None:
            raise RuntimeError(f'OmniVoice engine exited with code {engine_process.returncode}')
        try:
            status, data, _ = http_json(f'{ENGINE_URL}/v1/models', timeout=5)
            del data
            if status == 200:
                return
        except Exception as exc:
            last_error = exc
        time.sleep(2)
    raise RuntimeError(f'OmniVoice engine did not become ready: {last_error}')


def register_voice(profile):
    rvq_path = profile.get('reference_rvq')
    ref_text = (profile.get('reference_text') or '').strip()
    profile_id = str(profile.get('id') or '')
    if not rvq_path or not os.path.exists(rvq_path):
        raise RuntimeError(f'Voice profile {profile_id} RVQ reference is missing')
    if not ref_text:
        raise RuntimeError(f'Voice profile {profile_id} reference transcript is missing')
    voice_name = voice_name_for_profile(profile_id)
    rvq_data = Path(rvq_path).read_bytes()
    try:
        payload = {'name': voice_name, 'ref_text': ref_text, 'rvq_b64': base64.b64encode(rvq_data).decode('ascii')}
    finally:
        del rvq_data
    try:
        with engine_lock:
            status, body, _ = http_json(f'{ENGINE_URL}/v1/audio/voices', payload, timeout=120)
    finally:
        del payload
        cleanup_memory(f'register_voice:{profile_id}')
    if status not in (200, 201):
        raise RuntimeError(f'Voice registration failed: HTTP {status}: {body[:500].decode("utf-8", "replace")}')
    print(f'[OmniVoice] Voice profile registered id={profile_id} name={voice_name}')


def register_all_profiles():
    profiles = []
    for path in PROFILE_DIR.glob('*.json'):
        try:
            profile = json.loads(path.read_text(encoding='utf-8'))
            if profile.get('reference_rvq') and profile.get('reference_text'):
                profiles.append(profile)
        except Exception:
            continue
    profiles.sort(key=lambda p: 0 if p.get('id') == ALI_PROFILE_ID else 1)
    for profile in profiles:
        try:
            register_voice(profile)
        except Exception as exc:
            print(f'[OmniVoice] Skipping profile registration id={profile.get("id")}: {exc}')


def stop_engine():
    global engine_process
    process = engine_process
    engine_process = None
    if process is None:
        return
    if process.poll() is None:
        print(f'[Engine] stopping native engine pid={process.pid}')
        try:
            process.send_signal(signal.SIGTERM)
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        except Exception as exc:
            print(f'[Engine] stop error: {exc}')
    cleanup_memory('engine_stop')


def restart_engine(reason):
    with engine_lock:
        print(f'[Engine] restart_requested reason={reason} rss_mb={current_rss_mb():.1f}')
        stop_engine()
        start_engine()
        print(f'[Engine] restart_complete reason={reason} rss_mb={current_rss_mb():.1f}')


def recover_idle_engine():
    rss = current_rss_mb()
    if rss < MEMORY_GUARD_MB:
        return rss
    print(f'[Engine] idle_memory_recovery_trigger rss_mb={rss:.1f} guard_mb={MEMORY_GUARD_MB}')
    restart_engine('idle_rss_over_guard')
    rss = current_rss_mb()
    if rss >= MEMORY_GUARD_MB:
        raise MemoryError(f'Voice engine remains above memory guard after restart: {rss:.1f} MB >= {MEMORY_GUARD_MB} MB')
    return rss


def start_engine():
    global engine_process
    if engine_process is not None and engine_process.poll() is None:
        return
    for path in (MODEL_PATH, CODEC_PATH):
        if not Path(path).exists():
            raise RuntimeError(f'OmniVoice GGUF missing: {path}')
    env = os.environ.copy()
    env.setdefault('OMP_NUM_THREADS', '1')
    env.setdefault('OPENBLAS_NUM_THREADS', '1')
    env.setdefault('MKL_NUM_THREADS', '1')
    env.setdefault('GGML_N_THREADS', os.environ.get('GGML_N_THREADS', '2'))
    print(f'[OmniVoice] Starting native CPU engine model={MODEL_PATH} codec={CODEC_PATH} steps={NUM_STEPS} ggml_threads={env.get("GGML_N_THREADS")}')
    engine_process = subprocess.Popen([ENGINE_BIN, '--model', MODEL_PATH, '--codec', CODEC_PATH, '--port', str(ENGINE_PORT)], env=env)
    wait_for_engine()
    ali = read_profile(ALI_PROFILE_ID)
    if not ali:
        raise RuntimeError('Existing Ali profile is missing')
    if not ali.get('reference_rvq') or not ali.get('reference_text'):
        raise RuntimeError('Existing Ali profile reference is incomplete')
    register_all_profiles()


def language_value(language):
    value = (language or 'ur').strip()
    return value or 'ur'


def generate_job(job_id, profile, text, language, instruct=None, lock_held=False):
    acquired_here = False
    try:
        if not lock_held:
            generation_lock.acquire()
            acquired_here = True
        save_job(job_id, {'status': 'processing', 'started_at': time.time()})
        profile_id = str(profile.get('id') or '')
        payload = {'input': text, 'voice': voice_name_for_profile(profile_id), 'language': language_value(language), 'response_format': 'wav', 'seed': -1, 'num_step': NUM_STEPS}
        if instruct:
            payload['instructions'] = str(instruct)
        print(f'[Engine] generation_start job={job_id} profile={profile_id} voice={payload["voice"]} rss_mb={current_rss_mb():.1f} guard_mb={MEMORY_GUARD_MB}')
        status, data, _ = synthesize_native_with_recovery(payload, max_retries=1, timeout=ENGINE_HTTP_TIMEOUT)
        if status != 200 or not data:
            raise RuntimeError(f'Native OmniVoice synthesis failed: HTTP {status}: {data[:1000].decode("utf-8", "replace")}')
        output = OUTPUT_DIR / f'{job_id}.wav'
        tmp = output.with_suffix('.tmp.wav')
        tmp.write_bytes(data)
        tmp.replace(output)
        audio_bytes = len(data)
        del data
        del payload
        cleanup_memory(f'generation_decode_cleanup:{job_id}')
        started_at = float(read_job(job_id).get('started_at', time.time()))
        save_job(job_id, {'status': 'completed', 'path': str(output), 'completed_at': time.time()})
        print(f'[OmniVoice] Generated {job_id} ({audio_bytes} bytes) in {time.time() - started_at:.1f}s rss_mb={current_rss_mb():.1f}')
        post_rss = current_rss_mb()
        if post_rss >= MEMORY_GUARD_MB:
            print(f'[Engine] post_generation_memory_high job={job_id} rss_mb={post_rss:.1f} guard_mb={MEMORY_GUARD_MB}; restarting native engine before releasing generation lock')
            restart_engine('post_generation_rss_over_guard')
    except EngineUnavailableError as exc:
        save_job(job_id, {'status': 'failed', 'error': str(exc), 'retryable': True, 'failed_at': time.time()})
        print(f'[OmniVoice] Job {job_id} failed cleanly: {exc}')
    except Exception as exc:
        traceback.print_exc()
        save_job(job_id, {'status': 'failed', 'error': str(exc), 'retryable': isinstance(exc, MemoryError), 'failed_at': time.time()})
    finally:
        cleanup_memory(f'generation_finally:{job_id}')
        if lock_held or acquired_here:
            generation_lock.release()


def profile_path(profile_id):
    return PROFILE_DIR / f'{profile_id}.json'


def read_profile(profile_id):
    path = profile_path(profile_id)
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else None


def write_profile(profile):
    profile_path(profile['id']).write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding='utf-8')


def encode_reference_rvq(reference_wav, profile_id):
    if not Path(CODEC_BIN).exists():
        raise RuntimeError(f'OmniVoice codec binary is missing: {CODEC_BIN}')
    if not Path(CODEC_PATH).exists():
        raise RuntimeError(f'OmniVoice codec GGUF is missing: {CODEC_PATH}')
    print(f'[Voice] Encoding RVQ profile={profile_id}')
    subprocess.run([CODEC_BIN, '--model', CODEC_PATH, '-i', str(reference_wav)], check=True, capture_output=True, text=True)
    generated = Path(reference_wav).with_suffix('.rvq')
    target = PROFILE_DIR / f'{profile_id}_reference.rvq'
    if not generated.exists():
        raise RuntimeError('OmniVoice codec did not create the RVQ reference')
    if generated != target:
        target.unlink(missing_ok=True)
        generated.replace(target)
    return str(target)


def save_reference(file_bytes, filename, profile_id):
    if not file_bytes:
        raise ValueError('Empty reference audio')
    if len(file_bytes) > 25 * 1024 * 1024:
        raise ValueError('Reference audio is larger than 25 MB')
    path = PROFILE_DIR / f"{profile_id}_reference{Path(filename or '').suffix or '.wav'}"
    path.write_bytes(file_bytes)
    del file_bytes
    cleanup_memory(f'reference_upload_written:{profile_id}')
    try:
        data, rate = sf.read(str(path), dtype='float32', always_2d=False)
        data = np.asarray(data, dtype=np.float32)
        if data.ndim > 1:
            mono = np.mean(data, axis=1)
            del data
            data = mono
        if data.size == 0 or float(np.max(np.abs(data))) == 0:
            raise ValueError('Reference audio is silent')
        max_samples = int(MAX_REFERENCE_SECONDS * rate)
        if len(data) > max_samples:
            data = data[:max_samples].copy()
        wav_path = PROFILE_DIR / f'{profile_id}_reference.wav'
        sf.write(str(wav_path), data, int(rate))
        del data
        cleanup_memory(f'reference_decode_cleanup:{profile_id}')
        rvq_path = encode_reference_rvq(wav_path, profile_id)
        cleanup_memory(f'reference_rvq_cleanup:{profile_id}')
    except Exception:
        path.unlink(missing_ok=True)
        (PROFILE_DIR / f'{profile_id}_reference.wav').unlink(missing_ok=True)
        (PROFILE_DIR / f'{profile_id}_reference.rvq').unlink(missing_ok=True)
        raise
    return str(path), rvq_path


class Handler(BaseHTTPRequestHandler):
    def authorized(self):
        if not SERVICE_SECRET:
            return True
        token = self.headers.get('x-agenthub-secret', '') or self.headers.get('authorization', '').replace('Bearer ', '')
        return token.strip() == SERVICE_SECRET

    def _json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        del data

    def _read_json(self):
        length = int(self.headers.get('Content-Length', '0'))
        if length > 2 * 1024 * 1024:
            raise ValueError('JSON request is too large')
        return json.loads(self.rfile.read(length).decode('utf-8'))

    def _read_multipart(self):
        env = {'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': self.headers.get('Content-Type', ''), 'CONTENT_LENGTH': self.headers.get('Content-Length', '0')}
        form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ=env, keep_blank_values=True)
        fields, files = {}, []
        for key in form.keys():
            values = form[key] if isinstance(form[key], list) else [form[key]]
            for item in values:
                if getattr(item, 'filename', None):
                    files.append((key, item.filename, item.file.read()))
                else:
                    fields[key] = item.value
        return fields, files

    def do_GET(self):
        if self.path == '/health':
            engine_ok = engine_process is not None and engine_process.poll() is None
            self._json(200 if engine_ok else 503, {'ok': engine_ok, 'engine': 'omnivoice.cpp', 'voice': VOICE_NAME, 'num_steps': NUM_STEPS, 'rss_mb': round(current_rss_mb(), 1), 'guard_mb': MEMORY_GUARD_MB})
            return
        if not self.authorized():
            self._json(401, {'error': 'Unauthorized'})
            return
        if self.path.startswith('/audio/'):
            job_id = self.path.split('/')[2].split('?', 1)[0]
            job = read_job(job_id)
            if not job:
                self._json(404, {'error': 'Job not found', 'status': 'failed'})
                return
            if job.get('status') == 'failed':
                self._json(409, {'error': job.get('error', 'Voice generation failed'), 'status': 'failed'})
                return
            if job.get('status') != 'completed':
                self._json(409, {'error': 'Audio is not ready', 'status': job.get('status', 'processing')})
                return
            path = Path(job['path'])
            if not path.exists():
                save_job(job_id, {'status': 'failed', 'error': 'Generated audio is no longer available; retry generation'})
                self._json(409, {'error': 'Generated audio is no longer available; retry generation', 'status': 'failed'})
                return
            data = path.read_bytes()
            try:
                self.send_response(200)
                self.send_header('Content-Type', 'audio/wav')
                self.send_header('Content-Length', str(len(data)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(data)
            finally:
                del data
                cleanup_memory(f'audio_response:{job_id}')
            return
        if self.path.startswith('/history/'):
            job_id = self.path.split('/')[2].split('?', 1)[0]
            job = read_job(job_id)
            if not job:
                self._json(200, {'status': 'failed', 'error': 'Job was lost because the voice service restarted; retry generation'})
                return
            if job.get('status') == 'completed' and not Path(job.get('path', '')).exists():
                save_job(job_id, {'status': 'failed', 'error': 'Generated audio is no longer available; retry generation'})
            self._json(200, read_job(job_id))
            return
        self.send_error(404)

    def do_POST(self):
        if not self.authorized():
            self._json(401, {'error': 'Unauthorized'})
            return
        try:
            if self.path == '/profiles':
                body = self._read_json()
                requested_id = str(body.get('id') or '').strip()
                profile_id = requested_id or uuid.uuid4().hex
                if len(profile_id) > 128 or '/' in profile_id or '\\' in profile_id or profile_id in {'.', '..'}:
                    self._json(400, {'error': 'Invalid profile id'})
                    return
                profile = {'id': profile_id, 'name': str(body.get('name') or profile_id), 'description': body.get('description'), 'language': body.get('language') or 'en', 'reference_audio': None, 'reference_rvq': None, 'reference_text': None}
                write_profile(profile)
                self._json(200, profile)
                return
            if self.path.startswith('/profiles/') and self.path.endswith('/samples'):
                profile_id = self.path.split('/')[2]
                profile = read_profile(profile_id)
                if not profile:
                    self._json(404, {'error': 'Profile not found'})
                    return
                fields, files = self._read_multipart()
                if not files:
                    self._json(400, {'error': 'Audio sample is required'})
                    return
                _, filename, content = files[0]
                reference_audio, reference_rvq = save_reference(content, filename, profile_id)
                profile['reference_audio'] = reference_audio
                profile['reference_wav'] = str(PROFILE_DIR / f'{profile_id}_reference.wav')
                profile['reference_rvq'] = reference_rvq
                profile['reference_text'] = (fields.get('reference_text') or '').strip() or None
                if not profile['reference_text']:
                    raise ValueError('Exact sample transcript is required for cloned voice registration')
                write_profile(profile)
                del content
                files.clear()
                cleanup_memory(f'profile_sample_cleanup:{profile_id}')
                if engine_process is not None and engine_process.poll() is None:
                    register_voice(profile)
                self._json(200, {'ok': True, 'id': profile_id, 'registered_voice': voice_name_for_profile(profile_id)})
                return
            if self.path == '/generate':
                body = self._read_json()
                profile_id = str(body.get('profile_id') or '').strip()
                text = str(body.get('text') or '').strip()
                if not profile_id or not text:
                    self._json(400, {'error': 'profile_id and text are required'})
                    return
                if len(text) > MAX_TEXT_CHARS:
                    self._json(400, {'error': 'Text is too long'})
                    return
                profile = read_profile(profile_id)
                if not profile:
                    self._json(404, {'error': 'Profile not found'})
                    return
                try:
                    rss = recover_idle_engine()
                except MemoryError as exc:
                    print(f'[Engine] generation_preflight_rejected rss_mb={current_rss_mb():.1f} guard_mb={MEMORY_GUARD_MB} reason={exc}')
                    self._json(503, {'error': 'Voice generation is temporarily unavailable; engine memory recovery failed', 'retryable': True})
                    return
                if not generation_lock.acquire(blocking=False):
                    print('[Engine] generation_preflight_rejected reason=generation_in_progress')
                    self._json(503, {'error': 'Voice generation is busy; retry shortly', 'retryable': True})
                    return
                print(f'[Engine] generation_preflight rss_mb={rss:.1f} guard_mb={MEMORY_GUARD_MB} concurrency=1 profile={profile_id}')
                job_id = uuid.uuid4().hex
                save_job(job_id, {'status': 'processing', 'created_at': time.time()})
                try:
                    threading.Thread(target=generate_job, args=(job_id, profile, text, str(body.get('language') or profile.get('language') or 'ur'), body.get('instruct'), True), daemon=True).start()
                except Exception:
                    generation_lock.release()
                    raise
                self._json(200, {'id': job_id, 'status': 'processing', 'num_steps': NUM_STEPS})
                return
            self.send_error(404)
        except Exception as exc:
            traceback.print_exc()
            self._json(500, {'error': str(exc)})

    def do_DELETE(self):
        if not self.authorized():
            self._json(401, {'error': 'Unauthorized'})
            return
        if self.path.startswith('/profiles/'):
            profile_id = self.path.split('/')[2].split('?', 1)[0]
            if profile_id == ALI_PROFILE_ID:
                self._json(409, {'error': 'The existing Ali cloned voice is protected and cannot be deleted', 'protected': True, 'profile_id': profile_id})
                return
            profile = read_profile(profile_id)
            if not profile:
                self._json(404, {'error': 'Profile not found'})
                return
            for key in ('reference_audio', 'reference_wav', 'reference_rvq'):
                if profile.get(key):
                    Path(profile[key]).unlink(missing_ok=True)
            for suffix in ('_reference.mp3', '_reference.wav', '_reference.rvq', '.json'):
                (PROFILE_DIR / f'{profile_id}{suffix}').unlink(missing_ok=True)
            cleanup_memory(f'profile_delete:{profile_id}')
            self._json(200, {'ok': True, 'id': profile_id})
            return
        self.send_error(404)

    def log_message(self, fmt, *args):
        print('[HTTP]', fmt % args)


def shutdown(*_args):
    with engine_lock:
        stop_engine()


signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT, shutdown)

if __name__ == '__main__':
    try:
        start_engine()
        print(f'[OmniVoice] Native service listening on {HOST}:{PORT}')
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except Exception:
        traceback.print_exc()
        raise
