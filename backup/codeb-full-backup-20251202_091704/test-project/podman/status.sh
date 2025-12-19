#!/bin/bash

echo "📊 CodeB 컨테이너 상태"
cd "."
podman-compose ps
