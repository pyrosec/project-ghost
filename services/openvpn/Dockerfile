FROM alpine:3.19

RUN apk add --no-cache openvpn iptables bash

RUN mkdir -p /etc/openvpn /var/log/openvpn

COPY server.conf /etc/openvpn/server.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 1194/tcp

ENTRYPOINT ["/entrypoint.sh"]
