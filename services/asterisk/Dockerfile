# Build Asterisk from source with chan_sip support
FROM debian:bookworm-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    wget \
    ca-certificates \
    libssl-dev \
    libedit-dev \
    libsqlite3-dev \
    libxml2-dev \
    libjansson-dev \
    libsrtp2-dev \
    libspeex-dev \
    libspeexdsp-dev \
    libogg-dev \
    libvorbis-dev \
    libasound2-dev \
    libcurl4-openssl-dev \
    libxslt1-dev \
    libnewt-dev \
    libpq-dev \
    libopus-dev \
    libopusfile-dev \
    uuid-dev \
    liblua5.1-0-dev \
    unixodbc-dev \
    freetds-dev \
    libmariadb-dev \
    libsnmp-dev \
    libspandsp-dev \
    libgsm1-dev \
    libncurses5-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Download and extract Asterisk
WORKDIR /usr/src
ARG ASTERISK_VERSION=20.17.0
RUN wget -q http://downloads.asterisk.org/pub/telephony/asterisk/asterisk-${ASTERISK_VERSION}.tar.gz && \
    tar xzf asterisk-${ASTERISK_VERSION}.tar.gz && \
    rm asterisk-${ASTERISK_VERSION}.tar.gz

WORKDIR /usr/src/asterisk-${ASTERISK_VERSION}

# Configure with chan_sip enabled (use bundled pjproject)
RUN ./configure \
    --prefix=/usr \
    --sysconfdir=/etc \
    --localstatedir=/var \
    --with-pjproject-bundled \
    --with-jansson-bundled=no \
    --with-crypto \
    --with-ssl \
    --with-srtp \
    --with-sqlite3 \
    --without-dahdi \
    --without-pri

# Enable chan_sip in menuselect (deprecated but required for legacy SIP)
# In Asterisk 20, chan_sip is in EXTENDED - we need to list available options first
RUN make menuselect.makeopts && \
    menuselect/menuselect --list-options menuselect.makeopts | head -100 && \
    menuselect/menuselect \
    --enable chan_sip \
    --enable res_srtp \
    --enable codec_opus \
    --enable res_pjsip \
    --enable res_pjsip_session \
    --enable chan_pjsip \
    --enable pbx_lua \
    --disable format_mp3 \
    --enable app_voicemail \
    --disable BUILD_NATIVE \
    menuselect.makeopts || true && \
    cat menuselect.makeopts

# Build and install
RUN make -j$(nproc) && make install && make samples

# Runtime image
FROM debian:bookworm-slim

# Install runtime dependencies including Lua socket
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    libedit2 \
    libsqlite3-0 \
    libxml2 \
    libjansson4 \
    libsrtp2-1 \
    libspeex1 \
    libspeexdsp1 \
    libogg0 \
    libvorbis0a \
    libasound2 \
    libcurl4 \
    libxslt1.1 \
    libnewt0.52 \
    libopus0 \
    libopusfile0 \
    libuuid1 \
    liblua5.1-0 \
    lua-socket \
    lua-sec \
    lua-cjson \
    unixodbc \
    libsybdb5 \
    libmariadb3 \
    libsnmp40 \
    libspandsp2 \
    libgsm1 \
    libncurses6 \
    libcap2 \
    iproute2 \
    sngrep \
    ngrep \
    tcpdump \
    less \
    bash \
    wget \
    git \
    cmake \
    ca-certificates \
    luarocks \
    build-essential \
    liblua5.1-0-dev \
    && rm -rf /var/lib/apt/lists/*

# Install lua modules via luarocks
RUN luarocks install redis-lua && \
    luarocks install luafilesystem && \
    apt-get purge -y build-essential && \
    apt-get autoremove -y

# Copy Asterisk from builder (including libraries)
COPY --from=builder /usr/lib/asterisk /usr/lib/asterisk
COPY --from=builder /usr/lib/libasterisk*.so* /usr/lib/
COPY --from=builder /usr/sbin/asterisk /usr/sbin/asterisk
COPY --from=builder /usr/sbin/rasterisk /usr/sbin/rasterisk
COPY --from=builder /var/lib/asterisk /var/lib/asterisk
COPY --from=builder /var/spool/asterisk /var/spool/asterisk
COPY --from=builder /etc/asterisk /etc/asterisk

# Update library cache
RUN ldconfig

# Create asterisk user and set permissions
RUN groupadd -g 1000 asterisk && \
    useradd -u 1000 -g asterisk -d /var/lib/asterisk -s /bin/bash asterisk && \
    mkdir -p /var/run/asterisk /var/log/asterisk /var/spool/asterisk && \
    chown -R asterisk:asterisk /var/run/asterisk /var/log/asterisk /var/spool/asterisk /var/lib/asterisk /etc/asterisk

# Copy configuration files
COPY ./templates /templates
COPY ./config /config
COPY ./docker-entrypoint.sh /docker-entrypoint.sh
COPY ./extensions.lua /config/extensions.lua
RUN chmod +x /docker-entrypoint.sh

WORKDIR /
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD []
