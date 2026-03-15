/**
 * section3.js - 시험 섹션
 * 흐름: 단원 선택 → 문제 생성(10개) → 타이머 시작 → 답안 제출 → AI 일괄 채점 → 결과 저장
 * 의존: apiFetch, renderMath, showCustomPopup, goPage (app.js),
 *       prepareMathDisplayText (section1.js)
 */

let examProblems = [];
let examTimer = null;
let examTimeLeft = 2400;    // 40분 (초 단위)
let examStarted = false;
let examSubmitting = false; // 이중 제출 방지
let examModalClosable = false;
let examPendingSaveData = null;

// goPage("exam") 호출 시 실행
function initExam() {
  if (examStarted && !examSubmitting) return;
  resetExamState();
  bindExamModalEvents();
  loadExamUnits();
}

// 시험 관련 모든 상태 및 UI 초기화
function resetExamState() {
  examProblems = [];
  examStarted = false;
  examSubmitting = false;
  examTimeLeft = 2400;
  examModalClosable = false;
  examPendingSaveData = null;

  if (examTimer) { clearInterval(examTimer); examTimer = null; }

  const timerBox    = document.getElementById("exam-timer-box");
  const questionsBox = document.getElementById("exam-questions-container");
  const submitArea  = document.getElementById("exam-submit-area");
  const startBtn    = document.getElementById("exam-start-btn");
  const timerDisplay = document.getElementById("exam-timer-display");
  const modal       = document.getElementById("examResultModal");
  const body        = document.getElementById("examResultBody");
  const confirmBtn  = document.getElementById("examResultConfirmBtn");
  const unitSel     = document.getElementById("exam-unit-select");
  const makeBtn     = document.getElementById("exam-make-btn");
  const submitBtn   = document.getElementById("exam-submit-btn");

  if (timerBox) timerBox.style.display = "none";
  if (questionsBox) {
    questionsBox.classList.remove("exam-locked", "exam-unlocked");
    questionsBox.style.display = "none";
    questionsBox.innerHTML = "";
  }
  if (submitArea) submitArea.style.display = "none";
  if (startBtn) startBtn.disabled = true;
  if (timerDisplay) {
    timerDisplay.textContent = "40:00";
    timerDisplay.style.color = "";
    timerDisplay.style.fontWeight = "";
  }
  if (modal) { modal.classList.add("hidden"); modal.style.display = "none"; }
  if (body) body.innerHTML = "";
  if (confirmBtn) {
    confirmBtn.textContent = "확인";
    confirmBtn.style.display = "inline-block";
    confirmBtn.disabled = false;
  }
  if (unitSel) unitSel.disabled = false;
  if (makeBtn) makeBtn.disabled = false;
  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "답안지 제출"; }
}

// GET /api/units: 단원 목록 로드 + 버튼 이벤트 등록 (dataset.examBound로 중복 방지)
async function loadExamUnits() {
  const select = document.getElementById("exam-unit-select");
  if (!select) return;

  try {
    const res = await apiFetch("/api/units");
    const data = await res.json();
    select.innerHTML = '<option value="">단원 선택</option>';
    (data.units || []).forEach(unit => {
      const opt = document.createElement("option");
      opt.value = unit; opt.text = unit;
      select.add(opt);
    });
  } catch (e) {
    console.error("단원 목록 로드 실패", e);
  }

  const makeBtn  = document.getElementById("exam-make-btn");
  const startBtn = document.getElementById("exam-start-btn");
  const submitBtn = document.getElementById("exam-submit-btn");

  if (makeBtn && !makeBtn.dataset.examBound)   { makeBtn.dataset.examBound = "1";  makeBtn.addEventListener("click", makeExamPaper); }
  if (startBtn && !startBtn.dataset.examBound) { startBtn.dataset.examBound = "1"; startBtn.addEventListener("click", startExamTimer); }
  if (submitBtn && !submitBtn.dataset.examBound) { submitBtn.dataset.examBound = "1"; submitBtn.addEventListener("click", submitExam); }
}

// POST /api/exam/generate: 시험 문제 생성 및 렌더링
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

    if (examProblems.length === 0) { showCustomPopup("해당 단원에 문제가 없습니다.😢"); return; }

    renderExamQuestions(examProblems);

    const startBtn  = document.getElementById("exam-start-btn");
    const timerBox  = document.getElementById("exam-timer-box");
    const submitArea = document.getElementById("exam-submit-area");

    if (startBtn) startBtn.disabled = false;
    if (timerBox) timerBox.style.display = "block";
    if (submitArea) submitArea.style.display = "block";

    showCustomPopup(`${examProblems.length}개 문제가 생성되었습니다.\n"시험 시작" 버튼을 눌러 타이머를 시작하세요.`);
  } catch (e) {
    console.error("시험지 생성 오류", e);
    showCustomPopup("시험지 생성 중 오류가 발생했습니다.😢");
  } finally {
    if (makeBtn) { makeBtn.disabled = false; makeBtn.textContent = "시험지 만들기"; }
  }
}

// 문제 카드 렌더링 (시험 시작 전 exam-locked 클래스로 흐리게 표시)
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
      <input type="text" id="exam-answer-${num}" class="exam-answer-input"
        placeholder="답 입력" autocomplete="off"
        style="width:100%; padding:10px; font-size:17px; border:1px solid #ccc; box-sizing:border-box;">
    `;
    container.appendChild(card);
  });

  if (typeof renderMath === "function") {
    setTimeout(() => { try { renderMath(); } catch (e) {} }, 100);
  }
}

// HTML 특수문자 이스케이프 (XSS 방지)
function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 시험 시작: 타이머 시작 + 문제 잠금 해제
function startExamTimer() {
  if (examStarted) { showCustomPopup("이미 시험이 시작되었습니다.😢"); return; }
  if (examProblems.length === 0) { showCustomPopup("먼저 시험지를 만들어주세요.😢"); return; }

  examStarted = true;

  const startBtn  = document.getElementById("exam-start-btn");
  const makeBtn   = document.getElementById("exam-make-btn");
  const unitSel   = document.getElementById("exam-unit-select");
  const container = document.getElementById("exam-questions-container");

  if (startBtn) startBtn.disabled = true;
  if (makeBtn) makeBtn.disabled = true;
  if (unitSel) unitSel.disabled = true;

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

// 타이머 표시 갱신 (5분 이하 시 빨간색 강조)
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

// 시간 초과 시 자동 제출
function handleTimerExpired() {
  const display = document.getElementById("exam-timer-display");
  if (display) { display.textContent = "00:00"; display.style.color = "#d32f2f"; }
  showCustomPopup("시험 시간이 완료 되었습니다.\n답안지가 자동으로 제출됩니다.😄");
  submitExam();
}

// POST /api/exam/submit: 답안 수집 및 채점 요청
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
    examPendingSaveData = {
      unit, score: result.score,
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

function openExamResultModal() {
  const modal = document.getElementById("examResultModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.style.display = "flex";
  const box = document.getElementById("examResultModalBox");
  if (box) box.scrollTop = 0;
}

// 채점 결과를 모달에 채우기
function fillExamResultBody(result) {
  const body = document.getElementById("examResultBody");
  if (!body) return;

  const correct = result.correct ?? 0;
  const wrongNums = result.wrong_numbers || [];
  const feedbacks = result.feedbacks || {};
  const displayScore = correct * 10;

  let levelText = "";
  if (displayScore <= 50) levelText = "노력해야겠어요!";
  else if (displayScore <= 70) levelText = "조금만 더 열심히 해보도록 해요!";
  else if (displayScore <= 90) levelText = "정말 훌륭하네요!";
  else levelText = "당신은 수학천재!";

  let feedbackHtml = "";
  if (wrongNums.length === 0) {
    feedbackHtml = `<div class="solution-box" style="background:#f4fff6; border-color:#b9e3c1;">모든 문제를 맞혔어! 정말 잘했어!</div>`;
  } else {
    wrongNums.forEach(num => {
      const fb = feedbacks[String(num)] || "풀이 설명이 없습니다.";
      let processedFb = fb;
      if (typeof prepareMathDisplayText === "function") processedFb = prepareMathDisplayText(fb);
      feedbackHtml += `
        <div style="margin-bottom:18px; padding-bottom:14px; border-bottom:1px solid #eee;">
          <p style="font-weight:bold; color:#d32f2f; font-size:17px; margin:0 0 6px 0;">${num}번 풀이</p>
          <div class="solution-box">${escapeHtml(processedFb)}</div>
        </div>
      `;
    });
  }

  body.innerHTML = `
    <p style="font-size:24px; font-weight:bold; margin-bottom:10px;">시험 점수 : ${displayScore}점 / 100점</p>
    <p style="font-size:18px; margin-bottom:20px;">평가 : ${levelText}</p>
    <h3 style="margin:0 0 12px 0; font-size:20px;">틀린 문제 풀이</h3>
    ${feedbackHtml}
  `;

  if (typeof renderMath === "function") {
    setTimeout(() => { try { renderMath("examResultBody"); } catch (e) { console.error("수식 렌더링 실패:", e); } }, 100);
  }

  examModalClosable = true;
  const confirmBtn = document.getElementById("examResultConfirmBtn");
  if (confirmBtn) { confirmBtn.textContent = "확인"; confirmBtn.style.display = "inline-block"; confirmBtn.disabled = false; }
}

function showExamResultError(message) {
  const body = document.getElementById("examResultBody");
  if (!body) return;
  body.innerHTML = `<p style="color:#c00; padding:20px; font-size:16px;">${message}</p>`;
  examModalClosable = true;
  const confirmBtn = document.getElementById("examResultConfirmBtn");
  if (confirmBtn) { confirmBtn.textContent = "확인"; confirmBtn.style.display = "inline-block"; confirmBtn.disabled = false; }
  openExamResultModal();
}

function closeExamResultModal() {
  if (!examModalClosable) return;
  const modal = document.getElementById("examResultModal");
  if (modal) { modal.classList.add("hidden"); modal.style.display = "none"; }
  goPage("exam");
}

// POST /api/exam/save-result: 결과 DB 저장
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

// 확인 버튼: 모달 닫기 → 결과 저장 → 초기화 → 시험 첫 화면으로
function bindExamModalEvents() {
  const confirmBtn = document.getElementById("examResultConfirmBtn");
  if (confirmBtn) {
    confirmBtn.onclick = async function(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }

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
