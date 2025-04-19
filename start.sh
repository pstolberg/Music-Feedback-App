#!/bin/bash

# Music Feedback App Starter Script
# Runs both server and client concurrently with proper error handling

echo "🎵 Starting AI Music Feedback Platform..."

# Kill any processes that might be using our ports
echo "Cleaning up previous processes..."
lsof -ti:5002 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null

# Check for .env file in server directory
if [ ! -f ./server/.env ]; then
  echo "⚠️ Warning: No .env file found in server directory"
  echo "Creating example .env file..."
  echo "PORT=5002" > ./server/.env
  echo "OPENAI_API_KEY=" >> ./server/.env
  echo "⚠️ Please add your OpenAI API key to ./server/.env before running again!"
fi

# Start server in background
echo "🚀 Starting server on port 5002..."
cd server && npm start &
SERVER_PID=$!

# Wait a bit for server to initialize
sleep 2

# Start client in background
echo "🚀 Starting client on port 3000..."
cd ../client && npm start &
CLIENT_PID=$!

# Trap script termination to ensure child processes are killed
trap "echo 'Shutting down...'; kill $SERVER_PID 2>/dev/null; kill $CLIENT_PID 2>/dev/null; exit" INT TERM EXIT

# Keep script running until user interrupts
echo "✅ Development environment running! Press Ctrl+C to shut down."
wait
