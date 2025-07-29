import {
    Chart,
    ChartConfiguration,
    ChartData,
    ChartOptions,
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    TimeScale,
    CategoryScale,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import 'chartjs-adapter-date-fns';

// Register Chart.js components
Chart.register(
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    TimeScale,
    CategoryScale,
    Title,
    Tooltip,
    Legend,
    Filler
);

interface DistanceDataPoint {
    timestamp: number;
    distance: number;
    fingertip?: string;
    confidence: number;
}

interface ThresholdConfig {
    safe: number;        // Green zone - safe distance
    warning: number;     // Yellow zone - approaching
    danger: number;      // Red zone - potential nail biting
}

export class DistanceChart {
    private chart!: Chart;
    private canvas: HTMLCanvasElement;
    private dataBuffer: Map<string, DistanceDataPoint[]> = new Map();
    private chartStartTime = Date.now();
    private readonly CHART_DURATION = 3000; // 3 seconds
    private readonly maxDataPoints = 1800; // 30 seconds at 60fps
    private readonly updateInterval = 100; // Update chart every 100ms (10fps)
    private lastUpdate = 0;
    
    private readonly thresholds: ThresholdConfig = {
        safe: 20,      // 20cm
        warning: 12,   // 12cm
        danger: 8      // 8cm
    };

    private readonly colors = {
        safe: '#4caf50',      // Gentle green
        warning: '#ff9800',   // Warm orange
        danger: '#f44336',    // Soft red
        grid: 'rgba(0,0,0,0.05)',
        text: '#666',
        safeBg: 'rgba(76, 175, 80, 0.1)',
        warningBg: 'rgba(255, 152, 0, 0.1)',
        dangerBg: 'rgba(244, 67, 54, 0.1)'
    };

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas element with id '${canvasId}' not found`);
        }

        this.initializeChart();
        this.setupResizeHandler();
    }

    private initializeChart(): void {
        try {
            const config: ChartConfiguration<'line'> = {
                type: 'line',
                data: this.createInitialData(),
                options: this.createChartOptions()
            };

            this.chart = new Chart(this.canvas, config);
            console.log('Chart.js initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Chart.js:', error);
            throw new Error('Chart initialization failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
    }

    private createInitialData(): ChartData<'line'> {
        return {
            datasets: [
                {
                    label: 'Distance',
                    data: [],
                    borderColor: '#007bff',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 2,
                    pointHoverRadius: 4,
                    pointBackgroundColor: '#007bff',
                    pointBorderColor: '#007bff',
                    tension: 0.1,
                    fill: false,
                    showLine: true
                }
            ]
        };
    }

    private createChartOptions(): ChartOptions<'line'> {
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 300,
                easing: 'easeInOutCubic'
            },
            elements: {
                line: {
                    tension: 0.4
                },
                point: {
                    radius: 0,
                    hoverRadius: 6,
                    hitRadius: 8
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Time (ms)',
                        color: this.colors.text
                    },
                    grid: {
                        color: this.colors.grid
                    },
                    min: 0,
                    max: 3000,
                    ticks: {
                        stepSize: 500,
                        callback: function(value) {
                            return value + 'ms';
                        }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Distance (px)',
                        color: this.colors.text
                    },
                    min: 0,
                    max: 400,
                    grid: {
                        color: this.colors.grid
                    },
                    ticks: {
                        stepSize: 50,
                        callback: function(value) {
                            return value + ' px';
                        }
                    }
                }
            },
            plugins: {
                title: {
                    display: false
                },
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        filter: (legendItem) => {
                            // Only show the main distance line in legend
                            return legendItem.text === 'Shortest Distance';
                        },
                        usePointStyle: true,
                        pointStyle: 'line'
                    }
                },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        title: (context) => {
                            return new Date(context[0].parsed.x).toLocaleTimeString();
                        },
                        label: (context) => {
                            if (context.datasetIndex === 0) {
                                const distance = context.parsed.y.toFixed(0);
                                const status = this.getDistanceStatus(context.parsed.y);
                                return `Distance: ${distance} px (${status})`;
                            }
                            return '';
                        }
                    }
                }
            }
        };
    }

    private getDistanceStatus(distance: number): string {
        if (distance >= this.thresholds.safe) return 'Safe';
        if (distance >= this.thresholds.warning) return 'Approaching';
        return 'Danger';
    }

    private getDistanceColor(distance: number): string {
        if (distance >= this.thresholds.safe) return this.colors.safe;
        if (distance >= this.thresholds.warning) return this.colors.warning;
        return this.colors.danger;
    }

    public addDataPoint(distance: number, fingertip: string = 'default', confidence: number = 1.0): void {
        const now = Date.now();
        const dataPoint: DistanceDataPoint = {
            timestamp: now,
            distance,
            fingertip,
            confidence
        };

        // Add to buffer
        if (!this.dataBuffer.has(fingertip)) {
            this.dataBuffer.set(fingertip, []);
        }
        
        const buffer = this.dataBuffer.get(fingertip)!;
        buffer.push(dataPoint);

        // Limit buffer size
        if (buffer.length > this.maxDataPoints) {
            buffer.shift();
        }

        // Throttle chart updates for performance
        if (now - this.lastUpdate > this.updateInterval) {
            this.updateChart();
            this.lastUpdate = now;
        }
    }

    private updateChart(): void {
        const now = Date.now();
        const thirtySecondsAgo = now - 30000;

        // Get all data points from the primary fingertip (or default)
        const primaryFingertip = this.dataBuffer.has('index') ? 'index' : 
                                this.dataBuffer.has('default') ? 'default' : 
                                this.dataBuffer.keys().next().value;

        if (!primaryFingertip) return;

        const recentData = this.dataBuffer.get(primaryFingertip)!
            .map(point => ({
                x: point.timestamp - this.chartStartTime, // Relative time (0-3000ms)
                y: point.distance
            }))
            .filter(point => point.x >= 0 && point.x <= this.CHART_DURATION);

        // Update main distance line
        this.chart.data.datasets[0].data = recentData;
        
        // Update line color based on most recent distance
        if (recentData.length > 0) {
            const latestDistance = recentData[recentData.length - 1].y;
            const color = this.getDistanceColor(latestDistance);
            this.chart.data.datasets[0].borderColor = color;
            this.chart.data.datasets[0].backgroundColor = color + '20';
        }

        // No threshold lines needed - just one dataset

        // ECG-style: Check if we need to refresh the chart
        const timeElapsed = now - this.chartStartTime;
        if (timeElapsed > this.CHART_DURATION) {
            // Reset chart - start from left again
            this.chartStartTime = now;
            this.dataBuffer.clear();
            this.chart.data.datasets[0].data = [];
        }
        
        // Update time window to show current 3-second frame
        this.chart.options.scales!.x!.min = 0;
        this.chart.options.scales!.x!.max = this.CHART_DURATION;

        this.chart.update('active'); // Smooth animations for delightful experience
    }

    public addMultipleDataPoints(distances: { [fingertip: string]: { distance: number; confidence: number } }): void {
        for (const [fingertip, data] of Object.entries(distances)) {
            this.addDataPoint(data.distance, fingertip, data.confidence);
        }
    }

    public getCurrentStatus(): { status: string; distance: number; color: string } | null {
        const primaryFingertip = this.dataBuffer.has('index') ? 'index' : 
                                this.dataBuffer.has('default') ? 'default' : 
                                this.dataBuffer.keys().next().value;

        if (!primaryFingertip) return null;

        const buffer = this.dataBuffer.get(primaryFingertip)!;
        if (buffer.length === 0) return null;

        const latest = buffer[buffer.length - 1];
        return {
            status: this.getDistanceStatus(latest.distance),
            distance: latest.distance,
            color: this.getDistanceColor(latest.distance)
        };
    }

    public setThresholds(thresholds: Partial<ThresholdConfig>): void {
        Object.assign(this.thresholds, thresholds);
        this.updateChart();
    }

    public getThresholds(): ThresholdConfig {
        return { ...this.thresholds };
    }

    public clearData(): void {
        this.dataBuffer.clear();
        this.chart.data.datasets.forEach(dataset => {
            dataset.data = [];
        });
        this.chart.update();
    }

    public getAverageDistance(timeWindow: number = 5000): number | null {
        const now = Date.now();
        const windowStart = now - timeWindow;
        
        let totalDistance = 0;
        let count = 0;

        for (const buffer of this.dataBuffer.values()) {
            const recentPoints = buffer.filter(point => point.timestamp >= windowStart);
            for (const point of recentPoints) {
                totalDistance += point.distance;
                count++;
            }
        }

        return count > 0 ? totalDistance / count : null;
    }

    private setupResizeHandler(): void {
        const resizeObserver = new ResizeObserver(() => {
            this.chart.resize();
        });
        
        resizeObserver.observe(this.canvas.parentElement!);
    }

    public destroy(): void {
        this.chart.destroy();
        this.dataBuffer.clear();
    }
}