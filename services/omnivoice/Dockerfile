FROM debian:bookworm AS builder

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /src

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates git cmake ninja-build build-essential libopenblas-dev \
       curl wget pkg-config python3 \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --recurse-submodules --depth 1 https://github.com/ServeurpersoCom/omnivoice.cpp.git /src/omnivoice.cpp \
    && python3 - <<'PY'
from pathlib import Path

h = Path('/src/omnivoice.cpp/src/tts-server.h')
s = h.read_text()
old = 'int64_t seed; };'
new = 'int64_t seed; int num_step; };'
if old not in s:
    raise SystemExit('tts-server.h request struct pattern not found')
s = s.replace(old, new, 1)
old = 'req.seed = seed ? yyjson_get_sint(seed) : -1; yyjson_doc_free(doc);'
new = 'req.seed = seed ? yyjson_get_sint(seed) : -1; yyjson_val * steps = yyjson_obj_get(root, "num_step"); if (steps && !yyjson_is_int(steps)) { err = "\'num_step\' must be an integer"; yyjson_doc_free(doc); return false; } req.num_step = steps ? (int) yyjson_get_sint(steps) : 16; if (req.num_step < 4) req.num_step = 4; if (req.num_step > 32) req.num_step = 32; yyjson_doc_free(doc);'
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
PY
    && cmake -S /src/omnivoice.cpp -B /src/omnivoice.cpp/build \
       -DGGML_BLAS=ON \
       -DOMNIVOICE_SHARED=OFF \
       -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /src/omnivoice.cpp/build --config Release -j2 \
    && mkdir -p /runtime-libs \
    && find /src/omnivoice.cpp/build -type f -name 'lib*.so*' -exec cp -a {} /runtime-libs/ \; \
    && find /src/omnivoice.cpp/build -type l -name 'lib*.so*' -exec cp -a {} /runtime-libs/ \; \
    && test -n "$(find /runtime-libs -name 'libggml.so*' -print -quit)"

FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    GGML_N_THREADS=2 \
    OMNIVOICE_NUM_STEPS=16 \
    OMNIVOICE_GGUF_MODEL=/opt/omnivoice/models/omnivoice-base-Q4_K_M.gguf \
    OMNIVOICE_GGUF_CODEC=/opt/omnivoice/models/omnivoice-tokenizer-Q4_K_M.gguf \
    OMNIVOICE_ENGINE_BIN=/opt/omnivoice/bin/tts-server \
    OMNIVOICE_CODEC_BIN=/opt/omnivoice/bin/omnivoice-codec \
    OMNIVOICE_BOOTSTRAP_ASR_MODEL=tiny \
    HF_HOME=/data/huggingface \
    LD_LIBRARY_PATH=/opt/omnivoice/lib:/usr/local/lib:/usr/lib/x86_64-linux-gnu

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ffmpeg libsndfile1 libgomp1 libopenblas0 ca-certificates openssl curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

RUN mkdir -p /opt/omnivoice/bin /opt/omnivoice/lib /opt/omnivoice/models /data/omnivoice /data/huggingface
COPY --from=builder /src/omnivoice.cpp/build/tts-server /opt/omnivoice/bin/tts-server
COPY --from=builder /src/omnivoice.cpp/build/omnivoice-codec /opt/omnivoice/bin/omnivoice-codec
COPY --from=builder /runtime-libs/ /opt/omnivoice/lib/

RUN ldconfig /opt/omnivoice/lib \
    && test -n "$(find /opt/omnivoice/lib -name 'libggml.so*' -print -quit)" \
    && ldd /opt/omnivoice/bin/omnivoice-codec \
    && ldd /opt/omnivoice/bin/tts-server

# Q4_K_M keeps the native OmniVoice runtime within the existing ~1 GB Railway memory budget.
RUN curl -L --fail --retry 5 --retry-delay 2 \
      -o /opt/omnivoice/models/omnivoice-base-Q4_K_M.gguf \
      https://huggingface.co/Serveurperso/OmniVoice-GGUF/resolve/main/omnivoice-base-Q4_K_M.gguf \
    && curl -L --fail --retry 5 --retry-delay 2 \
      -o /opt/omnivoice/models/omnivoice-tokenizer-Q4_K_M.gguf \
      https://huggingface.co/Serveurperso/OmniVoice-GGUF/resolve/main/omnivoice-tokenizer-Q4_K_M.gguf \
    && test $(stat -c%s /opt/omnivoice/models/omnivoice-base-Q4_K_M.gguf) -gt 300000000 \
    && test $(stat -c%s /opt/omnivoice/models/omnivoice-tokenizer-Q4_K_M.gguf) -gt 180000000

COPY server.py ./
COPY bootstrap_voice.py ./
COPY ali_voice.enc.b64 ./

EXPOSE 7860

CMD ["sh", "-c", "python bootstrap_voice.py && exec python server.py"]
