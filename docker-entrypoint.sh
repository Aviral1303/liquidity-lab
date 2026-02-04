#!/bin/sh

# Start backend
node src/backend/server.js &
BACKEND_PID=$!

# Wait for backend to start
sleep 2

# Start frontend
serve -s frontend/build -l 3000 &
FRONTEND_PID=$!

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
