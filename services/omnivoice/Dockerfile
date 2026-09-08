FROM debian:bookworm AS builder

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /src

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates git cmake ninja-build build-essential libopenblas-dev \
       curl wget pkg-config \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --recurse-submodules --depth 1 https://github.com/ServeurpersoCom/omnivoice.cpp.git /src/omnivoice.cpp \
    && cmake -S /src/omnivoice.cpp -B /src/omnivoice.cpp/build \
       -DGGML_BLAS=ON \
       -DOMNIVOICE_SHARED=OFF \
       -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /src/omnivoice.cpp/build --config Release -j2

FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    OMNIVOICE_GGUF_MODEL=/opt/omnivoice/models/omnivoice-base-Q4_K_M.gguf \
    OMNIVOICE_GGUF_CODEC=/opt/omnivoice/models/omnivoice-tokenizer-Q4_K_M.gguf \
    OMNIVOICE_ENGINE_BIN=/opt/omnivoice/bin/tts-server \
    OMNIVOICE_CODEC_BIN=/opt/omnivoice/bin/omnivoice-codec \
    OMNIVOICE_BOOTSTRAP_ASR_MODEL=tiny \
    HF_HOME=/data/huggingface

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ffmpeg libsndfile1 libgomp1 libopenblas0 ca-certificates openssl curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

RUN mkdir -p /opt/omnivoice/bin /opt/omnivoice/models /data/omnivoice /data/huggingface
COPY --from=builder /src/omnivoice.cpp/build/tts-server /opt/omnivoice/bin/tts-server
COPY --from=builder /src/omnivoice.cpp/build/omnivoice-codec /opt/omnivoice/bin/omnivoice-codec

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
