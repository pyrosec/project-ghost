# SMS Phone Number Rewriting

## Overview

The SMS pipeline now supports phone number rewriting via Redis keys, allowing for private conversations through separate XMPP accounts. This feature enables routing messages between specific phone numbers through designated XMPP accounts, without leaving traces in the main DID's XMPP account.

## How It Works

### Inbound SMS Rewriting

When an SMS comes in from an external number (e.g., 4064044040) to one of our DIDs (e.g., 5055055050):

1. The system checks if a Redis key exists: `rewrite.4064044040.5055055050`
2. If the key exists, its value (e.g., "dante") is used as the username to queue in Redis for inbound SMS
3. The message is routed to `dante@pyrosec.is` (or whatever domain is set in the XMPP_DOMAIN environment variable)
4. SMS forwarding is prevented if sms-fallback is set for the extension

### Outbound SMS Rewriting

When sending an SMS from an XMPP account:

1. When a queue item appears in outgoing SMS, the system checks if a Redis key exists: `rewrite.<source>`
2. If the key exists, its value (a DID phone number in our system) is used as the sender number
3. This allows messages from `dante@pyrosec.is` to appear as if they're coming from a specific DID

## Setup Instructions

### Setting Up Rewriting for a Contact

To set up rewriting for a specific contact:

```
# For incoming SMS from 4064044040 to 5055055050, route to dante@pyrosec.is
redis-cli set rewrite.4064044040.5055055050 dante

# For outgoing SMS from dante@pyrosec.is, send from 5055055050
redis-cli set rewrite.dante 5055055050
```

### Example Scenario

1. Contact John (4064044040) sends an SMS to our DID (5055055050)
2. With rewriting set up, the message is routed to dante@pyrosec.is
3. When dante@pyrosec.is replies, the message is sent from 5055055050
4. John sees a normal SMS conversation with 5055055050
5. The main XMPP account for 5055055050 has no record of this conversation

## Benefits

- **Privacy**: Separate sensitive conversations from main communication channels
- **Organization**: Route specific contacts to dedicated XMPP accounts
- **Security**: Prevent sensitive communications from appearing in main accounts
- **Flexibility**: Easily change routing without affecting the contact's experience

## Technical Implementation

The feature is implemented in two main functions in the SMS pipeline:

1. `handleSms`: Checks for rewrite rules on incoming SMS and routes accordingly
2. `flushOne`: Checks for rewrite rules on outgoing SMS and sends from the appropriate DID

The system uses Redis keys for configuration, making it easy to add, modify, or remove rewriting rules without code changes.