# Asterisk RTT Implementation

## Overview

This document outlines our approach to implementing Real-Time Text (RTT) support in Asterisk 20.5.0 by adapting the RTT modules from Asterisk 15.7. The goal is to provide RTT functionality that integrates with our services/rtt package and the dialplan defined in services/asterisk/extensions.lua.

## Implementation Strategy

### 1. Module Structure

We're implementing four custom modules for RTT support:

1. **res_rtt.c** - Core RTT functionality
   - Manages RTT sessions
   - Provides API for enabling/disabling RTT on channels
   - Handles RTT text frames

2. **res_rtt_asterisk.c** - Asterisk integration
   - Provides dialplan applications (RTTEnable, RTTDisable)
   - Provides dialplan functions (RTT_IS_ENABLED)
   - Implements CLI commands for RTT management

3. **res_stasis_rtt.c** - Stasis integration
   - Publishes RTT events to Stasis
   - Defines message types for RTT text and status changes

4. **res_ari_rtt.c** - ARI integration
   - Exposes RTT functionality through ARI
   - Allows WebSocket clients to receive RTT events

### 2. Compatibility Layer

To address API differences between Asterisk 15.7 and 20.5.0, we've created a robust compatibility layer (`rtt_compat.h`) that:

- Defines custom mutex types and operations that avoid name conflicts
- Implements list management macros with the same functionality but different names
- Uses forward declarations to minimize Asterisk header dependencies
- Provides consistent interfaces across Asterisk versions

### 3. Build Process

The modules are built as part of the Asterisk Docker image using a custom build script:

1. Custom RTT module source files are copied to the container
2. Build dependencies are installed
3. A build script is created with proper compiler flags and include paths
4. Modules are compiled with error handling
5. Compiled modules are installed to Asterisk's module directory

The build process uses specific compiler flags to ensure compatibility:
```bash
CFLAGS="-g -Wall -Wno-unused-result -fPIC -DAST_MODULE_SELF_SYM=__internal_rtt_self -DAST_MODULE=__internal_rtt_module"
INCLUDE_FLAGS="-I/opt/asterisk/include -I/opt/asterisk/include/asterisk -I."
LDFLAGS="-lpthread -shared"
```

### 4. Integration with RTT Service

The RTT modules work in conjunction with our TypeScript-based RTT service:

- Asterisk handles the SIP/RTP aspects of RTT
- The RTT service processes and manages the text data
- Communication between Asterisk and the RTT service occurs via ARI

## Technical Challenges

### API Differences

Asterisk 20.5.0 has significant API differences from 15.7, including:

1. **Mutex handling** - Different mutex types and initialization methods
2. **List management** - Changes to list macros and operations
3. **Module initialization** - Different module registration patterns

### Build System Integration

Integrating custom modules with Asterisk's build system requires:

1. Proper header inclusion
2. Correct compiler flags
3. Dependency management

## Implementation Details

### RTT Session Management

RTT sessions are managed through a linked list structure:

```c
struct rtt_session {
    char *id;                  /* Unique session ID */
    struct ast_channel *chan;  /* Associated channel */
    RTT_LIST_ENTRY(rtt_session) list;  /* Next session in the list */
    rtt_mutex_t lock;          /* Lock for this session */
};

RTT_LIST_HEAD_STATIC(sessions, rtt_session);
```

### RTT Text Handling

RTT text is processed through Asterisk's frame system:

```c
int ast_rtt_handle_text_frame(struct ast_channel *chan, struct ast_frame *frame)
{
    /* Process text frame and log to stdout */
    if (frame->datalen > 0 && frame->data.ptr) {
        char *text = ast_alloca(frame->datalen + 1);
        memcpy(text, frame->data.ptr, frame->datalen);
        text[frame->datalen] = '\0';
        
        ast_log(LOG_NOTICE, "RTT TEXT RECEIVED (Channel %s): %s\n", 
                ast_channel_name(chan), text);
    }
    
    return 0;
}
```

### Dialplan Integration

RTT is integrated with the dialplan through custom applications:

```c
static int rtt_enable_exec(struct ast_channel *chan, const char *data)
{
    return ast_rtt_enable(chan);
}

static int rtt_disable_exec(struct ast_channel *chan, const char *data)
{
    return ast_rtt_disable(chan);
}
```

## Future Improvements

1. **Enhanced error handling** - More robust error detection and recovery
2. **Performance optimization** - Reduce memory usage and CPU overhead
3. **Additional features** - Support for RTT indicators, typing notifications, etc.
4. **Better integration** - Tighter integration with other Asterisk subsystems