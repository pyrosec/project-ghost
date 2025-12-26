# Use pre-built asterisk image to avoid CPU instruction issues
FROM mlan/asterisk:latest
USER root

# Install lua and dependencies (Alpine uses apk)
# Note: mlan/asterisk uses Lua 5.1 for pbx_lua
RUN apk add --no-cache \
    gettext \
    lua5.1 \
    lua5.1-dev \
    lua5.1-socket \
    lua5.1-filesystem \
    lua5.1-sec \
    openssl \
    openssl-dev \
    cmake \
    iproute2 \
    sngrep \
    ngrep \
    tcpdump \
    less \
    git \
    bash \
    build-base \
    wget \
    rapidjson-dev

# Install luarocks for Lua 5.1 and additional modules
RUN wget -q https://luarocks.org/releases/luarocks-3.9.2.tar.gz && \
    tar zxpf luarocks-3.9.2.tar.gz && \
    cd luarocks-3.9.2 && \
    ./configure --with-lua=/usr --with-lua-include=/usr/include && \
    make && make install && \
    cd .. && rm -rf luarocks-3.9.2*

# Install lua modules
RUN luarocks install luasocket 2>/dev/null || true
RUN luarocks install luasec OPENSSL_DIR=/usr 2>/dev/null || true
RUN luarocks install redis-lua 2>/dev/null || true
RUN luarocks install rapidjson 2>/dev/null || true

# Copy configuration files
COPY ./templates /templates
COPY ./config /config
COPY ./docker-entrypoint.sh /docker-entrypoint.sh
COPY ./extensions.lua /config/extensions.lua
RUN chmod +x /docker-entrypoint.sh

WORKDIR /
CMD ["bash", "/docker-entrypoint.sh"]
