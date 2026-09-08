import base64
import json
import os
import subprocess
from pathlib import Path

PROFILE_ID = "8fbf738572e14231b793c1d7651dc331"
BASE_DIR = Path(__file__).resolve().parent
PROFILE_DIR = BASE_DIR / "profiles"
PROFILE_DIR.mkdir(parents=True, exist_ok=True)
PROFILE_PATH = PROFILE_DIR / f"{PROFILE_ID}.json"
REFERENCE_PATH = PROFILE_DIR / f"{PROFILE_ID}_reference.mp3"
ENC_PATH = BASE_DIR / "ali_voice.enc.b64"
KEY = os.environ.get("ALI_VOICE_BOOTSTRAP_KEY", "").strip()

if not KEY:
    raise RuntimeError("ALI_VOICE_BOOTSTRAP_KEY is required to restore the existing Ali voice profile")

needs_restore = not PROFILE_PATH.exists() or not REFERENCE_PATH.exists() or REFERENCE_PATH.stat().st_size < 1000
if needs_restore:
    encoded = ENC_PATH.read_text(encoding="utf-8").strip()
    encrypted_path = BASE_DIR / ".ali_voice.enc"
    encrypted_path.write_bytes(base64.b64decode(encoded))
    try:
        subprocess.run([
            "openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000",
            "-in", str(encrypted_path), "-out", str(REFERENCE_PATH),
            "-pass", "env:ALI_VOICE_BOOTSTRAP_KEY",
        ], check=True, env={**os.environ, "ALI_VOICE_BOOTSTRAP_KEY": KEY}, capture_output=True, text=True)
    finally:
        encrypted_path.unlink(missing_ok=True)
    profile = {
        "id": PROFILE_ID,
        "name": "ali",
        "description": "Ali existing cloned voice",
        "language": "ur",
        "reference_audio": str(REFERENCE_PATH),
        "reference_text": None,
    }
    PROFILE_PATH.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[Voice Recovery] Restored existing Ali profile {PROFILE_ID} from encrypted seed")
else:
    print(f"[Voice Recovery] Existing Ali profile {PROFILE_ID} already present")
