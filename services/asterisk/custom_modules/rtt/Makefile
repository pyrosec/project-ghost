# Makefile for RTT modules

# Compiler and flags
CC = gcc
CFLAGS = -g -Wall -Wno-unused-result -fPIC -w -Wno-error -Wno-attributes -Wno-empty-body -Wno-return-type
INCLUDE_FLAGS = -I/opt/asterisk/include -I/opt/asterisk/include/asterisk -I.
LDFLAGS = -lpthread -shared

# Modules to build
MODULES = res_rtt.so res_rtt_asterisk.so res_stasis_rtt.so res_ari_rtt.so

# Default target
all: $(MODULES)

# Rule for building modules
%.so: %.c
	$(CC) $(CFLAGS) -o $@ $< $(INCLUDE_FLAGS) $(LDFLAGS)

# Install modules
install: $(MODULES)
	cp $(MODULES) /opt/asterisk/lib/asterisk/modules/

# Clean up
clean:
	rm -f $(MODULES)

.PHONY: all install clean
# Makefile for Asterisk RTT modules
# Copyright (C) 2025, Project Ghost

# Asterisk build system paths
ASTTOPDIR?=/opt/asterisk
ASTSBINDIR?=$(ASTTOPDIR)/sbin
ASTMODDIR?=$(ASTTOPDIR)/lib/asterisk/modules
ASTETCDIR?=$(ASTTOPDIR)/etc/asterisk
ASTINCDIR?=$(ASTTOPDIR)/include

# Compiler flags
CFLAGS=-g -Wall -Werror -Wstrict-prototypes -Wmissing-prototypes -Wmissing-declarations -Wno-unused-result -fPIC -DAST_MODULE_SELF_SYM=__internal_rtt_self
CFLAGS+=-I$(ASTINCDIR) -I$(ASTINCDIR)/asterisk

# Linker flags
LDFLAGS=-shared -Xlinker -x

# Source files
SRCS=res_rtt.c res_rtt_asterisk.c res_stasis_rtt.c res_ari_rtt.c

# Object files
OBJS=$(SRCS:.c=.o)

# Module files
MODS=$(SRCS:.c=.so)

# Default target
all: $(MODS)

# Rule to build modules
%.so: %.o
	$(CC) $(LDFLAGS) -o $@ $<

# Rule to build object files
%.o: %.c
	$(CC) $(CFLAGS) -c -o $@ $<

# Install modules
install: all
	install -d $(DESTDIR)$(ASTMODDIR)
	for mod in $(MODS); do \
		install -m 755 $$mod $(DESTDIR)$(ASTMODDIR)/; \
	done

# Clean up
clean:
	rm -f $(OBJS) $(MODS)

# Dependencies
res_rtt_asterisk.so: res_rtt.so
res_stasis_rtt.so: res_rtt.so
res_ari_rtt.so: res_rtt.so res_stasis_rtt.so

.PHONY: all install clean