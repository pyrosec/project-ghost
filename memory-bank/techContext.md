# Technical Context: Project Ghost

## Technologies Used

### Core Communication Services

1. **Asterisk**
   - Version: Based on Dockerfile (specific version not identified)
   - Purpose: Open-source PBX (Private Branch Exchange) for handling voice communications
   - Key features: SIP support, call routing, IVR, voicemail

2. **Prosody**
   - Purpose: XMPP server for instant messaging
   - Features: Message routing, presence information, federation with other XMPP servers

3. **Synapse**
   - Purpose: Matrix homeserver implementation
   - Features: Secure, decentralized communication, end-to-end encryption, room-based messaging

4. **NGINX**
   - Purpose: Reverse proxy, load balancer, and web server
   - Features: Request routing, SSL termination, static file serving

### Supporting Services

1. **Fail2ban**
   - Purpose: Intrusion prevention system
   - Features: Log monitoring, IP banning, protection against brute force attacks

2. **RTT (Real-Time Text)**
   - Purpose: Real-time text communication service
   - Implementation: Custom TypeScript service

3. **SMS Pipeline**
   - Purpose: SMS message processing and routing
   - Implementation: Custom TypeScript service

4. **Voicemail Pipeline**
   - Purpose: Voicemail processing and management
   - Implementation: Custom TypeScript service

5. **Dossi**
   - Purpose: Custom service (specific purpose not identified from file structure)
   - Implementation: Custom TypeScript service

### Speech Processing

1. **Google Cloud Speech-to-Text**
   - Purpose: Convert speech to text for accessibility and processing
   - Implementation: Node.js script using Google Cloud API

2. **Google Cloud Text-to-Speech**
   - Purpose: Convert text to speech for accessibility and notifications
   - Implementation: Node.js script using Google Cloud API

### Development Tools

1. **Docker & Docker Compose**
   - Purpose: Containerization and orchestration
   - Features: Service isolation, consistent environments, simplified deployment

2. **TypeScript**
   - Purpose: Typed JavaScript for custom services
   - Benefits: Type safety, better tooling, improved maintainability

3. **Node.js**
   - Purpose: Runtime for JavaScript/TypeScript services
   - Version: Based on package.json files (specific versions may vary by service)

4. **Puppeteer**
   - Purpose: Headless Chrome automation
   - Potential uses: Testing, screenshot generation, PDF creation

## Development Setup

### Prerequisites

1. Docker and Docker Compose
2. Node.js and Yarn (for development of custom services)
3. Google Cloud credentials (for speech services)

### Environment Structure

The project is organized as follows:

```
project-ghost/
├── docker-compose.yaml       # Main Docker Compose configuration
├── scripts/                  # Utility scripts
│   ├── googlecloud-speech-to-text/
│   ├── googlecloud-text-to-speech/
│   └── purge-voipms/
└── services/                 # Individual service directories
    ├── asterisk/
    ├── dossi/
    ├── fail2ban/
    ├── nginx/
    ├── prosody/
    ├── puppeteer/
    ├── rtt/
    ├── sms_pipeline/
    ├── synapse/
    └── voicemail_pipeline/
```

Each service directory contains:
- Dockerfile for building the service container
- Configuration files and templates
- Source code (for custom services)

### Build and Deployment

The project uses Docker Compose for local development and deployment. The `docker-compose.yaml` file defines the services, their dependencies, and configuration.

To start the entire system:
```bash
docker-compose up -d
```

Individual services can be rebuilt and restarted as needed:
```bash
docker-compose build <service_name>
docker-compose up -d <service_name>
```

## Technical Constraints

1. **Network Requirements**
   - SIP ports must be open for Asterisk
   - XMPP and Matrix ports must be accessible for federation
   - Proper DNS configuration is required for federation services

2. **Resource Requirements**
   - Asterisk: Moderate CPU, low memory
   - Synapse: Higher memory requirements, especially with many users
   - NGINX: Low to moderate resources depending on traffic

3. **External Dependencies**
   - Google Cloud for speech services
   - Possibly VoIP.ms for PSTN connectivity (based on purge-voipms script)

4. **Security Considerations**
   - SIP security is critical for Asterisk
   - XMPP and Matrix require proper TLS configuration
   - API keys and credentials must be securely managed

## Dependencies

### External Services

1. **Google Cloud Platform**
   - Speech-to-Text API
   - Text-to-Speech API

2. **VoIP Providers**
   - Possibly VoIP.ms (based on purge-voipms script)

### Internal Dependencies

1. **Service Dependencies**
   - NGINX depends on all backend services
   - Voicemail Pipeline depends on Asterisk and Speech-to-Text
   - SMS Pipeline may depend on external SMS gateways

2. **Shared Resources**
   - Configuration templates
   - Network infrastructure
   - Authentication systems

## Configuration Management

Configuration is managed through:
1. Docker Compose environment variables
2. Service-specific configuration files
3. Template files that are populated at container startup

Key configuration areas:
1. Network settings (ports, hostnames)
2. Authentication credentials
3. Service-specific options
4. Integration points between services