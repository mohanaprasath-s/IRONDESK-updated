/* ==========================================================================
   IronDesk Assistant — chat widget
   Loaded by gym-management.html with <script src="chatbot.js"></script>
   It reuses API_URL and token from that page, and talks to POST /api/chat.
   ========================================================================== */
(function () {
  var history = [];      // the conversation: [{ role: "user" | "assistant", content: "..." }]
  var busy = false;

  var SUGGESTIONS = [
    "Who is expiring this week?",
    "How much revenue this month?",
    "List expired members",
    "Draft a renewal reminder message"
  ];

  /* ---------- Styles (uses the page's existing colour variables) ---------- */
  var css = [
    "#ai-fab{position:fixed;right:22px;bottom:22px;z-index:900;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;",
    "  background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#1a1a1a;display:grid;place-items:center;",
    "  box-shadow:0 12px 28px rgba(255,90,52,.4);transition:transform .15s ease}",
    "#ai-fab:hover{transform:scale(1.06)}",
    "#ai-panel{position:fixed;right:22px;bottom:92px;z-index:900;width:380px;max-width:calc(100vw - 28px);height:540px;max-height:calc(100vh - 120px);",
    "  background:var(--panel);border:1px solid var(--line-2);border-radius:var(--radius);display:none;flex-direction:column;overflow:hidden;",
    "  box-shadow:0 24px 60px rgba(0,0,0,.55)}",
    "#ai-panel.open{display:flex}",
    "#ai-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line);background:var(--panel-2)}",
    "#ai-head .dot{width:9px;height:9px;border-radius:50%;background:var(--green)}",
    "#ai-head .title{font-weight:700;flex:1}",
    "#ai-head .sub{display:block;font-weight:400;font-size:11px;color:var(--muted);margin-top:1px}",
    "#ai-head button{background:none;border:none;color:var(--muted);cursor:pointer;font-size:12px;font-weight:600;padding:6px 8px;border-radius:6px}",
    "#ai-head button:hover{color:var(--text);background:var(--line)}",
    "#ai-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}",
    ".ai-msg{max-width:88%;padding:10px 13px;border-radius:12px;line-height:1.5;font-size:13.5px;word-wrap:break-word}",
    ".ai-msg.bot{align-self:flex-start;background:var(--panel-2);border:1px solid var(--line);border-bottom-left-radius:4px}",
    ".ai-msg.user{align-self:flex-end;background:var(--accent-soft);border:1px solid rgba(255,90,52,.3);border-bottom-right-radius:4px}",
    ".ai-msg.err{align-self:flex-start;background:rgba(248,113,113,.1);color:var(--red);border:1px solid rgba(248,113,113,.35)}",
    ".ai-msg ul{margin:6px 0 2px;padding-left:18px}",
    ".ai-typing{color:var(--muted);font-style:italic}",
    "#ai-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 12px}",
    "#ai-chips button{background:var(--panel-2);border:1px solid var(--line-2);color:var(--text);font:inherit;font-size:12px;",
    "  padding:6px 11px;border-radius:999px;cursor:pointer}",
    "#ai-chips button:hover{border-color:var(--accent);color:var(--accent)}",
    "#ai-form{display:flex;gap:8px;padding:12px;border-top:1px solid var(--line)}",
    "#ai-input{flex:1;background:var(--panel-2);border:1px solid var(--line-2);color:var(--text);padding:10px 12px;border-radius:10px;font:inherit;font-size:14px}",
    "#ai-input:focus{outline:none;border-color:var(--accent)}",
    "#ai-send{border:none;border-radius:10px;padding:0 16px;font-weight:700;cursor:pointer;font-family:inherit;",
    "  background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#1a1a1a}",
    "#ai-send:disabled{opacity:.5;cursor:default}"
  ].join("\n");
  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------- HTML ---------- */
  var fab = document.createElement("button");
  fab.id = "ai-fab";
  fab.setAttribute("aria-label", "Open IronDesk Assistant");
  fab.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';

  var panel = document.createElement("div");
  panel.id = "ai-panel";
  panel.innerHTML =
    '<div id="ai-head"><span class="dot"></span>' +
    '<span class="title">IronDesk Assistant<span class="sub">Ask about members, payments and trainers</span></span>' +
    '<button type="button" id="ai-clear">Clear</button><button type="button" id="ai-close">Close</button></div>' +
    '<div id="ai-msgs"></div>' +
    '<div id="ai-chips"></div>' +
    '<form id="ai-form"><input id="ai-input" placeholder="Ask something..." autocomplete="off" maxlength="500">' +
    '<button id="ai-send" type="submit">Send</button></form>';

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  var msgs = document.getElementById("ai-msgs");
  var chips = document.getElementById("ai-chips");
  var input = document.getElementById("ai-input");
  var sendBtn = document.getElementById("ai-send");

  /* ---------- Helpers ---------- */
  // Escape first, THEN add bold and bullets. This keeps AI output from injecting HTML.
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function format(text) {
    var lines = escapeHtml(text).split("\n");
    var out = "", inList = false;
    lines.forEach(function (line) {
      var bullet = line.match(/^\s*[-*•]\s+(.*)/);
      if (bullet) {
        if (!inList) { out += "<ul>"; inList = true; }
        out += "<li>" + bullet[1] + "</li>";
      } else {
        if (inList) { out += "</ul>"; inList = false; }
        out += line + "<br>";
      }
    });
    if (inList) out += "</ul>";
    return out.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(<br>)+$/, "");
  }
  function addMessage(kind, text) {
    var el = document.createElement("div");
    el.className = "ai-msg " + kind;
    if (kind === "bot") el.innerHTML = format(text); else el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  }
  function showChips() {
    chips.innerHTML = "";
    SUGGESTIONS.forEach(function (q) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = q;
      b.addEventListener("click", function () { ask(q); });
      chips.appendChild(b);
    });
  }
  function reset() {
    history = [];
    msgs.innerHTML = "";
    addMessage("bot", "Hi! I'm the IronDesk Assistant. I can answer questions about your members, payments and trainers, and draft reminder messages.");
    showChips();
  }

  /* ---------- Talking to the server ---------- */
  function ask(question) {
    question = (question || "").trim();
    if (!question || busy) return;

    busy = true;
    sendBtn.disabled = true;
    chips.innerHTML = "";
    input.value = "";
    addMessage("user", question);
    history.push({ role: "user", content: question });
    var typing = addMessage("bot", "Thinking...");
    typing.classList.add("ai-typing");

    fetch(API_URL + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ messages: history })
    })
      .then(function (res) {
        if (res.status === 401) {
          localStorage.removeItem("token");
          window.location.replace("login.html");
          throw new Error("Session expired. Please log in again.");
        }
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || "Something went wrong.");
          return data;
        });
      })
      .then(function (data) {
        typing.remove();
        history.push({ role: "assistant", content: data.reply });
        addMessage("bot", data.reply);
      })
      .catch(function (err) {
        typing.remove();
        history.pop(); // drop the question that failed so a retry starts clean
        var message = (err instanceof TypeError) ? "Can't reach the server. Is server.js running?" : err.message;
        addMessage("err", message);
      })
      .finally(function () {
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      });
  }

  /* ---------- Wire up the buttons ---------- */
  function toggle(open) {
    var willOpen = (open === undefined) ? !panel.classList.contains("open") : open;
    panel.classList.toggle("open", willOpen);
    if (willOpen) input.focus();
  }
  fab.addEventListener("click", function () { toggle(); });
  document.getElementById("ai-close").addEventListener("click", function () { toggle(false); });
  document.getElementById("ai-clear").addEventListener("click", reset);
  document.getElementById("ai-form").addEventListener("submit", function (e) {
    e.preventDefault();
    ask(input.value);
  });

  reset();
})();
