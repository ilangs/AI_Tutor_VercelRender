"""
app/tutor/integration.py  ─  AI 튜터 핵심 통합 모듈

LangChain 체인, LangGraph 워크플로우, OpenAI TTS 캐싱, RAG 답변 생성을 제공합니다.
이 파일의 모든 함수는 동기(sync) 함수이며, 서비스 계층에서 asyncio.to_thread()로 호출됩니다.
"""

import os, json, hashlib, tempfile
import pandas as pd
from typing import TypedDict, Optional, Dict, Any, Annotated
from dotenv import load_dotenv

from openai import OpenAI
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_PATH = os.path.join(_BASE_DIR, 'data', 'processed', 'math_tutor_dataset.csv')

load_dotenv()
api_key = os.environ.get("OPENAI_API_KEY")

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.5)


# ── TTS 캐싱 ──

def generate_speech_with_cache(text: str) -> bytes:
    """
    텍스트를 MP3 음성으로 변환합니다. 동일 텍스트는 OS 임시 폴더에 캐싱하여 재사용합니다.
    프로젝트 폴더 대신 임시 폴더를 사용하는 이유: Live Server의 파일 감시 대상 제외.
    """
    text_hash = hashlib.md5(text.encode()).hexdigest()
    audio_dir = os.path.join(tempfile.gettempdir(), "ai_math_tutor_audio")

    if not os.path.exists(audio_dir):
        os.makedirs(audio_dir)

    file_path = os.path.join(audio_dir, f"{text_hash}.mp3")

    if os.path.exists(file_path):
        with open(file_path, "rb") as f:
            return f.read()

    try:
        response = client.audio.speech.create(
            model="tts-1",
            voice="nova",
            input=text
        )
        response.write_to_file(file_path)

        with open(file_path, "rb") as f:
            return f.read()

    except Exception as e:
        print(f"❌ 음성 생성 오류: {e}")
        return None


# ── LangChain Tools ──

@tool
def get_units() -> list:
    """수학 튜터 데이터셋에 있는 전체 단원 목록을 반환합니다."""
    df = pd.read_csv(DATA_PATH)
    return sorted(df['단원'].unique().tolist())


@tool
def get_problem_by_unit(unit_name: str) -> dict:
    """선택한 단원에서 문제 하나를 무작위로 반환합니다."""
    df = pd.read_csv(DATA_PATH)
    unit_df = df[df['단원'] == unit_name]

    if not unit_df.empty:
        return unit_df.sample(n=1).iloc[0].to_dict()

    return None


def get_exam_problems(unit_name: str, n: int = 3) -> list:
    """
    선택한 단원에서 시험용 문제를 n개 추출합니다.
    pandas의 NaN 값은 JSON 직렬화 오류를 방지하기 위해 None으로 변환합니다.
    """
    df = pd.read_csv(DATA_PATH)
    unit_df = df[df['단원'] == unit_name]

    if unit_df.empty:
        return []

    k = min(n, len(unit_df))
    problems = unit_df.sample(n=k).to_dict("records")

    return [
        {key: (None if str(val) == "nan" else val) for key, val in p.items()}
        for p in problems
    ]


# ── LangChain 체인 ──
# 각 체인은 ChatPromptTemplate | llm | StrOutputParser() 구조입니다.

explain_prompt = ChatPromptTemplate.from_messages([
    ("system", """너는 수학 선생님인 토끼 캐릭터 '루미'야. 초등학교 학생들에게 아주 친절하고 상냥하게 말해줘.
    학생이 선택한 '{unit_name}' 단원에 대해 아주 쉽고 재미있는 비유를 들어서 한글로 설명해줘.

    [가이드라인]
    1. "안녕! 나는 루미 선생님이야!"처럼 친근하게 시작할 것.
    2. 초등학생이 이해하기 쉬운 비유를 하나 들어줄 것.
    3. 1개의 구분이 모달 화면 폭의 60%를 넘어가는 경우 마침표(.) 뒤에서는 반드시 줄바꿈 하세요.
    4. 설명 마지막에는 "이해가 잘 되었니? 이제 네가 나에게 설명해 줄래?"라고 물어봐줘.""")
])

explain_chain = explain_prompt | llm | StrOutputParser()

def explain_concept(unit_name: str) -> str:
    """선택한 단원의 개념 설명 텍스트를 생성합니다."""
    return explain_chain.invoke({"unit_name": unit_name})


reexplain_prompt = ChatPromptTemplate.from_messages([
    ("system", """너는 초등학생 수학 선생님인 토끼 캐릭터 '루미'야.
    학생이 '{unit_name}' 단원의 개념을 한 번 들었는데 잘 이해하지 못했어.
    처음 설명보다 훨씬 더 쉽고, 피자 나누기나 사탕 나누기 같은 일상생활의 재미있고 친숙한 예시를 들어서 아주 친절하게 한글로 다시 설명해줘.
    1개의 구분이 모달 화면 폭의 60%를 넘어가는 경우 마침표(.) 뒤에서는 반드시 줄바꿈 하세요.
    수학과 무관한 엉뚱한 대답을 하면 부드럽게 수학 학습으로 유도해줘.
    """)
])

reexplain_chain = reexplain_prompt | llm | StrOutputParser()

def reexplain_concept(unit_name: str) -> str:
    """학생이 이해하지 못했을 때 더 쉬운 예시로 재설명합니다."""
    return reexplain_chain.invoke({"unit_name": unit_name})


concept_eval_prompt = ChatPromptTemplate.from_messages([
    ("system",  """당신은 초등학교 수학 선생님입니다. 학생이 '{concept}'에 대해 설명한 내용을 듣고 한글로 평가해주세요.

    [평가 규칙]
    1. 핵심 원리가 포함되었는지 확인합니다.
    2. 이해도가 충분하면 답변 마지막에 반드시 [PASS]라고 적어주세요.
    3. 설명이 부족하거나 틀렸다면 친절하게 교정해주고, 답변 마지막에 반드시 [FAIL]이라고 적어주세요.
    4. 모든 피드백은 따뜻하고 격려하는 말투로 작성하세요.
    5. 1개의 구분이 모달 화면 폭의 60%를 넘어가는 경우 마침표(.) 뒤에서는 반드시 줄바꿈 하세요.
    6. 수학과 무관한 엉뚱한 대답을 하면 부드럽게 수학 학습으로 유도해줘.
    """),
    ("user", "{student_explanation}")
])

concept_chain = concept_eval_prompt | llm | StrOutputParser()


answer_eval_prompt = ChatPromptTemplate.from_messages([
    ("system", """
    너는 초등학교 수학 선생님이야.
    학생의 답변을 평가할 때 다음 [출력 규칙]을 반드시 지켜서 한글로 답변해 줘.
    수학과 무관한 엉뚱한 대답을 하면 부드럽게 수학 학습으로 유도해 줘.

    [출력 규칙]
    1. 모든 숫자와 연산 기호는 LaTeX 형식인 $ 기호로 감싸서 표현해.
       (예: 5000 + 3000은 $5000 + 3000$으로 작성)
    2. 분수는 \\frac{{분자}}{{분모}} 형식을 사용해. (예: $\\frac{{1}}{{2}}$)
    3. 곱셈 기호는 \\times, 나눗셈 기호는 \\div를 사용해.

    [문제 정보]
    문제: {problem_question}
    정답 및 풀이: {problem_solution}

    [학생의 답변]
    {student_answer}

    [가이드라인]
    1. 정답 여부와 함께 학생이 어느 부분을 잘했는지 혹은 왜 틀렸는지 친절하게 설명해줘.
    2. 틀렸을 때는 다시 생각해 볼 수 있는 '힌트'와 함께 정답과 풀이를 명확하게 보여줘.
    3. 답이 없을 때 "답변을 기다린다"는 식의 대화형 문구는 절대 사용하지 않는다.
    4. 모든 수식은 LaTeX 형식(예: $2 + 3 = 5$)으로 작성해줘.
    5. 학생의 답변(student_answer)이 비어있으면 [오답]으로 처리한다.
    6. 1개의 구분이 모달 화면 폭의 60%를 넘어가는 경우 마침표(.) 뒤에서는 반드시 줄바꿈 하세요. 
    7. **반드시 답변의 맨 마지막 줄에 [정답] 또는 [오답]이라고 명확하게 적어줘.**
    """),
    ("user", "{student_answer}")
])

answer_chain = answer_eval_prompt | llm | StrOutputParser()


# ── Q&A 챗봇 ──

_QA_SYSTEM_PROMPT = """
        너는 수학 선생님 '루미'야.
        초등학생 질문에 친절하게 한글로 답해줘.
        너는 엄격하고 전문적인 수학 선생님이야. 모든 답변은 수학적 지식에 근거해야 해.

        가장 중요한 규칙:
        수학과 무관한 엉뚱한 대답을 하면 부드럽게 수학 학습으로 유도해줘.

        지침:
        - 초등학생 3학년 눈높이에 맞게 상냥한 말투(~했어?, ~단다!)를 사용할 것.
        - 모든 수식은 LaTeX 형식(예: $2 + 3 = 5$)으로 작성해줘.
        - 1개의 구분이 모달 화면 폭의 60%를 넘어가는 경우 마침표(.) 뒤에서는 반드시 줄바꿈 하세요.
        """


def ask_question_to_tutor(question: str, chat_history: list) -> str:
    """
    학생의 질문과 이전 대화 기록을 바탕으로 루미 선생님의 답변을 생성합니다.
    대화 기록은 HumanMessage/AIMessage 객체로 변환하여 LLM에 전달합니다.
    """
    messages = [SystemMessage(content=_QA_SYSTEM_PROMPT)]

    for turn in chat_history:
        role = turn.get("role", "")
        content = turn.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))

    messages.append(HumanMessage(content=question))

    try:
        response = llm.invoke(messages)
        return response.content

    except Exception as e:
        return f"오류 발생: {e}"


# ── LangGraph 상태 ──

class TutorState(TypedDict):
    """LangGraph StateGraph의 공유 상태. 모든 노드가 이 딕셔너리를 통해 데이터를 주고받습니다."""
    units: Optional[list]
    selected_unit: Optional[str]
    problem: Optional[Dict]
    task_type: Optional[str]        # None: 문제 조회, "concept": 이해도 평가, "answer": 채점
    student_explanation: Optional[str]
    student_answer: Optional[str]
    feedback: Optional[str]
    messages: Annotated[list, add_messages]  # 새 메시지를 덮어쓰지 않고 누적
    context: Optional[str]


# ── LangGraph 노드 함수 ──

def fetch_units_node(state: TutorState) -> Dict[str, Any]:
    return {"units": get_units.invoke({})}


def fetch_problem_node(state: TutorState) -> Dict[str, Any]:
    unit_name = state.get("selected_unit")
    if unit_name:
        return {"problem": get_problem_by_unit.invoke({"unit_name": unit_name})}
    return {"problem": None}


def evaluate_concept_node(state: TutorState) -> Dict[str, Any]:
    feedback = concept_chain.invoke({
        "concept": state["selected_unit"],
        "student_explanation": state["student_explanation"]
    })
    return {"feedback": feedback}


def evaluate_answer_node(state: TutorState) -> Dict[str, Any]:
    problem = state["problem"]
    feedback = answer_chain.invoke({
        "problem_question": problem["문제"],
        "problem_solution": problem["풀이"],
        "correct_answer": problem["정답"],
        "student_answer": state["student_answer"]
    })
    return {"feedback": feedback}


def entry_router(state: TutorState) -> str:
    """
    task_type 값으로 첫 번째 실행 노드를 결정하는 조건부 라우터.
    "concept" → eval_concept, "answer" → eval_answer, 그 외 → get_units
    """
    task = state.get("task_type")
    if task == "concept":
        return "eval_concept"
    elif task == "answer":
        return "eval_answer"
    return "get_units"


# ── LangGraph 그래프 구성 ──
# 흐름: [START] → entry_router → (get_units → get_problem | eval_concept | eval_answer) → [END]

workflow = StateGraph(TutorState)

workflow.add_node("get_units",    fetch_units_node)
workflow.add_node("get_problem",  fetch_problem_node)
workflow.add_node("eval_concept", evaluate_concept_node)
workflow.add_node("eval_answer",  evaluate_answer_node)

workflow.set_conditional_entry_point(
    entry_router,
    {
        "get_units":    "get_units",
        "eval_concept": "eval_concept",
        "eval_answer":  "eval_answer"
    }
)

workflow.add_edge("get_units",    "get_problem")
workflow.add_edge("get_problem",  END)
workflow.add_edge("eval_concept", END)
workflow.add_edge("eval_answer",  END)

tutor_app = workflow.compile()


# ── Wrapper 함수 (서비스 계층에서 호출) ──

def evaluate_concept_understanding(concept: str, student_explanation: str):
    """LangGraph를 통해 학생의 개념 설명을 평가하고 피드백 텍스트를 반환합니다."""
    result = tutor_app.invoke({
        "task_type": "concept",
        "selected_unit": concept,
        "student_explanation": student_explanation,
        "messages": []
    })
    return result.get("feedback")


def evaluate_answer(problem: dict, student_answer: str):
    """LangGraph를 통해 학생의 답안을 채점하고 피드백 텍스트를 반환합니다."""
    result = tutor_app.invoke({
        "task_type": "answer",
        "problem": problem,
        "student_answer": student_answer,
        "messages": []
    })
    return result.get("feedback")


# ── 수학 질문 분류 (자유학습용) ──

_CLASSIFY_SYSTEM_PROMPT = """너는 질문 분류기야.
학생의 질문이 수학과 관련된 질문인지 판단해.
수학 개념, 수학 문제 풀이, 수학 공식, 수학적 사고와 관련된 질문이면 "YES"
그 외 모든 질문이면 "NO"
반드시 YES 또는 NO 한 단어만 답해."""


def classify_math_question(question: str) -> bool:
    """
    학생의 질문이 수학 관련인지 LLM으로 분류합니다.
    분류 실패 시 True 반환 (사용자 경험 우선).
    """
    messages = [
        SystemMessage(content=_CLASSIFY_SYSTEM_PROMPT),
        HumanMessage(content=question)
    ]
    try:
        response = llm.invoke(messages)
        return "YES" in response.content.upper()
    except Exception:
        return True


# ── RAG 연동 답변 생성 (자유학습용) ──

def ask_question_with_rag_context(question: str, chat_history: list) -> tuple:
    """
    ChromaDB에서 유사 문제를 검색(RAG)한 뒤 LLM으로 답변을 생성합니다.
    반환값: ({"answer": str, "tts_text": str}, rag_used: bool)
    - answer: 화면 표시용 (LaTeX 수식 포함)
    - tts_text: 음성 재생용 (순수 한글)
    - 거리 임계값 1.2 이하인 문서만 RAG 컨텍스트로 사용합니다.
    """
    rag_context = ""
    rag_used = False

    # 1단계: ChromaDB에서 유사 문제 검색
    try:
        from RAG_sys.rag_helper import search_problems

        results = search_problems(question, n_results=3)

        if results and results.get("documents") and results["documents"][0]:
            documents = results["documents"][0]
            metadatas = results["metadatas"][0] if results.get("metadatas") else []
            distances = results["distances"][0] if results.get("distances") else []

            relevant_docs = []
            for i, doc in enumerate(documents):
                dist = distances[i] if i < len(distances) else 999
                if dist < 1.2:
                    meta = metadatas[i] if i < len(metadatas) else {}
                    relevant_docs.append({
                        "문제": doc,
                        "단원": meta.get("단원", ""),
                        "정답": meta.get("정답", ""),
                        "풀이": meta.get("풀이", ""),
                    })

            if relevant_docs:
                rag_used = True
                rag_parts = []
                for j, rd in enumerate(relevant_docs):
                    rag_parts.append(
                        f"[참고자료 {j+1}]\n"
                        f"단원: {rd['단원']}\n"
                        f"문제: {rd['문제']}\n"
                        f"정답: {rd['정답']}\n"
                        f"풀이: {rd['풀이']}"
                    )
                rag_context = "\n\n".join(rag_parts)

    except Exception as e:
        print(f"⚠️ RAG 검색 오류 (LLM 직접 답변으로 전환): {e}")

    # 2단계: 시스템 프롬프트 구성 (JSON 출력 강제)
    # 중괄호 충돌 방지를 위해 f-string 대신 일반 문자열 결합 사용
    system_prompt = (
        "너는 수학 선생님 '루미'야.\n"
        "초등학생 질문에 친절하고 쉽게 답해줘.\n"
        "학생이 수학과 무관한 엉뚱한 질문을 하면 부드럽게 수학 학습으로 유도해 줘\n"
        "1개의 구분이 모달 화면 폭의 60%를 넘어가는 경우 마침표(.) 뒤에서는 반드시 줄바꿈 하세요.\n"
        "수치 계산은 반드시 정확하게 해줘.\n\n"
        "【중요: 출력 형식】\n"
        "반드시 아래의 JSON 형식으로만 응답해야 해. 마크다운 코드 블록이나 다른 부연 설명은 절대 넣지 마.\n"
        "{\n"
        '  "answer": "학생 화면에 보여줄 답변 (수식은 $...$ 형식으로 포함)",\n'
        '  "tts_text": "시각장애인이 듣고 완벽하게 이해할 수 있도록, answer 내용 중 모든 수식을 순수 한글 발음으로 풀어서 쓴 텍스트. 분수 \\frac{A}{B}는 \'B 분의 A\'로 읽고, 기호는 반드시 한글(÷는 나누기, =는 은, ×는 고파기)로 적어. 또한 \'나눗셈\'이라는 단어는 발음 오류 방지를 위해 \'나눋쎔\'으로 강제로 적어줘."\n'
        "}\n\n"
    )

    if rag_context:
        system_prompt += (
            "아래 참고자료를 바탕으로 개념과 예제를 학생 눈높이에 맞게 설명해줘.\n"
            "1개의 구분이 모달 화면 폭의 60%를 넘어가는 경우 마침표(.) 뒤에서는 반드시 줄바꿈 하세요.\n"
            "학생이 수학과 무관한 엉뚱한 얘기를 하면 부드럽게 수학 학습으로 유도해 줘\n\n"
            "참고자료에 없는 내용은 네가 아는 지식으로 보충해도 돼.\n\n"
            f"--- 참고자료 ---\n{rag_context}\n--- 참고자료 끝 ---"
        )

    # 3단계: 대화 기록 + 질문으로 LLM 호출
    messages = [SystemMessage(content=system_prompt)]

    for turn in chat_history:
        role = turn.get("role", "")
        content = turn.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))

    messages.append(HumanMessage(content=question))

    # 4단계: JSON 형식으로 응답 파싱
    try:
        # response_format 옵션으로 LLM이 반드시 JSON으로 답하게 강제
        response = llm.bind(response_format={"type": "json_object"}).invoke(messages)
        raw_content = response.content.strip()
        parsed_data = json.loads(raw_content.strip())
        return parsed_data, rag_used

    except json.JSONDecodeError as e:
        print(f"⚠️ JSON 파싱 오류: {e}\n원본 응답: {response.content}")
        fallback_data = {"answer": response.content, "tts_text": response.content}
        return fallback_data, rag_used

    except Exception as e:
        error_data = {"answer": f"오류가 발생했어요: {e}", "tts_text": "오류가 발생했어요."}
        return error_data, False
