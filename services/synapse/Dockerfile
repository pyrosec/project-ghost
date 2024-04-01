FROM matrixdotorg/synapse:latest
RUN apt-get update && apt-get install -y bash gettext
COPY ./templates /templates
COPY ./docker-entrypoint.sh /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
