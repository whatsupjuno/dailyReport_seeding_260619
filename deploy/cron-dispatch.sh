#!/bin/bash
# 정해진 시점에 활성 사용자에게 보고 안내 메일 발송 (cron이 호출)
export PATH=/usr/bin:/bin
export TZ=Asia/Seoul
cd /opt/apps/seeding || exit 1
/usr/bin/node node_modules/.bin/tsx scripts/dispatch.ts "$1" >> /var/log/seeding-dispatch.log 2>&1
