#!/usr/bin/env bash

NAME=arangodb
CONTINUE=1

if [ ! "$(docker ps -q -f name=${NAME})" ]; then
    if [ "$(docker ps -aq -f status=exited -f name=${NAME})" ]; then
        echo "Removing container: ${NAME}"
        docker rm ${NAME}
    fi

    docker pull arangodb:latest
    echo "Starting ArangoDB container: ${NAME}"
    docker run -d -e ARANGO_NO_AUTH=1 -p 127.0.0.1:8529:8529 --name ${NAME} arangodb:latest
fi

docker ps -f name=${NAME}
sleep 4
while [ $CONTINUE -eq 1 ]; do
    sleep 1 &&
    curl -s 127.0.0.1:8529/_api/version &&
    CONTINUE=0;
done
echo "Connection to ArangoDB is live!"
