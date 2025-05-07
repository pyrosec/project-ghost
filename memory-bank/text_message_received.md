# TextMessage and TextMessageReceived in Asterisk ARI

## TextMessage Structure

The TextMessage is defined in the Asterisk ARI (Asterisk REST Interface) under the Endpoints namespace. It represents a text message that can be sent or received through various technologies supported by Asterisk.

### Key Properties

1. **body**: String
   - The actual text content of the message

2. **from**: String
   - A technology-specific URI specifying the source of the message
   - For SIP and PJSIP technologies, any SIP URI can be specified
   - For XMPP, the URI must correspond to the client connection being used to send the message

3. **to**: String
   - A technology-specific URI specifying the destination of the message
   - Valid technologies include SIP, PJSIP, and XMPP
   - The destination should be an endpoint

4. **variables**: Array(TextMessageVariable)? (optional)
   - Technology-specific key/value pairs associated with the message
   - This is an optional field that can contain additional metadata

## TextMessageReceived Event

The TextMessageReceived event is part of the Asterisk::ARI::Events namespace and is triggered when a text message is received by Asterisk.

## Issue Investigation Context

### Current Problem
- RTT bridge is not logging or responding to incoming messages
- TextMessageReceived events potentially not working properly

### Diagnostic Approach
- Adding additional logging to track event flow
- Examining the StasisHandler class methods to understand how TextMessageReceived events are processed
- Verifying event structure and configuration

### Next Steps
- Further examination of how StasisHandler processes TextMessageReceived events
- Verification of event structure against actual incoming messages
- Potential addition of debug logging to trace message flow
