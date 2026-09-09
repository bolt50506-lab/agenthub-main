from pathlib import Path
import re
p=Path('/src/omnivoice.cpp/tools/tts-server.cpp')
s=p.read_text()
# Do not assume a particular chunking API exists. This patch only injects a safe
# per-request MaskGIT step limit; chunk splitting is performed at the AgentHub
# layer where each /generate call has a hard character bound.
if 'OMNIVOICE_NUM_STEPS' in s and 'req.num_step' not in s:
    raise SystemExit('unexpected source shape: inspect native request parser before patching')
print('noop')
