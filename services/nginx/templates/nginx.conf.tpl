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

    upstream vaultwarden-default {
      zone vaultwarden-default 64k;
      server vaultwarden:80;
      keepalive 2;
    }
    upstream vaultwarden-ws {
      zone vaultwarden-ws 64k;
      server vaultwarden:3012;
      keepalive 2;
    }
    server {
	listen 80 default_server;
	listen [::]:80 default_server;
	return 301 https://$host$request_uri;
    }

    server {
        resolver 127.0.0.11;
        server_name DOMAIN;
	listen 443 ssl default_server;
        ssl_certificate /etc/letsencrypt/live/DOMAIN/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/DOMAIN/privkey.pem;
	index index.html index.htm index.nginx-debian.html;
        root /usr/share/nginx/html;

        location /.well-known/matrix/client {
            add_header Content-Type application/json;
            add_header Access-Control-Allow-Origin *;
            return     200
              '{"m.homeserver":{"base_url":"https://DOMAIN"},"m.identity_server":{"base_url":"https://vector.im"}}';
         }

         location /.well-known {
            set $proxied synapse:8008;
            add_header       Access-Control-Allow-Origin *;
            proxy_pass       http://$proxied;
            proxy_set_header X-Forwarded-For $remote_addr;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Host $host;
         }
         location ~ ^(/_matrix|/_synapse/client) {
            # note: do not add a path (even a single /) after the port in `proxy_pass`,
            # otherwise nginx will canonicalise the URI and cause signature verification
            # errors.
            set $proxied synapse:8008;
            proxy_pass           http://$proxied;
            proxy_set_header     X-Forwarded-For $remote_addr;
            proxy_set_header     X-Forwarded-Proto $scheme;
            proxy_set_header     Host $host;
            # Nginx by default only allows file uploads up to 1M in size
            # Increase client_max_body_size to match max_upload_size defined in homeserver.yaml
            client_max_body_size 500M;
            # Synapse responses may be chunked, which is an HTTP/1.1 feature.
            proxy_http_version   1.1;
         }
         location /vault {
            proxy_set_header "Connection" "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_pass http://vaultwarden-default/;
         }
         location ~ ^/(?:_next/.*$|.*(?:ssg|build|framework|page-script).*js|image/.*|$) {
            proxy_set_header "Connection" "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_pass http://NEXT_CNAME:80;
         }
         location /notifications/hub/negotiate {
            proxy_http_version 1.1;
            proxy_set_header "Connection" "";
   
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
   
            proxy_pass http://vaultwarden-default;
        }
        location /notifications/hub {
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";

            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header Forwarded $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
     
            proxy_pass http://vaultwarden-ws;
        }
          
        location ~ ^(?:/$|/(vw_static|locales|theme_head|scripts|templates|api|identity|fonts|app|images|static|hub|anonymous|logout|users|organizations|diagnostics|app|attachments|alive|vw_static|sync|ciphers|accounts|devices|auth|two|sends|collections|plans|folders|emergency|settings|hibp|now|version|config|connect|invite|test|public|collect|[^/]+json$)) {
            proxy_pass           http://vaultwarden-default;
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
