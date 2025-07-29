# Nail Biting Detection System

A real-time webcam-based system that detects nail biting behavior using MediaPipe hand and face landmarks. The system provides instant visual feedback and tracks proximity between fingertips and mouth to help users build awareness of their nail biting habits.

## Features

### 🎯 Real-Time Detection
- **MediaPipe Integration**: Uses Google's MediaPipe for accurate hand and face landmark detection
- **Proximity Monitoring**: Calculates distance between fingertips and mouth in real-time
- **Multi-Hand Support**: Tracks both hands simultaneously and finds shortest distance

### 📊 ECG-Style Monitoring
- **3-Second Windows**: Chart displays data in 3-second cycles that refresh left-to-right
- **Fixed Scale**: Y-axis locked at 0-400px for consistent monitoring
- **Real-Time Visualization**: Distance tracking with smooth animations

### 🎛️ Interactive Controls
- **Modern Switch UI**: Toggle camera and landmark visibility with sleek switches
- **Landmark Visualization**: Optional overlay showing hand landmarks and face center
- **Adjustable Display**: Hide/show tracking dots while maintaining detection

### 🚨 Visual Feedback System
- **Background Color Changes**: Entire page background changes based on proximity status
  - 🟢 **Safe**: Light green background (>100px distance)
  - 🟡 **Warning**: Light yellow background (50-100px distance)  
  - 🔴 **Danger**: Light red background (<50px distance)
- **Status Light**: Real-time indicator showing current proximity level
- **Smooth Transitions**: 0.5s fade animations between status changes

### 📈 Performance Monitoring
- **FPS Display**: Real-time frame rate monitoring
- **GPU Acceleration**: Optimized MediaPipe processing with hardware acceleration
- **Efficient Processing**: ~60fps landmark detection with minimal CPU usage

## Technology Stack

### Frontend
- **TypeScript** - Type-safe JavaScript development
- **Vite** - Fast build tool and dev server
- **MediaPipe Tasks Vision** - Google's ML library for hand/face detection
- **Chart.js** - Real-time data visualization
- **Vanilla JavaScript** - No framework dependencies for maximum performance

### Backend (Optional)
- **FastAPI** - Modern Python web framework
- **WebSocket** - Real-time data logging and analytics
- **UV** - Fast Python package management

## Quick Start

### Prerequisites
- Modern web browser with webcam access
- Node.js 18+ and pnpm (for frontend)
- Python 3.13+ and uv (for optional backend)

### Frontend Setup
```bash
cd frontend
pnpm install
pnpm run dev
```
Access the application at `http://localhost:3000`

### Backend Setup (Optional)
```bash
cd fastapi-backend  
uv sync
uv run python main.py
```
Backend runs at `http://localhost:8000`

## Usage

1. **Start Detection**: Toggle the "Camera" switch to begin webcam capture
2. **Monitor Distance**: Watch the real-time chart showing fingertip-to-mouth distance
3. **Visual Feedback**: Notice background color changes as you bring hands near face
4. **Toggle Landmarks**: Use "Show Landmarks" switch to hide/show tracking dots
5. **Build Awareness**: Use the system to develop mindful habits around nail biting

## How It Works

### Detection Algorithm
1. **Webcam Capture**: Captures video stream at ~60fps
2. **Landmark Detection**: MediaPipe identifies 21 hand landmarks + 468 face landmarks
3. **Distance Calculation**: Computes Euclidean distance between all fingertips and mouth center
4. **Shortest Distance**: Tracks minimum distance across all detected fingertips
5. **Threshold Monitoring**: Triggers visual feedback based on proximity levels

### Positioning System
- **Offset Compensation**: Landmarks shifted +40px right and +180px down for accuracy
- **Real-Time Calibration**: Adapts to different webcam positions and user heights
- **Multi-Resolution Support**: Works across different camera resolutions

### Chart Behavior
- **ECG-Style Cycling**: 3-second windows that refresh and start from left
- **Fixed Timescale**: 0-3000ms X-axis with 500ms grid intervals
- **Continuous Monitoring**: Seamless data collection across chart refreshes

## Project Structure

```
webcam-inference/
├── frontend/                 # TypeScript/Vite frontend
│   ├── src/
│   │   ├── main.ts          # Main detection logic
│   │   ├── DistanceChart.ts # Chart.js visualization
│   │   └── config.ts        # Configuration management
│   ├── index.html           # UI layout and styling
│   └── package.json
├── fastapi-backend/         # Optional Python backend
│   ├── main.py             # FastAPI server with analytics
│   └── pyproject.toml
├── CLAUDE.md               # AI assistant context
└── README.md
```

## Configuration

### Detection Thresholds
- **Danger Zone**: < 50 pixels (triggers red background)
- **Warning Zone**: 50-100 pixels (triggers yellow background)  
- **Safe Zone**: > 100 pixels (triggers green background)

### Performance Settings
- **Detection Rate**: ~60fps landmark processing
- **Chart Update**: 10fps visualization updates
- **Buffer Size**: 300 data points maximum
- **Window Duration**: 3-second cycling display

## Privacy & Security

- **Client-Side Processing**: All AI detection runs locally in browser
- **No Data Upload**: Video never leaves your device
- **Optional Backend**: Data logging only if backend is enabled
- **Webcam Permissions**: Standard browser permission model

## Browser Compatibility

- **Chrome**: Full support with GPU acceleration
- **Firefox**: Full support with WebGL
- **Safari**: Full support on macOS
- **Edge**: Full support with hardware acceleration

## Development

### Adding Features
1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Make changes and test locally
4. Submit pull request with description

### Debugging
- Check browser console for MediaPipe errors
- Verify webcam permissions in browser settings
- Monitor FPS display for performance issues
- Use browser dev tools for network debugging

## Contributing

Contributions welcome! Please read the development guidelines and submit pull requests for:
- Performance improvements
- UI/UX enhancements  
- Additional detection features
- Bug fixes and optimizations

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- **Google MediaPipe** - Accurate hand and face detection
- **Chart.js Community** - Real-time visualization library
- **FastAPI Team** - High-performance Python web framework
- **Vite** - Lightning-fast build tool

---

*Built for helping users develop mindful awareness of nail biting habits through real-time visual feedback.*