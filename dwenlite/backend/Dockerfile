# Current Debian (bookworm) with Node 22. The old bullseye image no longer has working apt mirrors.
FROM node:22-bookworm-slim

# Python for edge-tts, in a virtualenv (bookworm blocks global pip installs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3001

CMD ["npm", "start"]
