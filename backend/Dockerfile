FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# SQLite DB 및 TTS 오디오 저장 디렉터리 보장
RUN mkdir -p database assets/audio

EXPOSE 10000

# Render는 PORT 환경변수로 포트를 주입합니다 (기본값: 10000)
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-10000}
