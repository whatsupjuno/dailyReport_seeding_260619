#!/bin/bash
# 정해진 시점에 활성 사용자에게 보고 안내 메일 발송 (cron이 호출)
# 주의: node_modules/.bin/tsx 는 sh shim 이라 `node`로 직접 실행하면 안 됨.
#       tsx의 실제 CLI(dist/cli.mjs)를 node로 실행한다.
export PATH=/usr/bin:/bin
export TZ=Asia/Seoul
cd /opt/apps/seeding || exit 1
/usr/bin/node node_modules/tsx/dist/cli.mjs scripts/dispatch.ts "$1" >> /var/log/seeding-dispatch.log 2>&1
