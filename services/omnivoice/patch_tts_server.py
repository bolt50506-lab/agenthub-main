from pathlib import Path
import re

h = Path('/src/omnivoice.cpp/src/tts-server.h')
s = h.read_text()

# Extend the request struct if the current upstream source does not already
# contain the override field.
if 'int num_step;' not in s:
    pattern = r'(\n\s*int64_t seed;\s*\n)(};)'
    s, n = re.subn(pattern, r'\1    int      num_step;       // MaskGIT iterations (4..32)\n\2', s, count=1)
    if n != 1:
        raise SystemExit('tts-server.h request struct pattern not found')

# Parse the optional field, defaulting to 16. This keeps the HTTP API useful
# while the native adapter below also enforces the production-safe default.
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

# The upstream backend deliberately uses logical/2 physical-core threads.
# Railway exposes many vCPUs, but this service is memory/CPU constrained. Honor
# OMNIVOICE_CPU_THREADS so the deployment can cap the native GGML backend.
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

# Force the Railway-safe production value directly in the native adapter.
# The previous deployment proved the HTTP request override was not reaching
# the ABI (the engine still reported 32), so do not depend on parser state.
needle = 'p.mg_seed = (req.seed < 0) ? (uint64_t) std::random_device{}() : (uint64_t) req.seed;'
if 'p.mg_num_step = 16;' not in s:
    if needle not in s:
        raise SystemExit('tts-server.cpp seed assignment pattern not found')
    s = s.replace(needle, needle + '\n        p.mg_num_step = 16;', 1)

cpp.write_text(s)
print('OmniVoice patch applied: native MaskGIT forced to 16 steps and CPU threads configurable')
