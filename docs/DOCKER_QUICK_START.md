# 🐳 Hashbuzz Docker Quick Start Guide

## ✅ Docker Setup Complete!

Your Docker environment is now properly configured and ready to use.

## 🚀 Quick Commands

### Development Server (with hot reload)

```bash
docker compose -f compose-dev.yaml up frontend-dev
```

Access: http://localhost:5173

### Production Build (for testing)

```bash
docker compose -f compose-dev.yaml --profile production up frontend-prod
```

Access: http://localhost:3000

### Development with Database

```bash
docker compose -f compose-dev.yaml --profile database up frontend-dev postgres-dev redis-dev
```

### Full Development Stack

```bash
docker compose -f compose-dev.yaml --profile database --profile proxy up
```

Access via Nginx proxy: http://localhost:8080

## 🔧 Useful Docker Aliases

These aliases are now available in your terminal:

- `dc` = `docker compose`
- `dcup` = `docker compose up`
- `dcdown` = `docker compose down`
- `dcbuild` = `docker compose build`
- `dclogs` = `docker compose logs`

## 🧹 Cleanup Commands

```bash
# Clean up unused containers and images
docker-clean

# Clean up everything (use with caution)
docker-clean-all

# Clean up volumes
docker-clean-volumes
```

## 📁 Environment Configuration

1. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` file with your specific configuration

## 🛠️ Troubleshooting

If you encounter issues:

1. Check Docker status:

   ```bash
   ./docker-setup.sh
   ```

2. View container logs:

   ```bash
   docker compose -f compose-dev.yaml logs frontend-dev
   ```

3. Restart containers:
   ```bash
   docker compose -f compose-dev.yaml down
   docker compose -f compose-dev.yaml up frontend-dev
   ```

## 📊 Container Management

```bash
# View running containers
docker ps

# View all containers
docker ps -a

# Remove stopped containers
docker container prune

# View images
docker images

# Remove unused images
docker image prune
```

## 🔗 Useful Links

- Development Frontend: http://localhost:5173
- Production Frontend: http://localhost:3000
- Nginx Proxy: http://localhost:8080
- PostgreSQL: localhost:5432
- Redis: localhost:6379

---

**Happy coding! 🚀**
