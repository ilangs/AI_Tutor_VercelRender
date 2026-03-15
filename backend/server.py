# 로컬 실행: python -m uvicorn server:app --reload --port 10000
# Render: render.yaml + Dockerfile로 자동 배포 (PORT 환경변수 사용)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from app.utils.db_manager import init_db
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer
import os

security = HTTPBearer()

app = FastAPI(
    title="AI Math Tutor API",
    description="초등학교 5학년 수학 AI 튜터 백엔드 API",
    version="1.0.0",
    swagger_ui_parameters={"persistAuthorization": True},
)

current_dir = os.path.dirname(os.path.abspath(__file__))
# 로컬 개발: backend/ 기준으로 ../frontend/ 참조
# 프로덕션(Render): Vercel이 frontend를 서빙하므로 이 경로는 사용되지 않음
frontend_dir = os.path.join(current_dir, "..", "frontend")

# 로컬 개발용: 프론트엔드 정적 파일 서빙 (프로덕션에서는 Vercel이 서빙)
if os.path.exists(frontend_dir):
    @app.get("/main")
    async def read_main():
        return FileResponse(os.path.join(frontend_dir, "app.html"))

    @app.get("/")
    async def read_index():
        return FileResponse(os.path.join(frontend_dir, "login.html"))

    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dir, "assets")), name="assets")
    app.mount("/css", StaticFiles(directory=os.path.join(frontend_dir, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(frontend_dir, "js")), name="js")

# ALLOWED_ORIGINS 환경변수로 허용 도메인 지정 (쉼표 구분)
# 미설정 시 로컬 개발 도메인 사용 (프로덕션에서는 Vercel 도메인을 포함해 설정)
_origins_env = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = (
    [o.strip() for o in _origins_env.split(",") if o.strip()]
    if _origins_env
    else [
        "http://localhost:10000",
        "http://127.0.0.1:10000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.routers.auth  import router as auth_router
from app.routers.tutor import router as tutor_router

app.include_router(auth_router,  prefix="/auth", tags=["인증"])
app.include_router(tutor_router, prefix="/api",  tags=["튜터"])


@app.on_event("startup")
async def startup_event():
    init_db()


def custom_openapi():
    """Swagger UI에 BearerAuth 토큰 입력란을 추가합니다."""
    if app.openapi_schema:
        return app.openapi_schema

    from fastapi.openapi.utils import get_openapi
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )

    schema.setdefault("components", {})
    schema["components"].setdefault("securitySchemes", {})
    schema["components"]["securitySchemes"]["BearerAuth"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "🔑 /auth/login 에서 발급받은 access_token을 입력하세요",
    }

    for path in schema.get("paths", {}).values():
        for operation in path.values():
            if isinstance(operation, dict):
                operation.setdefault("security", []).append({"BearerAuth": []})

    app.openapi_schema = schema
    return schema

app.openapi = custom_openapi


@app.get("/health", tags=["헬스체크"])
async def health_check():
    return {"status": "ok", "message": "AI Math Tutor 서버가 정상 동작 중입니다."}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 10000))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)
