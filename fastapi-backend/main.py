from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import json
from datetime import datetime, timedelta
from typing import List
from dataclasses import dataclass, asdict
from collections import defaultdict

app = FastAPI(title="Nail-Biting Analytics API", description="API for logging and analyzing nail-biting behavior data")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@dataclass
class NailBitingEvent:
    timestamp: str
    distance: float
    confidence: float
    session_id: str
    event_type: str  # "approach", "contact", "retreat"

class DataStore:
    def __init__(self):
        self.events: List[NailBitingEvent] = []
        self.sessions: dict = defaultdict(list)
    
    def add_event(self, event: NailBitingEvent):
        self.events.append(event)
        self.sessions[event.session_id].append(event)
    
    def get_recent_events(self, hours: int = 24) -> List[NailBitingEvent]:
        cutoff = datetime.now() - timedelta(hours=hours)
        return [event for event in self.events 
                if datetime.fromisoformat(event.timestamp.replace('Z', '+00:00')) > cutoff]
    
    def get_session_events(self, session_id: str) -> List[NailBitingEvent]:
        return self.sessions.get(session_id, [])

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.data_store = DataStore()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"Client connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print(f"Client disconnected. Total connections: {len(self.active_connections)}")

    async def log_event(self, event_data: dict):
        """Log nail-biting event data"""
        try:
            event = NailBitingEvent(
                timestamp=event_data.get('timestamp', datetime.now().isoformat()),
                distance=float(event_data.get('distance', 0.0)),
                confidence=float(event_data.get('confidence', 0.0)),
                session_id=event_data.get('session_id', 'default'),
                event_type=event_data.get('event_type', 'unknown')
            )
            self.data_store.add_event(event)
            print(f"Logged event: {event.event_type} - distance: {event.distance:.2f}")
        except Exception as e:
            print(f"Error logging event: {e}")

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    
    try:
        while True:
            # Receive JSON data instead of binary image data
            data = await websocket.receive_text()
            
            try:
                event_data = json.loads(data)
                
                # Log the nail-biting event data
                await manager.log_event(event_data)
                
                # Send confirmation back to client
                response = {
                    "timestamp": datetime.now().isoformat(),
                    "status": "logged",
                    "message": "Event data logged successfully",
                    "event_type": event_data.get('event_type', 'unknown')
                }
                
                await websocket.send_text(json.dumps(response))
                
            except json.JSONDecodeError as e:
                error_response = {
                    "timestamp": datetime.now().isoformat(),
                    "status": "error",
                    "message": f"Invalid JSON data: {str(e)}"
                }
                await websocket.send_text(json.dumps(error_response))
                print(f"JSON decode error: {e}")
                
            except Exception as e:
                error_response = {
                    "timestamp": datetime.now().isoformat(),
                    "status": "error",
                    "message": f"Error processing event: {str(e)}"
                }
                await websocket.send_text(json.dumps(error_response))
                print(f"Error processing event: {e}")
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/")
async def root():
    return {
        "message": "Nail-Biting Analytics API is running", 
        "active_connections": len(manager.active_connections),
        "total_events_logged": len(manager.data_store.events)
    }

@app.get("/analytics/summary")
async def get_analytics_summary(hours: int = 24):
    """Get summary analytics for nail-biting behavior"""
    try:
        recent_events = manager.data_store.get_recent_events(hours)
        
        if not recent_events:
            return {
                "period_hours": hours,
                "total_events": 0,
                "event_breakdown": {},
                "average_distance": 0,
                "sessions": 0
            }
        
        # Calculate analytics
        event_breakdown = defaultdict(int)
        distances = []
        sessions = set()
        
        for event in recent_events:
            event_breakdown[event.event_type] += 1
            distances.append(event.distance)
            sessions.add(event.session_id)
        
        return {
            "period_hours": hours,
            "total_events": len(recent_events),
            "event_breakdown": dict(event_breakdown),
            "average_distance": sum(distances) / len(distances) if distances else 0,
            "min_distance": min(distances) if distances else 0,
            "max_distance": max(distances) if distances else 0,
            "sessions": len(sessions),
            "events_per_hour": len(recent_events) / hours
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating analytics: {str(e)}")

@app.get("/analytics/events")
async def get_recent_events(hours: int = 24, limit: int = 100):
    """Get recent nail-biting events"""
    try:
        recent_events = manager.data_store.get_recent_events(hours)
        
        # Limit results and convert to dict for JSON serialization
        limited_events = recent_events[-limit:] if len(recent_events) > limit else recent_events
        
        return {
            "events": [asdict(event) for event in limited_events],
            "total_in_period": len(recent_events),
            "returned": len(limited_events)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving events: {str(e)}")

@app.get("/analytics/session/{session_id}")
async def get_session_analytics(session_id: str):
    """Get analytics for a specific session"""
    try:
        session_events = manager.data_store.get_session_events(session_id)
        
        if not session_events:
            return {
                "session_id": session_id,
                "events": [],
                "summary": {
                    "total_events": 0,
                    "duration_minutes": 0,
                    "event_breakdown": {}
                }
            }
        
        # Calculate session analytics
        event_breakdown = defaultdict(int)
        timestamps = []
        
        for event in session_events:
            event_breakdown[event.event_type] += 1
            timestamps.append(datetime.fromisoformat(event.timestamp.replace('Z', '+00:00')))
        
        # Calculate session duration
        if len(timestamps) > 1:
            duration = (max(timestamps) - min(timestamps)).total_seconds() / 60
        else:
            duration = 0
        
        return {
            "session_id": session_id,
            "events": [asdict(event) for event in session_events],
            "summary": {
                "total_events": len(session_events),
                "duration_minutes": duration,
                "event_breakdown": dict(event_breakdown),
                "start_time": min(timestamps).isoformat() if timestamps else None,
                "end_time": max(timestamps).isoformat() if timestamps else None
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving session analytics: {str(e)}")

@app.delete("/analytics/clear")
async def clear_analytics_data():
    """Clear all stored analytics data"""
    try:
        manager.data_store.events.clear()
        manager.data_store.sessions.clear()
        return {"message": "Analytics data cleared successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clearing data: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)