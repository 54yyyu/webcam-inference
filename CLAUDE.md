# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This is a webcam streaming application with real-time frame processing consisting of:

- **fastapi-backend/**: Python FastAPI backend that receives webcam frames via WebSocket, processes them using PIL, and returns frame metadata
- **frontend/**: TypeScript/Vite frontend that captures webcam feed and streams frames to the backend

## Development Commands

### Backend (FastAPI)
```bash
# Navigate to backend directory
cd fastapi-backend

# Install dependencies using uv
uv sync

# Run the development server
uv run python main.py
# Or alternatively:
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend (Vite + TypeScript)
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
pnpm install

# Run development server (port 3000)
pnpm run dev

# Build for production
pnpm run build

# Preview production build
pnpm run preview
```

## Architecture Overview

The application uses a real-time WebSocket connection between frontend and backend:

1. **Frontend (main.ts:1-175)**: WebcamStreamer class manages camera access, WebSocket connection, and frame streaming at ~10 FPS
2. **Backend (main.py:1-87)**: FastAPI app with ConnectionManager for WebSocket connections, processes incoming image frames using PIL
3. **Communication**: Frontend captures frames from HTMLVideoElement, converts to JPEG blobs, sends via WebSocket to backend
4. **Processing**: Backend analyzes frame metadata (dimensions, format, size) and returns processing status

### Key Components

- **ConnectionManager (main.py:19-35)**: Manages WebSocket connections and message broadcasting
- **WebcamStreamer (main.ts:1-175)**: Handles camera access, UI controls, and frame streaming
- **WebSocket endpoint (main.py:37-79)**: Receives binary frame data and processes with PIL

### Connection Flow

1. Frontend starts camera using getUserMedia API
2. User clicks "Connect to Backend" to establish WebSocket at `ws://localhost:8000/ws`
3. Frontend continuously captures frames and sends as JPEG blobs
4. Backend processes each frame and responds with metadata JSON

The backend expects to run on port 8000, frontend on port 3000. CORS is configured to allow all origins for development.