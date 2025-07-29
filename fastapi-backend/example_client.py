#!/usr/bin/env python3
"""
Example client for testing the simplified nail-biting analytics API.
This demonstrates how to send data from client-side MediaPipe processing.
"""

import asyncio
import websockets
import json
from datetime import datetime
import random

async def simulate_nail_biting_data():
    """Simulate sending nail-biting detection data to the WebSocket endpoint"""
    uri = "ws://localhost:8000/ws"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to WebSocket server")
            
            # Simulate different types of nail-biting events
            session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            events = [
                {
                    "timestamp": datetime.now().isoformat(),
                    "distance": 15.5,
                    "confidence": 0.85,
                    "session_id": session_id,
                    "event_type": "approach"
                },
                {
                    "timestamp": datetime.now().isoformat(),
                    "distance": 8.2,
                    "confidence": 0.92,
                    "session_id": session_id,
                    "event_type": "contact"
                },
                {
                    "timestamp": datetime.now().isoformat(),
                    "distance": 12.1,
                    "confidence": 0.78,
                    "session_id": session_id,
                    "event_type": "retreat"
                }
            ]
            
            for event in events:
                # Send event data as JSON
                await websocket.send(json.dumps(event))
                
                # Wait for confirmation
                response = await websocket.recv()
                response_data = json.loads(response)
                print(f"Server response: {response_data['status']} - {response_data['message']}")
                
                # Wait a bit before sending next event
                await asyncio.sleep(1)
                
    except Exception as e:
        print(f"Error connecting to WebSocket: {e}")

if __name__ == "__main__":
    asyncio.run(simulate_nail_biting_data())