import base64
import cgi
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
import soundfile as sf

HOST = os.environ.get('HOST', '0.0.0.0')
PORT = int(os.environ.get('PORT', '7860'))
SERVICE_SECRET = os.environ.get('AGENTHUB_WEBHOOK_SECRET', '')
MAX_REFERENCE_SECONDS = 10
MAX_TEXT_CHARS = 5000
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
MODEL_PATH = os.environ.get('OMNIVOICE_GGUF_MODEL', str(MODEL_DIR / 'omnivoice-base-Q4_K_M.gguf'))
CODEC_PATH = os.environ.get('OMNIVOICE_GGUF_CODEC', str(MODEL_DIR / 'omnivoice-tokenizer-Q4_K_M.gguf'))
VOICE_NAME = 'ali'
NUM_STEPS = max(4, min(32, int(os.environ.get('OMNIVOICE_NUM_STEPS', '16'))))

jobs = {}
engine_process = None
engine_lock = threading.Lock()
generation_lock = threading.Lock()


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
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.status, response.read(), response.headers


def wait_for_engine(timeout=300):
    deadline = time.time() + timeout
    last_error = None
    while time.time() < deadline:
        if engine_process is not None and engine_process.poll() is not None:
            raise RuntimeError(f'OmniVoice engine exited with code {engine_process.returncode}')
        try:
            status, data, _ = http_json(f'{ENGINE_URL}/v1/models', timeout=5)
            if status == 200:
                return
        except Exception as exc:
            last_error = exc
        time.sleep(2)
    raise RuntimeError(f'OmniVoice engine did not become ready: {last_error}')


def register_voice(profile):
    rvq_path = profile.get('reference_rvq')
    ref_text = (profile.get('reference_text') or '').strip()
    if not rvq_path or not os.path.exists(rvq_path):
        raise RuntimeError('Existing Ali voice RVQ reference is missing')
    if not ref_text:
        raise RuntimeError('Existing Ali voice reference transcript is missing')
    payload = {
        'name': VOICE_NAME,
        'ref_text': ref_text,
        'rvq_b64': base64.b64encode(Path(rvq_path).read_bytes()).decode('ascii'),
    }
    status, body, _ = http_json(f'{ENGINE_URL}/v1/audio/voices', payload, timeout=120)
    if status not in (200, 201):
        raise RuntimeError(f'Voice registration failed: HTTP {status}: {body[:500].decode("utf-8", "replace")}')
    print(f'[OmniVoice] Existing Ali cloned voice registered as {VOICE_NAME}')


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
    engine_process = subprocess.Popen([
        ENGINE_BIN,
        '--model', MODEL_PATH,
        '--codec', CODEC_PATH,
        '--port', str(ENGINE_PORT),
    ], env=env)
    wait_for_engine()
    profile = read_profile('8fbf738572e14231b793c1d7651dc331')
    if not profile:
        raise RuntimeError('Existing Ali profile is missing')
    register_voice(profile)


def language_value(language):
    value = (language or 'ur').strip()
    return value or 'ur'


def generate_job(job_id, profile, text, language, instruct=None):
    try:
        with generation_lock:
            save_job(job_id, {'status': 'processing', 'started_at': time.time()})
            payload = {
                'input': text,
                'voice': VOICE_NAME,
                'language': language_value(language),
                'response_format': 'wav',
                'seed': -1,
                'num_step': NUM_STEPS,
            }
            if instruct:
                payload['instructions'] = str(instruct)
            status, data, _ = http_json(f'{ENGINE_URL}/v1/audio/speech', payload, timeout=900)
            if status != 200 or not data:
                raise RuntimeError(f'Native OmniVoice synthesis failed: HTTP {status}: {data[:1000].decode("utf-8", "replace")}')
            output = OUTPUT_DIR / f'{job_id}.wav'
            tmp = output.with_suffix('.tmp.wav')
            tmp.write_bytes(data)
            tmp.replace(output)
            save_job(job_id, {'status': 'completed', 'path': str(output), 'completed_at': time.time()})
            print(f'[OmniVoice] Generated {job_id} ({len(data)} bytes) in {time.time() - float(read_job(job_id).get("started_at", time.time())):.1f}s')
    except Exception as exc:
        traceback.print_exc()
        save_job(job_id, {'status': 'failed', 'error': str(exc)})


def profile_path(profile_id):
    return PROFILE_DIR / f'{profile_id}.json'


def read_profile(profile_id):
    path = profile_path(profile_id)
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else None


def write_profile(profile):
    profile_path(profile['id']).write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding='utf-8')


def save_reference(file_bytes, filename, profile_id):
    if not file_bytes:
        raise ValueError('Empty reference audio')
    if len(file_bytes) > 25 * 1024 * 1024:
        raise ValueError('Reference audio is larger than 25 MB')
    path = PROFILE_DIR / f"{profile_id}_reference{Path(filename or '').suffix or '.wav'}"
    path.write_bytes(file_bytes)
    try:
        data, rate = sf.read(str(path), dtype='float32', always_2d=False)
        data = np.asarray(data, dtype=np.float32)
        if data.ndim > 1:
            data = np.mean(data, axis=1)
        if data.size == 0 or float(np.max(np.abs(data))) == 0:
            raise ValueError('Reference audio is silent')
        max_samples = int(MAX_REFERENCE_SECONDS * rate)
        if len(data) > max_samples:
            data = data[:max_samples]
        sf.write(str(path), data, int(rate))
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return str(path)


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

    def _read_json(self):
        length = int(self.headers.get('Content-Length', '0'))
        if length > 2 * 1024 * 1024:
            raise ValueError('JSON request is too large')
        return json.loads(self.rfile.read(length).decode('utf-8'))

    def _read_multipart(self):
        env = {
            'REQUEST_METHOD': 'POST',
            'CONTENT_TYPE': self.headers.get('Content-Type', ''),
            'CONTENT_LENGTH': self.headers.get('Content-Length', '0'),
        }
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
            self._json(200 if engine_ok else 503, {'ok': engine_ok, 'engine': 'omnivoice.cpp', 'voice': VOICE_NAME, 'num_steps': NUM_STEPS})
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
            self.send_response(200)
            self.send_header('Content-Type', 'audio/wav')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)
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
                profile = {
                    'id': profile_id,
                    'name': str(body.get('name') or profile_id),
                    'description': body.get('description'),
                    'language': body.get('language') or 'en',
                    'reference_audio': None,
                    'reference_rvq': None,
                    'reference_text': None,
                }
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
                profile['reference_audio'] = save_reference(content, filename, profile_id)
                profile['reference_text'] = (fields.get('reference_text') or '').strip() or None
                write_profile(profile)
                self._json(200, {'ok': True, 'id': profile_id})
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
                job_id = uuid.uuid4().hex
                save_job(job_id, {'status': 'processing', 'created_at': time.time()})
                threading.Thread(target=generate_job, args=(job_id, profile, text, str(body.get('language') or profile.get('language') or 'ur'), body.get('instruct')), daemon=True).start()
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
            if profile_id == '8fbf738572e14231b793c1d7651dc331':
                self._json(409, {'error': 'The existing Ali cloned voice is protected and cannot be deleted'})
                return
            profile = read_profile(profile_id)
            if not profile:
                self._json(404, {'error': 'Profile not found'})
                return
            if profile.get('reference_audio'):
                Path(profile['reference_audio']).unlink(missing_ok=True)
            if profile.get('reference_rvq'):
                Path(profile['reference_rvq']).unlink(missing_ok=True)
            profile_path(profile_id).unlink(missing_ok=True)
            self._json(200, {'ok': True})
            return
        self.send_error(404)

    def log_message(self, fmt, *args):
        print('[HTTP]', fmt % args)


def shutdown(*_args):
    global engine_process
    if engine_process is not None and engine_process.poll() is None:
        engine_process.send_signal(signal.SIGTERM)
        try:
            engine_process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            engine_process.kill()


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
