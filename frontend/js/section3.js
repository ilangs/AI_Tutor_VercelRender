/**
 * section3.js - 시험 섹션 (📝 exam)
 * 단원 선택 → AI 문제 생성 → 타이머 → 답안 제출 → 채점 → 결과 저장
 * 사용 페이지: app.html (id="page-exam")
 * 외부 의존: apiFetch, renderMath, showCustomPopup, goPage (app.js)
 *            prepareMathDisplayText (section1.js)
 */

// ─── 전역 변수 ─────────────────────────────────────────────────

let examProblems = [];          // 서버에서 받은 문제 배열
let examTimer = null;           // setInterval ID
let examTimeLeft = 2400;        // 남은 시험 시간 (초, 기본 40분)
let examStarted = false;        // 시험 진행 중 여부
let examSubmitting = false;     // 채점 요청 중 여부 (중복 방지)
let examModalClosable = false;  // 결과 모달 닫기 허용 여부
let examPendingSaveData = null; // 채점 후 저장 대기 데이터
let examTtsText = "";           // 결과 TTS 텍스트

// ─── 초기화 ────────────────────────────────────────────────────

/** goPage("exam") 진입 시 실행 - 시험 중이면 초기화 건너뜀 */
function initExam() {
  if (examStarted && !examSubmitting) return;
  resetExamState();
  bindExamModalEvents();
  loadExamUnits();
}

/** 전역 변수 및 UI 전체 초기값 복원 */
function resetExamState() {
  examProblems = [];
  examStarted = false;
  examSubmitting = false;
  examTimeLeft = 2400;
  examModalClosable = false;
  examPendingSaveData = null;

  if (examTimer) {
    clearInterval(examTimer);
    examTimer = null;
  }

  const timerBox   = document.getElementById("exam-timer-box");
  const questionsBox = document.getElementById("exam-questions-container");
  const submitArea = document.getElementById("exam-submit-area");
  const startBtn   = document.getElementById("exam-start-btn");
  const timerDisplay = document.getElementById("exam-timer-display");
  const modal      = document.getElementById("examResultModal");
  const body       = document.getElementById("examResultBody");
  const confirmBtn = document.getElementById("examResultConfirmBtn");
  const unitSel    = document.getElementById("exam-unit-select");
  const makeBtn    = document.getElementById("exam-make-btn");
  const submitBtn  = document.getElementById("exam-submit-btn");

  if (timerBox) timerBox.style.display = "none";

  if (questionsBox) {
    questionsBox.classList.remove("exam-locked", "exam-unlocked");
    questionsBox.style.display = "none";
    questionsBox.innerHTML = "";
  }

  if (submitArea) submitArea.style.display = "none";
  if (startBtn) startBtn.disabled = false;

  if (timerDisplay) {
    timerDisplay.textContent = "40:00";
    timerDisplay.style.color = "";
    timerDisplay.style.fontWeight = "";
  }

  if (modal) {
    modal.classList.add("hidden");
    modal.style.display = "none";
  }

  if (body) body.innerHTML = "";

  if (confirmBtn) {
    confirmBtn.textContent = "확인";
    confirmBtn.style.display = "inline-block";
    confirmBtn.disabled = false;
  }

  if (unitSel) unitSel.disabled = false;
  if (makeBtn) makeBtn.disabled = false;

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = "답안지 제출";
  }
}

// ─── 단원 목록 로드 ────────────────────────────────────────────

/**
 * 단원 목록 로드 (GET /api/units) 및 버튼 이벤트 바인딩
 * data-exam-bound 속성으로 중복 바인딩 방지
 */
async function loadExamUnits() {
  const select = document.getElementById("exam-unit-select");
  if (!select) return;

  try {
    const res = await apiFetch("/api/units");
    const data = await res.json();
    select.innerHTML = '<option value="">단원 선택</option>';
    (data.units || []).forEach(unit => {
      const opt = document.createElement("option");
      opt.value = unit;
      opt.text = unit;
      select.add(opt);
    });
  } catch (e) {
    console.error("단원 목록 로드 실패", e);
  }

  const makeBtn   = document.getElementById("exam-make-btn");
  const startBtn  = document.getElementById("exam-start-btn");
  const submitBtn = document.getElementById("exam-submit-btn");

  if (makeBtn && !makeBtn.dataset.examBound) {
    makeBtn.dataset.examBound = "1";
    makeBtn.addEventListener("click", makeExamPaper);
  }
  if (startBtn && !startBtn.dataset.examBound) {
    startBtn.dataset.examBound = "1";
    startBtn.addEventListener("click", startExamTimer);
  }
  if (submitBtn && !submitBtn.dataset.examBound) {
    submitBtn.dataset.examBound = "1";
    submitBtn.addEventListener("click", submitExam);
  }
}

// ─── 시험지 생성 ────────────────────────────────────────────────

/**
 * 선택 단원으로 AI 문제 생성 (POST /api/exam/generate)
 * 생성 후 exam-locked 상태로 문제 렌더링, 시작 버튼 활성화
 */
async function makeExamPaper() {
  const unit = document.getElementById("exam-unit-select")?.value;
  if (!unit) { showCustomPopup("단원을 선택하세요.😄"); return; }
  if (examStarted) { showCustomPopup("시험이 이미 진행 중입니다.😢"); return; }

  const makeBtn = document.getElementById("exam-make-btn");
  if (makeBtn) { makeBtn.disabled = true; makeBtn.textContent = "문제 생성 중..."; }

  try {
    const res = await apiFetch("/api/exam/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unit_name: unit })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showCustomPopup(err.detail || "문제를 불러오는데 실패했습니다.😢");
      return;
    }

    const data = await res.json();
    examProblems = data.problems || [];

    // 디버그: 콘솔에 정답 출력
    console.log("시험 정답 목록");
    examProblems.forEach((prob, idx) => {
      console.log(`${idx + 1}번 정답:`, prob.answer || prob["정답"] || prob["답"] || "");
    });

    if (examProblems.length === 0) {
      showCustomPopup("해당 단원에 문제가 없습니다.😢");
      return;
    }

    renderExamQuestions(examProblems);

    const startBtn  = document.getElementById("exam-start-btn");
    const timerBox  = document.getElementById("exam-timer-box");
    const submitArea = document.getElementById("exam-submit-area");

    if (startBtn)   startBtn.disabled = false;
    if (timerBox)   timerBox.style.display = "block";
    if (submitArea) submitArea.style.display = "block";

    showCustomPopup(`${examProblems.length}개 문제가 생성되었습니다.\n"시험 시작" 버튼을 눌러 타이머를 시작하세요.`);
  } catch (e) {
    console.error("시험지 생성 오류", e);
    showCustomPopup("시험지 생성 중 오류가 발생했습니다.😢");
  } finally {
    if (makeBtn) { makeBtn.disabled = false; makeBtn.textContent = "시험지 만들기"; }
  }
}

/**
 * 문제 배열을 카드 형태로 렌더링
 * 시험 시작 전: exam-locked(흐림), 시작 후: exam-unlocked(선명)
 * @param {Array} problems - 문제 객체 배열
 */
function renderExamQuestions(problems) {
  const container = document.getElementById("exam-questions-container");
  if (!container) return;

  container.innerHTML = "";
  container.style.display = "block";
  container.classList.add("exam-locked");
  container.classList.remove("exam-unlocked");

  problems.forEach((prob, idx) => {
    const num = idx + 1;
    const probText = prob["문제"] || "(문제 없음)";
    const card = document.createElement("div");
    card.className = "card";
    card.style.marginBottom = "12px";
    card.innerHTML = `
      <p style="font-size:18px; font-weight:bold; margin:0 0 10px 0;" id="exam-q-text-${num}">
        ${num}번. ${escapeHtml(probText)}
      </p>
      <input
        type="text"
        id="exam-answer-${num}"
        class="exam-answer-input"
        placeholder="답 입력"
        autocomplete="off"
        style="width:100%; padding:10px; font-size:17px; border:1px solid #ccc; box-sizing:border-box;"
      >
    `;
    container.appendChild(card);
  });

  // DOM 완료 후 MathJax 렌더링
  if (typeof renderMath === "function") {
    setTimeout(() => { try { renderMath(); } catch (e) {} }, 100);
  }
}

/** XSS 방지용 HTML 특수문자 이스케이프 */
function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── 타이머 ─────────────────────────────────────────────────────

/**
 * 타이머 시작 + 문제 잠금 해제 (exam-locked → exam-unlocked)
 * 0초 도달 시 handleTimerExpired() 자동 호출
 */
function startExamTimer() {
  if (examStarted) { showCustomPopup("이미 시험이 시작되었습니다.😢"); return; }
  if (examProblems.length === 0) { showCustomPopup("먼저 시험지를 만들어주세요.😢"); return; }

  examStarted = true;

  const startBtn  = document.getElementById("exam-start-btn");
  const makeBtn   = document.getElementById("exam-make-btn");
  const unitSel   = document.getElementById("exam-unit-select");
  const container = document.getElementById("exam-questions-container");

  if (startBtn) startBtn.disabled = true;
  if (makeBtn)  makeBtn.disabled = true;
  if (unitSel)  unitSel.disabled = true;

  if (container) {
    container.classList.remove("exam-locked");
    container.classList.add("exam-unlocked");
  }

  updateTimerDisplay();

  examTimer = setInterval(() => {
    examTimeLeft--;
    updateTimerDisplay();
    if (examTimeLeft <= 0) {
      clearInterval(examTimer);
      examTimer = null;
      handleTimerExpired();
    }
  }, 1000);
}

/** MM:SS 형식으로 타이머 표시 갱신, 5분 이하 시 빨간색 */
function updateTimerDisplay() {
  const display = document.getElementById("exam-timer-display");
  if (!display) return;
  const min = Math.floor(examTimeLeft / 60);
  const sec = examTimeLeft % 60;
  display.textContent = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  if (examTimeLeft <= 300) {
    display.style.color = "#d32f2f";
    display.style.fontWeight = "bold";
  }
}

/** 시간 초과 시 "00:00" 고정 후 자동 제출 */
function handleTimerExpired() {
  const display = document.getElementById("exam-timer-display");
  if (display) { display.textContent = "00:00"; display.style.color = "#d32f2f"; }
  showCustomPopup("시험 시간이 완료 되었습니다.\n답안지가 자동으로 제출됩니다.😄");
  submitExam();
}

// ─── 채점 ────────────────────────────────────────────────────────

/**
 * 답안 수집 후 채점 요청 (POST /api/exam/submit)
 * examSubmitting 플래그로 중복 제출 방지
 */
async function submitExam() {
  if (examSubmitting) return;
  if (!examStarted) { showCustomPopup("시험을 먼저 시작하세요.😄"); return; }
  if (examProblems.length === 0) { showCustomPopup("시험지가 없습니다.😢"); return; }

  if (examTimer) { clearInterval(examTimer); examTimer = null; }

  examSubmitting = true;

  const submitBtn = document.getElementById("exam-submit-btn");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "채점 중..."; }

  const answers = examProblems.map((_, idx) => {
    const input = document.getElementById(`exam-answer-${idx + 1}`);
    return input ? (input.value || "") : "";
  });

  const unit = document.getElementById("exam-unit-select")?.value || "";

  try {
    const res = await apiFetch("/api/exam/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unit, problems: examProblems, answers })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showExamResultError(err.detail || "채점 오류가 발생했습니다.");
      return;
    }

    const result = await res.json();

    // 확인 버튼 클릭 시 서버 저장용 데이터 임시 보관
    examPendingSaveData = {
      unit,
      score: result.score,
      total_questions: result.total,
      wrong_numbers: result.wrong_numbers || [],
      feedbacks: result.feedbacks || {}
    };

    fillExamResultBody(result);
    openExamResultModal();
  } catch (e) {
    console.error("채점 오류", e);
    showExamResultError("서버 연결 오류가 발생했습니다.");
  } finally {
    examSubmitting = false;
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "답안지 제출"; }
  }
}

// ─── 결과 모달 ──────────────────────────────────────────────────

/** 결과 모달 열기 (스크롤 맨 위로 초기화) */
function openExamResultModal() {
  const modal = document.getElementById("examResultModal");
  const box = modal?.querySelector(".modal-box");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.style.display = "flex";
  playModalSound();
  if (box) box.scrollTop = 0;
}

/**
 * 채점 결과로 모달 내용 채우기
 * 점수 구간별 평가 메시지 + 틀린 문제 풀이 표시
 * @param {object} result - { correct, score, wrong_numbers, feedbacks }
 */
function fillExamResultBody(result) {
  const body = document.getElementById("examResultBody");
  if (!body) return;

  const correct   = result.correct ?? 0;
  const wrongNums = result.wrong_numbers || [];
  const feedbacks = result.feedbacks || {};
  const displayScore = correct * 10; // 문제당 10점

  if (displayScore === 100) showHearts();

  let levelText = "";
  if (displayScore <= 50)      levelText = "조금 더 연습해 봅시다! 화이팅!";
  else if (displayScore <= 70) levelText = "괜찮아요! 조금만 더 하면 잘할 수 있어요!";
  else if (displayScore <= 90) levelText = "너무 훌륭해요! 수학을 정말 잘하네요!";
  else                         levelText = "진짜 대단해요! 우리 친구는 수학 천재!";

  let feedbackHtml = "";

  if (wrongNums.length === 0) {
    feedbackHtml = `
      <div class="solution-box" style="background:#f4fff6; border-color:#b9e3c1;">
        모든 문제를 맞혔어! 정말 잘했어!
      </div>
    `;
  } else {
    wrongNums.forEach(num => {
      const fb = feedbacks[String(num)] || "풀이 설명이 없습니다.";
      let processedFb = fb;
      if (typeof prepareMathDisplayText === "function") {
        processedFb = prepareMathDisplayText(fb);
      }
      feedbackHtml += `
        <div style="margin-bottom:18px; padding-bottom:14px; border-bottom:1px solid #eee;">
          <p style="font-weight:bold; color:#d32f2f; font-size:17px; margin:0 0 6px 0;">
            ${num}번 풀이
          </p>
          <div class="solution-box">${escapeHtml(processedFb)}</div>
        </div>
      `;
    });
  }

  body.innerHTML = `
    <p style="font-size:24px; font-weight:bold; margin-bottom:10px;">
      시험 점수 : ${displayScore}점 / 100점
    </p>
    <div style="
    background:#fff3cd;
    border:1px solid #ffe69c;
    padding:12px 16px;
    border-radius:10px;
    font-size:20px;
    font-weight:600;
    margin-bottom:20px;
    display:inline-block;">
    ⭐ ${levelText}
    </div>
    <h3 style="margin:0 0 12px 0; font-size:20px;">틀린 문제 풀이</h3>
    ${feedbackHtml}
  `;

  // MathJax 렌더링 (DOM 업데이트 후)
  if (typeof renderMath === "function") {
    setTimeout(() => {
      try { renderMath("examResultBody"); } catch (e) { console.error("수식 렌더링 실패:", e); }
    }, 100);
  }

  examTtsText = `시험 점수는 ${displayScore}점입니다. ${levelText}`;
  examModalClosable = true;

  const confirmBtn = document.getElementById("examResultConfirmBtn");
  if (confirmBtn) {
    confirmBtn.textContent = "확인";
    confirmBtn.style.display = "inline-block";
    confirmBtn.disabled = false;
  }
}

/**
 * 채점 오류 시 모달에 오류 메시지 표시
 * @param {string} message - 오류 메시지
 */
function showExamResultError(message) {
  const body = document.getElementById("examResultBody");
  if (!body) return;
  body.innerHTML = `<p style="color:#c00; padding:20px; font-size:16px;">${message}</p>`;
  examModalClosable = true;
  const confirmBtn = document.getElementById("examResultConfirmBtn");
  if (confirmBtn) {
    confirmBtn.textContent = "확인";
    confirmBtn.style.display = "inline-block";
    confirmBtn.disabled = false;
  }
  openExamResultModal();
}

/** 결과 모달 닫기 (examModalClosable=true일 때만 허용) */
function closeExamResultModal() {
  if (!examModalClosable) return;
  const modal = document.getElementById("examResultModal");
  if (modal) { modal.classList.add("hidden"); modal.style.display = "none"; }
  goPage("exam");
}

/**
 * 결과를 서버 DB에 저장 (POST /api/exam/save-result)
 * 성적 로그(section4.js)에서 조회됨
 * @param {object} data - 저장할 시험 결과
 */
async function saveExamResultAfterConfirm(data) {
  try {
    await apiFetch("/api/exam/save-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  } catch (e) {
    console.error("시험 결과 저장 실패", e);
  }
}

// ─── 모달 이벤트 바인딩 ─────────────────────────────────────────

/**
 * 확인 버튼 이벤트 등록 (initExam 호출 시 1회 실행)
 * 동작: 모달 닫기 → 결과 저장 → 상태 초기화 → 첫 화면 복귀
 */
function bindExamModalEvents() {
  const confirmBtn = document.getElementById("examResultConfirmBtn");
  if (confirmBtn) {
    confirmBtn.onclick = async function(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }

      console.log("✅ 시험 결과 확인 - 초기 화면으로 복귀합니다.");

      const modal = document.getElementById("examResultModal");
      if (modal) { modal.classList.add("hidden"); modal.style.display = "none"; }

      if (examPendingSaveData) {
        saveExamResultAfterConfirm(examPendingSaveData).catch(err => console.error(err));
      }

      resetExamState();

      if (typeof goPage === "function") goPage("exam");

      return false;
    };
  }
}

// ─── 100점 축하 이펙트 ──────────────────────────────────────────

/** 100점 시 하트 애니메이션 표시 */
function showHearts() {
  let count = 0;
  const interval = setInterval(() => {
    const heart = document.createElement("div");
    heart.innerHTML = "❤️";
    heart.className = "floating-heart";
    heart.style.left = Math.random() * 100 + "vw";
    heart.style.fontSize = Math.floor(Math.random() * 25 + 30) + "px";
    heart.style.animationDuration = (Math.random() * 3 + 3) + "s";
    document.body.appendChild(heart);
    setTimeout(() => heart.remove(), 6000);
    count++;
    if (count > 40) clearInterval(interval);
  }, 80);
}
