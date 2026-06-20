# Voice AI Personal Assistant

A minimalist, voice-first personal assistant for the browser. You talk to it, and
it takes **real actions in your apps** — sending email, checking your calendar,
opening GitHub issues — by connecting them on demand. It can also search the web,
show and let you edit drafts on screen, and hand hard problems to a more powerful
background AI.

Built with **Next.js (App Router)**, the **OpenAI Realtime API** over WebRTC,
**Composio** for app integrations, and **Supabase** for authentication.

---

## What it can do

🎙️ **Natural voice conversation** — Tap the orb, speak, and it answers in real
time (OpenAI Realtime API over WebRTC). It greets you proactively and keeps the
context of the whole conversation.

🔐 **Sign in your way** — Email + password **and** Google sign-in (Supabase Auth).
Every user is isolated.

🧩 **Connect 1,000+ apps on demand** — The agent starts with no app tools. When
you ask it to do something ("send an email", "find a repo"), it connects that app
just-in-time: if you haven't linked the account yet, a secure OAuth pop-up
appears; once connected, the app's tools load into the live session and it
completes your request. Powered by Composio's full toolkit catalog.

🌐 **Web search** — Ask it to look something up and it searches the web (keyless),
shows the results on screen, reads the most relevant ones aloud, and offers a
one-tap **"Open in Google"**.

📝 **Show & edit on screen (the Canvas)** — It can display drafts, results, and
summaries in a side panel. For things like an email draft, you can **edit the text
and confirm** before it acts — the approved version is what gets sent.

⌨️ **Take typed input** — When something's easier typed than spoken (an email
address, a long note), it pops a text box and uses what you type.

🧠 **Background "expert" agent** — For long-form writing, analysis, or careful
planning, it delegates to a stronger model (GPT-5.4) running server-side. The
result appears on the Canvas and is summarized aloud.

❓ **"What can you do?"** — Ask, and it opens a popup listing its core abilities
plus the full searchable list of connectable apps (with logos).

🛡️ **Honest errors + real logs** — If a tool fails, it tells you the actual
reason (spoken *and* shown on screen) instead of pretending it worked, and every
backend operation is logged with a clear, greppable format.

---

## How the "connect on demand" flow works

The agent holds a single meta-tool, `connect_and_load_application`, instead of
every app's tools at once (which would be slow and noisy):

```
You: "Email my team that I'll be 5 minutes late."
 └─ Agent → connect_and_load_application("gmail")
     └─ POST /api/composio/connect   (server, holds the Composio key)
         ├─ Not connected? → returns a live OAuth link
         │     • modal pops up: "Connect Gmail"
         │     • agent says: "I've pushed a secure link to your screen…"
         │     • you connect, say "I'm done", agent retries
         └─ Connected? → returns Gmail's tool schemas
               • browser splices them into the live session (session.update)
               • agent calls GMAIL_SEND_EMAIL
                   └─ POST /api/composio/execute  (runs it as *your* user)
                       └─ result flows back; the agent confirms aloud
```

Browser ↔ OpenAI audio runs over **WebRTC**; everything needing a secret key
(Composio, the expert agent, search) runs in **server API routes**, so keys never
reach the client. Each Composio action runs under the **signed-in user's id**, so
every user connects and uses their own accounts.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Voice | OpenAI Realtime API over WebRTC |
| Background agent | OpenAI Chat Completions (GPT-5.4) |
| App integrations | Composio Node SDK (`@composio/core`) |
| Auth | Supabase Auth (`@supabase/ssr`) — email + Google |
| Web search | Keyless DuckDuckGo (html + lite fallback) |
| Styling | Tailwind + hand-written CSS, Lucide icons |

---

## Project structure

| Path | Role |
| --- | --- |
| `components/app.tsx` | Realtime session + the tool-call / gatekeeper wiring |
| `components/orb.tsx` | The breathing start/stop orb (reflects live state) |
| `components/canvas.tsx` | Side panel: show text, editable drafts, input, search results |
| `components/auth-modal.tsx` | The "connect your account" OAuth modal |
| `components/capabilities-modal.tsx` | The "what can you do?" popup (live app catalog) |
| `components/auth-form.tsx` | Login / signup form (email + Google) |
| `components/account-menu.tsx` | Signed-in email + sign-out |
| `lib/config.ts` | Tool definitions, instructions, app catalog |
| `lib/composio.ts` | Server-only Composio client + helpers |
| `lib/supabase/*` | Browser/server Supabase clients + middleware session refresh |
| `lib/logger.ts` | Structured backend logging |
| `app/api/session` | Mints the OpenAI Realtime client secret |
| `app/api/composio/connect` | Gatekeeper: auth-check → OAuth link or load tools |
| `app/api/composio/execute` | Runs a Composio tool for the signed-in user |
| `app/api/composio/toolkits` | Lists the full app catalog (for the popup) |
| `app/api/agent` | The background GPT-5.4 expert agent |
| `app/api/search` | Keyless web search |
| `app/login`, `app/signup`, `app/auth/callback` | Auth pages + OAuth callback |
| `middleware.ts` | Session refresh, route gating, API-cookie management |

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Environment

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

You'll need an **OpenAI** key, a **Composio** key, and a **Supabase** project
(URL + anon key + service-role key). See `.env.example` for the full list.

### 3. Configure Supabase (one-time, in the dashboard)

- **Email**: Authentication → Providers → Email. Turn *Confirm email* off for an
  instant-login demo, or leave it on (the signup form handles "check your inbox").
- **Google**: Authentication → Providers → Google → paste a Google Cloud OAuth
  **client ID + secret**. In Google Cloud, add this authorized redirect URI:
  `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
- **Redirect URLs**: Authentication → URL Configuration → add
  `http://localhost:3000/**` (and your deployed URL).

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000>, sign in, tap the orb, allow microphone access, and
talk. Try:

- *"What can you do?"*
- *"Search for the best CRMs for small businesses."*
- *"Draft an email to alex@example.com saying I'll be five minutes late."*
- *"Find the most popular open-source repos for voice AI."*

---

## Deploying

Deploys cleanly to Vercel (all server work is serverless `fetch`-based — no
headless browser). Add every variable from `.env` to your Vercel project, and add
your production URL to Supabase's redirect URLs and (if used) Google OAuth origins.

---

## Extending it

To give the agent a new built-in skill:

1. Add a tool definition in `lib/config.ts`.
2. Handle it in `handleToolCall` in `components/app.tsx` (call a server route).
3. Add the server route under `app/api/…`.

For a new external app, you usually don't need to do anything — the
connect-on-demand gatekeeper already covers Composio's entire catalog.
