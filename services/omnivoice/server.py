import cgi
import json
import os
import threading
import traceback
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from omnivoice import OmniVoice, OmniVoiceGenerationConfig

MODEL_ID = os.environ.get('OMNIVOICE_MODEL_ID', 'k2-fsa/OmniVoice')
ASR_MODEL_ID = os.environ.get('OMNIVOICE_ASR_MODEL_ID', 'openai/whisper-small')
HOST = os.environ.get('HOST', '0.0.0.0')
PORT = int(os.environ.get('PORT', '7860'))
SERVICE_SECRET = os.environ.get('AGENTHUB_WEBHOOK_SECRET', '')
MAX_REFERENCE_SECONDS = 10
MAX_TEXT_CHARS = 5000
BASE_DIR = Path(__file__).resolve().parent
PROFILE_DIR = BASE_DIR / 'profiles'
OUTPUT_DIR = BASE_DIR / 'outputs'
PROFILE_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

if torch.cuda.is_available():
    DEVICE, DTYPE = 'cuda:0', torch.float16
elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
    DEVICE, DTYPE = 'mps', torch.float16
else:
    DEVICE, DTYPE = 'cpu', torch.float32

print(f'[OmniVoice] model={MODEL_ID} device={DEVICE} dtype={DTYPE}')
model = None
model_lock = threading.Lock()
jobs = {}


def load_model():
    global model
    if model is not None: return model
    with model_lock:
        if model is None:
            print('[OmniVoice] Loading model...')
            model = OmniVoice.from_pretrained(MODEL_ID, device_map=DEVICE, dtype=DTYPE, asr_model_name=ASR_MODEL_ID)
            print('[OmniVoice] Model loaded successfully')
    return model


def profile_path(profile_id): return PROFILE_DIR / f'{profile_id}.json'

def read_profile(profile_id):
    path = profile_path(profile_id)
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else None

def write_profile(profile): profile_path(profile['id']).write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding='utf-8')


def save_reference(file_bytes, filename, profile_id):
    if not file_bytes: raise ValueError('Empty reference audio')
    if len(file_bytes) > 25 * 1024 * 1024: raise ValueError('Reference audio is larger than 25 MB')
    path = PROFILE_DIR / f"{profile_id}_reference{Path(filename or '').suffix or '.wav'}"
    path.write_bytes(file_bytes)
    try:
        data, rate = sf.read(str(path), dtype='float32', always_2d=False)
        data = np.asarray(data, dtype=np.float32)
        if data.ndim > 1: data = np.mean(data, axis=1)
        if data.size == 0 or float(np.max(np.abs(data))) == 0: raise ValueError('Reference audio is silent')
        max_samples = int(MAX_REFERENCE_SECONDS * rate)
        if len(data) > max_samples: data = data[:max_samples]
        sf.write(str(path), data, int(rate))
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return str(path)


def generate_job(job_id, profile, text, language, instruct=None):
    try:
        model_instance = load_model()
        ref_audio = profile.get('reference_audio')
        ref_text = profile.get('reference_text') or None
        if not ref_audio or not os.path.exists(ref_audio): raise RuntimeError('Voice reference audio is missing')
        config = OmniVoiceGenerationConfig(num_step=int(os.environ.get('OMNIVOICE_NUM_STEPS', '32')), denoise=True, preprocess_prompt=True, postprocess_output=True)
        with torch.inference_mode():
            result = model_instance.generate(text=text, language=language or None, ref_audio=ref_audio, ref_text=ref_text, instruct=instruct, generation_config=config)
        if not result: raise RuntimeError('OmniVoice returned no audio')
        audio = result[0]
        if isinstance(audio, torch.Tensor): audio = audio.detach().cpu().float().numpy()
        audio = np.asarray(audio, dtype=np.float32).squeeze()
        if audio.size == 0: raise RuntimeError('Generated audio is empty')
        peak = float(np.max(np.abs(audio)))
        if peak > 0.89: audio = audio * (0.89 / peak)
        output = OUTPUT_DIR / f'{job_id}.wav'
        sf.write(str(output), audio, int(getattr(model_instance, 'sampling_rate', 24000)))
        jobs[job_id] = {'status': 'completed', 'path': str(output)}
    except Exception as exc:
        traceback.print_exc(); jobs[job_id] = {'status': 'failed', 'error': str(exc)}


class Handler(BaseHTTPRequestHandler):
    def authorized(self):
        if not SERVICE_SECRET: return True
        token = self.headers.get('x-agenthub-secret', '') or self.headers.get('authorization', '').replace('Bearer ', '')
        return token.strip() == SERVICE_SECRET

    def _json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)

    def _read_json(self):
        length = int(self.headers.get('Content-Length', '0'))
        if length > 2 * 1024 * 1024: raise ValueError('JSON request is too large')
        return json.loads(self.rfile.read(length).decode('utf-8'))

    def _read_multipart(self):
        env = {'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': self.headers.get('Content-Type', ''), 'CONTENT_LENGTH': self.headers.get('Content-Length', '0')}
        form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ=env, keep_blank_values=True)
        fields, files = {}, []
        for key in form.keys():
            values = form[key] if isinstance(form[key], list) else [form[key]]
            for item in values:
                if getattr(item, 'filename', None): files.append((key, item.filename, item.file.read()))
                else: fields[key] = item.value
        return fields, files

    def do_GET(self):
        if self.path == '/health': self._json(200, {'ok': True, 'model': MODEL_ID, 'device': DEVICE}); return
        if not self.authorized(): self._json(401, {'error': 'Unauthorized'}); return
        if self.path.startswith('/audio/'):
            job = jobs.get(self.path.split('/')[2].split('?', 1)[0])
            if not job or job.get('status') != 'completed': self.send_error(404); return
            path = Path(job['path'])
            if not path.exists(): self.send_error(404); return
            data = path.read_bytes(); self.send_response(200); self.send_header('Content-Type', 'audio/wav'); self.send_header('Content-Length', str(len(data))); self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(data); return
        if self.path.startswith('/history/'):
            job_id = self.path.split('/')[2].split('?', 1)[0]; self._json(200, jobs.get(job_id, {'status': 'pending'})); return
        self.send_error(404)

    def do_POST(self):
        if not self.authorized(): self._json(401, {'error': 'Unauthorized'}); return
        try:
            if self.path == '/profiles':
                body = self._read_json(); profile_id = uuid.uuid4().hex
                profile = {'id': profile_id, 'name': str(body.get('name') or profile_id), 'description': body.get('description'), 'language': body.get('language') or 'en', 'reference_audio': None, 'reference_text': None}
                write_profile(profile); self._json(200, profile); return
            if self.path.startswith('/profiles/') and self.path.endswith('/samples'):
                profile_id = self.path.split('/')[2]; profile = read_profile(profile_id)
                if not profile: self._json(404, {'error': 'Profile not found'}); return
                fields, files = self._read_multipart()
                if not files: self._json(400, {'error': 'Audio sample is required'}); return
                _, filename, content = files[0]
                profile['reference_audio'] = save_reference(content, filename, profile_id); profile['reference_text'] = (fields.get('reference_text') or '').strip() or None; write_profile(profile)
                self._json(200, {'ok': True, 'id': profile_id}); return
            if self.path == '/generate':
                body = self._read_json(); profile_id = str(body.get('profile_id') or '').strip(); text = str(body.get('text') or '').strip()
                if not profile_id or not text: self._json(400, {'error': 'profile_id and text are required'}); return
                if len(text) > MAX_TEXT_CHARS: self._json(400, {'error': 'Text is too long'}); return
                profile = read_profile(profile_id)
                if not profile: self._json(404, {'error': 'Profile not found'}); return
                job_id = uuid.uuid4().hex; jobs[job_id] = {'status': 'processing'}
                threading.Thread(target=generate_job, args=(job_id, profile, text, str(body.get('language') or profile.get('language') or 'en'), body.get('instruct')), daemon=True).start()
                self._json(200, {'id': job_id, 'status': 'processing'}); return
            self.send_error(404)
        except Exception as exc:
            traceback.print_exc(); self._json(500, {'error': str(exc)})

    def do_DELETE(self):
        if not self.authorized(): self._json(401, {'error': 'Unauthorized'}); return
        if self.path.startswith('/profiles/'):
            profile_id = self.path.split('/')[2].split('?', 1)[0]; profile = read_profile(profile_id)
            if not profile: self._json(404, {'error': 'Profile not found'}); return
            if profile.get('reference_audio'): Path(profile['reference_audio']).unlink(missing_ok=True)
            profile_path(profile_id).unlink(missing_ok=True); self._json(200, {'ok': True}); return
        self.send_error(404)

    def log_message(self, fmt, *args): print('[HTTP]', fmt % args)


if __name__ == '__main__':
    print(f'[OmniVoice] Listening on {HOST}:{PORT}')
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
