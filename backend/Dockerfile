FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

COPY scripts/railway-start.sh scripts/railway-start.sh
RUN chmod +x scripts/railway-start.sh

CMD ["sh", "scripts/railway-start.sh"]
