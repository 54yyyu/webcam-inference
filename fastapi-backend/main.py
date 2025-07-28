from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import io
import base64
import json
from datetime import datetime

app = FastAPI(title="Webcam Stream API", description="API for real-time webcam frame processing")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"Client connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        print(f"Client disconnected. Total connections: {len(self.active_connections)}")

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    
    try:
        while True:
            data = await websocket.receive_bytes()
            
            try:
                image = Image.open(io.BytesIO(data))
                
                width, height = image.size
                format_type = image.format or "JPEG"
                mode = image.mode
                
                frame_info = {
                    "timestamp": datetime.now().isoformat(),
                    "size_bytes": len(data),
                    "image_info": {
                        "width": width,
                        "height": height,
                        "format": format_type,
                        "mode": mode
                    },
                    "status": "processed",
                    "message": "Frame processed successfully"
                }
                
                print(f"Processed frame: {width}x{height}, {len(data)} bytes")
                
                await manager.send_personal_message(json.dumps(frame_info), websocket)
                
            except Exception as e:
                error_response = {
                    "timestamp": datetime.now().isoformat(),
                    "status": "error",
                    "message": f"Error processing frame: {str(e)}"
                }
                await manager.send_personal_message(json.dumps(error_response), websocket)
                print(f"Error processing frame: {e}")
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/")
async def root():
    return {"message": "Webcam Stream API is running", "active_connections": len(manager.active_connections)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)