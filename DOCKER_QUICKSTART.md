# HashBuzz dApp Backend - Docker Quick Start Guide

This guide will help you get the HashBuzz dApp backend running quickly using Docker Compose.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose v2.0+
- At least 4GB RAM available
- At least 10GB disk space

## Quick Start (Development)

1. **Clone and navigate to the backend directory:**

   ```bash
   cd /path/to/hashbuzz/dApp-backend
   ```

2. **Create environment file:**

   ```bash
   cp .env.example .env
   ```

3. **Edit the .env file and configure these minimum required values:**

   ```bash
   # Database password
   POSTGRES_PASSWORD=your_secure_password_here

   # JWT secrets (generate random strings)
   JWT_SECRET=your-super-secret-jwt-key-minimum-256-bits-long
   SESSION_SECRET=your-session-secret-key-here

   # Email configuration for alerts
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password
   ALERT_RECEIVER=admin@yourdomain.com
   ```

4. **Start the development environment:**

   ```bash
   docker compose --profile dev up -d
   ```

5. **Verify everything is running:**

   ```bash
   docker compose ps
   ```

6. **Access the application:**
   - API: http://localhost:4000
   - API Health: http://localhost:4000/health
   - Prisma Studio: http://localhost:5555
   - API Documentation: http://localhost:4000/api-docs (if available)

## Full Production Setup

1. **Start with monitoring and backup:**

   ```bash
   docker compose --profile monitoring --profile backup up -d
   ```

2. **Access monitoring dashboards:**
   - Grafana: http://localhost:3001 (admin / configured password)
   - Prometheus: http://localhost:9090

## Available Profiles

- **default**: Core services (API, Database, Cache)
- **dev**: Development tools (Prisma Studio, Debug port)
- **monitoring**: Monitoring stack (Prometheus, Grafana, Loki)
- **backup**: Automated database backup service
- **proxy**: Nginx reverse proxy with SSL

## Useful Commands

### Basic Operations

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# View logs
docker compose logs -f

# View logs for specific service
docker compose logs -f api

# Restart a service
docker compose restart api
```

### Development Commands

```bash
# Start development environment
docker compose --profile dev up -d

# Access the API container
docker compose exec api sh

# Run database migrations
docker compose exec api yarn prisma migrate deploy

# Generate Prisma client
docker compose exec api yarn prisma generate

# View database in Prisma Studio
open http://localhost:5555
```

### Monitoring Commands

```bash
# Start with monitoring
docker compose --profile monitoring up -d

# View Grafana dashboards
open http://localhost:3001

# View Prometheus metrics
open http://localhost:9090

# Check container health
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"
```

### Backup Commands

```bash
# Start backup service
docker compose --profile backup up -d

# Manual backup
docker compose exec backup /backup.sh

# Restore from backup
docker compose exec backup /restore.sh /backups/backup-YYYYMMDD-HHMMSS.sql
```

### Utility Commands

```bash
# Clean up everything (DESTRUCTIVE!)
docker compose down -v --remove-orphans

# Update images
docker compose pull

# Rebuild services
docker compose build --no-cache

# Check resource usage
docker stats

# View container sizes
docker images | grep hashbuzz
```

## Environment Configuration

### Critical Environment Variables

```bash
# Database
POSTGRES_PASSWORD=           # Strong password for PostgreSQL
DATABASE_URL=               # Auto-configured for Docker

# Security
JWT_SECRET=                 # 256-bit random string
SESSION_SECRET=             # Random string for sessions

# Hedera Configuration
HEDERA_NETWORK=testnet      # or mainnet
HEDERA_ACCOUNT_ID=          # Your Hedera account
HEDERA_PRIVATE_KEY=         # Your private key

# Social APIs
TWITTER_API_KEY=            # Twitter API credentials
TWITTER_API_SECRET=
TWITTER_BEARER_TOKEN=

# Email Alerts
EMAIL_USER=                 # Gmail account
EMAIL_PASS=                 # App password
ALERT_RECEIVER=             # Space-separated email list
```

### Port Mapping

| Service       | Internal | External | Description      |
| ------------- | -------- | -------- | ---------------- |
| API           | 4000     | 4000     | Main application |
| PostgreSQL    | 5432     | 5432     | Database         |
| Redis         | 6379     | 6379     | Cache            |
| Prisma Studio | 5555     | 5555     | DB browser (dev) |
| Prometheus    | 9090     | 9090     | Metrics          |
| Grafana       | 3000     | 3001     | Dashboards       |
| Nginx         | 80/443   | 80/443   | Reverse proxy    |

## Troubleshooting

### Common Issues

1. **Port conflicts:**

   ```bash
   # Check what's using a port
   sudo lsof -i :4000

   # Change ports in .env file
   API_PORT=4001
   ```

2. **Database connection issues:**

   ```bash
   # Check database logs
   docker compose logs postgres

   # Restart database
   docker compose restart postgres
   ```

3. **Permission issues:**

   ```bash
   # Fix file permissions
   sudo chown -R $USER:$USER ./logs ./public
   ```

4. **Memory issues:**

   ```bash
   # Check memory usage
   docker stats

   # Adjust resource limits in docker-compose.yml
   ```

### Health Checks

All services include health checks. Check status:

```bash
# View health status
docker compose ps

# Check specific service health
docker compose exec api curl http://localhost:4000/health
```

### Logs and Debugging

```bash
# View all logs
docker compose logs -f

# View logs with timestamps
docker compose logs -f -t

# View only error logs
docker compose logs -f | grep -i error

# Follow logs for specific service
docker compose logs -f api

# View last 100 lines
docker compose logs --tail=100 api
```

## Performance Optimization

### Resource Limits

The docker-compose.yml includes resource limits:

```yaml
deploy:
  resources:
    limits:
      memory: 512M # Adjust based on your needs
      cpus: '0.5' # Adjust based on your needs
```

### Database Optimization

```bash
# Optimize PostgreSQL settings in docker-compose.yml
POSTGRES_SHARED_BUFFERS=256MB
POSTGRES_MAX_CONNECTIONS=100
```

### Monitoring Resource Usage

```bash
# View resource usage
docker stats

# View disk usage
docker system df

# Clean up unused resources
docker system prune -a
```

## Security Considerations

1. **Change default passwords** in `.env` file
2. **Use strong JWT secrets** (256-bit minimum)
3. **Configure firewall** to limit external access
4. **Enable SSL/TLS** in production (use proxy profile)
5. **Regular security updates:**
   ```bash
   docker compose pull
   docker compose up -d
   ```

## Backup and Recovery

### Automated Backups

The backup service runs daily at 2 AM by default:

```bash
# Start backup service
docker compose --profile backup up -d

# Check backup logs
docker compose logs backup
```

### Manual Backup

```bash
# Create manual backup
docker compose exec backup /backup.sh

# List backups
docker compose exec backup ls -la /backups/
```

### Restore from Backup

```bash
# Restore specific backup
docker compose exec backup /restore.sh /backups/backup-20231225-020000.sql

# Restore latest backup
docker compose exec backup /restore.sh /backups/$(ls -1 /backups/*.sql | tail -1)
```

## Production Deployment

### SSL/TLS Configuration

1. **Enable the proxy profile:**

   ```bash
   docker compose --profile proxy up -d
   ```

2. **Configure SSL certificates** in `./nginx/ssl/`

3. **Update environment variables:**
   ```bash
   NODE_ENV=production
   HEDERA_NETWORK=mainnet
   CORS_ORIGIN=https://yourdomain.com
   ```

### Production Checklist

- [ ] Strong passwords for all services
- [ ] SSL certificates configured
- [ ] Firewall rules configured
- [ ] Monitoring enabled
- [ ] Backup schedule verified
- [ ] Email alerts configured
- [ ] Resource limits appropriate
- [ ] Log rotation configured
- [ ] Health checks passing

## Need Help?

1. Check the logs: `docker compose logs -f`
2. Verify configuration: `docker compose config`
3. Check service health: `docker compose ps`
4. Review environment variables: `docker compose exec api env`

For more detailed information, see the main README.md and DOCKER_README.md files.
