from pathlib import Path

SERVER = Path('/app/server.py')
s = SERVER.read_text(encoding='utf-8')

if 'from io import BytesIO' not in s:
    s = s.replace('import base64\n', 'import base64\nfrom io import BytesIO\n', 1)
if 'from scipy.signal import resample_poly' not in s:
    s = s.replace('import soundfile as sf\n', 'import soundfile as sf\nfrom scipy.signal import resample_poly\n', 1)

if 'OMNIVOICE_TRUE_PEAK_CEILING_DBFS' not in s:
    s = s.replace(
        "NUM_STEPS = max(4, min(32, int(os.environ.get('OMNIVOICE_NUM_STEPS', '16'))))\n",
        "NUM_STEPS = max(4, min(32, int(os.environ.get('OMNIVOICE_NUM_STEPS', '16'))))\n"
        "TRUE_PEAK_CEILING_DBFS = float(os.environ.get('OMNIVOICE_TRUE_PEAK_CEILING_DBFS', '-2.0'))\n"
        "TRUE_PEAK_OVERSAMPLE = max(2, min(8, int(os.environ.get('OMNIVOICE_TRUE_PEAK_OVERSAMPLE', '4'))))\n",
        1,
    )

if 'def limit_tts_wav_true_peak' not in s:
    marker = '\ndef generate_job(job_id, profile, text, language, instruct=None, lock_held=False):\n'
    if marker not in s:
        raise SystemExit('generate_job marker not found')
    helper = r'''

def _dbfs_from_linear(value):
    return 20.0 * np.log10(max(float(value), 1e-12))


def limit_tts_wav_true_peak(wav_bytes):
    """Apply final TTS gain protection before the WAV leaves the voice service.

    The limiter estimates inter-sample/true peak by oversampling the decoded
    waveform, then applies gain reduction only when the estimated peak exceeds
    the configured ceiling. Default ceiling is -2 dBFS, leaving useful headroom
    for downstream Opus/AAC/WhatsApp transcoding.
    """
    source = BytesIO(wav_bytes)
    try:
        info = sf.info(source)
        source.seek(0)
        audio, rate = sf.read(source, dtype='float32', always_2d=True)
    finally:
        source.close()

    if audio.size == 0:
        return wav_bytes

    peak_probe = resample_poly(audio, TRUE_PEAK_OVERSAMPLE, 1, axis=0)
    estimated_true_peak = float(np.max(np.abs(peak_probe)))
    del peak_probe

    ceiling = 10.0 ** (TRUE_PEAK_CEILING_DBFS / 20.0)
    gain = min(1.0, ceiling / max(estimated_true_peak, 1e-12))
    if gain < 0.999999:
        audio *= gain

    # Re-check after gain reduction so the emitted WAV is measurably below the
    # ceiling, rather than relying only on the pre-gain estimate.
    peak_probe = resample_poly(audio, TRUE_PEAK_OVERSAMPLE, 1, axis=0)
    final_true_peak = float(np.max(np.abs(peak_probe)))
    del peak_probe

    # Preserve floating-point output when the native engine emitted it. For
    # integer WAVs, retain their original subtype when practical.
    subtype = info.subtype if info.subtype in {'PCM_16', 'PCM_24', 'PCM_32', 'FLOAT', 'DOUBLE'} else 'PCM_16'
    output = BytesIO()
    sf.write(output, audio, int(rate), format='WAV', subtype=subtype)
    result = output.getvalue()
    output.close()
    del audio

    print(
        '[AudioGuard] final_tts_limiter '
        f'input_true_peak_dbfs={_dbfs_from_linear(estimated_true_peak):.2f} '
        f'gain={gain:.6f} '
        f'final_true_peak_dbfs={_dbfs_from_linear(final_true_peak):.2f} '
        f'ceiling_dbfs={TRUE_PEAK_CEILING_DBFS:.2f} '
        f'oversample={TRUE_PEAK_OVERSAMPLE} '
        f'bytes={len(result)}'
    )
    return result
'''
    s = s.replace(marker, helper + marker, 1)

old = '        tmp.write_bytes(data)\n'
new = '        data = limit_tts_wav_true_peak(data)\n        tmp.write_bytes(data)\n'
if old in s and 'data = limit_tts_wav_true_peak(data)' not in s:
    s = s.replace(old, new, 1)

SERVER.write_text(s, encoding='utf-8')
print('Applied OmniVoice final true-peak limiter patch to server.py')
