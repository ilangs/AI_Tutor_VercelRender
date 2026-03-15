"""
routers/auth.py  ─  인증 관련 API 라우터
로그인, 회원가입, 로그아웃 및 JWT 토큰 발급/검증을 담당합니다.
"""

import os
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel
from dotenv import load_dotenv

from app.utils.db_manager import get_user, verify_password, create_user

load_dotenv()

# JWT 설정
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "CHANGE_THIS_IN_PRODUCTION")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60


class TokenResponse(BaseModel):
    """로그인 성공 시 반환하는 JWT 토큰 응답."""
    access_token: str
    token_type: str = "bearer"
    username: str


class UserInfo(BaseModel):
    """GET /auth/me 응답 형식."""
    username: str
    current_unit: str
    nickname: str | None = None
    character: str | None = None


class RegisterRequest(BaseModel):
    """POST /auth/register 요청 데이터 구조."""
    username: str
    password: str
    nickname: str
    character: str


# Authorization 헤더에서 Bearer 토큰을 추출하는 OAuth2 유틸
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def create_access_token(data: dict) -> str:
    """주어진 payload로 만료 시간이 포함된 JWT 토큰을 생성합니다."""
    payload = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload.update({"exp": expire})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Authorization 헤더의 JWT 토큰을 검증하고 유저 정보를 반환합니다.
    검증 실패 시 HTTP 401 반환.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="로그인이 필요합니다. 토큰이 유효하지 않거나 만료되었습니다.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = get_user(username)
    if user is None:
        raise credentials_exception

    return user


router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    아이디와 비밀번호를 받아 JWT 토큰을 발급합니다.
    보안상 아이디/비밀번호 오류를 구분하지 않고 동일한 에러 메시지를 반환합니다.
    """
    user = get_user(form_data.username)

    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="아이디 또는 비밀번호가 일치하지 않습니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # "sub" 클레임에 사용자명을 담아 토큰 생성
    access_token = create_access_token(data={"sub": user["username"]})

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        username=user["username"]
    )


@router.post("/register")
async def register(user: RegisterRequest):
    """새 사용자를 등록합니다. 비밀번호는 bcrypt 해시로 저장됩니다."""
    success = create_user(
        username=user.username,
        plain_password=user.password,
        nickname=user.nickname,
        character=user.character
    )

    if not success:
        raise HTTPException(
            status_code=400,
            detail="이미 존재하는 아이디입니다."
        )

    return {"message": "회원가입이 완료되었습니다."}


@router.get("/me", response_model=UserInfo)
async def get_me(current_user: dict = Depends(get_current_user)):
    """현재 JWT 토큰의 사용자 정보를 반환합니다."""
    return UserInfo(
        username=current_user["username"],
        current_unit=current_user.get("current_unit", "None"),
        nickname=current_user.get("nickname"),
        character=current_user.get("character")
    )


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """
    로그아웃 처리.
    JWT는 Stateless이므로 서버에서 토큰을 무효화할 수 없습니다.
    실제 삭제는 클라이언트(sessionStorage)에서 수행해야 합니다.
    """
    return {
        "message": f"{current_user['username']}님이 로그아웃되었습니다.",
        "instruction": "클라이언트에서 토큰을 삭제해 주세요."
    }
