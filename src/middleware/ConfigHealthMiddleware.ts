import { Request, Response, NextFunction } from 'express';
import { getConfigHealth } from '../appConfig';

export const configHealthMiddleware = (req: Request, res: Response, next: NextFunction) => {
    try {
        const health = getConfigHealth();
        
        if (health.status === 'unhealthy') {
            return res.status(503).json({
                error: 'Service Unavailable',
                message: 'Configuration not loaded',
                details: health
            });
        }
        
        // Add health info to request for monitoring
        (req as any).configHealth = health;
        next();
    } catch (error) {
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Configuration health check failed'
        });
    }
};
