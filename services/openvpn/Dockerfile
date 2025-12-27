FROM alpine:3.19

RUN apk add --no-cache openvpn iptables bash python3

RUN mkdir -p /etc/openvpn /var/log/openvpn

COPY server.conf /etc/openvpn/server.conf
COPY entrypoint.sh /entrypoint.sh
COPY status-server.py /usr/local/bin/status-server.py
RUN chmod +x /entrypoint.sh /usr/local/bin/status-server.py

EXPOSE 1194/tcp
EXPOSE 8081/tcp

ENTRYPOINT ["/entrypoint.sh"]
