#!/bin/bash
set -a
source /opt/xdigitex/api/.env
set +a
exec node --enable-source-maps /opt/xdigitex/api/index.mjs
