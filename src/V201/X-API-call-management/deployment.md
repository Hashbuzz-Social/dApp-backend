# Deployment Guide

## Prerequisites
- Docker
- Redis
- Node.js 18+

## Steps
1. Build Docker image:
   docker build -t x-api-rate-limit .
2. Run Redis server
3. Set environment variables for X API credentials and Redis URL
4. Start container:
   docker run -p 3000:3000 --env-file .env x-api-rate-limit
5. Access API endpoints at http://localhost:3000
