from pathlib import Path

h = Path('/src/omnivoice.cpp/src/tts-server.h')
s = h.read_text()
old = 'int64_t seed; };'
new = 'int64_t seed; int num_step; };'
if old not in s:
    raise SystemExit('tts-server.h request struct pattern not found')
s = s.replace(old, new, 1)
old = 'req.seed = seed ? yyjson_get_sint(seed) : -1; yyjson_doc_free(doc);'
new = 'req.seed = seed ? yyjson_get_sint(seed) : -1; yyjson_val * steps = yyjson_obj_get(root, "num_step"); if (steps && !yyjson_is_int(steps)) { err = "num_step must be an integer"; yyjson_doc_free(doc); return false; } req.num_step = steps ? (int) yyjson_get_sint(steps) : 16; if (req.num_step < 4) req.num_step = 4; if (req.num_step > 32) req.num_step = 32; yyjson_doc_free(doc);'
if old not in s:
    raise SystemExit('tts-server.h parser pattern not found')
s = s.replace(old, new, 1)
h.write_text(s)

cpp = Path('/src/omnivoice.cpp/tools/tts-server.cpp')
s = cpp.read_text()
old = 'p.mg_seed = (req.seed < 0) ? (uint64_t) std::random_device{}() : (uint64_t) req.seed;'
new = 'p.mg_seed = (req.seed < 0) ? (uint64_t) std::random_device{}() : (uint64_t) req.seed; p.mg_num_step = req.num_step;'
if old not in s:
    raise SystemExit('tts-server.cpp seed pattern not found')
s = s.replace(old, new, 1)
cpp.write_text(s)
