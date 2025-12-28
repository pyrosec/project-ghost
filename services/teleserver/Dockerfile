FROM debian:bookworm-slim AS builder

RUN apt-get update && apt-get install -y \
    git \
    gcc \
    make \
    libc-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

RUN git clone --depth 1 https://github.com/stanleyhuangyc/Freematics.git

WORKDIR /build/Freematics/server/teleserver

RUN make clean && make

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /build/Freematics/server/teleserver/teleserver /app/
COPY --from=builder /build/Freematics/server/teleserver/htdocs /app/htdocs/
COPY --from=builder /build/Freematics/server/teleserver/config /app/config/

RUN mkdir -p /app/data && chmod 755 /app/data

EXPOSE 8080/tcp
EXPOSE 8081/udp

CMD ["./teleserver"]
