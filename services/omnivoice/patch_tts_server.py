from pathlib import Path
import re

h = Path('/src/omnivoice.cpp/src/tts-server.h')
s = h.read_text()

# Add an optional MaskGIT step count to the HTTP request without depending on
# exact whitespace/comments in upstream tts-server.h.
if 'int num_step;' not in s:
    pattern = r'(\n\s*int64_t seed;\s*\n)(};)'
    s, n = re.subn(pattern, r'\1    int      num_step;       // MaskGIT iterations (4..32)\n\2', s, count=1)
    if n != 1:
        raise SystemExit('tts-server.h request struct pattern not found')

# Parse num_step after seed. Keep upstream validation intact.
if 'req.num_step' not in s:
    pattern = r'(\s*req\.seed\s*=\s*seed\s*\?\s*yyjson_get_sint\(seed\)\s*:\s*-1;\s*)\n'
    replacement = r'''\1
    yyjson_val * steps = yyjson_obj_get(root, "num_step");
    if (steps && !yyjson_is_int(steps)) {
        err = "'num_step' must be an integer";
        yyjson_doc_free(doc);
        return false;
    }
    req.num_step = steps ? (int) yyjson_get_sint(steps) : 16;
    if (req.num_step < 4) req.num_step = 4;
    if (req.num_step > 32) req.num_step = 32;
'''
    s, n = re.subn(pattern, replacement, s, count=1)
    if n != 1:
        raise SystemExit('tts-server.h seed parser pattern not found')

h.write_text(s)

cpp = Path('/src/omnivoice.cpp/tools/tts-server.cpp')
s = cpp.read_text()
if 'p.mg_num_step = req.num_step;' not in s:
    pattern = r'(\s*p\.mg_seed\s*=\s*\(req\.seed\s*<\s*0\).*?;)(\s*\n)'
    replacement = r'\1\n        p.mg_num_step = req.num_step;\2'
    s, n = re.subn(pattern, replacement, s, count=1)
    if n != 1:
        raise SystemExit('tts-server.cpp seed assignment pattern not found')

cpp.write_text(s)
print('OmniVoice tts-server patch applied: num_step supported, default 16')
