# System Patterns: Project Ghost

## System Architecture

Project Ghost follows a microservices architecture, with each communication channel and supporting function implemented as a separate service. This architecture provides modularity, scalability, and resilience.

### High-Level Architecture

```
                                  ┌─────────────┐
                                  │    NGINX    │
                                  │  (Reverse   │
                                  │   Proxy)    │
                                  └──────┬──────┘
                                         │
                 ┌───────────────────────┼───────────────────────┐
                 │                       │                       │
        ┌────────▼─────────┐    ┌────────▼─────────┐    ┌────────▼─────────┐
        │     Asterisk     │    │      Prosody     │    │      Synapse     │
        │  (Voice/VoIP)    │    │      (XMPP)      │    │     (Matrix)     │
        └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘
                 │                       │                       │
        ┌────────▼─────────┐    ┌────────▼─────────┐    ┌────────▼─────────┐
        │   Voicemail      │    │    SMS Pipeline  │    │        RTT       │
        │    Pipeline      │    │                  │    │  (Real-Time Text) │
        └────────┬─────────┘    └────────┬─────────┘    └──────────────────┘
                 │                       │
        ┌────────▼─────────┐    ┌────────▼─────────┐
        │  Speech-to-Text  │    │   Text-to-Speech │
        │                  │    │                  │
        └──────────────────┘    └──────────────────┘
```

### Service Responsibilities

1. **NGINX**: Acts as the reverse proxy, handling incoming connections and routing them to the appropriate services.

2. **Asterisk**: Manages voice communications, including VoIP calls, call routing, and integration with the PSTN.

3. **Prosody**: Provides XMPP (Jabber) instant messaging capabilities.

4. **Synapse**: Implements the Matrix protocol for secure, decentralized communication.

5. **Voicemail Pipeline**: Processes voicemail messages, including storage, retrieval, and notification.

6. **SMS Pipeline**: Handles SMS message processing, routing, and delivery.

7. **RTT (Real-Time Text)**: Enables real-time text communication for accessibility.

8. **Speech-to-Text/Text-to-Speech**: Converts between audio and text formats to support accessibility features.

9. **Fail2ban**: Provides security by monitoring logs and blocking malicious activity.

10. **Dossi**: Appears to be a custom service, likely handling specific business logic or integration needs.

## Key Technical Decisions

1. **Containerization**: All services are containerized using Docker, allowing for consistent deployment and scaling.

2. **Service Isolation**: Each service operates independently, communicating through well-defined interfaces.

3. **Configuration as Code**: Service configurations are managed as code and templated for different environments.

4. **Security by Design**: Security measures are integrated at all levels, from network to application.

5. **Protocol Standards**: The system uses standard protocols (SIP, XMPP, Matrix) for interoperability.

## Design Patterns in Use

1. **Microservices Pattern**: The system is decomposed into small, specialized services that can be developed, deployed, and scaled independently.

2. **API Gateway Pattern**: NGINX serves as an API gateway, routing requests to the appropriate services.

3. **Event-Driven Architecture**: Services communicate through events for asynchronous operations.

4. **Pipeline Pattern**: Processing of messages (voicemail, SMS) follows a pipeline pattern for modular processing.

5. **Circuit Breaker Pattern**: Services are designed to handle failures gracefully, preventing cascading failures.

## Component Relationships

### Communication Flow

1. **Voice Communication**:
   - External calls → NGINX → Asterisk → Voicemail Pipeline (if needed) → Speech-to-Text (if needed)

2. **SMS Communication**:
   - Incoming SMS → NGINX → SMS Pipeline → Appropriate notification services

3. **Instant Messaging**:
   - XMPP: Client → NGINX → Prosody → Other XMPP servers (federation)
   - Matrix: Client → NGINX → Synapse → Other Matrix servers (federation)

4. **Real-Time Text**:
   - Client → NGINX → RTT Service → Other communication services as needed

### Data Flow

1. **User Authentication**: Centralized authentication system with service-specific authorization.

2. **Message Storage**: Each service manages its own data storage, with appropriate backup and retention policies.

3. **Configuration Management**: Centralized configuration with service-specific overrides.

4. **Logging and Monitoring**: Distributed logging with centralized aggregation and analysis.

## Scalability Considerations

1. **Horizontal Scaling**: Services can be scaled independently based on demand.

2. **Load Balancing**: NGINX provides load balancing for services with multiple instances.

3. **Resource Isolation**: Containerization ensures resource isolation between services.

4. **Stateless Design**: Services are designed to be stateless where possible, facilitating scaling.

## Resilience Strategies

1. **Service Redundancy**: Critical services can have multiple instances for high availability.

2. **Graceful Degradation**: The system can continue operating with reduced functionality if some services are unavailable.

3. **Retry Mechanisms**: Failed operations can be retried with appropriate backoff strategies.

4. **Circuit Breaking**: Prevent cascading failures by detecting and isolating failing services.