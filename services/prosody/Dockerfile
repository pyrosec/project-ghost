FROM debian:10
RUN apt-get update
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        lsb-base \
        gettext \
        sudo \
        procps \
        adduser \
        libidn11 \
        libicu63 \
        libssl1.1 \
        lua5.2 \
        openssl \
        ca-certificates \
        ssl-cert \
        build-essential \
        autoconf \
        automake \
        pkg-config \
        wget \
        liblua5.2-dev \
        libidn11-dev\
        libssl-dev \
        luarocks \
        libicu-dev \
        libunbound-dev \
        libexpat-dev
RUN adduser --gecos "" --disabled-password --disabled-login prosody
RUN luarocks install --lua-version 5.2 --tree /usr/local redis-lua
RUN luarocks install --lua-version 5.2 --tree /usr/local luaunbound
RUN luarocks install --lua-version 5.2 --tree /usr/local luafilesystem
RUN luarocks install --lua-version 5.2 --tree /usr/local luasec
WORKDIR /usr/src
RUN wget https://github.com/libexpat/libexpat/releases/download/R_2_6_2/expat-2.6.2.tar.gz
RUN tar xfvz expat-2.6.2.tar.gz
WORKDIR /usr/src/expat-2.6.2
RUN ./configure && make && make install
RUN luarocks install --lua-version 5.2 --tree /usr/local luaexpat
RUN mkdir -p /var/run/prosody && chown prosody /var/run/prosody
RUN mkdir -p /usr/local/var/lib/prosody/custom_plugins
WORKDIR /usr/src
RUN wget https://prosody.im/downloads/source/prosody-0.12.4.tar.gz
RUN tar xfvz prosody-0.12.4.tar.gz
RUN mv prosody-0.12.4 ./prosody
WORKDIR /usr/src/prosody
RUN ./configure && make && make install
RUN chown -R prosody /usr/local/var/lib/prosody
RUN prosodyctl install --server=https://modules.prosody.im/rocks/ mod_cloud_notify
#RUN prosodyctl install --server=https://modules.prosody.im/rocks/ mod_smacks
#RUN prosodyctl install --server=https://modules.prosody.im/rocks/ mod_push
#RUN prosodyctl install --server=https://modules.prosody.im/rocks/ mod_push_http
#RUN prosodyctl install --server=https://modules.prosody.im/rocks/ mod_unified_push
#RUN prosodyctl install --server=https://modules.prosody.im/rocks/ mod_http_upload
# Install lua-http for APNS support
RUN luarocks install --lua-version 5.2 --tree /usr/local http
COPY ./modules/mod_sms.lua /usr/local/lib/prosody/modules/mod_sms.lua
COPY ./templates /templates
COPY ./docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod 755 /docker-entrypoint.sh
ENV __FLUSH_LOG yes
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["prosody", "-F"]
