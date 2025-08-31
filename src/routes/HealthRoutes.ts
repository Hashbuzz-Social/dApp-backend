import { Router, Request, Response } from 'express';
import { getConfigHealth, refreshConfig } from '../appConfig';
import { ConfigMetrics } from '../monitoring/ConfigMetrics';

const router = Router();

// Health check endpoint
router.get('/health', (req: Request, res: Response): void => {
    try {
        const configHealth = getConfigHealth();
        const metrics = ConfigMetrics.getMetrics();
        const healthScore = ConfigMetrics.getHealthScore();

        const overallHealth = {
            status: configHealth.status === 'healthy' && healthScore > 70 ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            services: {
                configuration: configHealth,
                metrics: {
                    healthScore,
                    ...metrics
                }
            }
        };

        const statusCode = overallHealth.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(overallHealth);
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: 'Health check failed',
            timestamp: new Date().toISOString()
        });
    }
});

// Configuration refresh endpoint (for admin use)
router.post('/admin/config/refresh', (req: Request, res: Response): void => {
    const refreshConfigAsync = async (): Promise<void> => {
        try {
            const startTime = Date.now();
            await refreshConfig();
            const loadTime = Date.now() - startTime;
            
            ConfigMetrics.recordLoadSuccess(loadTime);
            
            res.json({
                message: 'Configuration refreshed successfully',
                loadTimeMs: loadTime,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            ConfigMetrics.recordLoadFailure();
            res.status(500).json({
                error: 'Configuration refresh failed',
                message: (error as Error).message,
                timestamp: new Date().toISOString()
            });
        }
    };
    
    refreshConfigAsync().catch(error => {
        ConfigMetrics.recordLoadFailure();
        res.status(500).json({
            error: 'Configuration refresh failed',
            message: (error as Error).message,
            timestamp: new Date().toISOString()
        });
    });
});

// Metrics endpoint
router.get('/metrics', (req: Request, res: Response): void => {
    try {
        const metrics = ConfigMetrics.getMetrics();
        res.json({
            ...metrics,
            healthScore: ConfigMetrics.getHealthScore(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: 'Metrics collection failed',
            timestamp: new Date().toISOString()
        });
    }
});

export default router;
