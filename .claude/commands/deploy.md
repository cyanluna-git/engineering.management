---
name: deploy
description: EOB 배포 스킬. "배포하자", "배포해줘", "deploy", "프론트 배포", "백엔드 배포" 등 배포 관련 요청 시 실행. 변경 파일을 분석해 frontend/backend/both를 판단하고 빠른 배포를 수행.
---

# EOB Deploy Skill

배포 요청을 받으면 **자동으로 판단**하여 적절한 배포를 수행한다.

## 판단 로직

### 1단계: 무엇이 바뀌었는지 감지

마지막 배포 이후 변경된 파일을 분석한다:

```bash
# 커밋되지 않은 변경 + 최근 커밋 변경 파일
git diff --name-only HEAD
git diff --name-only HEAD~1..HEAD
```

**자동 분류 규칙**:

| 변경 경로 패턴 | 타겟 |
|---------------|------|
| `frontend/` | `frontend` |
| `backend/` | `backend` |
| `frontend/` + `backend/` | `both` |
| `docker-compose.*`, `scripts/deploy/`, `.env*` | `both` |
| 위에 해당 없음 | `both` (안전한 기본값) |

복수 영역이 변경됐으면 합집합.

### 2단계: 배포 방식 결정

| 조건 | 방식 | 시간 |
|------|------|------|
| 기본 (개발 중) | **Quick Deploy** — 빌드 + SSH 전송, 타겟만 | ~30초~1분 |
| 유저가 "풀배포", "전체 배포", "full deploy" 언급 | **Full Deploy** — `full_deploy.sh` | ~5분 |
| 유저가 "마이그레이션 포함", "DB 포함" 언급 | **Full Deploy** (백업 포함) | ~5분 |

### 3단계: 유저에게 확인

배포 전 판단 결과를 한 줄로 보여주고 확인받는다:

```
frontend 변경 감지 → quick deploy (frontend only, ~30초) 진행할까요?
```

유저가 "ㅇㅇ", "응", "고", "yes", "ㄱ", 또는 "배포하자"로 시작한 경우 바로 실행.

---

## Quick Deploy 실행 (기본)

### 스크립트

```bash
./scripts/deploy/quick_deploy.sh <target> [--no-cache]
```

**타겟**: `frontend` (`fe`, `f`), `backend` (`be`, `b`), `both` (`all`)

**옵션**:
- `--no-cache`: Docker 캐시 없이 클린 빌드

### 동작 순서

```
1. docker compose build <service>     (로컬 빌드, 타겟만)
2. docker save | gzip | scp           (이미지 서버 전송)
3. docker load + docker compose up -d (해당 컨테이너만 재시작)
4. health check                       (상태 확인)
```

- **DB는 절대 건드리지 않는다** (postgres 컨테이너 무시)
- DB 백업/마이그레이션 없음
- postgres 이미지 export 없음

### 커밋되지 않은 변경이 있을 때

- 커밋 먼저 할지 물어본다
- 유저가 "그냥 배포해" 라고 하면 그대로 진행

---

## Full Deploy 실행 (공식 배포)

유저가 명시적으로 요청할 때만:

```bash
cd /home/edwards/cyanluna.dev/edwards/engineering.management
bash scripts/deploy/full_deploy.sh [--skip-backup]
```

- DB 백업 포함 (기본)
- 전체 아카이브 생성 + 업로드
- postgres 이미지 포함
- `--skip-backup`: DB 백업 생략

---

## 서버 정보

| 항목 | 값 |
|------|------|
| Host | 10.182.252.32 (VTISAZUAPP218) |
| User | atlasAdmin (SSH key) |
| App Dir | /data/eob/edwards_project |
| Frontend | https://eob.10.182.252.32.sslip.io |
| Backend | http://localhost:8004 |
| DB | PostgreSQL :5434 (절대 건드리지 않음) |

## 서비스 매핑

| 서비스 | 이미지 | 컨테이너 |
|--------|--------|----------|
| frontend | edwards_project-frontend | edwards-web |
| backend | edwards_project-backend | edwards-api |
| db | postgres:15 | edwards-postgres (배포 대상 아님) |

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| SSH 타임아웃 | VPN 미연결 | Edwards VPN 확인 |
| 빌드 실패 | Docker 캐시 문제 | `--no-cache` 옵션 |
| TypeScript 에러 | `tsc -b` 엄격 모드 | 로컬에서 `npx tsc --noEmit` 확인 |
| 컨테이너 시작 안 됨 | 마이그레이션 필요 | full deploy로 배포 |
