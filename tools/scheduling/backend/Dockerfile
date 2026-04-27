FROM python:3.11-slim

WORKDIR /app

# 安裝 CBC solver（PuLP 需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    coinor-cbc \
    && rm -rf /var/lib/apt/lists/*

# 安裝 Python 套件
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製程式碼
COPY main.py .
COPY solver.py .

ENV PORT=8080

CMD exec gunicorn \
    --bind "0.0.0.0:${PORT}" \
    --workers 2 \
    --timeout 180 \
    --graceful-timeout 30 \
    main:app
