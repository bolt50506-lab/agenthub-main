FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/data/huggingface \
    TRANSFORMERS_CACHE=/data/huggingface

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libsndfile1 git openssl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY server.py ./
COPY bootstrap_voice.py ./
COPY ali_voice.enc.b64 ./
RUN mkdir -p /app/profiles /app/outputs /data/huggingface

EXPOSE 7860

CMD ["sh", "-c", "python bootstrap_voice.py && python server.py"]
