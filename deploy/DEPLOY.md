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
*/5 6-22 * * *   /opt/apps/seeding/deploy/cron-dispatch.sh plan_invite_tick  # 그룹별 작성요청 메일(groups.invite_at 시각·평일/AI매일)
50 11 * * 1-5    /opt/apps/seeding/deploy/cron-dispatch.sh morning_close     # 오전 마감 안내
50 17 * * 1-5    /opt/apps/seeding/deploy/cron-dispatch.sh afternoon_close   # 오후 마감 안내
*/10 20-22 * * 1-5 /opt/apps/seeding/deploy/cron-dispatch.sh submit_nag      # 미제출 독촉(10분 간격)
# 그룹별 자동제출(마감 시각에 검수대기로 자동 전이). 2번째 인자=그룹 슬러그.
0  20 * * 1-5    /opt/apps/seeding/deploy/cron-dispatch.sh auto_submit sales # Sales 20:00 자동제출
30 21 * * 1-5    /opt/apps/seeding/deploy/cron-dispatch.sh auto_submit pd    # Product Design 21:30 자동제출
0  9  * * *      /opt/apps/seeding/deploy/cron-dispatch.sh auto_submit ai    # AI Agent 매일 09:00(어제 윈도우)
```
> 자동제출은 `groups.submit_due`가 NULL이면 cron 줄이 있어도 스킵(정책 = DB 단일 진실원천). AI는 09:00 이전 호출 방어.
> AI 그룹은 자체 API·09:00 슬롯으로 자기관리하므로 plan_invite/마감안내/독촉 전사 이메일에서 제외된다.
> ⚠️ crontab은 **레포에 포함된 `deploy/cron-dispatch.sh`** 경로를 써야 함. (루트 `/opt/apps/seeding/cron-dispatch.sh`는 레포에 없어 `rsync --delete` 동기화 시 삭제되어 cron이 전부 실패했던 이력 있음 — 2026-06.)
로그: `/var/log/seeding-dispatch.log`. 각 발송은 당일 보고서를 보장하고 `notifications`에 기록.

> **submit_nag(미제출 독촉)**: 20:00 이후, **야간 업무가 없는데 아직 제출하지 않은** 사용자에게만 **10분 간격**으로 발송. 사용자당 당일 **최대 30회**(`notifications`의 submit_nag 수로 캡). **제출 완료/야간 업무 있음이면 즉시 제외**(매 주기 재확인). 코드(`dispatch.ts`)에 20:00 이전 게이트가 있어 cron 시간대(`20-22`)와 이중 안전.
> 참고: 10분 간격 + `20-22`시 창이면 실제로는 20:00~22:50에 **최대 ~18회** 발송(캡 30은 안전 상한). 30회를 끝까지 채우려면(≈01:00까지) cron 시간대를 넓혀야 함.

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
