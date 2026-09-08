from pathlib import Path
import re

h = Path('/src/omnivoice.cpp/src/tts-server.h')
s = h.read_text()

if 'int num_step;' not in s:
    pattern = r'(\n\s*int64_t seed;\s*\n)(};)'
    s, n = re.subn(pattern, r'\1    int      num_step;       // MaskGIT iterations (4..32)\n\2', s, count=1)
    if n != 1:
        raise SystemExit('tts-server.h request struct pattern not found')

if 'req.num_step' not in s:
    pattern = r'(\s*req\.seed\s*=\s*seed\s*\?\s*yyjson_get_sint\(seed\)\s*:\s*-1;\s*)\n'
    replacement = r'''\1
    yyjson_val * steps = yyjson_obj_get(root, "num_step");
    if (steps && !yyjson_is_int(steps)) {
        err = "'num_step' must be an integer";
        yyjson_doc_free(doc);
        return false;
    }
    req.num_step = steps ? (int) yyjson_get_sint(steps) : 8;
    if (req.num_step < 4) req.num_step = 4;
    if (req.num_step > 32) req.num_step = 32;
'''
    s, n = re.subn(pattern, replacement, s, count=1)
    if n != 1:
        raise SystemExit('tts-server.h seed parser pattern not found')

h.write_text(s)

b = Path('/src/omnivoice.cpp/src/backend.h')
s = b.read_text()
old = '''static int backend_cpu_n_threads(void) {
    int n = (int) std::thread::hardware_concurrency() / 2;
    return n > 0 ? n : 1;
}'''
new = '''static int backend_cpu_n_threads(void) {
    const char * configured = std::getenv("OMNIVOICE_CPU_THREADS");
    if (configured && *configured) {
        char * end = nullptr;
        long n = std::strtol(configured, &end, 10);
        if (end != configured && *end == '\\0' && n > 0 && n <= 64) {
            return (int) n;
        }
    }
    int n = (int) std::thread::hardware_concurrency() / 2;
    return n > 0 ? n : 1;
}'''
if old not in s:
    raise SystemExit('backend_cpu_n_threads block not found')
s = s.replace(old, new, 1)
b.write_text(s)

cpp = Path('/src/omnivoice.cpp/tools/tts-server.cpp')
s = cpp.read_text()
needle = 'p.mg_seed = (req.seed < 0) ? (uint64_t) std::random_device{}() : (uint64_t) req.seed;'
# Make the native value follow the HTTP request so production can use the faster
# 8-step profile without a hidden hard-coded 16-step override.
old_force = 'p.mg_num_step = 16;'
if old_force in s:
    s = s.replace(old_force, 'p.mg_num_step = (req.num_step > 0) ? req.num_step : 8;', 1)
elif needle in s:
    s = s.replace(needle, needle + '\n        p.mg_num_step = (req.num_step > 0) ? req.num_step : 8;', 1)
else:
    raise SystemExit('tts-server.cpp seed assignment pattern not found')

cpp.write_text(s)
print('OmniVoice patch applied: configurable MaskGIT steps, production default 8, CPU threads configurable')
