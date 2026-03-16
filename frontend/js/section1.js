/**
 * section1.js - 오늘 학습 섹션
 * 학습 흐름: 단원선택 → AI개념설명 → 학생직접설명 → 이해도평가 → 문제풀이 → 채점
 * 사용 페이지: app.html (id="page-today")
 * 외부 의존: apiFetch, renderMath, openResultModal, closeResultModal,
 *            openFeedbackModal, closeFeedbackModal (app.js)
 */

// ─── 전역 변수 ─────────────────────────────────────────────────
let currentAnswer = "";           // 현재 문제 정답 (채점 비교용)
let currentQuestionText = "";     // 현재 문제 텍스트
let currentModalAudio = null;     // 모달 TTS Audio 객체
let currentModalTtsState = "idle"; // TTS 상태: idle / loading / playing / paused

// ─── 모달 TTS ──────────────────────────────────────────────────

/**
 * 풀이 모달 내 TTS 버튼 토글 (재생/일시정지/이어서재생)
 * 상태 흐름: idle → loading → playing ↔ paused
 * POST /api/tts → base64 MP3 응답
 * @param {string}      text  - 읽어줄 텍스트
 * @param {HTMLElement} btnEl - TTS 버튼 요소
 */
async function toggleModalTTS(text, btnEl) {
  // 자유학습 TTS가 재생 중이면 먼저 중지
  if (typeof stopOtherTTS === "function") stopOtherTTS();

  if (currentModalTtsState === "playing") {
    if (currentModalAudio) currentModalAudio.pause();
    currentModalTtsState = "paused";
    btnEl.innerHTML = "🔊 음성 듣기";
    return;
  }

  if (currentModalTtsState === "paused") {
    if (currentModalAudio) currentModalAudio.play();
    currentModalTtsState = "playing";
    btnEl.innerHTML = "⏸️ 음성 중지";
    return;
  }

  if (currentModalTtsState === "loading") return;

  // idle → 음성 생성 시작
  currentModalTtsState = "loading";
  btnEl.innerHTML = "⏳ 생성 중...";
  btnEl.disabled = true;

  try {
    const res = await apiFetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text })
    });

    if (!res.ok) throw new Error("TTS API 오류");
    const data = await res.json();
    const audioData = typeof data === "string" ? data : data.audio_b64;

    if (audioData) {
      currentModalAudio = new Audio(`data:audio/mp3;base64,${audioData}`);
      currentModalAudio.onended = () => {
        currentModalTtsState = "idle";
        btnEl.innerHTML = "🔊 음성 듣기";
        currentModalAudio = null;
      };
      currentModalAudio.play();
      currentModalTtsState = "playing";
      btnEl.innerHTML = "⏸️ 음성 중지";
    } else {
      throw new Error("오디오 데이터가 비어있습니다.");
    }
  } catch (err) {
    console.error("TTS 재생 실패:", err);
    showCustomPopup("음성을 불러오지 못했습니다.😢");
    currentModalTtsState = "idle";
    btnEl.innerHTML = "🔊 음성 듣기";
  } finally {
    btnEl.disabled = false;
  }
}

// ─── 수식 텍스트 유틸 ──────────────────────────────────────────

/**
 * 분수 표기(3/4)를 LaTeX(\frac{3}{4})로 변환 (이미 LaTeX면 그대로 반환)
 * @param {string} text
 * @returns {string}
 */
function prepareMathDisplayText(text) {
  const raw = String(text || "");
  if (/[\\$]/.test(raw)) return raw;
  return raw.replace(/(\d+)\s*\/\s*(\d+)/g, "\\(\\frac{$1}{$2}\\)");
}

/**
 * LaTeX 기호를 일반 텍스트로 변환 (콘솔 디버깅용)
 * @param {string} text
 * @returns {string}
 */
function formatMathForConsole(text) {
  return String(text || "")
    .replace(/\\\(/g, "").replace(/\\\)/g, "").replace(/\$/g, "")
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1/$2")
    .replace(/\\times/g, "×").replace(/\\div/g, "÷").replace(/\\cdot/g, "·")
    .replace(/\\left/g, "").replace(/\\right/g, "")
    .replace(/\\mathrm\{([^}]+)\}/g, "$1")
    .replace(/\s+/g, " ").trim();
}

/**
 * DOM 요소에 수식 텍스트를 설정하고 MathJax 렌더링
 * @param {string} targetId - 요소 id
 * @param {string} text     - 표시할 텍스트
 */
function setMathText(targetId, text) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.innerText = prepareMathDisplayText(text);
  try {
    if (typeof renderMath === "function") renderMath(targetId);
  } catch (e) {
    console.error("수식 렌더링 중 오류 발생:", e);
  }
}

/**
 * LaTeX 포함 텍스트를 읽기 쉬운 형식으로 콘솔 출력 (디버그용)
 * @param {string} label
 * @param {string} text
 */
function logMathText(label, text) {
  console.log(`${label}:`, formatMathForConsole(text));
}

// ─── 모달 공통 ─────────────────────────────────────────────────

/**
 * 모달 TTS 음성 정지 및 상태 초기화
 * closeResultModal / resetModal / renderToday 에서 호출
 */
function stopAllModalAudio() {
  if (currentModalAudio) {
    currentModalAudio.pause();
    currentModalAudio.currentTime = 0;
    currentModalAudio = null;
  }
  currentModalTtsState = "idle";
}

/**
 * 모달 내용 전체 초기화 (제목, 메시지, 풀이박스, TTS버튼, 다음버튼)
 * 새 내용 표시 전에 항상 호출
 */
function resetModal() {
  stopAllModalAudio();

  const titleEl  = document.getElementById("resultTitle");
  const msgEl    = document.getElementById("resultMessage");
  const solEl    = document.getElementById("solutionText");
  const solBox   = document.querySelector("#resultModal .solution-box");
  const ttsBtn   = document.getElementById("ttsBtn");
  const actionBtn = document.getElementById("resultActionBtn");

  if (titleEl) titleEl.innerText = "";
  if (msgEl)  { msgEl.innerHTML = ""; msgEl.style.display = "block"; }
  if (solEl)  { solEl.innerText = ""; solEl.style.display = "none"; }
  if (solBox) solBox.style.display = "none";
  if (ttsBtn) { ttsBtn.style.display = "none"; ttsBtn.innerHTML = "🔊 음성 듣기"; }
  if (actionBtn) {
    actionBtn.style.display = "none";
    actionBtn.onclick = null;
    actionBtn.innerText = "다음";
  }
}

/**
 * 모달 하단 다음 버튼 설정 (cloneNode로 기존 이벤트 초기화 후 교체)
 * @param {Function} handler - 클릭 시 실행할 함수
 * @param {string}   label   - 버튼 텍스트
 */
function setResultAction(handler, label) {
  const oldBtn = document.getElementById("resultActionBtn");
  if (!oldBtn) return;

  const newBtn = oldBtn.cloneNode(true);
  newBtn.innerText = label || "다음";
  newBtn.style.display = "inline-block";
  newBtn.onclick = () => {
    closeResultModal();
    if (handler) handler();
  };
  oldBtn.parentNode.replaceChild(newBtn, oldBtn);
}

/**
 * 풀이/개념 설명 모달 표시 (루미 이미지 + 내용 + TTS 버튼 선택)
 * @param {string}   title      - 모달 제목
 * @param {string}   content    - 표시 내용 (수식 포함 가능)
 * @param {string}   buttonText - 다음 버튼 텍스트
 * @param {Function} onNext     - 다음 버튼 클릭 시 실행 함수
 * @param {boolean}  showTts    - TTS 버튼 표시 여부
 */
function showSolutionModal(title, content, buttonText, onNext, showTts = false) {
  resetModal();

  const titleEl = document.getElementById("resultTitle");
  const solBox  = document.querySelector("#resultModal .solution-box");
  const ttsBtn  = document.getElementById("ttsBtn");

  if (titleEl) titleEl.innerText = title;

  if (solBox) {
    solBox.style.display = "block";
    solBox.innerHTML = `
      <div style="display:flex; align-items:center; margin-top:-75px; margin-bottom:6px; border-bottom:2px solid #e0e0e0; padding-bottom:12px; padding-left:30px;">
        <img
          src="/assets/images/main_rumi.png"
          alt="루미 선생님"
          style="width:200px; height:auto; margin-top:0; margin-right:0; flex-shrink:0;"
        ><h3 style="margin:0 0 0 40px; font-size:1.7rem; color:#333;">💡 루미 선생님의 풀이 설명</h3>
      </div><div
        id="solutionText"
        style="font-size:1.3rem; color:#444; padding-top:40px; padding-left:20px; padding-right:20px;"
      ></div>
    `;
  }

  // solBox.innerHTML 재작성 후 solutionText 참조 갱신
  const newSolEl = document.getElementById("solutionText");
  if (newSolEl) {
    newSolEl.style.display = "block";
    newSolEl.innerText = prepareMathDisplayText(content);
    if (typeof renderMath === "function") {
      setTimeout(() => renderMath("solutionText"), 50);
    }
  }

  if (ttsBtn) {
    if (showTts) {
      ttsBtn.style.display = "inline-block";
      ttsBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleModalTTS(content, ttsBtn);
      };
    } else {
      ttsBtn.style.display = "none";
    }
  }

  setResultAction(onNext, buttonText);
  openResultModal();
}

/**
 * 텍스트 입력 모달 표시 (학생 직접 설명 단계에서 사용)
 * @param {string}   title       - 모달 제목
 * @param {string}   placeholder - textarea 힌트 텍스트
 * @param {string}   buttonText  - 제출 버튼 텍스트
 * @param {Function} onSubmit    - 입력값을 받아 처리하는 콜백
 */
function showInputModal(title, placeholder, buttonText, onSubmit) {
  resetModal();
  const titleEl = document.getElementById("resultTitle");
  const msgEl   = document.getElementById("resultMessage");

  if (titleEl) titleEl.innerText = title;
  if (msgEl) {
    msgEl.innerHTML = `
      <textarea id="modal-student-text" rows="6" placeholder="${placeholder}" style="width:100%;padding:10px;box-sizing:border-box;"></textarea>
      <button id="modal-student-submit" type="button" style="margin-top:12px;">${buttonText}</button>
    `;
  }
  openResultModal();

  const submitBtn = document.getElementById("modal-student-submit");
  if (submitBtn) {
    submitBtn.onclick = (e) => {
      e.preventDefault();
      const value = document.getElementById("modal-student-text")?.value || "";
      onSubmit(value);
    };
  }
}

/**
 * 문제 모달 표시 (문제 텍스트 + 이미지 + 답안 입력 + 제출 버튼)
 * @param {object} prob     - 문제 객체 (문제/정답/단원 포함)
 * @param {string} imageB64 - 문제 이미지 base64 (없으면 빈 문자열)
 */
function showQuestionModal(prob, imageB64 = "") {
  resetModal();
  const titleEl = document.getElementById("resultTitle");
  const msgEl   = document.getElementById("resultMessage");

  if (titleEl) titleEl.innerText = `📝 퀴즈 (${prob["단원"] ?? "-"})`;
  if (msgEl) {
    msgEl.innerHTML = `
      <div id="modal-problem-text"></div>
      ${imageB64 ? `<img src="data:image/png;base64,${imageB64}" style="max-width:100%;margin-top:12px;">` : ""}
      <textarea id="modal-answer-input" rows="5" placeholder="정답과 풀이를 적어주세요." style="width:100%;padding:10px;margin-top:12px;box-sizing:border-box;"></textarea>
      <button id="modal-submit-btn" type="button" style="margin-top:12px;">제출하기</button>
    `;
    const p = document.getElementById("modal-problem-text");
    if (p) {
      p.innerText = prepareMathDisplayText(prob["문제"] ?? "문제를 불러올 수 없어요.");
      if (typeof renderMath === "function") renderMath("modal-problem-text");
    }
  }
  openResultModal();

  const submitBtn = document.getElementById("modal-submit-btn");
  if (submitBtn) {
    submitBtn.onclick = async (e) => {
      e.preventDefault();
      const answer = document.getElementById("modal-answer-input")?.value || "";
      await submitCurrentAnswer(answer);
    };
  }
}

// ─── 오늘 학습 초기화 ──────────────────────────────────────────

/**
 * 오늘 학습 화면 초기화 - goPage("today") 시 호출
 * 단원 선택 영역 표시, 학습 시작 버튼 이벤트 등록 (중복 방지)
 * API: POST /api/explain → AI 개념 설명 요청
 */
function renderToday() {
  const selectUnit = document.getElementById("step-select_unit");
  if (selectUnit) selectUnit.style.display = "block";

  // 모달 X 버튼 클릭 시 TTS 즉시 정지
  const closeBtn = document.querySelector("#resultModal .close-btn") ||
                   document.querySelector("#resultModal .modal-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => stopAllModalAudio());
  }

  // 학습 시작 버튼 이벤트 (data-bound로 중복 방지)
  const btnStart = document.getElementById("btn-start");
  if (btnStart && !btnStart.dataset.bound) {
    btnStart.dataset.bound = "1";
    btnStart.addEventListener("click", async () => {
      const unit = document.getElementById("unit-select")?.value;
      if (!unit) {
        showCustomPopup("단원을 선택하세요.😄");
        return;
      }

      document.getElementById("loading-overlay").style.display = "flex";
      await new Promise(resolve => setTimeout(resolve, 100));
      localStorage.setItem("selected_unit", unit);

      try {
        const res = await apiFetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unit_name: unit }),
        });
        const data = await res.json();
        document.getElementById("loading-overlay").style.display = "none";

        const explanation = data.explanation || "설명이 없습니다.";
        showSolutionModal(`📖 ${unit} 개념 익히기`, explanation, "내용 이해 완료! 내가 설명해보기 🗣️", () => {
          showStudentExplainModal(unit);
        }, true);
      } catch {
        document.getElementById("loading-overlay").style.display = "none";
        showSolutionModal("오류", "설명을 불러오는 데 실패했어요.", "확인", () => {}, false);
      }
    });
  }
}

/**
 * 학생 직접 설명 입력 모달 표시 후 AI 이해도 평가
 * API: POST /api/explain/evaluate → is_passed 기준으로 문제풀기 or 보충설명 분기
 * @param {string} unit - 현재 학습 단원명
 */
function showStudentExplainModal(unit) {
  showInputModal(`🗣️ ${unit} 직접 설명하기`, "어떻게 이해했는지 적어줘", "설명 완료! ✨", async (studentText) => {
    if (!studentText.trim()) return showCustomPopup("설명을 적어주세요.😊");
    try {
      const res = await apiFetch("/api/explain/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept: unit, student_explanation: studentText }),
      });
      const data = await res.json();
      const feedback = data.feedback || "평가 결과가 없습니다.";

      if (data.is_passed) {
        // 통과 → 문제 풀기
        showSolutionModal("👨‍🏫 이해도 검토 결과", feedback, "이제 문제 풀기 📝", async () => { await loadProblem(); }, false);
      } else {
        // 미통과 → 보충 설명
        showSolutionModal("👨‍🏫 이해도 검토 결과", feedback, "더 쉬운 보충 설명 듣기 ➡️", async () => {
          showSolutionModal("📖 보충 학습 (더 쉬운 설명)", "루미 선생님이 보충 설명을 준비 중... ⏳", "기다리는 중...", () => {}, false);
          try {
            const res2 = await apiFetch("/api/reexplain", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ unit_name: unit }),
            });
            const re_data = await res2.json();
            showSolutionModal("📖 보충 학습", re_data.explanation || "설명이 없습니다.", "이제 문제 풀기 📝", async () => { await loadProblem(); }, true);
          } catch (e) { showCustomPopup("⚠️ 보충 설명 로드 실패"); }
        }, false);
      }
    } catch { showCustomPopup("⚠️ 평가 실패"); }
  });
}

// ─── 단원 목록 / 문제 로드 / 채점 ─────────────────────────────

/**
 * GET /api/units → unit-select 드롭다운 옵션 채우기
 */
async function loadUnits() {
  const select = document.getElementById("unit-select");
  if (!select) return;
  try {
    const res = await apiFetch("/api/units");
    const data = await res.json();
    select.innerHTML = `<option value="">단원 선택</option>`;
    (data.units || []).forEach(u => {
      const opt = document.createElement("option");
      opt.value = u;
      opt.text = u;
      select.add(opt);
    });
  } catch (e) { console.error("단원 목록 로드 실패"); }
}

/**
 * GET /api/problem?unit=... → 문제 수신 후 showQuestionModal 호출
 * 문제 데이터는 localStorage에 저장 (submitCurrentAnswer에서 사용)
 */
async function loadProblem() {
  const unit = localStorage.getItem("selected_unit");
  try {
    const res = await apiFetch(`/api/problem?unit=${encodeURIComponent(unit)}`);
    const data = await res.json();
    const prob = data.problem;
    if (!prob) throw new Error("문제가 없습니다.");

    localStorage.setItem("current_problem", JSON.stringify(prob));
    currentAnswer = prob.answer || prob["정답"] || prob["답"] || "";
    currentQuestionText = prob["문제"] || "";

    showQuestionModal(prob, data.image_b64 || "");
  } catch (e) {
    console.error("문제 로드 중 상세 오류:", e);
    showCustomPopup("문제를 불러오지 못했습니다.😢");
  }
}

/**
 * POST /api/evaluate → AI 채점 후 showFinalFeedbackModal 호출
 * @param {string|null} answerText - 학생 입력 답안
 */
async function submitCurrentAnswer(answerText = null) {
  const studentAnswer = answerText ?? "";

  const savedData = localStorage.getItem("current_problem");
  if (!savedData) {
    showCustomPopup("문제 데이터가 사라졌습니다. 다시 시도해 주세요.😢");
    return;
  }

  const problemObj = JSON.parse(savedData);

  try {
    const res = await apiFetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem: problemObj, student_answer: studentAnswer }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("서버 채점 에러:", data);
      throw new Error(data.detail || "채점 실패");
    }

    closeResultModal();
    showFinalFeedbackModal(data.feedback, data.is_correct);

  } catch (err) {
    console.error("제출 프로세스 중 오류:", err);
    showCustomPopup("채점 중 오류가 발생했습니다.😢 " + err.message);

    const submitBtn = document.getElementById("modal-submit-btn");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = "제출하기";
    }
  }
}

// ─── 최종 피드백 모달 ──────────────────────────────────────────

/**
 * 채점 결과 피드백을 feedbackModal에 표시
 * "다시 풀기"(loadProblem) / "다른 단원 선택"(goPage today) 버튼 제공
 * 빠른 더블클릭 방지: 500ms 후 버튼 활성화
 * @param {string}  feedback  - AI 채점 피드백 텍스트
 * @param {boolean} isCorrect - 정답 여부
 */
function showFinalFeedbackModal(feedback, isCorrect) {
  const feedbackText = document.getElementById("feedbackText");
  const retryBtn     = document.getElementById("feedbackRetryBtn");
  const nextUnitBtn  = document.getElementById("feedbackNextUnitBtn");
  const closeBtn     = document.getElementById("closeFeedbackModalBtn");

  if (feedbackText) {
    const processedText = (typeof prepareMathDisplayText === "function")
                          ? prepareMathDisplayText(feedback)
                          : feedback;
    feedbackText.innerText = processedText;
    if (typeof renderMath === "function") renderMath("feedbackText");
  }

  if (retryBtn) {
    retryBtn.style.display = "inline-block";
    retryBtn.disabled = true;
    retryBtn.onclick = async (e) => {
      if (e) e.preventDefault();
      if (typeof closeFeedbackModal === "function") closeFeedbackModal();
      if (typeof loadProblem === "function") await loadProblem();
    };
  }

  if (nextUnitBtn) {
    nextUnitBtn.style.display = "inline-block";
    nextUnitBtn.disabled = true;
    nextUnitBtn.onclick = (e) => {
      if (e) e.preventDefault();
      if (typeof closeFeedbackModal === "function") closeFeedbackModal();
      localStorage.setItem("step", "select_unit");
      if (typeof goPage === "function") goPage("today");
    };
  }

  if (typeof openFeedbackModal === "function") {
    openFeedbackModal();
  } else {
    console.error("openFeedbackModal 함수가 정의되지 않았습니다.");
  }

  // 500ms 후 버튼 활성화 (빠른 중복 클릭 방지)
  setTimeout(() => {
    if (retryBtn)    retryBtn.disabled = false;
    if (nextUnitBtn) nextUnitBtn.disabled = false;
    if (closeBtn)    closeBtn.disabled = false;
  }, 500);
}
