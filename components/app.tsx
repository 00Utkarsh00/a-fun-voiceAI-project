"use client";

import Orb, { type VoiceStatus } from "@/components/orb";
import AuthModal, { type AuthRequest } from "@/components/auth-modal";
import Canvas, { type CanvasState } from "@/components/canvas";
import CapabilitiesModal from "@/components/capabilities-modal";
import { useCallback, useEffect, useRef, useState } from "react";
import { INSTRUCTIONS, TOOLS, GREETING } from "@/lib/config";
import { REALTIME_CALLS_URL } from "@/lib/constants";

type ToolCallOutput = {
  response: string;
  [key: string]: unknown;
};

type RealtimeClientSecret = {
  value: string;
  expires_at: number;
};

const statusCopy: Record<VoiceStatus, { label: string; detail: string }> = {
  idle: {
    label: "Tap to start",
    detail: "Your personal assistant is ready when you are.",
  },
  connecting: {
    label: "Connecting…",
    detail: "Setting up a secure voice session.",
  },
  listening: {
    label: "Listening",
    detail: "Go ahead — speak naturally.",
  },
  thinking: {
    label: "Thinking…",
    detail: "Working on your request.",
  },
  speaking: {
    label: "Speaking",
    detail: "Your assistant is responding.",
  },
  error: {
    label: "Something went wrong",
    detail: "Tap the orb to try again.",
  },
};

const parseToolArguments = (raw: unknown): Record<string, unknown> => {
  if (typeof raw !== "string") return (raw as Record<string, unknown>) ?? {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const getVoiceErrorMessage = (error: unknown) => {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access was blocked. Enable it in your browser and try again.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone was found on this device.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "The voice session could not start.";
};

const readRealtimeResponseError = async (response: Response, fallback: string) => {
  const body = await response.text();
  const status = `${response.status} ${response.statusText}`.trim();
  if (!body) return `${fallback} (${status}).`;
  try {
    const parsed = JSON.parse(body) as {
      error?: string | { message?: string; code?: string };
      message?: string;
    };
    const errorObject = typeof parsed.error === "object" ? parsed.error : undefined;
    const message =
      (typeof parsed.error === "string" ? parsed.error : errorObject?.message)
        ?.trim() || parsed.message?.trim();
    if (message) return `${message} (${status}).`;
  } catch {
    return `${fallback} (${status}).`;
  }
  return `${fallback} (${status}).`;
};

export default function App() {
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [authRequest, setAuthRequest] = useState<AuthRequest | null>(null);
  const [canvas, setCanvas] = useState<CanvasState | null>(null);
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const canvasToken = useRef(0);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const audioStream = useRef<MediaStream | null>(null);
  const cleanupDataChannel = useRef<(() => void) | null>(null);
  const isSessionStarted = useRef(false);
  const sessionAbort = useRef<AbortController | null>(null);

  // Composio tools loaded into the live session, accumulated across connections.
  const loadedTools = useRef<any[]>([]);
  const loadedToolNames = useRef<Set<string>>(new Set());

  const sendClientEvent = useCallback((message: any) => {
    const channel = dataChannel.current;
    if (channel?.readyState === "open") {
      message.event_id = message.event_id || crypto.randomUUID();
      channel.send(JSON.stringify(message));
      return;
    }
    console.error("No open data channel; dropping event", message);
  }, []);

  const setReadyVoiceStatus = useCallback(() => {
    setVoiceStatus(isSessionStarted.current ? "listening" : "idle");
  }, []);

  // Push the current full tool set (local tools + all loaded Composio tools) to
  // the live session. session.update replaces the list, so we always send all.
  const syncSessionTools = useCallback(() => {
    sendClientEvent({
      type: "session.update",
      session: {
        type: "realtime",
        tools: [...TOOLS, ...loadedTools.current],
        instructions: INSTRUCTIONS,
      },
    });
  }, [sendClientEvent]);

  /** Open a canvas panel with a fresh token so its internal state resets. */
  const openCanvas = useCallback((next: Omit<CanvasState, "token">) => {
    canvasToken.current += 1;
    setCanvas({ ...next, token: canvasToken.current });
  }, []);

  /** Send a plain user message into the live session and ask for a response. */
  const sendUserMessage = useCallback(
    (text: string) => {
      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      });
      sendClientEvent({ type: "response.create" });
    },
    [sendClientEvent]
  );

  // User confirmed an edited draft, or submitted typed input → feed it back.
  const handleCanvasSubmit = useCallback(
    (text: string) => {
      const wasInput = canvas?.mode === "input";
      sendUserMessage(
        wasInput
          ? `The user typed the following in response to your request:\n\n${text}`
          : `The user reviewed and approved this content. Use exactly this final version:\n\n${text}`
      );
      setCanvas(null);
    },
    [canvas?.mode, sendUserMessage]
  );

  const handleToolCall = useCallback(
    async (output: any) => {
      const args = parseToolArguments(output.arguments);
      console.log("Tool call:", output.name, args);
      let toolCallOutput: ToolCallOutput;

      try {
        if (output.name === "connect_and_load_application") {
          // ---- The gatekeeper / dynamic auth loop ----
          const appName = String(args.application_name ?? "");
          const res = await fetch("/api/composio/connect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ application_name: appName }),
          });
          const data = await res.json();

          if (data.status === "auth_required") {
            setAuthRequest({ appName: data.appName, url: data.redirectUrl });
            toolCallOutput = {
              response: `AUTH_REQUIRED for ${data.appName}. A secure link is now on the user's screen. Tell them: "I've pushed a secure link to your screen. Please connect your ${data.appName} account, and let me know when you're done!" Then wait — do not call any tools until they confirm they have finished.`,
              status: "auth_required",
            };
          } else if (data.status === "connected") {
            setAuthRequest(null);
            // Merge new tools, de-duplicating by name.
            for (const tool of data.tools ?? []) {
              if (tool?.name && !loadedToolNames.current.has(tool.name)) {
                loadedToolNames.current.add(tool.name);
                loadedTools.current.push(tool);
              }
            }
            syncSessionTools();
            toolCallOutput = {
              response: `CONNECTED. ${data.appName} tools are now available. Proceed to fulfil the user's original request by calling the appropriate tool now.`,
              status: "connected",
              loadedTools: data.toolNames,
            };
          } else {
            toolCallOutput = {
              response:
                data.error ??
                `Couldn't connect ${appName}. Apologize briefly and offer to try again.`,
              status: "error",
            };
          }
        } else if (output.name === "show_on_screen") {
          // ---- Display text (optionally editable) on screen ----
          const editable = args.editable === true;
          openCanvas({
            mode: editable ? "edit" : "display",
            title: String(args.title ?? "Details"),
            body: String(args.body ?? ""),
            confirmLabel:
              typeof args.confirm_label === "string"
                ? args.confirm_label
                : undefined,
          });
          toolCallOutput = {
            response: editable
              ? "The draft is on screen for the user to review and edit. Briefly invite them to make changes and confirm, then wait."
              : "The content is now on screen. Continue.",
          };
        } else if (output.name === "request_text_input") {
          // ---- Ask the user to type something ----
          openCanvas({
            mode: "input",
            title: "Your input",
            prompt: String(args.prompt ?? "Please type your answer."),
            placeholder:
              typeof args.placeholder === "string" ? args.placeholder : undefined,
          });
          toolCallOutput = {
            response:
              "A text box is on screen. Ask them to type it in, then wait for their input.",
          };
        } else if (output.name === "consult_expert_agent") {
          // ---- Offload to the background GPT-5.4 expert ----
          const res = await fetch("/api/agent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ task: args.task, context: args.context }),
          });
          const data = await res.json();
          if (data.text) {
            openCanvas({
              mode: "display",
              title: "From your expert assistant",
              body: data.text,
            });
            toolCallOutput = {
              response: `The expert produced this result (now shown on screen). Summarize it in a sentence or two, or act on it:\n\n${data.text}`,
            };
          } else {
            openCanvas({
              mode: "display",
              tone: "error",
              title: "Expert agent failed",
              body: data.error ?? "The expert agent did not return a result.",
            });
            toolCallOutput = {
              response: `The expert agent failed: ${data.error ?? "unknown error"}. Tell the user briefly and offer to try again.`,
              error: true,
            };
          }
        } else if (output.name === "web_search") {
          // ---- Web search (keyless) → results shown on screen + read aloud ----
          const res = await fetch("/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ query: args.query }),
          });
          const data = await res.json();
          const results = data.results ?? [];
          if (results.length > 0) {
            openCanvas({
              mode: "results",
              title: `Results for “${data.query}”`,
              results,
              searchQuery: data.query,
            });
            const summary = results
              .slice(0, 4)
              .map(
                (r: any, i: number) =>
                  `${i + 1}. ${r.title}${r.snippet ? ` — ${r.snippet}` : ""}`
              )
              .join("\n");
            toolCallOutput = {
              response: `Web results are shown on screen. Read the most relevant one or two aloud, then offer to open Google or a link:\n\n${summary}`,
            };
          } else {
            openCanvas({
              mode: "display",
              tone: "error",
              title: "Search failed",
              body: data.error ?? "No results found.",
            });
            toolCallOutput = {
              response: `The search didn't return results: ${data.error ?? "unknown error"}. Tell the user briefly and offer to try a different query.`,
              error: true,
            };
          }
        } else if (output.name === "show_capabilities") {
          // ---- Show the "what can you do" popup ----
          setCapabilitiesOpen(true);
          toolCallOutput = {
            response:
              "The capabilities popup is on screen. Give a one-sentence summary of what you can help with.",
          };
        } else {
          // ---- A real Composio action tool (e.g. GMAIL_SEND_EMAIL) ----
          const res = await fetch("/api/composio/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ toolName: output.name, arguments: args }),
          });
          const data = await res.json();

          if (data.successful) {
            toolCallOutput = {
              response: "The action completed successfully.",
              result: data.data,
            };
          } else {
            // Surface the real reason — on screen AND back to the agent to speak.
            const reason = data.error ?? "unknown error";
            openCanvas({
              mode: "display",
              tone: "error",
              title: `${output.name} failed`,
              body: String(reason),
            });
            toolCallOutput = {
              response: `The "${output.name}" action did not succeed. The reason was: ${reason}. Tell the user this reason in plain language and offer a next step (retry, reconnect the app, or provide missing details).`,
              error: true,
            };
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "The requested tool failed.";
        openCanvas({
          mode: "display",
          tone: "error",
          title: "Something went wrong",
          body: message,
        });
        toolCallOutput = { response: message, error: true };
      }

      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: output.call_id,
          output: JSON.stringify(toolCallOutput),
        },
      });
      sendClientEvent({ type: "response.create" });
    },
    [sendClientEvent, syncSessionTools, openCanvas]
  );

  const handleRealtimeMessage = useCallback(
    (eventMessage: MessageEvent) => {
      let event: any;
      try {
        event = JSON.parse(eventMessage.data);
      } catch {
        return;
      }

      if (event.type === "error") {
        console.error("Realtime error:", event);
        setSessionError(event.error?.message ?? "Realtime session error.");
        setVoiceStatus("error");
        return;
      }

      if (event.type === "input_audio_buffer.speech_started") {
        setSessionError(null);
        setVoiceStatus("listening");
      }
      if (
        event.type === "input_audio_buffer.speech_stopped" ||
        event.type === "response.created"
      ) {
        setVoiceStatus("thinking");
      }
      if (
        event.type === "response.audio.delta" ||
        event.type === "response.output_audio.delta" ||
        event.type === "output_audio_buffer.started"
      ) {
        setVoiceStatus("speaking");
      }
      if (
        event.type === "response.audio.done" ||
        event.type === "output_audio_buffer.stopped"
      ) {
        setReadyVoiceStatus();
      }

      if (event.type === "response.done") {
        const outputs = event.response?.output ?? [];
        const functionCall = outputs.find(
          (o: any) => o?.type === "function_call"
        );
        if (functionCall) void handleToolCall(functionCall);
        else setReadyVoiceStatus();
      }
    },
    [handleToolCall, setReadyVoiceStatus]
  );

  const stopSession = useCallback(() => {
    cleanupDataChannel.current?.();
    cleanupDataChannel.current = null;
    dataChannel.current?.close();
    peerConnection.current?.close();
    audioStream.current?.getTracks().forEach((track) => track.stop());
    sessionAbort.current?.abort();

    dataChannel.current = null;
    peerConnection.current = null;
    audioStream.current = null;
    isSessionStarted.current = false;
    sessionAbort.current = null;
    loadedTools.current = [];
    loadedToolNames.current = new Set();

    if (audioElement.current) audioElement.current.srcObject = null;
    setAuthRequest(null);
    setCanvas(null);
    setCapabilitiesOpen(false);
    setVoiceStatus("idle");
  }, []);

  const startSession = useCallback(async () => {
    if (isSessionStarted.current) return;

    let pc: RTCPeerConnection | null = null;
    let stream: MediaStream | null = null;
    const controller = new AbortController();
    sessionAbort.current = controller;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support microphone access.");
      }

      isSessionStarted.current = true;
      setSessionError(null);
      setVoiceStatus("connecting");

      const sessionResponse = await fetch("/api/session", {
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!sessionResponse.ok) {
        throw new Error(
          await readRealtimeResponseError(
            sessionResponse,
            "Could not start the voice session"
          )
        );
      }

      const session: RealtimeClientSecret = await sessionResponse.json();
      const sessionToken = session.value;
      if (!sessionToken) throw new Error("Missing realtime client secret.");

      pc = new RTCPeerConnection();
      peerConnection.current = pc;

      pc.onconnectionstatechange = () => {
        if (
          pc &&
          (pc.connectionState === "failed" ||
            pc.connectionState === "disconnected")
        ) {
          if (isSessionStarted.current) {
            setSessionError("The connection dropped. Tap the orb to reconnect.");
            setVoiceStatus("error");
          }
        }
      };

      if (!audioElement.current) {
        audioElement.current = document.createElement("audio");
      }
      audioElement.current.autoplay = true;
      pc.ontrack = (event) => {
        if (audioElement.current) audioElement.current.srcObject = event.streams[0];
      };

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const activeStream = stream;
      audioStream.current = activeStream;
      activeStream.getTracks().forEach((track) => pc?.addTrack(track, activeStream));

      const channel = pc.createDataChannel("oai-events");
      dataChannel.current = channel;

      const handleOpen = () => {
        setSessionError(null);
        setVoiceStatus("listening");

        // Start with just the meta-tool; the rest load on demand.
        sendClientEvent({
          type: "session.update",
          session: {
            type: "realtime",
            tools: TOOLS,
            instructions: INSTRUCTIONS,
          },
        });

        // Proactive greeting.
        sendClientEvent({
          type: "response.create",
          response: {
            instructions: `Greet the user now, warmly and briefly, with exactly: "${GREETING}" Do not call any tools yet.`,
          },
        });
      };

      const handleClose = () => {
        isSessionStarted.current = false;
        setVoiceStatus("idle");
      };
      const handleChannelError = () => {
        setSessionError("The voice data channel closed unexpectedly.");
        setVoiceStatus("error");
      };

      channel.addEventListener("message", handleRealtimeMessage);
      channel.addEventListener("open", handleOpen);
      channel.addEventListener("close", handleClose);
      channel.addEventListener("error", handleChannelError);
      cleanupDataChannel.current = () => {
        channel.removeEventListener("message", handleRealtimeMessage);
        channel.removeEventListener("open", handleOpen);
        channel.removeEventListener("close", handleClose);
        channel.removeEventListener("error", handleChannelError);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(REALTIME_CALLS_URL, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/sdp",
        },
        signal: controller.signal,
      });
      if (!sdpResponse.ok) {
        throw new Error(
          await readRealtimeResponseError(
            sdpResponse,
            "Could not connect to the voice service"
          )
        );
      }

      await pc.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
      });
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      pc?.close();
      cleanupDataChannel.current?.();
      cleanupDataChannel.current = null;
      dataChannel.current = null;
      peerConnection.current = null;
      audioStream.current = null;
      isSessionStarted.current = false;
      if (controller.signal.aborted) {
        setVoiceStatus("idle");
        return;
      }
      console.error("Error starting session:", error);
      setVoiceStatus("error");
      setSessionError(getVoiceErrorMessage(error));
    } finally {
      if (sessionAbort.current === controller) sessionAbort.current = null;
    }
  }, [handleRealtimeMessage, sendClientEvent]);

  const handleOrbClick = useCallback(() => {
    if (isSessionStarted.current) stopSession();
    else void startSession();
  }, [startSession, stopSession]);

  // Clean up on unmount.
  useEffect(() => () => stopSession(), [stopSession]);

  const copy = statusCopy[voiceStatus];

  return (
    <main className="assistant-shell">
      <div className="assistant-center">
        <p className="assistant-wordmark">Personal Assistant</p>

        <Orb status={voiceStatus} onClick={handleOrbClick} />

        <div className="assistant-status" aria-live="polite">
          <h1 className="assistant-status-label">
            {sessionError ? "Couldn't connect" : copy.label}
          </h1>
          <p className="assistant-status-detail">{sessionError ?? copy.detail}</p>
        </div>

        {voiceStatus === "idle" && (
          <>
            <p className="assistant-hint">
              Try: &ldquo;Send an email to my team&rdquo; or &ldquo;What can you
              do?&rdquo;
            </p>
            <button
              type="button"
              className="assistant-caps-link"
              onClick={() => setCapabilitiesOpen(true)}
            >
              See everything I can do
            </button>
          </>
        )}
      </div>

      <Canvas
        state={canvas}
        onClose={() => setCanvas(null)}
        onSubmit={handleCanvasSubmit}
      />
      <AuthModal request={authRequest} onClose={() => setAuthRequest(null)} />
      <CapabilitiesModal
        open={capabilitiesOpen}
        onClose={() => setCapabilitiesOpen(false)}
      />
    </main>
  );
}
