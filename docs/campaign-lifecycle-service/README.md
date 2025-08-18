# 📚 Campaign Lifecycle Service Documentation

## 🎯 **Overview**

The Campaign Lifecycle Service is a dedicated microservice responsible for managing the automated lifecycle of Twitter campaigns in the Hashbuzz platform. It provides event-driven, crash-resistant, real-time campaign state management with WebSocket notifications.

---

## 📖 **Documentation Structure**

### **📋 Planning & Architecture**
- [01-architecture-overview.md](./01-architecture-overview.md) - High-level system architecture
- [02-database-schema.md](./02-database-schema.md) - Database design and relationships
- [03-event-flow.md](./03-event-flow.md) - Event-driven architecture flow

### **🛠 Implementation Details**
- [04-redis-event-bus.md](./04-redis-event-bus.md) - Redis Pub/Sub implementation
- [05-timer-management.md](./05-timer-management.md) - Background timer system
- [06-crash-recovery.md](./06-crash-recovery.md) - Service restart recovery mechanism

### **🔌 Integration & Communication**
- [07-websocket-integration.md](./07-websocket-integration.md) - Real-time frontend updates
- [08-api-integration.md](./08-api-integration.md) - Main API integration points
- [09-error-handling.md](./09-error-handling.md) - Comprehensive error management

### **🚀 Deployment & Operations**
- [10-deployment-guide.md](./10-deployment-guide.md) - Docker & production deployment
- [11-monitoring-metrics.md](./11-monitoring-metrics.md) - Health checks and monitoring
- [12-performance-scaling.md](./12-performance-scaling.md) - Performance optimization

### **📊 Charts & Diagrams**
- [charts/](./charts/) - Visual diagrams and flowcharts
- [examples/](./examples/) - Code examples and configurations

---

## 🚀 **Quick Start**

1. **Read Architecture Overview** → Understanding the system design
2. **Review Database Schema** → Understanding data structures  
3. **Follow Event Flow** → Understanding process lifecycle
4. **Check Deployment Guide** → Getting service running
5. **Setup Monitoring** → Ensuring reliable operation

---

## 🔄 **Campaign Lifecycle States**

```
CREATED → RUNNING → CLOSED → REWARD_CLAIM → EXPIRED
   │         │         │          │           │
   │         │         │          │           └─► Final State
   │         │         │          └─────────────► Claims Processing
   │         │         └────────────────────────► Campaign Ended
   │         └──────────────────────────────────► Active Period
   └────────────────────────────────────────────► Initial State
```

---

## 🎯 **Key Features**

### ✅ **Event-Driven Architecture**
- Redis Pub/Sub for low-latency communication
- Durable event storage with Redis Streams
- Decoupled services for better scalability

### ✅ **Crash Recovery**
- Database-persisted timer state
- Automatic recovery on service restart
- Heartbeat mechanism for health monitoring

### ✅ **Real-Time Updates**
- WebSocket notifications to frontend
- Live campaign status updates
- Progress tracking and alerts

### ✅ **Reliable Processing**
- Retry mechanisms for failed operations
- Comprehensive error handling
- Transaction safety for state changes

---

## 📞 **Support & Troubleshooting**

For common issues and solutions, refer to:
- [Error Handling Guide](./09-error-handling.md)
- [Monitoring & Metrics](./11-monitoring-metrics.md)
- [Performance Optimization](./12-performance-scaling.md)

---

## 🔄 **Version History**

- **v1.0** - Initial architecture design
- **v1.1** - Redis event bus implementation
- **v1.2** - Crash recovery mechanism
- **v1.3** - WebSocket integration
- **v1.4** - Production deployment guide

---

## 👥 **Contributing**

When contributing to this documentation:

1. Follow the existing structure and formatting
2. Update flowcharts in the `charts/` directory
3. Provide practical examples in `examples/`
4. Keep technical details accurate and up-to-date
5. Test all code examples before documenting

---

*Last Updated: August 19, 2025*
