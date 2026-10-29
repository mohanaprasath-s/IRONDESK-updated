/* ==========================================================================
   IronDesk Gym Management — Backend Server (v2)
   ==========================================================================
   What's new compared to v1:
     • PUT /api/members/:id   -> lets the "Renew" button update a member
     • Your private files (server.js, data.json, package.json...) can no
       longer be downloaded by visitors. Before, express.static(__dirname)
       would have let anyone open /data.json or even /server.js (with the
       admin password inside!) once the app is online.
     • Port and admin password can come from environment variables, so you
       don't have to edit this file when you deploy.

   RUN IT:
     npm install
     node server.js
   Then open  http://localhost:3000/login.html
   ========================================================================== */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");

/* --------------------------------------------------------------------------
   MIDDLEWARE
-------------------------------------------------------------------------- */
app.use(cors());
app.use(express.json());

// Block anyone from downloading your source code and data through the browser.
// (Runs BEFORE express.static, so these requests never reach the files.)
const PRIVATE_FILES = ["/server.js", "/data.json", "/package.json", "/package-lock.json", "/readme.md", "/.env", "/.gitignore"];
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (PRIVATE_FILES.includes(p) || p.startsWith("/node_modules")) {
    return res.status(404).send("Not found");
  }
  next();
});

// Visiting the bare address (http://localhost:3000/) goes to the login page.
app.get("/", (req, res) => res.redirect("/login.html"));

// Serves login.html and gym-management.html from this folder.
app.use(express.static(__dirname));

/* --------------------------------------------------------------------------
   "DATABASE" — a JSON file on disk
-------------------------------------------------------------------------- */
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const starter = {
      members: [],
      trainers: [],
      payments: [],
      nextMemberId: 1,
      nextTrainerId: 1,
      nextPaymentId: 1,
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(starter, null, 2));
    return starter;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let db = loadData();

/* --------------------------------------------------------------------------
   AUTH
   Change the password WITHOUT editing code by starting the server like:
     Windows cmd:   set ADMIN_PASSWORD=MyStrongPass123 && node server.js
   If you don't set one, a random temporary password is generated and printed
   in the terminal when the server starts.
-------------------------------------------------------------------------- */
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
// No password is stored in the code. If ADMIN_PASSWORD is not set, a random temporary one
// is generated each time the server starts and printed in the terminal.
const PASSWORD_WAS_GENERATED = !process.env.ADMIN_PASSWORD;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString("hex");

const sessions = new Set();

function requireAuth(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: "Not logged in or session expired." });
  }
  next();
}

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(24).toString("hex");
    sessions.add(token);
    return res.json({ token: token });
  }

  res.status(401).json({ error: "Wrong username or password." });
});

app.post("/api/logout", requireAuth, (req, res) => {
  const token = req.headers["authorization"].slice(7);
  sessions.delete(token);
  res.json({ ok: true });
});

/* --------------------------------------------------------------------------
   MEMBERS
-------------------------------------------------------------------------- */
app.get("/api/members", requireAuth, (req, res) => {
  res.json(db.members);
});

app.post("/api/members", requireAuth, (req, res) => {
  const { name, phone, plan, expires } = req.body;

  if (!name || !plan || !expires) {
    return res.status(400).json({ error: "Missing name, plan, or expires." });
  }

  const member = { id: db.nextMemberId++, name, phone: phone || "", plan, expires };
  db.members.push(member);
  saveData(db);
  res.status(201).json(member);
});

// NEW: update a member (used by the Renew button to change plan + expiry).
app.put("/api/members/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const member = db.members.find((m) => m.id === id);

  if (!member) {
    return res.status(404).json({ error: "Member not found." });
  }

  // Only copy over the fields that were actually sent.
  const { name, phone, plan, expires } = req.body;
  if (name !== undefined) member.name = name;
  if (phone !== undefined) member.phone = phone;
  if (plan !== undefined) member.plan = plan;
  if (expires !== undefined) member.expires = expires;

  saveData(db);
  res.json(member);
});

app.delete("/api/members/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.members = db.members.filter((m) => m.id !== id);
  saveData(db);
  res.json({ ok: true });
});

/* --------------------------------------------------------------------------
   TRAINERS
-------------------------------------------------------------------------- */
app.get("/api/trainers", requireAuth, (req, res) => {
  res.json(db.trainers);
});

app.post("/api/trainers", requireAuth, (req, res) => {
  const { name, specialty } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Missing name." });
  }

  const trainer = { id: db.nextTrainerId++, name, specialty: specialty || "" };
  db.trainers.push(trainer);
  saveData(db);
  res.status(201).json(trainer);
});

app.delete("/api/trainers/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.trainers = db.trainers.filter((t) => t.id !== id);
  saveData(db);
  res.json({ ok: true });
});

/* --------------------------------------------------------------------------
   PAYMENTS
-------------------------------------------------------------------------- */
app.get("/api/payments", requireAuth, (req, res) => {
  res.json(db.payments);
});

app.post("/api/payments", requireAuth, (req, res) => {
  const { memberId, amount, mode } = req.body;

  if (!memberId || !amount) {
    return res.status(400).json({ error: "Missing memberId or amount." });
  }

  // Use the server's local date (not UTC) so late-night payments get the right day.
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);

  const payment = {
    id: db.nextPaymentId++,
    memberId: Number(memberId),
    amount: Number(amount),
    mode: mode || "Cash",
    date: localDate,
  };
  db.payments.push(payment);
  saveData(db);
  res.status(201).json(payment);
});

/* --------------------------------------------------------------------------
   AI CHATBOT  (POST /api/chat)
   The browser never sees the API key. It sends the conversation to THIS
   route, and the server forwards it to the AI service (Gemini or Claude).

   Start the server with your key like this (Windows cmd, two separate lines):
     set GEMINI_API_KEY=your-key-here
     node server.js
-------------------------------------------------------------------------- */
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

// Google Gemini (free tier available). If GEMINI_API_KEY is set, it is used first.
// If you get a "model not found" error, set GEMINI_MODEL to the exact name shown in Google AI Studio.
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
// If the main model is overloaded (503), the server retries, then tries this lighter backup model.
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-lite-latest";
// How long to wait for Gemini before giving up on one attempt (milliseconds).
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 20000;

function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Turns the gym's data into a short text "snapshot" the AI can read.
// Phone numbers are left out on purpose: the AI doesn't need them.
function buildGymContext() {
  const today = localToday();
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  const status = (m) => (m.expires < today ? "EXPIRED" : m.expires <= in7 ? "EXPIRING SOON" : "ACTIVE");
  const nameOf = (id) => (db.members.find((m) => m.id === id) || {}).name || "Unknown member";

  const counts = { ACTIVE: 0, "EXPIRING SOON": 0, EXPIRED: 0 };
  db.members.forEach((m) => counts[status(m)]++);

  const monthRevenue = db.payments
    .filter((p) => String(p.date).startsWith(month))
    .reduce((sum, p) => sum + p.amount, 0);
  const totalRevenue = db.payments.reduce((sum, p) => sum + p.amount, 0);

  const memberLines = db.members.slice(0, 200).map(
    (m) => `- #${m.id} ${m.name} | plan: ${m.plan} | expires: ${m.expires} | ${status(m)}`
  );
  const paymentLines = db.payments.slice(-30).reverse().map(
    (p) => `- ${p.date} | ${nameOf(p.memberId)} | Rs ${p.amount} | ${p.mode}`
  );
  const trainerLines = db.trainers.map((t) => `- ${t.name}${t.specialty ? " (" + t.specialty + ")" : ""}`);

  return [
    `Today's date: ${today}`,
    `Members: ${db.members.length} total (${counts.ACTIVE} active, ${counts["EXPIRING SOON"]} expiring within 7 days, ${counts.EXPIRED} expired)`,
    `Revenue this month: Rs ${monthRevenue} | All-time revenue: Rs ${totalRevenue}`,
    "",
    "MEMBERS:",
    memberLines.join("\n") || "(none)",
    "",
    "TRAINERS:",
    trainerLines.join("\n") || "(none)",
    "",
    "LATEST PAYMENTS (newest first):",
    paymentLines.join("\n") || "(none)",
  ].join("\n");
}

const CHAT_SYSTEM_PROMPT = [
  "You are IronDesk Assistant, a helpful assistant built into a gym management app.",
  "You help the gym owner understand their members, trainers and payments.",
  "Rules:",
  "- Answer ONLY from the gym data snapshot below. If the answer isn't in it, say you don't have that information. Never invent members, amounts or dates.",
  "- You are read-only. You cannot add, edit or delete anything. If asked to, explain which page of the app to use.",
  "- Show money with the rupee symbol. Keep answers short and clear; use a simple list when listing people.",
  "- You may also give brief, practical gym-business tips (for example how to follow up with members whose plans are expiring), and you may draft short WhatsApp/SMS reminder messages.",
  "- Politely decline requests unrelated to running the gym.",
].join("\n");

// Very small rate limit so a bug or spam can't burn through your API credit.
const chatHits = [];
function chatRateLimited() {
  const now = Date.now();
  while (chatHits.length && now - chatHits[0] > 60000) chatHits.shift();
  if (chatHits.length >= 20) return true; // max 20 questions per minute
  chatHits.push(now);
  return false;
}

app.post("/api/chat", requireAuth, async (req, res) => {
  if (!GEMINI_API_KEY && !ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: "The AI assistant isn't set up yet. Start the server with GEMINI_API_KEY (or ANTHROPIC_API_KEY) set.",
    });
  }
  if (chatRateLimited()) {
    return res.status(429).json({ error: "Too many questions. Please wait a minute." });
  }

  // Keep only valid, recent messages (the browser sends the whole conversation each time).
  const incoming = Array.isArray(req.body && req.body.messages) ? req.body.messages : [];
  const messages = incoming
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "Send a question first." });
  }

  try {
    if (GEMINI_API_KEY) {
      console.log("Chat question received -> asking Gemini...");
      // Gemini wants roles "user" and "model", and the first message must be from the user.
      const turns = messages.slice();
      while (turns.length && turns[0].role !== "user") turns.shift();

      const gemBody = JSON.stringify({
        systemInstruction: {
          parts: [{ text: CHAT_SYSTEM_PROMPT + "\n\n=== GYM DATA SNAPSHOT ===\n" + buildGymContext() }],
        },
        contents: turns.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: 900 },
      });

      // Free models are sometimes "overloaded" (503). Retry the main model once,
      // then try the backup model once, before giving up.
      const attempts = [GEMINI_MODEL, GEMINI_MODEL, GEMINI_FALLBACK_MODEL];
      let gemRes = null, gemData = {};
      for (let i = 0; i < attempts.length; i++) {
        try {
          gemRes = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/" + attempts[i] + ":generateContent",
            {
              method: "POST",
              headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
              body: gemBody,
              signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS), // never wait forever
            }
          );
          gemData = await gemRes.json().catch(() => ({}));
        } catch (err) {
          // Timeout or network failure: no response from Google at all.
          gemRes = null;
          const why = err.cause ? (err.cause.code || err.cause.message) : "";
          console.log("Gemini request failed (" + attempts[i] + "):", err.name + ": " + err.message, why ? "| cause: " + why : "");
          if (i < attempts.length - 1) continue;
          break;
        }
        if (gemRes.ok) {
          console.log("Gemini answered (" + attempts[i] + ")");
          break;
        }
        console.log("Gemini API error (" + attempts[i] + "):", gemRes.status, JSON.stringify(gemData));
        const retryable = [429, 500, 502, 503, 504].includes(gemRes.status);
        if (!retryable) break;
        if (i < attempts.length - 1) await new Promise((r) => setTimeout(r, 1500));
      }

      if (!gemRes) {
        return res.status(502).json({
          error: "Couldn't get an answer from Gemini in time. Check your internet connection and try again.",
        });
      }
      if (!gemRes.ok) {
        let hint = "The AI service returned an error.";
        if (gemRes.status === 400 || gemRes.status === 403) hint = "Gemini rejected the request. Check that your API key is correct.";
        if (gemRes.status === 404) hint = "Gemini model not found. Set GEMINI_MODEL to a current model name from Google AI Studio.";
        if (gemRes.status === 429) hint = "Gemini free-tier limit reached. Wait a minute and try again.";
        if (gemRes.status === 503) hint = "Gemini is busy right now (high demand). Please try again in a minute.";
        return res.status(502).json({ error: hint });
      }

      const parts = (gemData.candidates && gemData.candidates[0] && gemData.candidates[0].content && gemData.candidates[0].content.parts) || [];
      const gemReply = parts.map((p) => p.text || "").join("").trim();
      return res.json({ reply: gemReply || "Sorry, I couldn't come up with an answer." });
    }

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 700,
        system: CHAT_SYSTEM_PROMPT + "\n\n=== GYM DATA SNAPSHOT ===\n" + buildGymContext(),
        messages: messages,
      }),
    });

    const data = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      console.log("Anthropic API error:", apiRes.status, JSON.stringify(data));
      const hint = apiRes.status === 401 ? "The API key was rejected." : "The AI service returned an error.";
      return res.status(502).json({ error: hint });
    }

    const reply = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    res.json({ reply: reply || "Sorry, I couldn't come up with an answer." });
  } catch (err) {
    console.log("Chat request failed:", err.message);
    res.status(502).json({ error: "Couldn't reach the AI service. Check your internet connection." });
  }
});

/* --------------------------------------------------------------------------
   START THE SERVER
-------------------------------------------------------------------------- */
app.listen(PORT, () => {
  console.log("IronDesk running at http://localhost:" + PORT);
  console.log("Open  http://localhost:" + PORT + "/login.html  in your browser.");
  if (GEMINI_API_KEY) {
    console.log("Chatbot: using Gemini (" + GEMINI_MODEL + ")");
  } else if (ANTHROPIC_API_KEY) {
    console.log("Chatbot: using Claude (" + ANTHROPIC_MODEL + ")");
  } else {
    console.log("NOTE: no GEMINI_API_KEY or ANTHROPIC_API_KEY set, so the chatbot is switched off.");
  }
  if (PASSWORD_WAS_GENERATED) {
    console.log("No ADMIN_PASSWORD set. Temporary login for this run -> username: " + ADMIN_USERNAME + "  password: " + ADMIN_PASSWORD);
    console.log("Set ADMIN_PASSWORD to choose your own.");
  }
});
