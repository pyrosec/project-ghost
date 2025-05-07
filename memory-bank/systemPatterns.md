# System Patterns: Cline Communications Platform

## System Architecture

The Cline Communications Platform follows a microservices architecture pattern, with distinct services handling specific aspects of the communication workflow. The system is containerized using Docker, allowing for isolated, scalable, and maintainable components.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Cline Communications Platform                       │
│                                                                         │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────────────┐    │
│  │ SMS Pipeline  │◄──►│ Voice Services│◄──►│ Security Layer        │    │
│  └───────────────┘    └───────────────┘    └───────────────────────┘    │
│          ▲                    ▲                        ▲                │
│          │                    │                        │                │
│          ▼                    ▼                        ▼                │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────────────┐    │
│  │  VoIP MS      │    │  Google Cloud  │    │   Fail2Ban           │    │
│  │  Integration  │    │  Speech APIs   │    │                      │    │
│  └───────────────┘    └───────────────┘    └───────────────────────┘    │
│                              ▲                                          │
│                              │                                          │
│                              ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                         RTT Bridge                                │  │
│  │                                                                   │  │
│  │  ┌───────────────┐    ┌───────────────┐    ┌───────────────────┐  │  │
│  │  │ Stasis Handler│◄──►│  RTT Handler  │◄──►│  AWS Bedrock      │  │  │
│  │  └───────────────┘    └───────────────┘    └───────────────────┘  │  │
│  │          ▲                                                        │  │
│  │          │                                                        │  │
│  └──────────┼────────────────────────────────────────────────────────┘  │
│             │                                                           │
│  ┌──────────┼────────────────────────────────────────────────────────┐  │
│  │          ▼                                                        │  │
│  │  ┌───────────────┐    ┌───────────────┐    ┌───────────────────┐  │  │
│  │  │ Stasis App    │◄──►│  Dialplan     │◄──►│  SIP/RTP          │  │  │
│  │  └───────────────┘    └───────────────┘    └───────────────────┘  │  │
│  │                                                                   │  │
│  │                        Asterisk                                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Technical Decisions

1. **Containerization with Docker**
   - All services are containerized for consistency across environments
   - Docker Compose is used for orchestrating the services
   - Enables easy deployment and scaling

2. **Microservices Approach**
   - Each functional area is implemented as a separate service
   - Services communicate through well-defined interfaces
   - Allows independent development and deployment cycles

3. **Event-Driven Processing**
   - SMS pipeline processes messages as events
   - Asynchronous processing for better scalability
   - Event-based architecture for loose coupling

4. **External Service Integration**
   - Google Cloud services for speech processing
   - VoIP MS for telephony capabilities
   - Standardized integration patterns for third-party services

5. **Security-First Design**
   - Fail2ban integration for intrusion prevention
   - Layered security approach
   - Proactive security measures rather than reactive

## Component Relationships

### SMS Pipeline Service
- **Purpose**: Process incoming and outgoing SMS messages
- **Dependencies**: VoIP MS API
- **Interfaces**:
  - Receives SMS events from external sources
  - Sends processed messages to destinations
  - Logs activity for monitoring

### Voice Processing Services
- **Purpose**: Handle speech-to-text and text-to-speech conversions
- **Dependencies**: Google Cloud Speech APIs
- **Interfaces**:
  - Accepts audio input for transcription
  - Returns text output from speech
  - Converts text to speech audio

### RTT Bridge Service
- **Purpose**: Connect Asterisk dialplan to AI agent via RTT
- **Dependencies**: AWS Bedrock, Asterisk ARI
- **Interfaces**:
  - Stasis application for Asterisk integration
  - AGI server for legacy integration
  - WebSocket for direct RTT communication
  - REST API for health checks and management

### Security Layer (Fail2ban)
- **Purpose**: Protect services from malicious access attempts
- **Dependencies**: System logs
- **Interfaces**:
  - Monitors log files for suspicious activity
  - Blocks malicious IPs through firewall rules
  - Reports security incidents

## Critical Implementation Paths

1. **SMS Message Flow**
   ```
   Incoming SMS → VoIP MS → SMS Pipeline → Processing Logic → Response Generation → VoIP MS → Outgoing SMS
   ```

2. **Voice Processing Flow**
   ```
   Audio Input → Google Speech-to-Text → Processing Logic → Response Generation → Google Text-to-Speech → Audio Output
   ```

3. **RTT Communication Flow**
   ```
   Incoming Call → Asterisk Dialplan → Stasis App → RTT Bridge → AWS Bedrock → AI Response → RTT Bridge → Stasis App → Asterisk → Caller
   ```

4. **Security Incident Flow**
   ```
   Connection Attempt → Log Entry → Fail2ban Analysis → Pattern Matching → IP Ban (if malicious)
   ```

## Design Patterns in Use

1. **Adapter Pattern**
   - Used for integrating external services with standardized interfaces
   - Abstracts the complexities of third-party APIs
   - Applied in the RTT bridge to connect Asterisk with AWS Bedrock

2. **Pipeline Pattern**
   - Implemented in the SMS processing workflow
   - Allows for sequential processing of messages through discrete steps
   - Used in RTT communication for processing text streams

3. **Observer Pattern**
   - Used for event notification across services
   - Enables loose coupling between components
   - Applied in the Stasis handler to react to Asterisk events

4. **Factory Pattern**
   - Employed for creating appropriate handlers based on message types
   - Simplifies the creation of specialized processors

5. **Repository Pattern**
   - Used for data access abstraction
   - Provides a consistent interface for data operations

6. **Bridge Pattern**
   - Implemented in the RTT bridge to connect Asterisk with AI services
   - Decouples the abstraction (communication interface) from the implementation (AI processing)