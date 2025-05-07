# RTT Support in Asterisk 20.5.0 via ARI

## Overview

Real-Time Text (RTT) is supported in Asterisk 20.5.0 through the SIP protocol using the ITU-T T.140 codec. RTT allows text to be transmitted character by character as it is typed, rather than waiting for the user to press send, making it more conversational and useful for accessibility purposes.

## Implementation Details

### ARI Configuration

1. **Enable HTTP Server**: 
   First, ensure Asterisk's HTTP server is enabled in `http.conf`:
   ```
   [general]
   enabled=yes
   bindaddr=0.0.0.0
   bindport=8088
   ```

2. **Configure ARI Access**:
   In `ari.conf`:
   ```
   [general]
   enabled=yes
   
   [username]
   type=user
   password=password
   password_format=plain
   ```

3. **Dialplan Configuration**:
   Use the Stasis application to hand channels over to ARI:
   ```
   [default]
   exten => 1000,1,Answer()
   same => n,Stasis(rtt-app)
   same => n,Hangup()
   ```

### RTT Events in ARI

When working with RTT in ARI, you'll primarily interact with the following events:

1. **TextMessageReceived**: This event is triggered when a text message is received from an endpoint. The event payload includes:
   - `endpoint`: The endpoint that sent the message
   - `message`: The text content of the message
   - `technology`: The technology of the endpoint (SIP, PJSIP, etc.)

2. **TextMessageSent**: This event confirms that a text message was successfully sent.

### Sending RTT Messages

To send RTT messages via ARI, use the `/endpoints/sendMessage` endpoint:

```
PUT /ari/endpoints/sendMessage
```

Required parameters:
- `to`: The target endpoint
- `from`: The source endpoint
- `body`: The text message content

### Receiving RTT Messages

To receive RTT messages:

1. Connect to the ARI WebSocket endpoint
2. Subscribe to the appropriate application events
3. Listen for `TextMessageReceived` events

### Example Implementation (Python)

Here's a basic Python implementation using the ari-py library:

```python
import ari
import logging

logging.basicConfig(level=logging.ERROR)

client = ari.connect('http://localhost:8088', 'username', 'password')

def on_text_message(event, event_type):
    print(f"Received message from {event['endpoint']['resource']}: {event['message']['body']}")
    
    # Echo the message back
    client.endpoints.sendMessage(
        to=event['endpoint']['resource'],
        from_="sip:asterisk@localhost",
        body=f"Echo: {event['message']['body']}"
    )

client.on_event('TextMessageReceived', on_text_message)

# Subscribe to the application
client.applications.subscribe(applicationName='rtt-app', eventSource='endpoint:')

print("RTT application started. Press Ctrl+C to exit.")
try:
    client.run()
except KeyboardInterrupt:
    print("Application stopped")
```

## Best Practices

1. **Error Handling**: Always implement proper error handling for message sending and receiving.
2. **Connection Management**: Maintain a robust WebSocket connection with reconnection logic.
3. **Event Filtering**: Consider filtering events to only receive the ones relevant to your application.
4. **Testing**: Test with various SIP clients that support RTT to ensure compatibility.

## Limitations

1. RTT in Asterisk works in passthrough mode, meaning Asterisk routes the RTT data between endpoints without modifying it.
2. Not all SIP clients support RTT, so compatibility testing is important.
3. The implementation follows the T.140 standard, which may have specific formatting requirements.

## Next Steps

1. Set up your ARI application using the example code above
2. Configure your dialplan to route calls to your Stasis application
3. Test with compatible SIP clients that support RTT
4. Implement more advanced features like message storage or integration with other systems
