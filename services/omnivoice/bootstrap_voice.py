import base64
import json
import os
import subprocess
from pathlib import Path

PROFILE_ID = "8fbf738572e14231b793c1d7651dc331"
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path('/data/omnivoice') if Path('/data').exists() else BASE_DIR
PROFILE_DIR = DATA_DIR / "profiles"
MODEL_DIR = DATA_DIR / "models"
PROFILE_DIR.mkdir(parents=True, exist_ok=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)
PROFILE_PATH = PROFILE_DIR / f"{PROFILE_ID}.json"
REFERENCE_PATH = PROFILE_DIR / f"{PROFILE_ID}_reference.mp3"
REFERENCE_WAV = PROFILE_DIR / f"{PROFILE_ID}_reference.wav"
REFERENCE_RVQ = PROFILE_DIR / f"{PROFILE_ID}_reference.rvq"
ENC_PATH = BASE_DIR / "ali_voice.enc.b64"
KEY = os.environ.get("ALI_VOICE_BOOTSTRAP_KEY", "").strip()
CODEC_BIN = os.environ.get("OMNIVOICE_CODEC_BIN", "/opt/omnivoice/bin/omnivoice-codec")
CODEC_MODEL = os.environ.get("OMNIVOICE_GGUF_CODEC", str(MODEL_DIR / "omnivoice-tokenizer-Q4_K_M.gguf"))

if not KEY:
    raise RuntimeError("ALI_VOICE_BOOTSTRAP_KEY is required to restore the existing Ali voice profile")


def restore_reference():
    needs_restore = not REFERENCE_PATH.exists() or REFERENCE_PATH.stat().st_size < 1000
    if needs_restore:
        encoded = ENC_PATH.read_text(encoding="utf-8").strip()
        encrypted_path = DATA_DIR / ".ali_voice.enc"
        encrypted_path.write_bytes(base64.b64decode(encoded))
        try:
            subprocess.run([
                "openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000",
                "-in", str(encrypted_path), "-out", str(REFERENCE_PATH),
                "-pass", "env:ALI_VOICE_BOOTSTRAP_KEY",
            ], check=True, env={**os.environ, "ALI_VOICE_BOOTSTRAP_KEY": KEY}, capture_output=True, text=True)
        finally:
            encrypted_path.unlink(missing_ok=True)
        print(f"[Voice Recovery] Restored existing Ali reference audio")
    else:
        print(f"[Voice Recovery] Existing Ali reference audio already present")


def transcribe_reference():
    profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8")) if PROFILE_PATH.exists() else {}
    existing = (profile.get("reference_text") or "").strip()
    if existing and REFERENCE_RVQ.exists():
        return profile

    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(REFERENCE_PATH),
        "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(REFERENCE_WAV),
    ], check=True)

    print("[Voice Recovery] No stored transcript; transcribing the existing Ali sample once with Whisper tiny")
    from faster_whisper import WhisperModel
    asr_model = WhisperModel(
        os.environ.get("OMNIVOICE_BOOTSTRAP_ASR_MODEL", "tiny"),
        device="cpu",
        compute_type="int8",
        download_root=str(DATA_DIR / "whisper"),
    )
    segments, info = asr_model.transcribe(
        str(REFERENCE_WAV),
        language="ur",
        beam_size=1,
        best_of=1,
        temperature=0.0,
        vad_filter=False,
    )
    transcript = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
    del asr_model
    if not transcript:
        raise RuntimeError("Could not transcribe the existing Ali voice sample; refusing to replace or recreate the voice")

    print(f"[Voice Recovery] Existing Ali reference transcript recovered: {transcript[:120]}")
    profile = {
        "id": PROFILE_ID,
        "name": "ali",
        "description": "Ali existing cloned voice",
        "language": "ur",
        "reference_audio": str(REFERENCE_PATH),
        "reference_wav": str(REFERENCE_WAV),
        "reference_rvq": str(REFERENCE_RVQ),
        "reference_text": transcript,
    }
    PROFILE_PATH.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    return profile


def encode_reference(profile):
    if REFERENCE_RVQ.exists() and REFERENCE_RVQ.stat().st_size > 100:
        return profile
    if not Path(CODEC_BIN).exists():
        raise RuntimeError(f"OmniVoice codec binary is missing: {CODEC_BIN}")
    if not Path(CODEC_MODEL).exists():
        raise RuntimeError(f"OmniVoice codec GGUF is missing: {CODEC_MODEL}")
    print("[Voice Recovery] Encoding existing Ali reference into persistent RVQ")
    subprocess.run([
        CODEC_BIN, "--model", CODEC_MODEL, "-i", str(REFERENCE_WAV)
    ], check=True)
    generated = REFERENCE_WAV.with_suffix('.rvq')
    if not generated.exists():
        raise RuntimeError("OmniVoice codec did not create the Ali RVQ reference")
    if generated != REFERENCE_RVQ:
        generated.replace(REFERENCE_RVQ)
    profile["reference_rvq"] = str(REFERENCE_RVQ)
    PROFILE_PATH.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    print("[Voice Recovery] Existing Ali voice reference encoded successfully")
    return profile


restore_reference()
profile = transcribe_reference()
if not profile.get("reference_text"):
    raise RuntimeError("Ali voice profile has no reference transcript")
profile = encode_reference(profile)
print(f"[Voice Recovery] Existing Ali profile ready: {PROFILE_ID}")
