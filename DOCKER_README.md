# 🐳 Enhanced Docker Setup for Hashbuzz dApp Backend

## 🌟 Features

### **Multi-Stage Build**

- **Dependencies Stage**: Optimized dependency installation
- **Build Stage**: Application compilation and Prisma generation
- **Production Stage**: Minimal runtime image with security hardening

### **Security Enhancements**

- ✅ **Non-root user**: Runs as `hashbuzz` user (UID 1001)
- ✅ **Minimal attack surface**: Alpine Linux base with only required packages
- ✅ **Proper file permissions**: Secure ownership and access controls
- ✅ **Signal handling**: Uses `dumb-init` for proper process management

### **Performance Optimizations**

- ✅ **Layer caching**: Optimized layer order for faster rebuilds
- ✅ **Minimal image size**: Production image ~200MB (vs ~800MB+ without optimization)
- ✅ **Dependency pruning**: Only production dependencies in final image
- ✅ **Build context optimization**: Enhanced `.dockerignore` excludes unnecessary files

### **Monitoring & Health**

- ✅ **Health checks**: Built-in container health monitoring
- ✅ **Structured logging**: Configurable log formats and outputs
- ✅ **Graceful shutdown**: Proper signal handling for clean restarts

## 📋 Prerequisites

```bash
# Ensure you have Docker and Docker Compose installed
docker --version
docker compose version
```

## 🚀 Quick Start

### **1. Build the Image**

```bash
# Build with build args (optional)
docker build \
  --build-arg NODE_ENV=production \
  --tag hashbuzz-backend:latest \
  .
```

### **2. Run with Docker Compose (Recommended)**

```bash
# Start the full stack
docker compose up -d

# Start only API and database
docker compose up hashbuzz-backend postgres redis

# With nginx proxy
docker compose --profile proxy up -d
```

### **3. Run Standalone Container**

```bash
# Run the backend container
docker run -d \
  --name hashbuzz-backend \
  --port 4000:4000 \
  --env-file .env \
  hashbuzz-backend:latest
```

## ⚙️ Configuration

### **Environment Variables**

Create a `.env` file in the project root:

```bash
# Required
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://user:password@localhost:5432/hashbuzz

# Optional (defaults provided)
JET_LOGGER_MODE=FILE
JET_LOGGER_FILEPATH=logs/jet-logger.log
REWARD_CALIM_DURATION=60
CAMPAIGN_DURATION=60

# Email Configuration (for multiple recipients)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
ALERT_RECEIVER="admin@example.com support@example.com alerts@example.com"

# External Services
HEDERA_NETWORK=mainnet
TWITTER_CALLBACK_HOST=https://api.hashbuzz.social
FRONTEND_URL=https://hashbuzz.social,https://www.hashbuzz.social
```

### **Docker Compose Profiles**

```bash
# Default: API + Database + Redis
docker compose up

# With reverse proxy
docker compose --profile proxy up

# With backup service
docker compose --profile backup up

# All services
docker compose --profile proxy --profile backup up
```

## 📊 Monitoring

### **Health Checks**

```bash
# Check container health
docker compose ps

# View health check logs
docker inspect hashbuzz-backend-api --format='{{.State.Health}}'
```

### **Logs**

```bash
# View application logs
docker compose logs -f hashbuzz-backend

# View all service logs
docker compose logs -f

# Follow logs in real-time
docker compose logs --tail=100 -f hashbuzz-backend
```

### **Metrics**

```bash
# Container stats
docker stats hashbuzz-backend-api

# Resource usage
docker compose top
```

## 🔧 Development

### **Development Build**

```bash
# Build for development
docker build --target build -t hashbuzz-backend:dev .

# Run development container with volume mounts
docker run -it \
  --volume $(pwd):/app \
  --volume /app/node_modules \
  --port 4000:4000 \
  hashbuzz-backend:dev npm run dev
```

### **Debugging**

```bash
# Access container shell
docker compose exec hashbuzz-backend sh

# Run commands inside container
docker compose exec hashbuzz-backend npm run prisma:studio

# Debug with Node.js inspector
docker run -p 4000:4000 -p 9229:9229 \
  hashbuzz-backend:latest \
  node --inspect=0.0.0.0:9229 dist/index.js
```

## 🛠️ Maintenance

### **Database Operations**

```bash
# Run Prisma migrations
docker compose exec hashbuzz-backend npx prisma migrate deploy

# Generate Prisma client
docker compose exec hashbuzz-backend npx prisma generate

# Access database
docker compose exec postgres psql -U hashbuzz -d hashbuzz
```

### **Backup & Restore**

```bash
# Create manual backup
docker compose exec postgres pg_dump -U hashbuzz hashbuzz > backup.sql

# Restore from backup
docker compose exec -T postgres psql -U hashbuzz -d hashbuzz < backup.sql

# Automated backups (with backup profile)
docker compose --profile backup up -d
```

### **Updates**

```bash
# Rebuild and restart
docker compose build --no-cache
docker compose up -d

# Rolling update (zero downtime)
docker compose up -d --scale hashbuzz-backend=2
docker compose stop hashbuzz-backend
docker compose up -d --scale hashbuzz-backend=1
```

## 🔍 Troubleshooting

### **Common Issues**

#### **Container won't start**

```bash
# Check logs
docker compose logs hashbuzz-backend

# Check health status
docker compose ps

# Verify environment variables
docker compose config
```

#### **Database connection issues**

```bash
# Test database connectivity
docker compose exec hashbuzz-backend node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$connect().then(() => console.log('Connected')).catch(console.error);
"
```

#### **Performance issues**

```bash
# Check resource usage
docker stats

# Increase memory limits
docker compose up --memory=1g hashbuzz-backend
```

### **Debug Mode**

```bash
# Enable debug logging
docker compose up -e DEBUG=* hashbuzz-backend

# Run with increased verbosity
docker compose up -e LOG_LEVEL=debug hashbuzz-backend
```

## 📈 Production Deployment

### **Production Checklist**

- [ ] Set strong passwords in `.env`
- [ ] Configure proper SSL certificates
- [ ] Set up log rotation
- [ ] Configure monitoring and alerts
- [ ] Set up automated backups
- [ ] Configure resource limits
- [ ] Set up health check endpoints

### **Security Hardening**

```bash
# Scan for vulnerabilities
docker scout cves hashbuzz-backend:latest

# Run security checks
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image hashbuzz-backend:latest
```

### **Scaling**

```bash
# Horizontal scaling
docker compose up --scale hashbuzz-backend=3

# Load balancing with nginx
docker compose --profile proxy up -d
```

## 📝 Image Information

| Stage        | Size   | Purpose                 |
| ------------ | ------ | ----------------------- |
| Dependencies | ~400MB | Dependency installation |
| Build        | ~600MB | Application compilation |
| Production   | ~200MB | Runtime execution       |

## 🤝 Contributing

When making changes to the Docker setup:

1. Test locally with `docker compose up`
2. Verify multi-stage build: `docker build --target production .`
3. Check image size: `docker images hashbuzz-backend`
4. Test health checks: `docker inspect --format='{{.State.Health}}' <container>`
5. Update this documentation if needed

---

**Happy containerizing! 🐳**
