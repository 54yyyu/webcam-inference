class WebcamStreamer {
    private videoElement: HTMLVideoElement;
    private stream: MediaStream | null = null;
    private websocket: WebSocket | null = null;
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private isStreaming = false;

    constructor() {
        this.videoElement = document.getElementById('videoElement') as HTMLVideoElement;
        this.canvas = document.createElement('canvas');
        this.context = this.canvas.getContext('2d')!;
        
        this.initializeEventListeners();
    }

    private initializeEventListeners(): void {
        const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
        const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
        const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
        const disconnectBtn = document.getElementById('disconnectBtn') as HTMLButtonElement;

        startBtn.addEventListener('click', () => this.startCamera());
        stopBtn.addEventListener('click', () => this.stopCamera());
        connectBtn.addEventListener('click', () => this.connectToBackend());
        disconnectBtn.addEventListener('click', () => this.disconnectFromBackend());
    }

    private async startCamera(): Promise<void> {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    width: { ideal: 640 }, 
                    height: { ideal: 480 },
                    facingMode: 'user'
                },
                audio: false
            });

            this.videoElement.srcObject = this.stream;
            
            const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
            const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
            const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;

            startBtn.disabled = true;
            stopBtn.disabled = false;
            connectBtn.disabled = false;

            this.updateStatus('Camera: On | Backend: Disconnected');
        } catch (error) {
            console.error('Error accessing camera:', error);
            alert('Error accessing camera. Please check permissions.');
        }
    }

    private stopCamera(): void {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        this.videoElement.srcObject = null;
        this.disconnectFromBackend();

        const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
        const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
        const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;

        startBtn.disabled = false;
        stopBtn.disabled = true;
        connectBtn.disabled = true;

        this.updateStatus('Camera: Off | Backend: Disconnected');
    }

    private connectToBackend(): void {
        try {
            this.websocket = new WebSocket('ws://localhost:8000/ws');
            
            this.websocket.onopen = () => {
                console.log('Connected to backend');
                this.updateStatus('Camera: On | Backend: Connected');
                this.startStreaming();
                
                const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
                const disconnectBtn = document.getElementById('disconnectBtn') as HTMLButtonElement;
                connectBtn.disabled = true;
                disconnectBtn.disabled = false;
            };

            this.websocket.onclose = () => {
                console.log('Disconnected from backend');
                this.updateStatus('Camera: On | Backend: Disconnected');
                this.stopStreaming();
                
                const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
                const disconnectBtn = document.getElementById('disconnectBtn') as HTMLButtonElement;
                connectBtn.disabled = false;
                disconnectBtn.disabled = true;
            };

            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                alert('Failed to connect to backend. Make sure the server is running on port 8000.');
            };

        } catch (error) {
            console.error('Error connecting to backend:', error);
            alert('Failed to connect to backend.');
        }
    }

    private disconnectFromBackend(): void {
        if (this.websocket) {
            this.stopStreaming();
            this.websocket.close();
            this.websocket = null;
        }

        const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
        const disconnectBtn = document.getElementById('disconnectBtn') as HTMLButtonElement;
        connectBtn.disabled = this.stream ? false : true;
        disconnectBtn.disabled = true;

        this.updateStatus('Camera: On | Backend: Disconnected');
    }

    private startStreaming(): void {
        if (!this.stream || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            return;
        }

        this.isStreaming = true;
        this.canvas.width = this.videoElement.videoWidth || 640;
        this.canvas.height = this.videoElement.videoHeight || 480;

        const sendFrame = () => {
            if (!this.isStreaming || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
                return;
            }

            this.context.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);
            
            this.canvas.toBlob((blob) => {
                if (blob && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    this.websocket.send(blob);
                }
            }, 'image/jpeg', 0.8);

            setTimeout(sendFrame, 100); // Send ~10 FPS
        };

        sendFrame();
    }

    private stopStreaming(): void {
        this.isStreaming = false;
    }

    private updateStatus(message: string): void {
        const statusElement = document.getElementById('status') as HTMLDivElement;
        statusElement.textContent = message;
        
        if (message.includes('Connected')) {
            statusElement.className = 'status connected';
        } else {
            statusElement.className = 'status disconnected';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new WebcamStreamer();
});