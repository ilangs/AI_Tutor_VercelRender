# Vercel + Render 배포 완전 가이드
> AI Agent 과정 수강생용 — 처음부터 끝까지 따라하기

---

## 목차

1. [전체 구조 이해](#1-전체-구조-이해)
2. [사전 준비](#2-사전-준비)
3. [GitHub 저장소 설정](#3-github-저장소-설정)
4. [Render 백엔드 배포](#4-render-백엔드-배포)
5. [Vercel 프론트엔드 배포](#5-vercel-프론트엔드-배포)
6. [vercel.json 연결 설정](#6-verceljson-연결-설정)
7. [환경변수 설정](#7-환경변수-설정)
8. [배포 확인 및 테스트](#8-배포-확인-및-테스트)
9. [폴더 구조 정리](#9-폴더-구조-정리)
10. [자주 발생하는 문제](#10-자주-발생하는-문제)

---

## 1. 전체 구조 이해

```
인터넷 사용자
     │
     ▼
┌─────────────────────────────────────┐
│  Vercel (프론트엔드)                  │
│  https://your-app.vercel.app        │
│  - login.html, app.html             │
│  - JS, CSS, 이미지                   │
│  - vercel.json (API 프록시 설정)      │
└──────────────┬──────────────────────┘
               │  /auth/* /api/* 요청
               ▼
┌─────────────────────────────────────┐
│  Render (백엔드)                     │
│  https://your-app.onrender.com      │
│  - FastAPI 서버 (Docker 컨테이너)     │
│  - SQLite DB                        │
│  - ChromaDB (벡터 DB)                │
│  - LangChain + OpenAI               │
└─────────────────────────────────────┘
```

**왜 Vercel + Render 조합인가?**

| | Vercel | Render |
|---|---|---|
| 역할 | 정적 파일 서빙 (HTML/JS/CSS) | Python 서버 실행 |
| 무료 플랜 | 넉넉한 무료 플랜 | Docker 지원 무료 플랜 |
| 자동 배포 | GitHub push 시 자동 | GitHub push 시 자동 |
| 특징 | CDN으로 빠른 응답 | 항상 실행 중인 서버 필요한 경우 |

---

## 2. 사전 준비

### 필요한 계정 (모두 무료)

- **GitHub** — https://github.com — 코드 저장소
- **Vercel** — https://vercel.com — 프론트엔드 배포
- **Render** — https://render.com — 백엔드 배포
- **OpenAI** — https://platform.openai.com — API 키 발급

### 필요한 도구

- Git 설치 (https://git-scm.com)
- VS Code 또는 원하는 에디터

---

## 3. GitHub 저장소 설정

### 3-1. GitHub 회원가입

1. https://github.com 접속
2. **Sign up** 클릭
3. 이메일, 비밀번호, 사용자명 입력
4. 이메일 인증 완료

### 3-2. 저장소(Repository) 생성

1. GitHub 로그인 후 우측 상단 **+** → **New repository**
2. 설정:
   - **Repository name**: `AI-Tutor-VercelRender` (원하는 이름)
   - **Public** 선택 (Vercel/Render 무료 플랜은 Public 저장소 권장)
   - **Add a README file** 체크 해제 (우리가 직접 올릴 것)
3. **Create repository** 클릭

### 3-3. 로컬에서 코드 올리기

```bash
# 프로젝트 폴더에서 실행
cd AI_Tutor_VercelRender

# git 초기화 (이미 되어 있으면 건너뜀)
git init

# 모든 파일 추가 (.gitignore에 제외 목록 확인 필수)
git add .
git commit -m "initial commit"

# GitHub 저장소와 연결 (본인 저장소 URL로 변경)
git remote add origin https://github.com/your-username/AI-Tutor-VercelRender.git

# 업로드
git push -u origin main
```

### 3-4. .gitignore 확인 (중요!)

업로드하면 안 되는 파일들이 `.gitignore`에 있는지 확인:

```gitignore
.env                    # API 키 등 비밀 정보 — 절대 업로드 금지
__pycache__/
*.pyc
*.sqlite                # 운영 DB는 서버에서 생성
```

---

## 4. Render 백엔드 배포

### 4-1. Render 회원가입

1. https://render.com 접속
2. **Get Started for Free** 클릭
3. **GitHub으로 로그인** 권장 (이후 연동 편리)

### 4-2. 새 Web Service 생성

1. Dashboard → **New +** → **Web Service**
2. **Connect a repository** → GitHub 저장소 선택
   - GitHub 연동 버튼 클릭 → 권한 허용
   - 방금 만든 `AI-Tutor-VercelRender` 저장소 선택
3. **Connect** 클릭

### 4-3. 서비스 설정

| 항목 | 설정값 |
|------|--------|
| **Name** | `ai-math-tutor` (원하는 이름) |
| **Region** | Singapore (한국에서 가장 빠름) |
| **Branch** | `main` |
| **Root Directory** | `backend` ← **중요!** |
| **Environment** | `Docker` |
| **Dockerfile Path** | `./Dockerfile` |
| **Instance Type** | `Free` |

> `Root Directory`를 `backend`로 설정하면 Render가 `backend/` 폴더만 빌드합니다.

### 4-4. 환경변수 설정

**Advanced** 섹션 → **Add Environment Variable**:

| Key | Value |
|-----|-------|
| `OPENAI_API_KEY` | `sk-...` (OpenAI에서 발급) |
| `JWT_SECRET_KEY` | 랜덤 문자열 (아래 명령어로 생성) |
| `ALLOWED_ORIGINS` | (지금은 비워두고 Vercel URL 발급 후 추가) |

```bash
# JWT_SECRET_KEY 생성 명령어 (로컬에서 실행)
python -c "import secrets; print(secrets.token_hex(32))"
```

### 4-5. 배포 시작

**Create Web Service** 클릭 → 배포 시작 (첫 빌드는 5~10분 소요)

배포 완료 후 URL 확인:
```
https://ai-math-tutor-xxxx.onrender.com
```

### 4-6. 배포 확인

브라우저에서 접속:
```
https://ai-math-tutor-xxxx.onrender.com/health
```

아래 응답이 오면 성공:
```json
{"status": "ok", "message": "AI Math Tutor 서버가 정상 동작 중입니다."}
```

---

## 5. Vercel 프론트엔드 배포

### 5-1. Vercel 회원가입

1. https://vercel.com 접속
2. **Sign Up** → **Continue with GitHub** 클릭
3. GitHub 권한 허용

### 5-2. 새 프로젝트 생성

1. Dashboard → **Add New...** → **Project**
2. **Import Git Repository** → GitHub 저장소 선택
   - `AI-Tutor-VercelRender` 선택 → **Import**

### 5-3. 프로젝트 설정

| 항목 | 설정값 |
|------|--------|
| **Project Name** | `ai-tutor-vercel-render` |
| **Framework Preset** | `Other` |
| **Root Directory** | `frontend` ← **중요!** |
| **Build Command** | 비워둠 (정적 파일이므로 빌드 불필요) |
| **Output Directory** | 비워둠 |

> `Root Directory`를 `frontend`로 설정하면 Vercel이 `frontend/` 폴더만 배포합니다.

### 5-4. 배포 시작

**Deploy** 클릭 → 약 1분 내 완료

배포 완료 후 URL 확인:
```
https://ai-tutor-vercel-render.vercel.app
```

---

## 6. vercel.json 연결 설정

Vercel은 `/auth/*`, `/api/*` 요청을 Render 백엔드로 **프록시** 해줍니다.
이 설정이 없으면 프론트에서 백엔드를 호출할 수 없습니다.

### 6-1. vercel.json 수정

`frontend/vercel.json` 파일에서 Render URL을 실제 값으로 변경:

```json
{
  "routes": [
    {
      "src": "/auth/(.*)",
      "dest": "https://ai-math-tutor-xxxx.onrender.com/auth/$1"
    },
    {
      "src": "/api/(.*)",
      "dest": "https://ai-math-tutor-xxxx.onrender.com/api/$1"
    },
    {
      "src": "/health",
      "dest": "https://ai-math-tutor-xxxx.onrender.com/health"
    },
    {
      "src": "/main",
      "dest": "/app.html"
    },
    {
      "src": "/",
      "dest": "/login.html"
    },
    {
      "src": "/(.*)",
      "dest": "/$1"
    }
  ]
}
```

### 6-2. Render CORS 설정 업데이트

Render 대시보드 → 해당 서비스 → **Environment** → `ALLOWED_ORIGINS` 값 업데이트:

```
https://ai-tutor-vercel-render.vercel.app
```

여러 도메인 허용 시 쉼표로 구분:
```
https://ai-tutor-vercel-render.vercel.app,https://custom-domain.com
```

### 6-3. 변경사항 배포

```bash
git add frontend/vercel.json
git commit -m "fix: Render URL 연결"
git push
```

GitHub에 push하면 Vercel이 자동으로 재배포합니다.

---

## 7. 환경변수 설정

### Render 환경변수 전체 목록

Render Dashboard → 서비스 선택 → **Environment** 탭:

| 변수명 | 예시 값 | 설명 |
|--------|---------|------|
| `OPENAI_API_KEY` | `sk-proj-abc123...` | OpenAI API 키 |
| `JWT_SECRET_KEY` | `a3f9b2c1d4e5...` (64자) | JWT 토큰 서명 키 |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` | CORS 허용 도메인 |

### OpenAI API 키 발급 방법

1. https://platform.openai.com 접속
2. 로그인 → 우측 상단 계정 → **API keys**
3. **Create new secret key** → 키 복사 (한 번만 표시됨)
4. Render 환경변수에 붙여넣기

---

## 8. 배포 확인 및 테스트

### 체크리스트

```
□ Render 헬스체크:  https://your-app.onrender.com/health
□ Vercel 접속:     https://your-app.vercel.app (로그인 화면 표시)
□ 회원가입 테스트:  닉네임/아이디/비밀번호/캐릭터 선택 후 가입 완료
□ 로그인 테스트:   가입한 계정으로 로그인 성공
□ API 연동 테스트: 로그인 후 튜터 기능 동작 확인
```

### Render 무료 플랜 주의사항

> Render 무료 플랜은 **15분 비활성 시 서버가 절전 모드**로 전환됩니다.
> 다음 요청 시 30~60초 지연이 발생합니다. 이는 정상입니다.
> 절전 방지가 필요하면 유료 플랜으로 업그레이드하거나, UptimeRobot(https://uptimerobot.com)으로 주기적 헬스체크를 설정하세요.

---

## 9. 폴더 구조 정리

```
AI_Tutor_VercelRender/          ← GitHub 루트 저장소
├── .env                         ← 로컬 개발용 (절대 GitHub에 올리지 말것!)
├── .gitignore
├── README.md
├── DEPLOY_GUIDE.md              ← 이 문서
│
├── backend/                     ← Render가 이 폴더를 배포
│   ├── Dockerfile               ← Docker 빌드 설정
│   ├── render.yaml              ← Render 서비스 설정
│   ├── server.py                ← FastAPI 진입점
│   ├── requirements.txt         ← Python 패키지 목록
│   ├── app/
│   │   ├── routers/             ← API 라우터 (auth.py, tutor.py)
│   │   ├── services/            ← 비즈니스 로직
│   │   ├── tutor/               ← LangGraph AI 튜터
│   │   └── utils/               ← DB 관리, 유틸리티
│   ├── RAG_sys/                 ← RAG 파이프라인
│   ├── data/processed/          ← 수학 문제 데이터셋 CSV
│   ├── database/                ← SQLite DB + ChromaDB (서버에서 생성)
│   └── assets/audio/            ← TTS 오디오 파일 (서버에서 생성)
│
└── frontend/                    ← Vercel이 이 폴더를 배포
    ├── vercel.json              ← Vercel 라우팅 + Render 프록시 설정
    ├── login.html               ← 로그인/회원가입 페이지
    ├── app.html                 ← 메인 앱 (SPA)
    ├── css/app.css              ← 전체 스타일
    ├── js/
    │   ├── app.js               ← 공통 모듈 (JWT, API, SPA 라우팅)
    │   ├── section1.js          ← 오늘의 학습
    │   ├── section2.js          ← 자유학습 채팅
    │   ├── section3.js          ← 시험
    │   ├── section4.js          ← 성적 대시보드
    │   └── section5.js          ← 토큰 사용 로그
    └── assets/
        ├── images/              ← 캐릭터 이미지
        ├── fonts/               ← 한글 폰트
        └── animations/          ← 동영상
```

---

## 10. 자주 발생하는 문제

### 문제 1: CORS 오류 (Cross-Origin Request Blocked)

**증상**: 브라우저 콘솔에 CORS 에러 발생, API 호출 실패

**원인**: Render의 `ALLOWED_ORIGINS`에 Vercel URL이 없음

**해결**:
1. Render 대시보드 → Environment → `ALLOWED_ORIGINS` 값 확인
2. Vercel 배포 URL 추가 (예: `https://your-app.vercel.app`)
3. Render가 자동 재배포될 때까지 대기 (약 2~3분)

---

### 문제 2: Render 배포 실패 (Build Error)

**증상**: Render 로그에 빨간색 에러

**원인 및 해결**:
- `Root Directory`가 `backend`로 설정되었는지 확인
- `requirements.txt`의 패키지 버전 호환성 확인
- Render 로그 탭에서 구체적 에러 메시지 확인

---

### 문제 3: Vercel에서 API 호출 시 404

**증상**: `/auth/login` 요청이 404 반환

**원인**: `vercel.json`의 Render URL이 `YOUR-RENDER-APP` 그대로

**해결**: `frontend/vercel.json`의 URL을 실제 Render URL로 수정 후 push

---

### 문제 4: 로그인 후 화면이 안 나옴

**증상**: 로그인 성공 후 흰 화면 또는 리다이렉트 실패

**원인**: `vercel.json`의 `/main` → `/app.html` 라우팅 설정 누락

**해결**: `vercel.json`에 다음이 있는지 확인:
```json
{ "src": "/main", "dest": "/app.html" }
```

---

### 문제 5: Render 서버 응답 없음 (무료 플랜 절전)

**증상**: 첫 API 호출이 30~60초 걸림

**해결**: 정상입니다. UptimeRobot으로 15분마다 헬스체크를 설정하면 절전 방지 가능:
1. https://uptimerobot.com 가입
2. **New Monitor** → HTTP(s) 타입
3. URL: `https://your-app.onrender.com/health`
4. Monitoring Interval: 14분

---

## 배포 후 개발 사이클

코드 수정 → GitHub push → Vercel/Render 자동 배포

```bash
# 코드 수정 후
git add .
git commit -m "feat: 새로운 기능 추가"
git push

# → Vercel: 약 30초~1분 내 자동 반영
# → Render: 약 3~5분 내 자동 반영 (Docker 빌드)
```

---

*AI Agent 과정 — Vercel + Render 배포 가이드*
