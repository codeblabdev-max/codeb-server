#!/bin/bash

cd "."
podman-compose logs -f $@
