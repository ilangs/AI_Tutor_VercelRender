"""
app/utils/db_manager.py  ─  SQLite 데이터베이스 관리 모듈

테이블: users, learning_history, exam_results, chat_history, token_logs
모든 DB 연결은 get_db() 컨텍스트 매니저로 관리하며, 자동 커밋/롤백/연결 해제됩니다.
비밀번호는 bcrypt 해시로 저장합니다.
"""

import sqlite3
import os
import pandas as pd
import bcrypt
from contextlib import contextmanager

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH  = os.path.join(_BASE_DIR, 'database', 'user_db.sqlite')
CSV_PATH = os.path.join(_BASE_DIR, 'data', 'processed', 'math_tutor_dataset.csv')

# OpenAI GPT-4o 기준 토큰 단가
PRICE_INPUT  = 0.000005   # 입력 토큰 1개당 $
PRICE_OUTPUT = 0.000015   # 출력 토큰 1개당 $
KRW_PER_USD  = 1350       # 달러→원 환율 (고정값)


@contextmanager
def get_db():
    """
    SQLite 연결을 안전하게 열고 닫는 컨텍스트 매니저.
    정상 종료 시 commit, 예외 발생 시 rollback 후 재전파합니다.
    """
    db_dir = os.path.dirname(DB_PATH)
    if not os.path.exists(db_dir):
        os.makedirs(db_dir)

    conn = sqlite3.connect(DB_PATH)

    try:
        c = conn.cursor()
        yield conn, c
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def hash_password(plain_password: str) -> str:
    """평문 비밀번호를 bcrypt 해시 문자열로 변환합니다."""
    salt   = bcrypt.gensalt()
    hashed = bcrypt.hashpw(plain_password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """입력된 평문 비밀번호가 DB에 저장된 해시와 일치하는지 확인합니다."""
    return bcrypt.checkpw(
        plain_password.encode('utf-8'),
        hashed_password.encode('utf-8')
    )


def init_db():
    """
    서버 시작 시 1회 호출되어 모든 테이블을 생성합니다.
    CREATE TABLE IF NOT EXISTS를 사용하므로 기존 데이터는 유지됩니다.
    기존 users 테이블에 nickname/character 컬럼이 없으면 ALTER TABLE로 추가합니다.
    """
    with get_db() as (conn, c):

        c.execute("""
            CREATE TABLE IF NOT EXISTS users
            (username    TEXT PRIMARY KEY,
             password    TEXT,
             current_unit TEXT)
        """)

        # 스키마 마이그레이션: 없는 컬럼만 추가
        c.execute("PRAGMA table_info(users)")
        columns = [row[1] for row in c.fetchall()]

        if "nickname" not in columns:
            c.execute("ALTER TABLE users ADD COLUMN nickname TEXT")

        if "character" not in columns:
            c.execute("ALTER TABLE users ADD COLUMN character TEXT")

        c.execute("""
            CREATE TABLE IF NOT EXISTS learning_history
            (id         INTEGER PRIMARY KEY AUTOINCREMENT,
             username   TEXT,
             problem_id TEXT,
             unit       TEXT,
             is_correct INTEGER,
             timestamp  DATETIME DEFAULT CURRENT_TIMESTAMP)
        """)

        # wrong_numbers, feedback은 JSON 문자열로 저장
        c.execute("""
            CREATE TABLE IF NOT EXISTS exam_results
            (id              INTEGER PRIMARY KEY AUTOINCREMENT,
             username        TEXT,
             unit            TEXT,
             score           INTEGER,
             total_questions INTEGER,
             wrong_numbers   TEXT,
             feedback        TEXT,
             timestamp       DATETIME DEFAULT CURRENT_TIMESTAMP)
        """)

        # role: 'user' 또는 'assistant'
        c.execute("""
            CREATE TABLE IF NOT EXISTS chat_history
            (id        INTEGER PRIMARY KEY AUTOINCREMENT,
             username  TEXT NOT NULL,
             role      TEXT NOT NULL,
             content   TEXT NOT NULL,
             timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)
        """)

        c.execute("""
            CREATE TABLE IF NOT EXISTS token_logs
            (id                INTEGER PRIMARY KEY AUTOINCREMENT,
             username          TEXT NOT NULL,
             action            TEXT NOT NULL,
             prompt_tokens     INTEGER DEFAULT 0,
             completion_tokens INTEGER DEFAULT 0,
             total_tokens      INTEGER DEFAULT 0,
             total_cost_usd    REAL    DEFAULT 0.0,
             timestamp         DATETIME DEFAULT CURRENT_TIMESTAMP)
        """)

        # 기본 테스트 계정 (이미 존재하면 무시)
        hashed_pw = hash_password("1234")
        c.execute(
            """
            INSERT OR IGNORE INTO users
            (username, password, current_unit, nickname, character)
            VALUES (?, ?, ?, ?, ?)
            """,
            ('student01', hashed_pw, 'None', '학생1', 'bunny')
        )


def get_user(username: str) -> dict | None:
    """username으로 사용자 정보를 조회합니다. 존재하지 않으면 None 반환."""
    with get_db() as (conn, c):
        c.execute(
            """
            SELECT username, password, current_unit, nickname, character
            FROM users
            WHERE username = ?
            """,
            (username,)
        )
        row = c.fetchone()

    if row is None:
        return None

    return {
        "username":     row[0],
        "password":     row[1],
        "current_unit": row[2],
        "nickname":     row[3],
        "character":    row[4]
    }


def create_user(username: str, plain_password: str,
                nickname: str, character: str) -> bool:
    """
    새 사용자를 DB에 등록합니다.
    성공 시 True, 아이디 중복(IntegrityError) 시 False 반환.
    """
    try:
        hashed_pw = hash_password(plain_password)

        with get_db() as (conn, c):
            c.execute(
                """
                INSERT INTO users
                (username, password, current_unit, nickname, character)
                VALUES (?, ?, ?, ?, ?)
                """,
                (username, hashed_pw, 'None', nickname, character)
            )
        return True

    except sqlite3.IntegrityError:
        return False


def save_history(username: str, problem_id: str,
                 unit: str, is_correct: bool):
    """문제 풀이 결과를 learning_history 테이블에 저장합니다."""
    with get_db() as (conn, c):
        c.execute(
            "INSERT INTO learning_history (username, problem_id, unit, is_correct) VALUES (?, ?, ?, ?)",
            (username, str(problem_id), unit, 1 if is_correct else 0)
        )


def get_user_history(username: str) -> pd.DataFrame:
    """특정 학생의 전체 학습 기록을 DataFrame으로 반환합니다."""
    with get_db() as (conn, c):
        query = "SELECT unit, is_correct, timestamp FROM learning_history WHERE username = ?"
        df = pd.read_sql_query(query, conn, params=(username,))

    return df


def get_incorrect_problems(username: str) -> list[dict]:
    """
    한 번도 정답을 맞히지 못한 문제 목록을 반환합니다(오답노트).
    SUM(is_correct) = 0 인 problem_id를 추출하여 CSV에서 문제 원문을 조회합니다.
    """
    with get_db() as (conn, c):
        query = """
            SELECT problem_id FROM learning_history
            WHERE username = ?
            GROUP BY problem_id
            HAVING SUM(is_correct) = 0
        """
        incorrect_ids = pd.read_sql_query(
            query, conn, params=(username,)
        )['problem_id'].tolist()

    df = pd.read_csv(CSV_PATH)
    return df[df['ID'].astype(str).isin(incorrect_ids)].to_dict('records')


def save_exam_result(username: str, unit: str, score: int,
                     total_questions: int, wrong_numbers: str, feedback: str):
    """시험 완료 후 결과를 exam_results 테이블에 저장합니다. wrong_numbers/feedback은 JSON 문자열."""
    with get_db() as (conn, c):
        c.execute(
            """
            INSERT INTO exam_results
            (username, unit, score, total_questions, wrong_numbers, feedback)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (username, unit, score, total_questions, wrong_numbers, feedback)
        )


def get_exam_results(username: str) -> list:
    """특정 학생의 모든 시험 결과를 시간 순으로 반환합니다."""
    with get_db() as (conn, c):
        c.execute(
            """
            SELECT id, unit, score, total_questions,
                   wrong_numbers, feedback, timestamp
            FROM exam_results
            WHERE username = ?
            ORDER BY timestamp ASC
            """,
            (username,)
        )
        rows = c.fetchall()

    return [
        {
            "id":              r[0],
            "unit":            r[1],
            "score":           r[2],
            "total_questions": r[3],
            "wrong_numbers":   r[4],
            "feedback":        r[5],
            "timestamp":       r[6]
        }
        for r in rows
    ]


def save_chat_message(username: str, role: str, content: str):
    """자유학습 채팅 메시지 1건을 chat_history 테이블에 저장합니다."""
    with get_db() as (conn, c):
        c.execute(
            "INSERT INTO chat_history (username, role, content) VALUES (?, ?, ?)",
            (username, role, content)
        )


def get_chat_history(username: str, limit: int = 50) -> list:
    """
    자유학습 채팅 기록을 최근 limit건 시간순으로 반환합니다.
    DESC로 최신 N건을 가져온 후 reversed()로 시간순 정렬합니다.
    """
    with get_db() as (conn, c):
        c.execute(
            """
            SELECT role, content, timestamp
            FROM chat_history
            WHERE username = ?
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (username, limit)
        )
        rows = c.fetchall()

    return [
        {"role": r[0], "content": r[1], "timestamp": r[2]}
        for r in reversed(rows)
    ]


def save_token_usage(username: str, action: str,
                     prompt: int, completion: int,
                     total: int, cost: float = 0.0):
    """LLM API 호출 1회의 토큰 사용량과 비용을 token_logs 테이블에 저장합니다."""
    with get_db() as (conn, c):
        c.execute(
            """
            INSERT INTO token_logs
            (username, action, prompt_tokens, completion_tokens, total_tokens, total_cost_usd)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (username, action, prompt, completion, total, cost)
        )


def get_token_stats_from_db(username: str) -> dict:
    """
    token_logs 테이블에서 사용자의 누적 토큰 통계를 집계합니다.
    반환 구조: prompt_tokens, completion_tokens, total_tokens, total_cost_usd,
               total_cost_krw, call_count, history(최근 10건), source
    """
    with get_db() as (conn, c):

        # COALESCE: 값이 NULL이면 0으로 대체
        c.execute(
            """
            SELECT
                COALESCE(SUM(prompt_tokens),     0),
                COALESCE(SUM(completion_tokens), 0),
                COALESCE(SUM(total_tokens),      0),
                COALESCE(SUM(total_cost_usd),    0.0),
                COUNT(*)
            FROM token_logs
            WHERE username = ?
            """,
            (username,)
        )
        agg = c.fetchone()

        c.execute(
            """
            SELECT action, prompt_tokens, completion_tokens,
                   total_tokens, total_cost_usd, timestamp
            FROM token_logs
            WHERE username = ?
            ORDER BY timestamp DESC
            LIMIT 10
            """,
            (username,)
        )
        rows = c.fetchall()

    prompt     = agg[0]
    completion = agg[1]
    total      = agg[2]
    cost_usd   = agg[3]
    call_count = agg[4]

    # timestamp : "2026-03-12 14:23"
    history = [
        {
            "action":     r[0],
            "prompt":     r[1],
            "completion": r[2],
            "total":      r[3],
            "cost_usd":   round(r[4], 5),
            "ts":         r[5][:16] if r[5] else "--",
        }
        for r in rows
    ]

    return {
        "prompt_tokens":     prompt,
        "completion_tokens": completion,
        "total_tokens":      total,
        "total_cost_usd":    round(cost_usd, 5),
        "total_cost_krw":    int(cost_usd * KRW_PER_USD),
        "call_count":        call_count,
        "history":           history,
        "source":            "database",
    }
