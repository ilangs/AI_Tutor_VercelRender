/**
 * app.js - 앱 전역 공통 모듈
 * 인증(JWT), API 호출, SPA 라우팅, 모달 관리 담당
 * 사용 페이지: app.html, login.html
 */

// API 기본 경로 (빈 문자열 = 현재 도메인 상대 경로)
const API = "";

// 현재 표시 중인 페이지 이름 (goPage 호출 시 갱신)
let currentPage = "";

// ─── 모달 사운드 ───────────────────────────────────────────────
const modalSound = new Audio("/assets/audio/button.mp3");
modalSound.preload = "auto";

let modalSoundUnlocked = false;

// 첫 클릭 시 오디오 자동 재생 정책 우회 (브라우저 보안 정책)
function unlockModalSound() {
  if (modalSoundUnlocked) return;
  modalSound.volume = 0;
  modalSound.play()
    .then(() => {
      modalSound.pause();
      modalSound.currentTime = 0;
      modalSound.volume = 1;
      modalSoundUnlocked = true;
    })
    .catch(err => console.log("사운드 잠금 해제 실패:", err));
}

document.addEventListener("click", unlockModalSound, { once: true });

function playModalSound() {
  modalSound.currentTime = 0;
  modalSound.play().catch(err => console.log("사운드 재생 실패:", err));
}

// ─── 인증 ──────────────────────────────────────────────────────

/** sessionStorage에서 JWT 토큰 반환 */
function getToken() {
  return sessionStorage.getItem("token");
}

/**
 * 인증 헤더가 자동 추가된 fetch 래퍼
 * @param {string} path    - API 경로 (예: "/api/units")
 * @param {object} options - fetch 옵션
 * @returns {Promise<Response>}
 */
async function apiFetch(path, options = {}) {
  const token = getToken();
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
}

// app.html 에서만 initApp 실행 (sidebar-title 요소 존재 여부로 구분)
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("sidebar-title")) {
    initApp();
  }
});

// ─── 로그인 ────────────────────────────────────────────────────

/**
 * 로그인 처리 - POST /auth/login
 * 성공 시 JWT 토큰을 sessionStorage에 저장 후 /main 으로 이동
 */
async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    showCustomPopup("모든 항목을 입력해 주세요.😄");
    return;
  }

  try {
    const response = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username, password })
    });

    const data = await response.json();

    if (data.access_token) {
      sessionStorage.setItem("token", data.access_token);
      sessionStorage.setItem("username", data.username || username);
      if (data.nickname) localStorage.setItem("nickname", data.nickname);
      if (data.character) localStorage.setItem("character", data.character);
      window.location.href = "/main";
    } else {
      showCustomPopup("아이디 또는 비밀번호가 일치하지 않습니다.🥲");
    }
  } catch (error) {
    showCustomPopup("로그인 중 오류가 발생했습니다.😢");
    console.error(error);
  }
}

// ─── 앱 초기화 ─────────────────────────────────────────────────

/**
 * app.html 진입 시 실행 - GET /auth/me 로 토큰 유효성 확인
 * 실패 시 로그인 페이지로 이동, 성공 시 사이드바 업데이트 후 홈 화면 표시
 */
async function initApp() {
  const token = getToken();
  if (!token) {
    window.location.href = "/";
    return;
  }

  try {
    const res = await apiFetch("/auth/me");
    if (!res.ok) {
      sessionStorage.clear();
      window.location.href = "/";
      return;
    }

    const user = await res.json();
    sessionStorage.setItem("username", user.username);

    const title = document.getElementById("sidebar-title");
    if (title) title.innerText = ` ${user.nickname || user.username}의 math class🎓`;

    const img = document.getElementById("user-character");
    if (img && user.character) img.src = `/assets/images/${user.character}.png`;

    goPage("home");
    bindAppEvents();
  } catch (error) {
    console.error(error);
    window.location.href = "/";
  }
}

// ─── SPA 페이지 전환 ───────────────────────────────────────────

/**
 * SPA 방식 페이지 전환 - 모든 .page div를 숨기고 id="page-{pageName}" 만 표시
 * 각 페이지 초기화 함수 호출 및 홈 비디오 재생/정지 처리
 * @param {string} pageName - 이동할 페이지 이름 (home / today / free / exam / score / token)
 */
function goPage(pageName) {
  document.querySelectorAll(".page").forEach(p => (p.style.display = "none"));

  const target = document.getElementById(`page-${pageName}`);
  if (target) target.style.display = "block";

  currentPage = pageName;

  // 홈 비디오 재생/정지
  const homeVideo = document.getElementById("homeVideo");
  if (homeVideo) {
    if (pageName === "home") {
      homeVideo.play().catch(() => {});
    } else {
      homeVideo.pause();
      homeVideo.currentTime = 0;
    }
  }

  if (pageName === "today") {
    localStorage.setItem("step", "select_unit");
    renderToday();
    loadUnits();
  }

  if (pageName === "free") {
    if (typeof initFreeChat === "function") initFreeChat();
  }

  if (pageName === "exam") {
    if (typeof initExam === "function") initExam();
  }

  if (pageName === "score") {
    if (typeof loadScoreLog === "function") loadScoreLog();
  }

  if (pageName === "token") {
    if (typeof renderTokenPage === "function") renderTokenPage();
  }
}

/** 학습 단계를 초기화하고 오늘 학습 페이지로 이동 */
function goHome() {
  localStorage.setItem("step", "select_unit");
  goPage("today");
}

// ─── 로그아웃 ──────────────────────────────────────────────────

/** sessionStorage 삭제 후 로그인 페이지로 이동 */
function logout() {
  sessionStorage.clear();
  window.location.href = "/";
}

// ─── 수식 렌더링 ───────────────────────────────────────────────

/**
 * MathJax로 LaTeX 수식 렌더링
 * @param {string} [targetId] - 특정 요소 id (없으면 전체 페이지)
 */
function renderMath(targetId) {
  if (!window.MathJax) return;

  if (targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;
    MathJax.typesetPromise([el]).catch(err => console.error("MathJax 렌더링 오류:", err));
    return;
  }

  MathJax.typesetPromise().catch(err => console.error("MathJax 렌더링 오류:", err));
}

// ─── 문제 결과 모달 ────────────────────────────────────────────

/** resultModal 열기 */
function openResultModal() {
  const modal = document.getElementById("resultModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.style.display = "flex";
  playModalSound();
}

/** resultModal 닫기 (TTS 정지 포함) */
function closeResultModal() {
  stopAllModalAudio();
  const modal = document.getElementById("resultModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.style.display = "none";
  }
}

// ─── 최종 피드백 모달 ──────────────────────────────────────────

/** feedbackModal 열기 */
function openFeedbackModal() {
  const modal = document.getElementById("feedbackModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.style.display = "flex";
  playModalSound();
}

/** feedbackModal 닫기 */
function closeFeedbackModal() {
  const modal = document.getElementById("feedbackModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.style.display = "none";
}

// ─── 공통 이벤트 바인딩 ────────────────────────────────────────

/**
 * 모달 닫기 버튼 이벤트 등록 (중복 방지: data-bound 속성 사용)
 * initApp() 완료 후 1회 호출
 */
function bindAppEvents() {
  const closeBtn = document.getElementById("closeModalBtn");
  const closeFeedbackBtn = document.getElementById("closeFeedbackModalBtn");

  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = "1";
    closeBtn.addEventListener("click", closeResultModal);
  }

  if (closeFeedbackBtn && !closeFeedbackBtn.dataset.bound) {
    closeFeedbackBtn.dataset.bound = "1";
    closeFeedbackBtn.addEventListener("click", closeFeedbackModal);
  }
}

// ─── 캐릭터 선택 (login.html) ─────────────────────────────────

// 회원가입 모달의 캐릭터 버튼 단일 선택 처리
document.addEventListener("DOMContentLoaded", () => {
  const characterButtons = document.querySelectorAll(".character-btn");
  characterButtons.forEach(button => {
    button.addEventListener("click", () => {
      characterButtons.forEach(btn => btn.classList.remove("selected"));
      button.classList.add("selected");
    });
  });
});

// ─── 커스텀 팝업 ───────────────────────────────────────────────

/**
 * alert() 대체 커스텀 팝업 표시
 * @param {string} message - 팝업 메시지
 */
function showCustomPopup(message) {
  const popup = document.getElementById("custom-popup");
  const text = document.getElementById("popup-message");
  text.innerText = message;
  popup.style.display = "flex";
  playModalSound();
}

/** 커스텀 팝업 닫기 */
function closeCustomPopup() {
  document.getElementById("custom-popup").style.display = "none";
}
