user             www-data;
worker_processes auto;
pid              /run/nginx.pid;

events {
    worker_connections 768;
}

http {
    sendfile                  on;
    tcp_nopush                on;
    types_hash_max_size       2048;
    default_type              application/octet-stream;
    ssl_protocols             TLSv1 TLSv1.1 TLSv1.2 TLSv1.3; # Dropping SSLv3, ref: POODLE
    ssl_prefer_server_ciphers on;
    access_log                /var/log/nginx/access.log;
    error_log                 /var/log/nginx/error.log;
    gzip                      on;

    server {
        server_name DOMAIN;

        location /.well-known/matrix/client {
            add_header Content-Type application/json;
            add_header Access-Control-Allow-Origin *;
            return     200
              '{"m.homeserver":{"base_url":"https://DOMAIN"},"m.identity_server":{"base_url":"https://vector.im"}}';
        }

        location /.well-known {
            add_header       Access-Control-Allow-Origin *;
            proxy_pass       http://synapse:8008;
            proxy_set_header X-Forwarded-For $remote_addr;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Host $host;
        }

        location ~ ^(/_matrix|/_synapse/client) {
            # note: do not add a path (even a single /) after the port in `proxy_pass`,
            # otherwise nginx will canonicalise the URI and cause signature verification
            # errors.
            proxy_pass           http://synapse:8008;
            proxy_set_header     X-Forwarded-For $remote_addr;
            proxy_set_header     X-Forwarded-Proto $scheme;
            proxy_set_header     Host $host;
            # Nginx by default only allows file uploads up to 1M in size
            # Increase client_max_body_size to match max_upload_size defined in homeserver.yaml
            client_max_body_size 500M;
            # Synapse responses may be chunked, which is an HTTP/1.1 feature.
            proxy_http_version   1.1;
        }
    }
}
