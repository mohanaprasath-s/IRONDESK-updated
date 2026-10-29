# IronDesk: Gym Management App with an AI Assistant

IronDesk is a full-stack gym management web app built with **Node.js and Express**. The owner logs in to manage members, trainers and payments, and can ask an **AI assistant** questions about the gym in plain English, such as "Who is expiring this week?"

![IronDesk dashboard with the AI assistant](docs/screenshot.png)

## Features

**Gym management**
- Token-based admin login and logout
- Add, view and delete members, with plans and expiry dates
- Renew a member's plan with one click
- Manage trainers and their specialties
- Log payments (UPI, cash and other modes) and view payment history
- Dashboard with membership status, a revenue chart for the last 6 months, plan mix, a "Needs attention" list and recent payments

**AI assistant**
- Answers questions about members, trainers and payments from the app's live data
- Can draft short reminder messages for members whose plans are expiring
- Read-only: it cannot add, edit or delete anything
- Uses the Google **Gemini API** (Anthropic's Claude is supported as an alternative)

## Tech stack

| Part | Technology |
|------|------------|
| Backend | Node.js, Express |
| Frontend | HTML, CSS, vanilla JavaScript |
| Storage | JSON file (`data.json`) |
| Authentication | Random session tokens sent as a Bearer header |
| AI | Gemini API (or Claude API) |

## How the AI assistant works

1. The admin types a question in the chat window in the browser.
2. The browser sends it to `POST /api/chat` on the server, with the login token.
3. The server checks the token and applies a rate limit (20 questions per minute).
4. The server builds a snapshot of the gym's data: members with their status (active, expiring or expired), revenue totals, trainers and recent payments. Dates and totals are calculated in code, not by the AI.
5. The snapshot, a system prompt and the recent conversation are sent to the Gemini API.
6. The reply goes back to the browser.

**Design decisions**
- **The API key stays on the server.** It is read from an environment variable, never placed in frontend code or the repository.
- **Only a logged-in admin can use the chat**, so nobody else can use up the API quota.
- **The AI is told to answer only from the supplied data**, and to say when it doesn't know. This reduces made-up answers.
- **Phone numbers are not sent** to the AI service.
- **Failures are handled.** If the model is overloaded (HTTP 503), the server retries, then falls back to a lighter model. Each request has a timeout, so the chat never hangs, and errors are shown in plain language.

## Getting started

### Requirements
- [Node.js](https://nodejs.org) 18 or newer (check with `node -v`)
- A Gemini API key from [Google AI Studio](https://aistudio.google.com) (optional; without it the app works but the chatbot is switched off)

### Install and run

```bash
git clone <your-repository-url>
cd <repository-folder>
npm install
```

Set your API key and start the server.

**Windows (Command Prompt):**
```
set GEMINI_API_KEY=your_key_here
node server.js
```

**Windows (PowerShell):**
```
$env:GEMINI_API_KEY="your_key_here"
node server.js
```

**Mac / Linux:**
```bash
export GEMINI_API_KEY=your_key_here
node server.js
```

Open **http://localhost:3000/login.html**.

Choose your own admin password by setting `ADMIN_PASSWORD` before starting (see Configuration). If you don't, the server generates a random temporary password and prints it in the terminal when it starts. Log in with username `admin` and that password.

The first run creates an empty `data.json` automatically.

## Configuration

All settings are environment variables, so you never edit the code.

| Variable | Purpose | Default |
|----------|---------|---------|
| `GEMINI_API_KEY` | Enables the chatbot with Gemini | none (chatbot off) |
| `GEMINI_MODEL` | Main Gemini model | `gemini-flash-latest` |
| `GEMINI_FALLBACK_MODEL` | Backup model if the main one is busy | `gemini-flash-lite-latest` |
| `GEMINI_TIMEOUT_MS` | Time to wait for each Gemini attempt | `20000` |
| `ANTHROPIC_API_KEY` | Use Claude instead (only if no Gemini key is set) | none |
| `ADMIN_USERNAME` | Admin login name | `admin` |
| `ADMIN_PASSWORD` | Admin password | random, printed in the terminal at startup |
| `PORT` | Server port | `3000` |

Model names change over time. If you see a "model not found" error, set `GEMINI_MODEL` to a current name from Google AI Studio.

## Project structure

```
irondesk/
├── server.js             # Express server: API routes, auth, AI chat route
├── login.html            # Login page
├── gym-management.html   # Main app (dashboard, members, trainers, payments)
├── chatbot.js            # Chat window in the browser
├── package.json
└── data.json             # Created on first run (not committed)
```

## API overview

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/login` | Log in, returns a token |
| POST | `/api/logout` | Log out |
| GET / POST | `/api/members` | List or add members |
| PUT / DELETE | `/api/members/:id` | Update (renew) or delete a member |
| GET / POST | `/api/trainers` | List or add trainers |
| DELETE | `/api/trainers/:id` | Delete a trainer |
| GET / POST | `/api/payments` | List or log payments |
| POST | `/api/chat` | Ask the AI assistant |

All routes except login need an `Authorization: Bearer <token>` header.

## Security notes

- No password is stored in the code. Set a strong `ADMIN_PASSWORD` before putting the app online; otherwise a random temporary one is generated at each start.
- Never commit API keys. Keep them in environment variables, and keep `data.json`, `.env` and `node_modules` in `.gitignore`.
- The server blocks browser downloads of `server.js`, `data.json` and other private files.
- When the free Gemini tier is used, don't enter real members' personal details, because Google's free terms may allow using submitted content to improve its products.

## Known limitations

- Data is stored in a JSON file, which suits a single small gym but not many users at once.
- There is one hardcoded admin account, and tokens reset when the server restarts.
- The whole data snapshot is sent with each question. A very large gym would need a retrieval step so that only relevant records are sent.

## Roadmap

- [ ] Deploy to AWS (EC2 or Render) with a managed database
- [ ] Hashed passwords and multiple user roles
- [ ] Stream the AI reply as it is written
- [ ] Retrieval (RAG) for larger data sets
- [ ] Send reminders by WhatsApp or SMS

## Author

**Mohan**, Computer Science Engineering graduate (2026).
Built to learn full-stack development and how to use AI tools safely in real applications.

[LinkedIn](https://www.linkedin.com/) | [GitHub](https://github.com/)
