FROM debian:bookworm AS builder

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /src

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates git cmake ninja-build build-essential libopenblas-dev \
       curl wget pkg-config python3 \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --recurse-submodules --depth 1 https://github.com/ServeurpersoCom/omnivoice.cpp.git /src/omnivoice.cpp
COPY patch_tts_server.py /src/patch_tts_server.py
RUN python3 /src/patch_tts_server.py \
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
    OMNIVOICE_CPU_THREADS=2 \
    OMNIVOICE_NUM_STEPS=8 \
    OMNIVOICE_MEMORY_GUARD_MB=850 \
    OMNIVOICE_ENGINE_TIMEOUT=900 \
    OMNIVOICE_CHUNK_DURATION_SEC=5 \
    OMNIVOICE_CHUNK_THRESHOLD_SEC=10 \
    OMNIVOICE_TRUE_PEAK_CEILING_DBFS=-2.0 \
    OMNIVOICE_TRUE_PEAK_OVERSAMPLE=4 \
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
COPY patch_audio_output.py /tmp/patch_audio_output.py
RUN python /tmp/patch_audio_output.py
COPY launcher.py ./
COPY bootstrap_voice.py ./
COPY ali_voice.enc.b64 ./

EXPOSE 7860

CMD ["python", "launcher.py"]
