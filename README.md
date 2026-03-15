# 🐰 AI Math Tutor — 루미와 함께하는 초등 수학

초등학교 5학년 학생을 위한 AI 기반 1:1 수학 튜터링 서비스입니다.
LangChain · LangGraph · FastAPI · ChromaDB · OpenAI GPT-4o

---

## ✨ 주요 기능

- **오늘의 학습**: 단원 선택 → AI 개념 설명 → 이해도 평가 → 문제 풀기 → AI 채점
- **AI 자유학습 채팅**: RAG 기반 수학 질문 자유 채팅
- **단원 시험**: 10문제 자동 출제 → 병렬 채점 → 결과 저장
- **성적 대시보드**: 학습 이력, 정답률 통계, 시험 점수 추이
- **토큰 사용 로그**: LLM API 호출 비용 추적

---

## 🚀 배포 구성 (Vercel + Render)

| 서비스 | 플랫폼 | 설정 경로 |
|--------|--------|-----------|
| 프론트엔드 | Vercel | Root Directory: `frontend` |
| 백엔드 | Render | Root Directory: `backend` |

### Vercel 설정

1. Vercel 프로젝트에서 **Root Directory** → `frontend`
2. `frontend/vercel.json`의 `YOUR-RENDER-APP`을 실제 Render 서비스 URL로 변경

```json
{ "src": "/auth/(.*)", "dest": "https://실제-render-앱.onrender.com/auth/$1" }
```

### Render 설정

- Render 프로젝트에서 **Root Directory** → `backend`
- `backend/render.yaml`이 Docker 빌드를 자동으로 구성합니다.
- Render 대시보드 → **Environment** 탭에서 아래 환경변수를 설정하세요.

---

## ⚙️ 환경변수

| 변수명 | 설명 | 필수 |
|--------|------|------|
| `OPENAI_API_KEY` | OpenAI API 키 | ✅ |
| `JWT_SECRET_KEY` | JWT 서명용 시크릿 키 (임의의 긴 문자열) | ✅ |
| `ALLOWED_ORIGINS` | CORS 허용 도메인 (쉼표 구분, 예: `https://your-app.vercel.app`) | 권장 |

> JWT_SECRET_KEY 생성: `python -c "import secrets; print(secrets.token_hex(32))"`

---

## 🛠️ 기술 스택

| 분류 | 기술 |
|------|------|
| Backend | FastAPI, Python 3.10 |
| AI / LLM | OpenAI, LangChain, LangGraph |
| RAG | ChromaDB, text-embedding-3-small |
| Database | SQLite |
| Auth | JWT (python-jose), bcrypt |
| Frontend | Vanilla HTML / JS |
| Deploy | Vercel (프론트) + Render (백엔드) |

---

## 💻 로컬 개발

```bash
cd backend
pip install -r requirements.txt
# .env 파일에 OPENAI_API_KEY, JWT_SECRET_KEY 설정 (.env.example 참고)
python -m uvicorn server:app --reload --port 10000
# http://localhost:10000 접속
```

---

## 📄 라이선스

교육 목적으로 제작된 프로젝트입니다. (AI Agent 과정)

```
AI_Tutor_render_versel/
├── .env.eample
├── .gitignore
├── README.md
├── backend/              
│   ├── app/
│   ├── aseets/
│   ├── RAG_sys/
│   ├── data/
│   ├── database/
│   ├── server.py
│   ├── requirements.txt
│   ├── render.yaml
│   └── Dockerfile
└── frontend/              
    ├── login.html
    ├── app.html
    ├── vercel.json
    ├── js/
    ├── css/
    └── assets/
```