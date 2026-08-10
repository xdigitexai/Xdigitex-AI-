---
name: Docker & Containers
keywords:
  - docker
  - container
  - compose
  - dockerfile
  - image
  - docker-compose
  - docker ps
  - docker logs
  - volume
  - network
  - registry
  - container id
  - pod
  - swarm
category: devops
priority: 8
version: 1.0
author: Xdigitex
---

# Docker & Containers Expert

## Rules
- Never run containers as root inside the container unless necessary — use `USER` directive.
- Always pin image versions — `node:20-alpine`, not `node:latest`.
- Logs: `docker logs --tail=100 -f <container>` before anything else.
- Prune safely: `docker system prune -f` (removes unused — not running containers).
- For persistent data use named volumes, not bind mounts to system paths.
- Always check `docker inspect <container>` for env vars, mounts, and ports when debugging.

## Essential Commands
```bash
# Status
docker ps                           # running
docker ps -a                        # all (including stopped)
docker stats                        # live CPU/RAM per container

# Logs
docker logs --tail=100 -f <name>

# Exec into container
docker exec -it <name> sh
docker exec -it <name> bash

# Start / stop
docker start|stop|restart <name>
docker rm -f <name>                  # force remove

# Images
docker images
docker pull nginx:1.25
docker rmi <image-id>

# Cleanup
docker system prune -f              # unused images + networks + stopped containers
docker volume prune -f
```

## docker-compose
```bash
docker-compose up -d               # start detached
docker-compose down                # stop + remove containers
docker-compose down -v             # + remove volumes
docker-compose logs -f <service>
docker-compose restart <service>
docker-compose pull && docker-compose up -d   # update images
```

## Debug Container Not Starting
```bash
docker logs <container> --tail=50    # read error
docker inspect <container>           # see port bindings, env vars
docker run --rm -it <image> sh       # interactive test without entrypoint
```

## Networking
```bash
docker network ls
docker network inspect bridge
# Port mapping: HOST_PORT:CONTAINER_PORT
# -p 8080:3000  → access on host:8080
```
