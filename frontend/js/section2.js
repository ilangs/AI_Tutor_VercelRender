/**
 * section2.js - AI 자유학습 섹션
 * RAG+LLM 기반 수학 Q&A 채팅 UI. TTS 토글, 답변 복사, 대화 기록 DB 저장/복원.
 * 의존: apiFetch, renderMath (app.js)
 */

var freeChatHistory = [];   // 대화 기록 (컨텍스트 유지용)
var freeInited = false;     // 이벤트 중복 바인딩 방지
var freeCurrentAudio = null;
var freeCurrentTtsBtn = null;

// goPage("free") 호출 시 실행
async function initFreeChat() {
    if (!freeInited) {
        bindFreeChatEvents();
        freeInited = true;
    }
    await loadFreeChatHistory();
    var input = document.getElementById("free-chat-input");
    if (input) input.focus();
}

// 전송 버튼 + Enter 키 이벤트 등록 (Shift+Enter는 줄바꿈)
function bindFreeChatEvents() {
    var sendBtn = document.getElementById("free-chat-send-btn");
    var input = document.getElementById("free-chat-input");

    if (sendBtn) {
        sendBtn.addEventListener("click", function (e) {
            e.preventDefault(); e.stopPropagation();
            handleFreeChatSend();
        });
    }
    if (input) {
        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault(); e.stopPropagation();
                handleFreeChatSend();
            }
        });
    }
}

// GET /api/free/history: 이전 대화 기록 복원
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
        // 모든 메시지 추가 후 마지막에 한 번만 스크롤
        history.forEach(function (msg) {
            appendChatBubble(msg.role, msg.content, true);
        });
        scrollToBottom();
    } catch (err) {
        console.error("채팅 기록 불러오기 오류:", err);
    }
}

// POST /api/free/chat: 질문 전송 → AI 답변 표시
async function handleFreeChatSend() {
    var input = document.getElementById("free-chat-input");
    var sendBtn = document.getElementById("free-chat-send-btn");

    if (!input) return;
    var question = input.value.trim();
    if (!question) return;

    input.value = "";
    if (input) input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    appendChatBubble("user", question);
    var loadingId = showLoadingBubble();

    try {
        var res = await apiFetch("/api/free/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question, chat_history: freeChatHistory })
        });

        removeLoadingBubble(loadingId);

        if (!res.ok) {
            var errData = await res.json().catch(function () { return {}; });
            appendChatBubble("assistant", errData.detail || "서버 오류가 발생했어요. 다시 시도해 주세요.");
            return;
        }

        var data = await res.json();
        var answer = data.answer || "답변을 생성하지 못했어요.";
        var ttsText = data.tts_text || answer;

        freeChatHistory.push({ role: "user", content: question });
        freeChatHistory.push({ role: "assistant", content: answer });

        appendChatBubble("assistant", answer, false, ttsText);

    } catch (err) {
        removeLoadingBubble(loadingId);
        console.error("자유학습 채팅 오류:", err);
        appendChatBubble("assistant", "네트워크 오류가 발생했어요. 인터넷 연결을 확인해 주세요.");
    } finally {
        if (input) input.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        if (input) input.focus();
    }
}

// 말풍선 추가 (user=오른쪽, assistant=왼쪽+TTS/복사 버튼)
function appendChatBubble(role, content, skipScroll, ttsText) {
    var container = document.getElementById("free-chat-messages");
    if (!container) return;

    var row = document.createElement("div");
    row.className = "free-msg-row " + role;

    var bubble = document.createElement("div");
    bubble.className = "free-msg-bubble";
    bubble.innerText = content;

    if (role === "assistant") {
        var wrapper = document.createElement("div");
        wrapper.className = "free-msg-wrapper";
        wrapper.appendChild(bubble);

        var btnRow = document.createElement("div");
        btnRow.className = "free-btn-row";

        var ttsBtn = document.createElement("button");
        ttsBtn.type = "button";
        ttsBtn.className = "free-tts-btn";
        ttsBtn.innerText = "🔊 음성 듣기";
        ttsBtn.dataset.ttsState = "idle";

        var textToRead = ttsText || cleanTextForCopy(content);
        ttsBtn.addEventListener("click", function (e) {
            e.preventDefault(); e.stopPropagation();
            toggleFreeTTS(textToRead, ttsBtn);
        });

        var copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "free-copy-btn";
        copyBtn.innerText = "📋 답변 복사";
        copyBtn.addEventListener("click", function (e) {
            e.preventDefault(); e.stopPropagation();
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

// 로딩 말풍선 표시 (고유 ID 반환)
function showLoadingBubble() {
    var container = document.getElementById("free-chat-messages");
    if (!container) return null;

    var id = "free-loading-" + Date.now();
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

function removeLoadingBubble(loadingId) {
    if (!loadingId) return;
    var el = document.getElementById(loadingId);
    if (el) el.remove();
}

// TTS 재생/일시정지 토글 (서버 TTS → 실패 시 Web Speech API 폴백)
async function toggleFreeTTS(text, btn) {
    if (!text || !btn) return;

    var state = btn.dataset.ttsState || "idle";

    if (state === "playing") { pauseFreeTTS(btn); return; }
    if (state === "paused")  { resumeFreeTTS(btn); return; }
    if (state === "loading") return;

    stopOtherTTS(btn);

    btn.dataset.ttsState = "loading";
    btn.innerText = "🔊 생성 중...";
    btn.disabled = true;

    // TTS 엔진이 수학 기호를 잘못 읽는 문제 방지
    var safeText = text
        .replace(/÷/g, " 나누기 ").replace(/=/g, " 은 ")
        .replace(/×/g, " 고파기 ").replace(/\+/g, " 더하기 ")
        .replace(/-/g, " 빼기 ").replace(/\\div/g, " 나누기 ")
        .replace(/\\times/g, " 고파기 ")
        .replace(/나눗셈/g, "나누쎔");

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
            if (freeCurrentTtsBtn === btn) { freeCurrentAudio = null; freeCurrentTtsBtn = null; }
        });

        freeCurrentAudio = audio;
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
                if (freeCurrentTtsBtn === btn) { freeCurrentAudio = null; freeCurrentTtsBtn = null; }
            });
            btn._utterance = utt;
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

function pauseFreeTTS(btn) {
    if (btn._useBrowserTTS) {
        if (window.speechSynthesis && window.speechSynthesis.speaking) window.speechSynthesis.pause();
    } else if (btn._audioObj) {
        btn._audioObj.pause();
    }
    btn.dataset.ttsState = "paused";
    btn.innerText = "🔊 음성 듣기";
}

function resumeFreeTTS(btn) {
    if (btn._useBrowserTTS) {
        if (window.speechSynthesis && window.speechSynthesis.paused) window.speechSynthesis.resume();
    } else if (btn._audioObj) {
        btn._audioObj.play();
    }
    btn.dataset.ttsState = "playing";
    btn.innerText = "⏸️ 음성 중지";
}

// 다른 버튼의 TTS 중지 (한 번에 하나만 재생)
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
        otherBtn.dataset.ttsState = "idle";
        otherBtn.innerText = "🔊 음성 듣기";
        otherBtn._useBrowserTTS = false;
    }
    freeCurrentAudio = null;
    freeCurrentTtsBtn = null;
}

// 클립보드 복사 (Clipboard API → fallback: execCommand)
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
            textarea.style.opacity = "0";
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

// LaTeX 기호를 읽기 쉬운 텍스트로 변환 (복사/TTS용)
function cleanTextForCopy(text) {
    if (!text) return "";
    var res = text;
    res = res.replace(/\\frac{([^}]+)}{([^}]+)}/g, "$2분의 $1");
    res = res.replace(/\\pi/g, "π").replace(/\\times/g, "×")
             .replace(/\\div/g, "÷").replace(/\\sqrt/g, "√");
    res = res.replace(/\\\[/g, "").replace(/\\\]/g, "")
             .replace(/\\\(/g, "").replace(/\\\)/g, "").replace(/\$/g, "");
    res = res.replace(/\\/g, "");
    return res.trim();
}

// DOM 렌더링 완료 후 스크롤 (50ms 지연)
function scrollToBottom() {
    var container = document.getElementById("free-chat-messages");
    if (!container) return;
    setTimeout(function () {
        container.scrollTop = container.scrollHeight;
    }, 50);
}
