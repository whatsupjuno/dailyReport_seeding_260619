# 배포 (운영) — cafe24 / 58.229.163.104

현재 **http://58.229.163.104** 에 라이브. 같은 서버의 기존 앱 `agentnews`(포트 3000, 자체 postgres 컨테이너)와 **격리 공존**.

## 구성
- OS: Ubuntu 22.04, Node 22, pnpm. 앱 경로: `/opt/apps/seeding`
- **앱**: systemd `seeding.service` → `next start -p 80` (root). `deploy/seeding.service`
- **DB**: 기존 `agentnews-postgres`(docker, postgres:16) 컨테이너 안에 **별도 DB `seeding` + 롤 `seeding`** 생성(데이터 격리). `DATABASE_URL=postgresql://seeding:***@127.0.0.1:5432/seeding`
- **메일**: NCP Outbound Mailer 실발송(`MAIL_TRANSPORT=ncp`, 발신 `no-reply@wavle.io`). 검증 완료(requestId 수신).
- **방화벽**: ufw에 80/tcp 추가(기존 22만 열려 있었음).
- 시크릿: 서버 `/opt/apps/seeding/.env.local`에만(미커밋). `SESSION_SECRET`(운영 필수)·`DATABASE_URL`·NCP 키.

## 자동 발송 (cron, KST 평일)
`deploy/cron-dispatch.sh` + 루트 crontab:
```
CRON_TZ=Asia/Seoul
30 8  * * 1-5  /opt/apps/seeding/cron-dispatch.sh plan_invite       # 오늘 계획 안내
50 11 * * 1-5  /opt/apps/seeding/cron-dispatch.sh morning_close     # 오전 마감 안내
50 17 * * 1-5  /opt/apps/seeding/cron-dispatch.sh afternoon_close   # 오후 마감 안내
```
로그: `/var/log/seeding-dispatch.log`. 각 발송은 당일 보고서를 보장하고 `notifications`에 기록.

## 재배포 절차
```bash
# 1) 코드 동기화 (로컬에서)
rsync -az --delete -e "ssh -i ~/.ssh/<key>" \
  --exclude node_modules --exclude .next --exclude .git --exclude '.env*' \
  ./ root@58.229.163.104:/opt/apps/seeding/

# 2) 서버에서
cd /opt/apps/seeding
pnpm install --no-frozen-lockfile
pnpm rebuild esbuild sharp @tailwindcss/oxide   # 빌드스크립트 승인 우회
node_modules/.bin/tsx scripts/migrate.ts        # 마이그레이션
node_modules/.bin/tsx scripts/seed-prod.ts      # 운영 시드(멱등)
NODE_ENV=production node_modules/.bin/next build
systemctl restart seeding
```

## 운영 사용자 (고정 4자리 코드 로그인 — OTP는 추후)
| 이름 | 아이디(=이메일) | 코드 | 역할 |
|---|---|---|---|
| 방준호 | juno@wavle.io | 5660 | 그룹장(Sales) |
| 박정빈 | jb@wavle.io | 7815 | 직원 |
| 강진현 | jhkang@wavle.io | 4942 | 직원 |

## 운영 점검
```bash
systemctl status seeding              # 앱
journalctl -u seeding -n 50           # 앱 로그
tail -f /var/log/seeding-dispatch.log # 발송 로그
docker exec agentnews-postgres psql -U seeding -d seeding -c "table notifications"
```

> ⚠️ 현재 인증은 고정 코드(브루트포스 레이트리밋 20/5분으로 완화). 운영 안정화 후 **자동 OTP/메일 인증 전환 권장**. 상세는 `docs/VERIFICATION.md`.
