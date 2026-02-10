#!/bin/bash

echo "🛑 Stopping any existing servers..."
pkill -9 node 2>/dev/null
pkill -9 tsx 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null
sleep 2

echo "✅ Ports cleared"
echo "🚀 Starting servers..."
npm run dev
