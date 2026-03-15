"""
routers/tutor.py  ─  튜터 기능 API 라우터
프론트엔드(JS)의 apiFetch("/api/...") 호출과 연결되는 모든 튜터 엔드포인트를 정의합니다.
LLM을 호출하는 엔드포인트는 get_openai_callback()으로 토큰 사용량을 측정하여 DB에 저장합니다.
"""

import json, base64, asyncio

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.routers.auth import get_current_user
from app.utils.db_manager import (
    save_history,
    get_user_history,
    get_incorrect_problems,
    save_exam_result,
    get_exam_results,
    save_chat_message,
    get_chat_history,
    save_token_usage,
    get_token_stats_from_db,
)
from langchain_community.callbacks import get_openai_callback
from app.services.tutor_service import (
    fetch_units,
    fetch_problem,
    get_explanation     as svc_get_explanation,
    get_reexplanation,
    evaluate_explanation as svc_evaluate_explanation,
    ask_tutor           as svc_ask_tutor,
    grade_answer        as svc_grade_answer,
    get_problem_image_b64,
    generate_exam_questions,
    grade_exam_answers,
    ask_tutor_with_rag,
)

router = APIRouter()


# ── Pydantic 요청 모델 ──

class ExplainRequest(BaseModel):
    unit_name: str

class StudentExplainRequest(BaseModel):
    concept: str
    student_explanation: str

class AskRequest(BaseModel):
    question: str
    chat_history: list = []

class EvaluateRequest(BaseModel):
    problem: dict
    student_answer: str

class SaveHistoryRequest(BaseModel):
    problem_id: str
    unit: str
    is_correct: bool

class ExamGenerateRequest(BaseModel):
    unit_name: str

class ExamSubmitRequest(BaseModel):
    unit: str
    problems: list
    answers: list

class ExamSaveRequest(BaseModel):
    unit: str
    score: int
    total_questions: int
    wrong_numbers: list
    feedbacks: dict

class TTSRequest(BaseModel):
    text: str

class TTSResponse(BaseModel):
    audio_b64: str

class FreeChatRequest(BaseModel):
    question: str
    chat_history: list = []


# ── 단원 목록 조회 (LLM 미사용) ──

@router.get("/units")
async def get_unit_list(current_user: dict = Depends(get_current_user)):
    """CSV 파일에서 고유 단원명을 추출하여 반환합니다."""
    try:
        units = await fetch_units()
        return {"units": units}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 문제 조회 (LLM 미사용) ──

@router.get("/problem")
async def get_problem(unit: str, current_user: dict = Depends(get_current_user)):
    """선택한 단원에서 무작위로 문제 1개를 반환합니다. 이미지가 있으면 base64로 포함합니다."""
    problem = await fetch_problem(unit)

    if not problem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{unit} 문제 없음"
        )

    # NaN 값을 None으로 변환 (JSON 직렬화 오류 방지)
    cleaned   = {k: (None if str(v) == "nan" else v) for k, v in problem.items()}
    image_b64 = get_problem_image_b64(str(cleaned.get("ID", "")))

    return {"problem": cleaned, "image_b64": image_b64}


# ── 개념 설명 (LLM 호출 ①) ──

@router.post("/explain")
async def get_explanation(
    body: ExplainRequest,
    current_user: dict = Depends(get_current_user)
):
    """선택한 단원에 대한 AI 개념 설명을 생성합니다."""
    try:
        with get_openai_callback() as cb:
            explanation = await svc_get_explanation(body.unit_name)

        save_token_usage(
            username=current_user["username"],
            action="개념설명",
            prompt=cb.prompt_tokens,
            completion=cb.completion_tokens,
            total=cb.total_tokens,
            cost=cb.total_cost,
        )
        return {"explanation": explanation}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 보충 설명 (LLM 호출 ②) ──

@router.post("/reexplain")
async def get_supplementary_explanation(
    body: ExplainRequest,
    current_user: dict = Depends(get_current_user)
):
    """처음 설명을 이해하지 못한 학생을 위한 더 쉬운 보충 설명을 생성합니다."""
    try:
        with get_openai_callback() as cb:
            explanation = await get_reexplanation(body.unit_name)

        save_token_usage(
            username=current_user["username"],
            action="추가설명",
            prompt=cb.prompt_tokens,
            completion=cb.completion_tokens,
            total=cb.total_tokens,
            cost=cb.total_cost,
        )
        return {"explanation": explanation}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 이해도 평가 (LLM 호출 ③) ──

@router.post("/explain/evaluate")
async def evaluate_student_explanation(
    body: StudentExplainRequest,
    current_user: dict = Depends(get_current_user)
):
    """학생이 개념을 자신의 말로 설명한 내용을 AI가 평가합니다. [PASS]/[FAIL] 판정 포함."""
    try:
        with get_openai_callback() as cb:
            result = await svc_evaluate_explanation(
                body.concept,
                body.student_explanation
            )

        save_token_usage(
            username=current_user["username"],
            action="이해도평가",
            prompt=cb.prompt_tokens,
            completion=cb.completion_tokens,
            total=cb.total_tokens,
            cost=cb.total_cost,
        )
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Q&A 질문 (LLM 호출 ④) ──

@router.post("/ask")
async def ask_tutor(
    body: AskRequest,
    current_user: dict = Depends(get_current_user)
):
    """학습 중 학생이 궁금한 점을 질문합니다. chat_history로 대화 맥락을 유지합니다."""
    try:
        with get_openai_callback() as cb:
            answer = await svc_ask_tutor(body.question, body.chat_history)

        save_token_usage(
            username=current_user["username"],
            action="Q&A",
            prompt=cb.prompt_tokens,
            completion=cb.completion_tokens,
            total=cb.total_tokens,
            cost=cb.total_cost,
        )
        return {"answer": answer}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 문제 채점 (LLM 호출 ⑤) ──

@router.post("/evaluate")
async def evaluate_student_answer(
    body: EvaluateRequest,
    current_user: dict = Depends(get_current_user)
):
    """학생의 문제 답변을 AI가 채점하고 [정답]/[오답] + 피드백을 반환합니다."""
    try:
        with get_openai_callback() as cb:
            result = await svc_grade_answer(body.problem, body.student_answer)

        save_token_usage(
            username=current_user["username"],
            action="채점",
            prompt=cb.prompt_tokens,
            completion=cb.completion_tokens,
            total=cb.total_tokens,
            cost=cb.total_cost,
        )
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 학습 기록 저장 (LLM 미사용) ──

@router.post("/history")
async def record_history(
    body: SaveHistoryRequest,
    current_user: dict = Depends(get_current_user)
):
    """문제 풀이 결과(정오답)를 DB에 저장합니다."""
    try:
        save_history(
            username=current_user["username"],
            problem_id=body.problem_id,
            unit=body.unit,
            is_correct=body.is_correct
        )
        return {"message": "학습 기록 저장 완료"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 학습 기록 조회 (LLM 미사용) ──

@router.get("/history")
async def get_history(current_user: dict = Depends(get_current_user)):
    """학생의 전체 학습 기록과 정답률을 반환합니다."""
    try:
        df = get_user_history(current_user["username"])

        if df.empty:
            return {"history": [], "correct_rate": 0.0}

        correct_rate = round(df["is_correct"].mean() * 100, 1)

        return {
            "history":      df.to_dict(orient="records"),
            "correct_rate": correct_rate
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 오답 문제 조회 (LLM 미사용) ──

@router.get("/history/incorrect")
async def get_incorrect(current_user: dict = Depends(get_current_user)):
    """한 번도 정답을 맞히지 못한 문제 목록(오답노트)을 반환합니다."""
    try:
        problems = get_incorrect_problems(current_user["username"])
        return {"incorrect_problems": problems}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 시험 문제 생성 (LLM 미사용) ──

@router.post("/exam/generate")
async def exam_generate(
    body: ExamGenerateRequest,
    current_user: dict = Depends(get_current_user)
):
    """선택한 단원에서 시험 문제 10개를 무작위 추출하여 반환합니다."""
    try:
        problems = await generate_exam_questions(body.unit_name)

        if not problems:
            raise HTTPException(status_code=404, detail="시험 문제 없음")

        return {"problems": problems, "count": len(problems)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 시험 일괄 채점 (LLM 호출 ⑥, asyncio.gather 병렬 처리) ──

@router.post("/exam/submit")
async def exam_submit(
    body: ExamSubmitRequest,
    current_user: dict = Depends(get_current_user)
):
    """시험 전체 답안을 병렬로 일괄 채점합니다."""
    try:
        with get_openai_callback() as cb:
            result = await grade_exam_answers(body.problems, body.answers)

        save_token_usage(
            username=current_user["username"],
            action="시험채점",
            prompt=cb.prompt_tokens,
            completion=cb.completion_tokens,
            total=cb.total_tokens,
            cost=cb.total_cost,
        )
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 시험 결과 저장 (LLM 미사용) ──

@router.post("/exam/save-result")
async def exam_save_result(
    body: ExamSaveRequest,
    current_user: dict = Depends(get_current_user)
):
    """시험 점수와 AI 피드백을 DB에 저장합니다."""
    try:
        save_exam_result(
            username=current_user["username"],
            unit=body.unit,
            score=body.score,
            total_questions=body.total_questions,
            wrong_numbers=json.dumps(body.wrong_numbers, ensure_ascii=False),
            feedback=json.dumps(body.feedbacks, ensure_ascii=False)
        )
        return {"message": "시험 결과 저장 완료"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 시험 결과 목록 조회 (LLM 미사용) ──

@router.get("/exam/results")
async def exam_results(current_user: dict = Depends(get_current_user)):
    """학생의 모든 시험 이력을 반환합니다."""
    try:
        results = get_exam_results(current_user["username"])
        return {"results": results}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── TTS (음성 합성) ──

@router.post("/tts", response_model=TTSResponse)
async def text_to_speech(
    body: TTSRequest,
    current_user: dict = Depends(get_current_user)
):
    """텍스트를 OpenAI TTS(nova 목소리)로 변환하여 base64 MP3로 반환합니다. 동일 텍스트는 캐시 사용."""
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="텍스트 없음")

    try:
        from app.tutor.integration import generate_speech_with_cache

        # 동기 함수를 비동기로 실행 (서버 블로킹 방지)
        audio_bytes = await asyncio.to_thread(
            generate_speech_with_cache,
            body.text
        )

        if audio_bytes is None:
            raise HTTPException(status_code=500, detail="음성 생성 실패")

        return {"audio_b64": base64.b64encode(audio_bytes).decode()}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 자유학습 채팅 (LLM 호출 ⑦: 수학 분류 + RAG 답변) ──

@router.post("/free/chat")
async def free_chat(
    body: FreeChatRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    자유학습 채팅 엔드포인트. RAG + LLM을 결합하여 맞춤형 답변을 생성합니다.
    수학 질문 분류(1회) + RAG 기반 답변(1회), 최대 2회 LLM 호출.
    """
    username = current_user["username"]
    question = body.question.strip()

    if not question:
        raise HTTPException(status_code=400, detail="질문을 입력해주세요.")

    try:
        save_chat_message(username, "user", question)

        with get_openai_callback() as cb:
            result = await ask_tutor_with_rag(question, body.chat_history)

        save_chat_message(username, "assistant", result["answer"])

        save_token_usage(
            username=username,
            action="AI자유학습",
            prompt=cb.prompt_tokens,
            completion=cb.completion_tokens,
            total=cb.total_tokens,
            cost=cb.total_cost,
        )

        return {
            "answer":   result["answer"],
            "tts_text": result.get("tts_text", result["answer"]),
            "is_math":  result["is_math"],
            "rag_used": result["rag_used"],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 자유학습 채팅 기록 조회 (LLM 미사용) ──

@router.get("/free/history")
async def free_chat_history(current_user: dict = Depends(get_current_user)):
    """학생의 자유학습 채팅 기록을 최근 50건 반환합니다."""
    try:
        history = get_chat_history(current_user["username"])
        return {"history": history}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 토큰 사용량 통계 조회 ──

@router.get("/token/logs")
async def get_token_logs(current_user: dict = Depends(get_current_user)):
    """로컬 DB(token_logs 테이블)에서 사용자의 토큰 사용 통계를 반환합니다."""
    try:
        stats = get_token_stats_from_db(username=current_user["username"])
        return stats

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
