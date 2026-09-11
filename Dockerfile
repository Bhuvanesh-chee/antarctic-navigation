FROM python:3.11-slim

# Hugging Face Spaces-friendly: non-root user, uid 1000
RUN useradd -m -u 1000 -s /bin/bash user

WORKDIR /home/user/app

# Install Python deps BEFORE copying source (better layer caching)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY backend/ ./backend/
COPY frontend/dist/ ./frontend/dist/

# Non-root runtime
USER user

EXPOSE 7860

# Entrypoint seeds the DB on first boot, then runs uvicorn
COPY backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD []
