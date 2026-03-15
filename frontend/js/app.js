/**
 * app.js - 앱 전역 공통 모듈
 * JWT 토큰 관리, API 호출 헬퍼, SPA 페이지 라우팅, 모달 관리, MathJax 렌더링
 */

// Vercel 프록시를 통해 API 호출 (상대 경로)
const API = ""

// sessionStorage에서 JWT 토큰 반환 (탭 닫으면 자동 삭제)
function getToken() {
  return sessionStorage.getItem("token");
}

// 모든 API 요청에 Authorization 헤더를 자동으로 추가하는 헬퍼
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

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("sidebar-title")) {
    initApp();
  }

  const characterButtons = document.querySelectorAll(".character-btn");
  characterButtons.forEach(button => {
    button.addEventListener("click", () => {
      characterButtons.forEach(btn => btn.classList.remove("selected"));
      button.classList.add("selected");
    });
  });
});

// POST /auth/login → JWT 토큰 저장 → /main 이동
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

// app.html 로드 시 실행: GET /auth/me로 토큰 검증 후 사이드바 업데이트
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

// SPA 페이지 전환: 모든 .page를 숨기고 target만 표시
function goPage(pageName) {
  const pages = document.querySelectorAll(".page");
  pages.forEach(p => (p.style.display = "none"));

  const target = document.getElementById(`page-${pageName}`);
  if (target) target.style.display = "block";

  currentPage = pageName;

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
  if (pageName === "free" && typeof initFreeChat === "function") initFreeChat();
  if (pageName === "exam" && typeof initExam === "function") initExam();
  if (pageName === "score" && typeof loadScoreLog === "function") loadScoreLog();
  if (pageName === "token" && typeof renderTokenPage === "function") renderTokenPage();
}

function goHome() {
  localStorage.setItem("step", "select_unit");
  goPage("today");
}

function logout() {
  sessionStorage.clear();
  window.location.href = "/";
}

// MathJax 수식 렌더링 (targetId 지정 시 해당 요소만)
function renderMath(targetId) {
  if (!window.MathJax) return;
  if (targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;
    MathJax.typesetPromise([el]).catch(err => console.error("MathJax 오류:", err));
    return;
  }
  MathJax.typesetPromise().catch(err => console.error("MathJax 오류:", err));
}

function openResultModal() {
  const modal = document.getElementById("resultModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.style.display = "flex";
}

function closeResultModal() {
  stopAllModalAudio();
  const modal = document.getElementById("resultModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.style.display = "none";
  }
}

function openFeedbackModal() {
  const modal = document.getElementById("feedbackModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.style.display = "flex";
}

function closeFeedbackModal() {
  const modal = document.getElementById("feedbackModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.style.display = "none";
}

// 이벤트 리스너 등록 (dataset.bound로 중복 방지)
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

document.addEventListener("DOMContentLoaded", () => {
  const characterButtons = document.querySelectorAll(".character-btn");
  characterButtons.forEach(button => {
    button.addEventListener("click", () => {
      characterButtons.forEach(btn => btn.classList.remove("selected"));
      button.classList.add("selected");
    });
  });
});

function showCustomPopup(message) {
  const popup = document.getElementById("custom-popup");
  const text = document.getElementById("popup-message");
  text.innerText = message;
  popup.style.display = "flex";
}

function closeCustomPopup() {
  document.getElementById("custom-popup").style.display = "none";
}
