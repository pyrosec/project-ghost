# Dockerfile for RTT Bridge component
FROM python:3.9-slim

# Set working directory
WORKDIR /app
# Set environment variables
ENV PYTHONUNBUFFERED=1

COPY . .
RUN pip install --no-cache-dir -r requirements.txt
CMD ["python", "main.py"]
