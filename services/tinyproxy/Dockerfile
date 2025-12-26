FROM alpine:3.19

RUN apk add --no-cache tinyproxy

COPY tinyproxy.conf /etc/tinyproxy/tinyproxy.conf

EXPOSE 8880

CMD ["tinyproxy", "-d"]
