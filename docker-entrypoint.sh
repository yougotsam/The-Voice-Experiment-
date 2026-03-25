#!/bin/sh
set -e

cd /app/web && npx next start -p 3000 &
cd /app && python -m server.main

wait
