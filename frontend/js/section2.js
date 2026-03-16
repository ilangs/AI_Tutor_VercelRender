/**
 * section2.js - AI 자유학습 섹션
 * 학생 질문 → RAG 기반 AI 답변 → 채팅 UI 표시
 * 기능: 채팅 송수신, TTS(재생/정지), 답변 복사, 대화기록 복원
 * 사용 페이지: app.html (id="page-free")
 * 외부 의존: apiFetch, renderMath, showCustomPopup (app.js)
 */

// ─── 전역 변수 ─────────────────────────────────────────────────
// 대화 기록 배열 - 서버 전송 시 컨텍스트로 사용
// 형식: [{ role: "user"|"assistant", content: "..." }, ...]
var freeChatHistory = [];

var freeInited = false;        // 이벤트 중복 바인딩 방지 플래그
var freeCurrentAudio = null;   // 현재 재생 중인 Audio 객체
var freeCurrentTtsBtn = null;  // 현재 활성화된 TTS 버튼

// ─── 초기화 ────────────────────────────────────────────────────

/**
 * 자유학습 섹션 초기화 - goPage("free") 시 호출
 * 이벤트 바인딩 1회, 이전 대화 기록 복원, 입력창 포커스
 */
async function initFreeChat() {
  if (!freeInited) {
    bindFreeChatEvents();
    freeInited = true;
  }
  await loadFreeChatHistory();
  var input = document.getElementById("free-chat-input");
  if (input) input.focus();
}

// ─── 이벤트 바인딩 ─────────────────────────────────────────────

/**
 * 전송 버튼 클릭 / Enter 키 → handleFreeChatSend() 연결
 * Shift+Enter는 줄바꿈 처리
 */
function bindFreeChatEvents() {
  var sendBtn = document.getElementById("free-chat-send-btn");
  var input   = document.getElementById("free-chat-input");

  if (sendBtn) {
    sendBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      handleFreeChatSend();
    });
  }

  if (input) {
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        handleFreeChatSend();
      }
    });
  }
}

// ─── 대화 기록 복원 ────────────────────────────────────────────

/**
 * GET /api/free/history → 이전 채팅 기록 화면 복원
 * skipScroll 패턴: 대량 복원 시 마지막에 한 번만 스크롤
 */
async function loadFreeChatHistory() {
  var container = document.getElementById("free-chat-messages");
  if (!container) return;

  container.innerHTML = "";
  freeChatHistory = [];

  try {
    var res = await apiFetch("/api/free/history");
    if (!res.ok) { console.error("채팅 기록 로드 실패:", res.status); return; }

    var data = await res.json();
    var history = data.history || [];

    history.forEach(function (msg) {
      freeChatHistory.push({ role: msg.role, content: msg.content });
    });

    // 복원 시 각 메시지마다 스크롤하지 않고 마지막에 한 번만 스크롤
    history.forEach(function (msg) {
      appendChatBubble(msg.role, msg.content, true);
    });

    scrollToBottom();
  } catch (err) {
    console.error("채팅 기록 불러오기 오류:", err);
  }
}

// ─── 메시지 전송 ───────────────────────────────────────────────

/**
 * 질문 전송 → POST /api/free/chat → AI 답변 수신 및 표시
 * 전송 중 입력창/버튼 비활성화, 로딩 말풍선 표시
 */
async function handleFreeChatSend() {
  var input   = document.getElementById("free-chat-input");
  var sendBtn = document.getElementById("free-chat-send-btn");

  if (!input) return;

  var question = input.value.trim();
  if (!question) return;

  input.value = "";
  if (input)   input.disabled = true;
  if (sendBtn) sendBtn.disabled = true;

  appendChatBubble("user", question);
  var loadingId = showLoadingBubble();

  try {
    var res = await apiFetch("/api/free/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question, chat_history: freeChatHistory })
    });

    removeLoadingBubble(loadingId);

    if (!res.ok) {
      var errData = await res.json().catch(function () { return {}; });
      appendChatBubble("assistant", errData.detail || "서버 오류가 발생했어요. 다시 시도해 주세요.");
      return;
    }

    var data = await res.json();
    var answer  = data.answer  || "답변을 생성하지 못했어요.";
    var ttsText = data.tts_text || answer;

    freeChatHistory.push({ role: "user",      content: question });
    freeChatHistory.push({ role: "assistant", content: answer   });

    appendChatBubble("assistant", answer, false, ttsText);

  } catch (err) {
    removeLoadingBubble(loadingId);
    console.error("자유학습 채팅 오류:", err);
    appendChatBubble("assistant", "네트워크 오류가 발생했어요. 인터넷 연결을 확인해 주세요.");
  } finally {
    if (input)   input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    if (input)   input.focus();
  }
}

// ─── 말풍선 렌더링 ─────────────────────────────────────────────

/**
 * 채팅 말풍선 추가
 * user → 오른쪽 / assistant → 왼쪽 + TTS 버튼 + 복사 버튼
 * @param {string}  role       - "user" | "assistant"
 * @param {string}  content    - 메시지 내용
 * @param {boolean} skipScroll - true 이면 스크롤 안 함 (대량 복원 시)
 * @param {string}  ttsText    - TTS 읽기용 텍스트 (없으면 content 사용)
 */
function appendChatBubble(role, content, skipScroll, ttsText) {
  var container = document.getElementById("free-chat-messages");
  if (!container) return;

  var row    = document.createElement("div");
  row.className = "free-msg-row " + role;

  var bubble = document.createElement("div");
  bubble.className = "free-msg-bubble";
  bubble.innerText = content;  // innerText로 XSS 방지

  if (role === "assistant") {
    var wrapper = document.createElement("div");
    wrapper.className = "free-msg-wrapper";
    wrapper.appendChild(bubble);

    var btnRow = document.createElement("div");
    btnRow.className = "free-btn-row";

    // TTS 버튼
    var ttsBtn = document.createElement("button");
    ttsBtn.type = "button";
    ttsBtn.className = "free-tts-btn";
    ttsBtn.innerText = "🔊 음성 듣기";
    ttsBtn.dataset.ttsState = "idle";

    var textToRead = ttsText || cleanTextForCopy(content);
    ttsBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleFreeTTS(textToRead, ttsBtn);
    });

    // 복사 버튼
    var copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "free-copy-btn";
    copyBtn.innerText = "📋 답변 복사";
    copyBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      copyAnswerToClipboard(cleanTextForCopy(content), copyBtn);
    });

    btnRow.appendChild(ttsBtn);
    btnRow.appendChild(copyBtn);
    wrapper.appendChild(btnRow);
    row.appendChild(wrapper);
  } else {
    row.appendChild(bubble);
  }

  container.appendChild(row);

  if (typeof MathJax !== "undefined" && MathJax.typesetPromise) {
    MathJax.typesetPromise([row]).catch(function (err) {
      console.error("MathJax 렌더링 오류:", err);
    });
  }

  if (!skipScroll) scrollToBottom();
}

// ─── 로딩 말풍선 ───────────────────────────────────────────────

/**
 * "루미가 생각하는 중..." 로딩 말풍선 표시
 * @returns {string} 고유 ID (removeLoadingBubble에서 사용)
 */
function showLoadingBubble() {
  var container = document.getElementById("free-chat-messages");
  if (!container) return null;

  var id  = "free-loading-" + Date.now();
  var row = document.createElement("div");
  row.className = "free-msg-row assistant";
  row.id = id;

  var bubble = document.createElement("div");
  bubble.className = "free-msg-bubble";
  bubble.innerHTML =
    '<span class="free-loading-dot" style="animation-delay:0s">●</span> ' +
    '<span class="free-loading-dot" style="animation-delay:0.2s">●</span> ' +
    '<span class="free-loading-dot" style="animation-delay:0.4s">●</span> ' +
    " 루미가 생각하는 중...";

  row.appendChild(bubble);
  container.appendChild(row);
  scrollToBottom();
  return id;
}

/** 로딩 말풍선 제거 */
function removeLoadingBubble(loadingId) {
  if (!loadingId) return;
  var el = document.getElementById(loadingId);
  if (el) el.remove();
}

// ─── TTS 제어 ──────────────────────────────────────────────────

/**
 * TTS 버튼 토글 - 상태별 동작
 *   idle    → API 호출 후 재생, playing → 일시정지, paused → 이어서재생
 * POST /api/tts → base64 MP3, 실패 시 Web Speech API 폴백
 * @param {string}      text - 읽어줄 텍스트
 * @param {HTMLElement} btn  - TTS 버튼 요소
 */
async function toggleFreeTTS(text, btn) {
  if (!text || !btn) return;

  var state = btn.dataset.ttsState || "idle";

  if (state === "playing") { pauseFreeTTS(btn);  return; }
  if (state === "paused")  { resumeFreeTTS(btn); return; }
  if (state === "loading") { return; }

  // idle → 음성 생성 시작
  stopOtherTTS(btn);

  btn.dataset.ttsState = "loading";
  btn.innerText = "🔊 생성 중...";
  btn.disabled = true;

  // TTS 엔진이 수학 기호를 잘못 읽는 문제 방지
  var safeText = text
    .replace(/÷/g,       " 나누기 ")
    .replace(/=/g,       " 은 ")
    .replace(/×/g,       " 곱하기 ")
    .replace(/\+/g,      " 더하기 ")
    .replace(/-/g,       " 빼기 ")
    .replace(/\\div/g,   " 나누기 ")
    .replace(/\\times/g, " 곱하기 ")
    .replace(/나눗셈/g,   "나누쎔");  // "나눗셈"이 "나눅셈"으로 읽히는 TTS 버그 방지

  try {
    var res = await apiFetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: safeText })
    });

    if (!res.ok) throw new Error("TTS API 오류");

    var data = await res.json();
    var audioData = typeof data === "string" ? data : data.audio_b64;
    if (!audioData) throw new Error("오디오 데이터 없음");

    var audio = new Audio("data:audio/mp3;base64," + audioData);
    btn._audioObj = audio;

    audio.addEventListener("ended", function () {
      btn.dataset.ttsState = "idle";
      btn.innerText = "🔊 음성 듣기";
      btn._audioObj = null;
      if (freeCurrentTtsBtn === btn) {
        freeCurrentAudio = null;
        freeCurrentTtsBtn = null;
      }
    });

    freeCurrentAudio  = audio;
    freeCurrentTtsBtn = btn;

    audio.play();
    btn.disabled = false;
    btn.dataset.ttsState = "playing";
    btn.innerText = "⏸️ 음성 중지";

  } catch (err) {
    console.warn("TTS 실패, 브라우저 음성으로 대체:", err);

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();

      var utt = new SpeechSynthesisUtterance(text);
      utt.lang = "ko-KR";
      utt.addEventListener("end", function () {
        btn.dataset.ttsState = "idle";
        btn.innerText = "🔊 음성 듣기";
        if (freeCurrentTtsBtn === btn) {
          freeCurrentAudio  = null;
          freeCurrentTtsBtn = null;
        }
      });

      btn._utterance    = utt;
      btn._useBrowserTTS = true;
      freeCurrentTtsBtn = btn;

      window.speechSynthesis.speak(utt);
      btn.disabled = false;
      btn.dataset.ttsState = "playing";
      btn.innerText = "⏸️ 음성 중지";
    } else {
      btn.disabled = false;
      btn.dataset.ttsState = "idle";
      btn.innerText = "🔊 음성 듣기";
      showCustomPopup("이 브라우저에서는 음성 기능을 사용할 수 없습니다.😢");
    }
  }
}

/**
 * TTS 일시정지 (서버 TTS: Audio.pause / 브라우저 TTS: speechSynthesis.pause)
 * @param {HTMLElement} btn - TTS 버튼
 */
function pauseFreeTTS(btn) {
  if (btn._useBrowserTTS) {
    if (window.speechSynthesis && window.speechSynthesis.speaking) window.speechSynthesis.pause();
  } else if (btn._audioObj) {
    btn._audioObj.pause();
  }
  btn.dataset.ttsState = "paused";
  btn.innerText = "🔊 음성 듣기";
}

/**
 * TTS 이어서 재생 (서버 TTS: Audio.play / 브라우저 TTS: speechSynthesis.resume)
 * @param {HTMLElement} btn - TTS 버튼
 */
function resumeFreeTTS(btn) {
  if (btn._useBrowserTTS) {
    if (window.speechSynthesis && window.speechSynthesis.paused) window.speechSynthesis.resume();
  } else if (btn._audioObj) {
    btn._audioObj.play();
  }
  btn.dataset.ttsState = "playing";
  btn.innerText = "⏸️ 음성 중지";
}

/**
 * 다른 버튼의 TTS 중지 및 초기화 (한 번에 하나만 재생)
 * section1.js의 toggleModalTTS에서도 호출
 * @param {HTMLElement} currentBtn - 현재 클릭된 버튼 (이 버튼 외 중지)
 */
function stopOtherTTS(currentBtn) {
  if (freeCurrentTtsBtn && freeCurrentTtsBtn !== currentBtn) {
    var otherBtn = freeCurrentTtsBtn;
    if (otherBtn._useBrowserTTS) {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } else if (otherBtn._audioObj) {
      otherBtn._audioObj.pause();
      otherBtn._audioObj.currentTime = 0;
      otherBtn._audioObj = null;
    }
    otherBtn.dataset.ttsState  = "idle";
    otherBtn.innerText         = "🔊 음성 듣기";
    otherBtn._useBrowserTTS    = false;
  }
  freeCurrentAudio  = null;
  freeCurrentTtsBtn = null;
}

// ─── 클립보드 복사 ─────────────────────────────────────────────

/**
 * AI 답변을 클립보드에 복사 (실패 시 textarea execCommand 폴백)
 * 복사 성공 시 버튼 텍스트 2초간 "✅ 복사 완료!"로 변경
 * @param {string}      text - 복사할 텍스트
 * @param {HTMLElement} btn  - 복사 버튼
 */
async function copyAnswerToClipboard(text, btn) {
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      btn.innerText = "✅ 복사 완료!";
      setTimeout(function () { btn.innerText = "📋 답변 복사"; }, 2000);
    }
  } catch (err) {
    console.warn("Clipboard API 실패, fallback 사용:", err);
    try {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity  = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      if (btn) {
        btn.innerText = "✅ 복사 완료!";
        setTimeout(function () { btn.innerText = "📋 답변 복사"; }, 2000);
      }
    } catch (fallbackErr) {
      console.error("복사 실패:", fallbackErr);
      showCustomPopup("복사에 실패했습니다. 직접 텍스트를 선택하여 복사해 주세요.😢");
    }
  }
}

/**
 * LaTeX 기호를 일반 텍스트/읽기 가능한 형식으로 변환 (복사 및 TTS용)
 * @param {string} text - LaTeX 포함 텍스트
 * @returns {string} 정제된 일반 텍스트
 */
function cleanTextForCopy(text) {
  if (!text) return "";
  var res = text;
  res = res.replace(/\\frac{([^}]+)}{([^}]+)}/g, "$2분의 $1");  // \frac{a}{b} → b분의 a
  res = res.replace(/\\pi/g,    "π");
  res = res.replace(/\\times/g, "×");
  res = res.replace(/\\div/g,   "÷");
  res = res.replace(/\\sqrt/g,  "√");
  res = res.replace(/\\\[/g, "").replace(/\\\]/g, "");
  res = res.replace(/\\\(/g, "").replace(/\\\)/g, "");
  res = res.replace(/\$/g,   "");
  res = res.replace(/\\/g,   "");  // 남은 백슬래시 제거 (메모장 ₩ 표시 방지)
  return res.trim();
}

// ─── 스크롤 ────────────────────────────────────────────────────

/**
 * 채팅 메시지 컨테이너 최하단으로 스크롤
 * 50ms 지연: DOM 렌더링 완료 후 scrollHeight 측정
 */
function scrollToBottom() {
  var container = document.getElementById("free-chat-messages");
  if (!container) return;
  setTimeout(function () {
    container.scrollTop = container.scrollHeight;
  }, 50);
}
