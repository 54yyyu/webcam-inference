import { HandLandmarker, FaceLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';
import { DistanceChart } from './DistanceChart';

// LandmarkPoint interface removed - not used in current implementation

interface DetectionResult {
    shortestDistance: number;
    handsDetected: number;
    faceDetected: boolean;
    timestamp: number;
}

interface AlertEvent {
    type: 'warning' | 'danger';
    message: string;
    timestamp: number;
    distance: number;
    fingertip: string;
}

class NailBitingDetector {
    private videoElement: HTMLVideoElement;
    private stream: MediaStream | null = null;
    // Removed websocket - frontend-only detection
    private canvas: HTMLCanvasElement;
    private overlayCanvas: HTMLCanvasElement;
    private overlayContext: CanvasRenderingContext2D;
    private isDetecting = false;
    
    // MediaPipe components
    private handLandmarker: HandLandmarker | null = null;
    private faceLandmarker: FaceLandmarker | null = null;
    private drawingUtils: DrawingUtils | null = null;
    private vision: any = null;
    
    // Detection state
    private lastVideoTime = -1;
    private detectionResults: DetectionResult[] = [];
    private maxResults = 1800; // 30 seconds at 60fps
    
    // FPS tracking
    private frameCount = 0;
    private lastFpsTime = Date.now();
    private currentFps = 0;
    
    // Landmark visibility toggle
    private showLandmarks = true;
    
    // Chart integration
    private distanceChart!: DistanceChart;
    
    // Alert system
    private alerts: AlertEvent[] = [];
    private maxAlerts = 50;
    private lastAlertTime = 0;
    private alertCooldown = 2000; // 2 seconds between similar alerts
    
    // Statistics
    private sessionStartTime = 0;
    private detectionCount = 0;
    
    // Delight features
    private goodDistanceStreak = 0;
    private lastGoodDistanceTime = 0;
    private achievementMessages = [
        "You're doing amazing! Keep those hands happy!",
        "Fantastic mindfulness! Your awareness is growing!",
        "Beautiful self-care in action!",
        "You're building such healthy habits!",
        "This is what mindful living looks like!",
        "Your hands are thanking you!",
        "Such wonderful self-awareness!",
        "You're becoming more mindful every moment!"
    ];
    private encouragementMessages = [
        "Just a gentle reminder to give your hands some space",
        "Your hands might be getting a bit close - you've got this!",
        "Take a breath and let those hands relax",
        "Notice and release - you're doing great!",
        "A mindful moment to check in with yourself",
        "Gentle reminder: hands away, confidence up!"
    ];
    private lastEncouragementShown = 0;
    
    // Fingertip landmark indices (MediaPipe Hand model)
    private readonly fingertipIndices = {
        thumb: 4,
        index: 8,
        middle: 12,
        ring: 16,
        pinky: 20
    };
    
    // Face center approximation (nose tip)
    private readonly faceCenterIndex = 1; // Nose tip landmark
    
    // Distance thresholds (in pixels)
    private readonly thresholds = {
        warning: 100,  // 100 pixels
        danger: 50     // 50 pixels
    };

    constructor() {
        this.videoElement = document.getElementById('videoElement') as HTMLVideoElement;
        this.canvas = document.createElement('canvas');
        
        // Create overlay canvas for landmarks
        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.style.position = 'absolute';
        this.overlayCanvas.style.top = '0';
        this.overlayCanvas.style.left = '0';
        this.overlayCanvas.style.pointerEvents = 'none';
        this.overlayContext = this.overlayCanvas.getContext('2d')!;
        
        // Position overlay canvas on top of video
        this.videoElement.parentElement!.style.position = 'relative';
        this.videoElement.parentElement!.appendChild(this.overlayCanvas);
        
        // Initialize chart
        try {
            this.distanceChart = new DistanceChart('distanceChart');
            console.log('DistanceChart initialized successfully');
        } catch (error) {
            console.error('Failed to initialize distance chart:', error);
            alert('Failed to initialize chart. Please refresh the page.');
        }
        
        this.initializeEventListeners();
        
        // Update status to show loading
        this.updateStatus('Loading AI detection models...');
        
        // Initialize MediaPipe asynchronously
        this.initializeMediaPipe().then(() => {
            this.updateStatus('Ready - Click "Start Camera" to begin');
            
            // Update detection status
            const detectionStatus = document.getElementById('detectionStatus');
            if (detectionStatus) {
                detectionStatus.textContent = 'Ready';
                detectionStatus.className = 'detection-status inactive';
            }
        }).catch((error) => {
            console.error('MediaPipe initialization failed:', error);
            this.updateStatus('Model loading failed - Please refresh the page');
            
            // Disable start button
            const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
            if (startBtn) {
                startBtn.disabled = true;
                startBtn.textContent = 'Models Failed to Load';
            }
        });
    }
    
    private async initializeMediaPipe(): Promise<void> {
        try {
            console.log('Initializing MediaPipe...');
            this.updateStatus('Loading AI models...');
            
            // Initialize the MediaPipe Vision API
            console.log('Loading MediaPipe Vision API...');
            this.vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
            );
            console.log('MediaPipe Vision API loaded');
            
            // Create Hand Landmarker
            console.log('Loading Hand Landmarker model...');
            this.handLandmarker = await HandLandmarker.createFromOptions(this.vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                    delegate: 'CPU' // Use CPU instead of GPU for better compatibility
                },
                runningMode: 'VIDEO',
                numHands: 2,
                minHandDetectionConfidence: 0.5,
                minHandPresenceConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            console.log('Hand Landmarker loaded');
            
            // Create Face Landmarker
            console.log('Loading Face Landmarker model...');
            this.faceLandmarker = await FaceLandmarker.createFromOptions(this.vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'CPU' // Use CPU instead of GPU for better compatibility
                },
                runningMode: 'VIDEO',
                numFaces: 1,
                minFaceDetectionConfidence: 0.5,
                minFacePresenceConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            console.log('Face Landmarker loaded');
            
            // Initialize drawing utils
            this.drawingUtils = new DrawingUtils(this.overlayContext);
            
            console.log('MediaPipe initialized successfully');
            this.updateStatus('AI models loaded - Ready to start camera');
        } catch (error) {
            console.error('Failed to initialize MediaPipe:', error);
            
            let errorMessage = 'Failed to initialize AI models. ';
            if (error instanceof Error) {
                errorMessage += error.message;
            } else {
                errorMessage += 'Please check your internet connection and try again.';
            }
            
            alert(errorMessage);
            this.updateStatus('Model loading failed - ' + errorMessage);
        }
    }

    private initializeEventListeners(): void {
        const cameraSwitch = document.getElementById('cameraSwitch') as HTMLInputElement;
        const landmarkSwitch = document.getElementById('landmarkSwitch') as HTMLInputElement;

        cameraSwitch.addEventListener('change', () => {
            if (cameraSwitch.checked) {
                this.startCamera();
            } else {
                this.stopCamera();
            }
        });
        
        landmarkSwitch.addEventListener('change', () => {
            this.showLandmarks = landmarkSwitch.checked;
        });
        
        // Handle video resize for overlay canvas
        this.videoElement.addEventListener('loadedmetadata', () => {
            this.updateCanvasSize();
        });
        
        window.addEventListener('resize', () => {
            this.updateCanvasSize();
        });
    }
    
    private updateCanvasSize(): void {
        const rect = this.videoElement.getBoundingClientRect();
        this.overlayCanvas.width = rect.width;
        this.overlayCanvas.height = rect.height;
        this.overlayCanvas.style.width = rect.width + 'px';
        this.overlayCanvas.style.height = rect.height + 'px';
        
        // Canvas is only used for sizing reference
        this.canvas.width = this.videoElement.videoWidth || 640;
        this.canvas.height = this.videoElement.videoHeight || 480;
    }

    private async startCamera(): Promise<void> {
        try {
            console.log('Requesting camera access...');
            
            // Check if MediaPipe is initialized first
            if (!this.handLandmarker || !this.faceLandmarker) {
                console.log('MediaPipe not ready, waiting...');
                this.updateStatus('Loading detection models...');
                
                // Wait for MediaPipe to initialize
                let attempts = 0;
                while ((!this.handLandmarker || !this.faceLandmarker) && attempts < 10) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    attempts++;
                }
                
                if (!this.handLandmarker || !this.faceLandmarker) {
                    throw new Error('MediaPipe models failed to load. Please refresh the page.');
                }
            }
            
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    width: { ideal: 640 }, 
                    height: { ideal: 480 },
                    facingMode: 'user'
                },
                audio: false
            });

            this.videoElement.srcObject = this.stream;
            
            // Wait for video to load
            await new Promise<void>((resolve) => {
                this.videoElement.onloadeddata = () => {
                    console.log('Video loaded successfully');
                    this.updateCanvasSize();
                    resolve();
                };
            });
            
            const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
            // Camera is now on
            
            // Start detection immediately
            this.startDetection();
            this.sessionStartTime = Date.now();
            this.startSessionTimer();

            this.updateStatus('Camera: On | Detection: Active');
            this.showWelcomeMessage();
        } catch (error) {
            console.error('Error accessing camera:', error);
            
            let errorMessage = 'Error accessing camera. ';
            
            if (error instanceof Error) {
                if (error.name === 'NotAllowedError') {
                    errorMessage += 'Please allow camera access and refresh the page.';
                } else if (error.name === 'NotFoundError') {
                    errorMessage += 'No camera found. Please connect a camera and try again.';
                } else if (error.name === 'NotReadableError') {
                    errorMessage += 'Camera is already in use by another application.';
                } else {
                    errorMessage += error.message;
                }
            } else {
                errorMessage += 'Please check permissions and try again.';
            }
            
            alert(errorMessage);
            this.updateStatus('Camera access failed - ' + errorMessage);
        }
    }

    private stopCamera(): void {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        this.videoElement.srcObject = null;
        this.stopDetection();
        // No backend to disconnect from
        this.showSessionSummary();
        this.clearOverlay();
        this.distanceChart.clearData();
        this.clearAlerts();

        // Reset camera switch if stopped manually
        const cameraSwitch = document.getElementById('cameraSwitch') as HTMLInputElement;
        cameraSwitch.checked = false;

        this.updateStatus('Ready - Click Start Camera');
        this.goodDistanceStreak = 0;
        this.updateStreakDisplay();
    }
    
    private startDetection(): void {
        if (!this.handLandmarker || !this.faceLandmarker) {
            console.error('MediaPipe not initialized');
            return;
        }
        
        this.isDetecting = true;
        this.detectLoop();
    }
    
    private stopDetection(): void {
        this.isDetecting = false;
    }
    
    private async detectLoop(): Promise<void> {
        if (!this.isDetecting || !this.videoElement || this.videoElement.readyState < 2) {
            if (this.isDetecting) {
                requestAnimationFrame(() => this.detectLoop());
            }
            return;
        }
        
        const currentTime = this.videoElement.currentTime;
        
        // Only process if video time has changed
        if (currentTime !== this.lastVideoTime && this.handLandmarker && this.faceLandmarker) {
            this.lastVideoTime = currentTime;
            
            // Update FPS
            this.updateFPS();
            
            try {
                // Detect hands and face
                const handResults = this.handLandmarker.detectForVideo(this.videoElement, performance.now());
                const faceResults = this.faceLandmarker.detectForVideo(this.videoElement, performance.now());
                
                // Process results
                const detectionResult = this.processDetectionResults(handResults, faceResults);
                
                // Update visualizations
                this.drawLandmarks(handResults, faceResults);
                this.updateChart(detectionResult);
                this.checkAlerts(detectionResult);
                this.updateStatistics(detectionResult);
                
                // Store detection data locally for statistics
                this.logDetectionData(detectionResult);
                
            } catch (error) {
                console.error('Detection error:', error);
            }
        }
        
        if (this.isDetecting) {
            requestAnimationFrame(() => this.detectLoop());
        }
    }
    
    private processDetectionResults(handResults: any, faceResults: any): DetectionResult {
        const result: DetectionResult = {
            shortestDistance: 0,
            handsDetected: handResults.landmarks ? handResults.landmarks.length : 0,
            faceDetected: faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0,
            timestamp: Date.now()
        };
        
        // Calculate shortest distance if both hands and face are detected
        let shortestDistance = Infinity;
        if (result.handsDetected > 0 && result.faceDetected) {
            const faceLandmarks = faceResults.faceLandmarks[0];
            const faceCenter = faceLandmarks[this.faceCenterIndex];
            
            // Process each hand to find shortest distance
            for (let handIndex = 0; handIndex < handResults.landmarks.length; handIndex++) {
                const handLandmarks = handResults.landmarks[handIndex];
                
                // Check all fingertips for this hand
                for (const landmarkIndex of Object.values(this.fingertipIndices)) {
                    const fingertip = handLandmarks[landmarkIndex];
                    
                    // Calculate pixel distance with position offset
                    const fingertipX = (fingertip.x * this.overlayCanvas.width) + 40;
                    const fingertipY = (fingertip.y * this.overlayCanvas.height) + 180;
                    const faceCenterX = (faceCenter.x * this.overlayCanvas.width) + 40;
                    const faceCenterY = (faceCenter.y * this.overlayCanvas.height) + 180;
                    const dx = fingertipX - faceCenterX;
                    const dy = fingertipY - faceCenterY;
                    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (pixelDistance < shortestDistance) {
                        shortestDistance = pixelDistance;
                    }
                }
            }
        }
        
        result.shortestDistance = shortestDistance === Infinity ? 0 : shortestDistance;
        
        // Store result
        this.detectionResults.push(result);
        if (this.detectionResults.length > this.maxResults) {
            this.detectionResults.shift();
        }
        
        return result;
    }
    
    // Removed unused calculateEuclideanDistance method
    
    // Removed unused normalizedDistanceToCm method
    
    private drawLandmarks(handResults: any, faceResults: any): void {
        if (!this.drawingUtils) return;
        
        this.clearOverlay();
        
        // Skip drawing if landmarks are hidden
        if (!this.showLandmarks) return;
        
        const canvasWidth = this.overlayCanvas.width;
        const canvasHeight = this.overlayCanvas.height;
        
        // Draw hand landmarks
        if (handResults.landmarks) {
            for (const landmarks of handResults.landmarks) {
                // Draw connections
                this.drawingUtils.drawConnectors(
                    landmarks.map((l: any) => ({
                        x: (l.x * canvasWidth) + 80,
                        y: (l.y * canvasHeight) + 180
                    })),
                    HandLandmarker.HAND_CONNECTIONS,
                    { color: '#00FF00', lineWidth: 2 }
                );
                
                // Draw landmarks
                this.drawingUtils.drawLandmarks(
                    landmarks.map((l: any) => ({
                        x: (l.x * canvasWidth) + 80,
                        y: (l.y * canvasHeight) + 180
                    })),
                    { color: '#FF0000', radius: 3 }
                );
                
                // Highlight fingertips
                for (const fingertipIndex of Object.values(this.fingertipIndices)) {
                    const fingertip = landmarks[fingertipIndex];
                    this.overlayContext.beginPath();
                    this.overlayContext.arc(
                        (fingertip.x * canvasWidth) + 80,
                        (fingertip.y * canvasHeight) + 180,
                        3,
                        0,
                        2 * Math.PI
                    );
                    this.overlayContext.fillStyle = '#FFFF00';
                    this.overlayContext.fill();
                }
            }
        }
        
        // Draw face landmarks (just the center point)
        if (faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
            const faceLandmarks = faceResults.faceLandmarks[0];
            const faceCenter = faceLandmarks[this.faceCenterIndex];
            
            this.overlayContext.beginPath();
            this.overlayContext.arc(
                (faceCenter.x * canvasWidth) + 80,
                (faceCenter.y * canvasHeight) + 180,
                5,
                0,
                2 * Math.PI
            );
            this.overlayContext.fillStyle = '#00FFFF';
            this.overlayContext.fill();
            this.overlayContext.strokeStyle = '#0088FF';
            this.overlayContext.lineWidth = 2;
            this.overlayContext.stroke();
        }
    }
    
    private clearOverlay(): void {
        this.overlayContext.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }
    
    private updateChart(result: DetectionResult): void {
        if (result.shortestDistance > 0) {
            // Add single data point for shortest distance
            this.distanceChart.addDataPoint(result.shortestDistance, 'shortest');
        }
    }
    
    private checkAlerts(result: DetectionResult): void {
        const now = Date.now();
        let hasWarningDistance = false;
        let hasDangerDistance = false;
        
        const pixelDistance = result.shortestDistance;
        if (pixelDistance > 0) {
            if (pixelDistance <= this.thresholds.danger) {
                hasDangerDistance = true;
                this.updateStatusLight('danger');
                this.goodDistanceStreak = 0; // Reset streak
            } else if (pixelDistance <= this.thresholds.warning) {
                hasWarningDistance = true;
                this.updateStatusLight('warning');
            } else {
                this.updateStatusLight('safe');
            }
        } else {
            this.updateStatusLight('safe');
        }
        
        // Check for good distance streak
        if (!hasWarningDistance && !hasDangerDistance && result.shortestDistance > 0) {
            this.maintainGoodDistanceStreak(now);
        }
    }
    
    private addAlert(alert: AlertEvent): void {
        this.alerts.push(alert);
        if (this.alerts.length > this.maxAlerts) {
            this.alerts.shift();
        }
        
        this.displayAlert(alert);
        
        if (alert.type === 'danger') {
            this.detectionCount++;
        }
    }
    
    private displayAlert(alert: AlertEvent): void {
        const alertsList = document.getElementById('alertsList');
        if (!alertsList) return;
        
        const alertElement = document.createElement('div');
        alertElement.className = `alert-item alert-${alert.type}`;
        
        // Create friendly message with emoji
        const emoji = alert.type === 'danger' ? '🤗' : '💙';
        alertElement.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 20px;">${emoji}</span>
                <div>
                    <div style="font-weight: 600; margin-bottom: 2px;">${alert.message}</div>
                    <div style="font-size: 12px; opacity: 0.7;">${new Date(alert.timestamp).toLocaleTimeString()}</div>
                </div>
            </div>
        `;
        
        alertsList.insertBefore(alertElement, alertsList.firstChild);
        
        // Add entrance animation
        alertElement.style.transform = 'translateX(-100%) scale(0.8)';
        alertElement.style.opacity = '0';
        setTimeout(() => {
            alertElement.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
            alertElement.style.transform = 'translateX(0) scale(1)';
            alertElement.style.opacity = '1';
        }, 10);
        
        // Remove old alerts
        while (alertsList.children.length > 6) {
            const lastChild = alertsList.lastChild as HTMLElement;
            lastChild.style.transition = 'all 0.3s ease-out';
            lastChild.style.transform = 'translateX(100%) scale(0.8)';
            lastChild.style.opacity = '0';
            setTimeout(() => {
                if (lastChild.parentNode) {
                    lastChild.parentNode.removeChild(lastChild);
                }
            }, 300);
        }
        
        // Auto-remove after 12 seconds with animation
        setTimeout(() => {
            if (alertElement.parentNode) {
                alertElement.style.transition = 'all 0.3s ease-out';
                alertElement.style.transform = 'translateX(100%) scale(0.8)';
                alertElement.style.opacity = '0';
                setTimeout(() => {
                    if (alertElement.parentNode) {
                        alertElement.parentNode.removeChild(alertElement);
                    }
                }, 300);
            }
        }, 12000);
    }
    
    private clearAlerts(): void {
        this.alerts = [];
        const alertsList = document.getElementById('alertsList');
        if (alertsList) {
            alertsList.innerHTML = '';
        }
    }
    
    private updateStatistics(_result: DetectionResult): void {
        // Update detection count
        const detectionCountEl = document.getElementById('detectionCount');
        if (detectionCountEl) {
            detectionCountEl.textContent = this.detectionCount.toString();
        }
        
        // Update average distance
        const avgDistance = this.distanceChart.getAverageDistance(5000);
        const avgDistanceEl = document.getElementById('avgDistance');
        if (avgDistanceEl) {
            avgDistanceEl.textContent = avgDistance ? `${avgDistance.toFixed(0)} px` : '--';
        }
    }
    
    private startSessionTimer(): void {
        const updateTimer = () => {
            if (this.sessionStartTime === 0) return;
            
            const elapsed = Date.now() - this.sessionStartTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            
            const sessionTimeEl = document.getElementById('sessionTime');
            if (sessionTimeEl) {
                sessionTimeEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            
            if (this.isDetecting) {
                setTimeout(updateTimer, 1000);
            }
        };
        
        updateTimer();
    }

    // Removed all backend connection methods - frontend only
    
    private updateStatusLight(status: 'safe' | 'warning' | 'danger'): void {
        const statusElement = document.getElementById('detectionStatus');
        if (!statusElement) return;
        
        // Remove all status classes
        statusElement.classList.remove('safe', 'warning', 'danger');
        
        // Add current status
        statusElement.classList.add(status);
        
        // Update background color of entire page
        const body = document.body;
        
        // Update text and background
        switch (status) {
            case 'safe':
                statusElement.textContent = '● Safe Distance';
                body.style.backgroundColor = '#f0f8f0'; // Light green
                break;
            case 'warning':
                statusElement.textContent = '● Getting Close';
                body.style.backgroundColor = '#fff8e1'; // Light yellow
                break;
            case 'danger':
                statusElement.textContent = '● Too Close!';
                body.style.backgroundColor = '#ffebee'; // Light red
                break;
        }
    }
    
    private updateFPS(): void {
        this.frameCount++;
        const now = Date.now();
        
        if (now - this.lastFpsTime >= 1000) { // Update every second
            this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
            this.frameCount = 0;
            this.lastFpsTime = now;
            
            // Update FPS display
            const fpsElement = document.getElementById('fpsDisplay');
            if (fpsElement) {
                fpsElement.textContent = `${this.currentFps} FPS`;
            }
        }
    }
    
    // Landmark toggle now handled by switch event listener

    private updateStatus(message: string): void {
        const statusElement = document.getElementById('status') as HTMLDivElement;
        
        // Add a gentle fade transition
        statusElement.style.transition = 'all 0.3s ease';
        statusElement.style.opacity = '0.5';
        
        setTimeout(() => {
            statusElement.textContent = message;
            statusElement.style.opacity = '1';
            
            if (message.includes('Connected') || message.includes('Active')) {
                statusElement.className = 'status connected';
            } else {
                statusElement.className = 'status disconnected';
            }
        }, 150);
    }
    
    private showWelcomeMessage(): void {
        const encouragementBox = document.getElementById('encouragementBox');
        const encouragementText = document.getElementById('encouragementText');
        
        if (encouragementBox && encouragementText) {
            encouragementText.textContent = "Welcome! Let's practice mindful awareness together";
            encouragementBox.style.display = 'block';
            encouragementBox.style.background = 'linear-gradient(135deg, #e8f5e8 0%, #f0f8f0 100%)';
            
            setTimeout(() => {
                encouragementBox.style.display = 'none';
            }, 4000);
        }
    }
    
    private getRandomEncouragementMessage(): string {
        return this.encouragementMessages[Math.floor(Math.random() * this.encouragementMessages.length)];
    }
    
    private maintainGoodDistanceStreak(now: number): void {
        if (now - this.lastGoodDistanceTime > 1000) { // Count every second of good distance
            this.goodDistanceStreak++;
            this.lastGoodDistanceTime = now;
            
            // Show achievements at certain milestones
            if (this.goodDistanceStreak === 30) { // 30 seconds
                this.showAchievement("30 seconds of mindful awareness! 🌟");
            } else if (this.goodDistanceStreak === 60) { // 1 minute
                this.showAchievement("One full minute of great habits! 🎆");
            } else if (this.goodDistanceStreak === 300) { // 5 minutes
                this.showAchievement("5 minutes of excellence! You're on fire! 🔥");
            } else if (this.goodDistanceStreak % 600 === 0 && this.goodDistanceStreak > 0) { // Every 10 minutes
                this.showAchievement(`${this.goodDistanceStreak / 60} minutes of mindful mastery! 🏆`);
            }
            
            this.updateStreakDisplay();
        }
    }
    
    private showAchievement(message: string): void {
        const encouragementBox = document.getElementById('encouragementBox');
        const encouragementText = document.getElementById('encouragementText');
        
        if (encouragementBox && encouragementText) {
            encouragementText.textContent = message;
            encouragementBox.style.display = 'block';
            encouragementBox.style.background = 'linear-gradient(135deg, #fff9c4 0%, #f7d794 100%)';
            encouragementBox.style.animation = 'celebrationShimmer 1.5s ease-in-out';
            
            // Add confetti effect (simple version)
            this.createConfettiEffect();
            
            setTimeout(() => {
                encouragementBox.style.display = 'none';
                encouragementBox.style.animation = '';
            }, 5000);
        }
    }
    
    private createConfettiEffect(): void {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b', '#eb4d4b'];
        const container = document.querySelector('.container');
        
        if (!container) return;
        
        for (let i = 0; i < 20; i++) {
            const confetti = document.createElement('div');
            confetti.style.position = 'absolute';
            confetti.style.width = '10px';
            confetti.style.height = '10px';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.borderRadius = '50%';
            confetti.style.pointerEvents = 'none';
            confetti.style.zIndex = '1000';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.top = '20px';
            confetti.style.animation = `confettiFall ${1 + Math.random() * 2}s ease-out forwards`;
            
            container.appendChild(confetti);
            
            setTimeout(() => {
                if (confetti.parentNode) {
                    confetti.parentNode.removeChild(confetti);
                }
            }, 3000);
        }
        
        // Add confetti animation if not already present
        if (!document.querySelector('#confetti-style')) {
            const style = document.createElement('style');
            style.id = 'confetti-style';
            style.textContent = `
                @keyframes confettiFall {
                    0% {
                        transform: translateY(0) rotate(0deg);
                        opacity: 1;
                    }
                    100% {
                        transform: translateY(300px) rotate(360deg);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    private updateStreakDisplay(): void {
        const streakDisplay = document.getElementById('streakDisplay');
        const streakCounter = document.getElementById('streakCounter');
        
        if (streakDisplay && streakCounter && this.goodDistanceStreak >= 10) {
            const minutes = Math.floor(this.goodDistanceStreak / 60);
            const seconds = this.goodDistanceStreak % 60;
            
            let timeText = '';
            if (minutes > 0) {
                timeText = `${minutes}m ${seconds}s`;
            } else {
                timeText = `${seconds}s`;
            }
            
            streakCounter.textContent = `${timeText} of mindful awareness!`;
            streakDisplay.style.display = 'block';
        } else if (streakDisplay && this.goodDistanceStreak < 10) {
            streakDisplay.style.display = 'none';
        }
    }
    
    private showSessionSummary(): void {
        if (this.sessionStartTime === 0) return;
        
        const sessionDuration = Math.floor((Date.now() - this.sessionStartTime) / 1000);
        const minutes = Math.floor(sessionDuration / 60);
        const seconds = sessionDuration % 60;
        
        let summaryMessage = '';
        if (sessionDuration < 30) {
            summaryMessage = "Thanks for practicing mindful awareness!";
        } else if (sessionDuration < 120) {
            summaryMessage = `Great ${minutes > 0 ? minutes + 'm ' + seconds + 's' : seconds + 's'} session! You're building healthy habits.`;
        } else {
            summaryMessage = `Amazing ${minutes}m ${seconds}s of mindful practice! Your dedication is inspiring.`;
        }
        
        const encouragementBox = document.getElementById('encouragementBox');
        const encouragementText = document.getElementById('encouragementText');
        
        if (encouragementBox && encouragementText) {
            encouragementText.textContent = summaryMessage;
            encouragementBox.style.display = 'block';
            encouragementBox.style.background = 'linear-gradient(135deg, #e8f5e8 0%, #c8e6c9 100%)';
            encouragementBox.style.animation = 'celebrationShimmer 1.5s ease-in-out';
            
            setTimeout(() => {
                encouragementBox.style.display = 'none';
                encouragementBox.style.animation = '';
            }, 6000);
        }
        
        this.sessionStartTime = 0;
        this.goodDistanceStreak = 0;
    }

    private logDetectionData(result: DetectionResult): void {
        // Log detection results locally for debugging
        if (result.shortestDistance > 0) {
            console.log('Shortest distance:', result.shortestDistance);
        }
    }
    
    public cleanup(): void {
        this.stopCamera();
        this.distanceChart.destroy();
        
        if (this.handLandmarker) {
            this.handLandmarker.close();
        }
        if (this.faceLandmarker) {
            this.faceLandmarker.close();
        }
        
        if (this.overlayCanvas.parentNode) {
            this.overlayCanvas.parentNode.removeChild(this.overlayCanvas);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        const detector = new NailBitingDetector();
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            detector.cleanup();
        });
        
        console.log('Nail Biting Detector initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Nail Biting Detector:', error);
        
        // Show error message to user
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = 'Initialization failed. Please refresh the page.';
            statusElement.className = 'status disconnected';
        }
        
        // Disable start button
        const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.textContent = 'Initialization Failed';
        }
    }
});