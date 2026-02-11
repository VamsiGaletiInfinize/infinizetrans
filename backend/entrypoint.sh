#!/bin/sh
# Generate self-signed cert if it doesn't exist
mkdir -p /app/certs
if [ ! -f /app/certs/cert.pem ]; then
  echo "Generating self-signed SSL certificate..."
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout /app/certs/key.pem \
    -out /app/certs/cert.pem \
    -days 365 \
    -subj "/CN=infinize-backend"
fi
exec node dist/src/server.js
