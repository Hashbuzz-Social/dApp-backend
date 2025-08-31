export class ConfigMetrics {
    private static accessCount = 0;
    private static lastAccess: Date | null = null;
    private static loadFailures = 0;
    private static loadSuccesses = 0;
    private static avgLoadTime = 0;
    private static totalLoadTime = 0;

    static recordAccess(): void {
        this.accessCount++;
        this.lastAccess = new Date();
    }

    static recordLoadFailure(): void {
        this.loadFailures++;
    }

    static recordLoadSuccess(loadTimeMs: number): void {
        this.loadSuccesses++;
        this.totalLoadTime += loadTimeMs;
        this.avgLoadTime = this.totalLoadTime / this.loadSuccesses;
    }

    static getMetrics() {
        return {
            totalAccess: this.accessCount,
            lastAccess: this.lastAccess,
            loadFailures: this.loadFailures,
            loadSuccesses: this.loadSuccesses,
            avgLoadTimeMs: Math.round(this.avgLoadTime),
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            nodeVersion: process.version
        };
    }

    static reset(): void {
        this.accessCount = 0;
        this.lastAccess = null;
        this.loadFailures = 0;
        this.loadSuccesses = 0;
        this.avgLoadTime = 0;
        this.totalLoadTime = 0;
    }

    static getHealthScore(): number {
        if (this.loadSuccesses === 0) return 0;
        const successRate = this.loadSuccesses / (this.loadSuccesses + this.loadFailures);
        const performanceScore = this.avgLoadTime < 1000 ? 1 : Math.max(0, 1 - (this.avgLoadTime - 1000) / 5000);
        return Math.round((successRate * 0.7 + performanceScore * 0.3) * 100);
    }
}
