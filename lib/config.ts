// Voice assistant configuration.
//
// The agent always has a small set of LOCAL tools (handled in the browser):
// the gatekeeper, screen display, text input, the expert hand-off, and the
// capabilities popup. Real app tools (Gmail, Calendar, GitHub, …) are loaded
// on demand once the user connects an account.

export const GREETING =
  "Hi, I'm your personal assistant. What can I help you with today?";

/**
 * The catalog of apps the assistant can connect to. Used by the connect route
 * (pretty names) and the "What can you do?" capabilities popup. Add apps here.
 */
export const APP_CATALOG: {
  slug: string;
  name: string;
  examples: string[];
}[] = [
  { slug: "gmail", name: "Gmail", examples: ["Send or draft an email", "Summarize my latest emails"] },
  { slug: "googlecalendar", name: "Google Calendar", examples: ["What's on my calendar tomorrow?", "Schedule a meeting"] },
  { slug: "github", name: "GitHub", examples: ["Find a repo", "Open an issue", "List my pull requests"] },
  { slug: "slack", name: "Slack", examples: ["Send a message to a channel", "Set my status"] },
  { slug: "notion", name: "Notion", examples: ["Create a page", "Add a note to my workspace"] },
  { slug: "linear", name: "Linear", examples: ["Create an issue", "List my assigned tasks"] },
];

/** A toolkit (app) the assistant can connect to, as returned by /api/composio/toolkits. */
export type ToolkitSummary = {
  slug: string;
  name: string;
  logo?: string;
  categories: string[];
};

/** Things the assistant can do regardless of which apps are connected. */
export const CORE_CAPABILITIES: { title: string; description: string }[] = [
  {
    title: "Connect your apps",
    description:
      "Securely link Gmail, Calendar, GitHub and more on demand, then take real actions for you.",
  },
  {
    title: "Show & edit on screen",
    description:
      "Display drafts and results on screen — and let you edit the text before anything is sent.",
  },
  {
    title: "Search the web",
    description:
      "Look things up online, show you the results, and read out what matters — with a one-tap link to open Google.",
  },
  {
    title: "Take typed input",
    description:
      "Pop up a text box when something is easier to type than to say (emails, long notes).",
  },
  {
    title: "Think harder when needed",
    description:
      "Hand complex writing, analysis and planning to a more powerful background AI.",
  },
];

const noArgs = { type: "object", properties: {}, additionalProperties: false };

const META_TOOL = {
  type: "function",
  name: "connect_and_load_application",
  description:
    "Use this whenever the user wants to perform an action on an external app (like 'gmail', 'googlecalendar', 'github', 'slack', 'notion') that you don't currently have tools for. This connects the app (asking the user to authorize it if needed) and loads its tools so you can then fulfil their request. Call it again after the user says they've finished connecting.",
  parameters: {
    type: "object",
    properties: {
      application_name: {
        type: "string",
        description:
          "The external application the user wants to act on, e.g. 'gmail', 'googlecalendar', 'github', 'slack', 'notion'.",
      },
    },
    required: ["application_name"],
    additionalProperties: false,
  },
};

const SHOW_TOOL = {
  type: "function",
  name: "show_on_screen",
  description:
    "Display text on the user's screen — a drafted email, a result, a summary, code, or a list. Use this whenever showing is clearer than only speaking. Set editable=true to let the user revise the text before they confirm (e.g. an email draft they may want to tweak); when they confirm, you'll receive their final version back as a message.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short heading for the panel, e.g. 'Draft email'." },
      body: { type: "string", description: "The full text/content to display." },
      editable: {
        type: "boolean",
        description:
          "If true, the user can edit the text and click confirm; you then receive their final version. Use for drafts awaiting approval.",
      },
      confirm_label: {
        type: "string",
        description: "Label for the confirm button when editable (e.g. 'Looks good', 'Send'). Defaults to 'Confirm'.",
      },
    },
    required: ["title", "body"],
    additionalProperties: false,
  },
};

const INPUT_TOOL = {
  type: "function",
  name: "request_text_input",
  description:
    "Ask the user to TYPE something instead of saying it — useful for email addresses, long bodies of text, codes, or anything error-prone by voice. A text box appears; when they submit, you receive what they typed as a message.",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "What you're asking them to type, e.g. 'Paste the recipient's email address'." },
      placeholder: { type: "string", description: "Optional placeholder text for the input box." },
      multiline: { type: "boolean", description: "True for long text (a textarea), false for a single line. Defaults to false." },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
};

const CONSULT_TOOL = {
  type: "function",
  name: "consult_expert_agent",
  description:
    "Hand a complex task to a more powerful background AI (the expert). Use this for long-form or careful writing (detailed emails, documents, proposals), analysis, summarization of large content, multi-step planning, or any reasoning that benefits from deeper thought. The expert's result is shown on screen automatically and returned to you so you can summarize it aloud or act on it.",
  parameters: {
    type: "object",
    properties: {
      task: { type: "string", description: "A clear, self-contained instruction for the expert, e.g. 'Write a polite 150-word email declining the meeting and proposing next week.'" },
      context: { type: "string", description: "Any relevant context the expert needs (names, prior details, constraints)." },
    },
    required: ["task"],
    additionalProperties: false,
  },
};

const SEARCH_TOOL = {
  type: "function",
  name: "web_search",
  description:
    "Search the web for current information, facts, news, people, products, or anything you don't already know. The results (titles, snippets, links) are shown on the user's screen automatically and returned to you. Read or summarize the most relevant ones aloud. Use this whenever the user asks to 'search', 'google', 'look up', or 'find' something online.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query — phrase it as you would type into a search engine.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

const CAPABILITIES_TOOL = {
  type: "function",
  name: "show_capabilities",
  description:
    "Show the user a popup listing everything you can do and the apps you can connect to. Call this when the user asks what you can do, what you can help with, what apps you support, or similar. Then give a one-sentence spoken summary.",
  parameters: noArgs,
};

export const TOOLS = [
  META_TOOL,
  SHOW_TOOL,
  INPUT_TOOL,
  CONSULT_TOOL,
  SEARCH_TOOL,
  CAPABILITIES_TOOL,
];

/** Tool names handled in the browser (everything else goes to Composio). */
export const LOCAL_TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

export const INSTRUCTIONS = `
You are a warm, concise, highly capable personal assistant in a voice-first app.
You speak naturally and keep spoken replies short — usually one or two sentences.

# Your tools
You start with these local tools, plus you can load app-specific tools on demand:
- connect_and_load_application — connect an external app and load its tools.
- show_on_screen — display text (drafts, results, summaries) for the user to read or edit.
- request_text_input — ask the user to type something.
- consult_expert_agent — offload complex writing/analysis/planning to a stronger AI.
- web_search — search the web for current/unknown information.
- show_capabilities — show the popup of what you can do.

# Doing things in external apps (the connect flow)
When the user asks you to DO something in an app you don't yet have tools for:
1. Call connect_and_load_application with the app name (e.g. "github").
2. React to the status you get back:
   - "AUTH_REQUIRED": a secure link is now on their screen. Say naturally:
     "I've pushed a secure link to your screen. Please connect your <app>
     account, and let me know when you're done!" Then STOP and wait. When they
     say they're done, call connect_and_load_application again for the same app.
   - "CONNECTED": the app's tools are loaded — immediately proceed and call the
     right tool to fulfil their original request.
   - "ERROR": tell the user briefly what went wrong (use the message provided).

# Executing real actions, and being honest about failures
- After a tool runs successfully, give a short friendly confirmation.
- If a tool reports it was NOT successful, do not pretend it worked. Read out
  the actual reason from the error you received, in plain language, and offer a
  next step (retry, connect the app, or provide missing info). The failure
  detail is also shown on screen for them.

# Showing and editing content
- For anything worth reading — an email you drafted, a result, a summary, a list
  — call show_on_screen so the user can see it, not just hear it.
- For a draft the user should approve before you act (like an email), call
  show_on_screen with editable=true. When they confirm, you'll receive their
  final, possibly-edited text as a message — use exactly that when you act.
- When something is easier typed than spoken (an email address, a long body),
  call request_text_input and use what they type.

# Searching the web
- When the user asks you to search, google, look up, or find something online,
  or asks about current events or facts you're unsure of, call web_search.
- The results appear on screen automatically. Read out the most relevant one or
  two, and offer to open Google or a specific link if they want more.

# Using the expert agent
- For detailed/long-form writing, analysis, summarizing large text, or careful
  multi-step reasoning, call consult_expert_agent rather than composing it
  yourself. Its result is shown on screen automatically; summarize it in a
  sentence or two aloud, or proceed to act on it.

# Capabilities
- If the user asks what you can do or what apps you support, call
  show_capabilities and give a one-line spoken summary.

# Style
- Conversational and human. Never read tool names or JSON aloud.
- Ask a short clarifying question only when you genuinely need a detail.
- Never invent results — only report what tools actually returned.
`;

export const VOICE = process.env.OPENAI_REALTIME_VOICE ?? "shimmer";
