FROM debian:bookworm-slim
WORKDIR /opt
RUN apt-get update
RUN apt-get install -y git gettext build-essential autoconf binutils automake bash sudo findutils less curl sngrep ngrep tcpdump libcap-dev libedit-dev libxml2-dev libsqlite3-dev libedit-dev libjansson-dev libssl-dev libxml2-dev patch uuid-dev iproute2
RUN git clone https://github.com/asterisk/asterisk
WORKDIR /opt/asterisk
RUN git checkout 20.5.0
RUN yes | ./contrib/scripts/install_prereq install
RUN ./configure --without-dahdi --without-pri --without-gtk2 --without-radius --without-x11 --without-speex
RUN make menuselect.makeopts
RUN menuselect/menuselect \
        --enable app_authenticate --enable app_cdr --enable app_celgenuserevent \
        --enable app_channelredirect --enable app_chanisavail --enable app_chanspy \
        --enable app_amd --enable app_mixmonitor --enable pbx_lua --enable res_srtp \
        --enable chan_sip --enable res_srtp --enable app_bridgewait --enable app_dial --enable app_playback --enable app_stack --enable app_verbose --enable app_voicemail --enable app_directory --enable app_confbridge --enable app_queue --enable app_playtones --enable app_disa --enable pbx_lua
RUN make install

# Copy custom RTT modules
COPY ./custom_modules/rtt /tmp/rtt
WORKDIR /tmp/rtt
RUN make ASTTOPDIR=/opt/asterisk && make ASTTOPDIR=/opt/asterisk install
RUN apt-get install -y luarocks lua5.2 liblua5.2-dev openssl cmake
RUN luarocks install --lua-version 5.2 --tree /usr/local configh
RUN luarocks install --lua-version 5.2 --tree /usr/local luasocket
RUN luarocks install --lua-version 5.2 --tree /usr/local redis-lua
RUN luarocks install --lua-version 5.2 --tree /usr/local luafilesystem
RUN luarocks install --lua-version 5.2 --tree /usr/local rapidjson
COPY ./templates /templates
COPY ./config /config
COPY ./docker-entrypoint.sh /docker-entrypoint.sh
COPY ./extensions.lua /config/extensions.lua
WORKDIR /
CMD ["bash", "/docker-entrypoint.sh"]
