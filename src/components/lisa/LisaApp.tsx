"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  pickDialog,
  resolveChoices,
  type LisaChoice,
  type LisaContent,
  type LisaModel,
  type Locale,
} from "@/lib/lisa-types";
import { speakDooogs, unlockDooogsAudio, stripDialogHtml } from "@/lib/dooogs-voice";
import { withBase } from "@/lib/base-path";
import {
  avaGreetingHtml,
  freshSession,
  loadSession,
  offlineAvaReply,
  runAvaChatTurn,
  saveSession,
  type ChatMessage,
} from "@/lib/ava-chat-engine";
import { isSafeHttpUrl, sanitizeDialogHtml, stripHtml } from "@/lib/safe-html";
import { DooogsAskBar } from "./DooogsAskBar";
import { LisaDialog } from "./LisaDialog";
import { LisaMedia } from "./LisaMedia";
import { isInAppBrowser } from "@/lib/in-app-browser";

type HistoryEntry = {
  id: string;
  dialogHtml: string;
};

export function LisaApp({
  content,
  locale,
}: {
  content: LisaContent;
  locale: Locale;
}) {
  const [stepId, setStepId] = useState("intro");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [dialogHtml, setDialogHtml] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [typingDone, setTypingDone] = useState(false);
  const [muted, setMuted] = useState(true);
  const mutedRef = useRef(true);
  mutedRef.current = muted;
  const [model, setModel] = useState<LisaModel>({});
  const [toast, setToast] = useState<string | null>(null);
  const [documentTitle, setDocumentTitle] = useState("AVA | Sewer Squad");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<string[] | null>(null);
  const [thinking, setThinking] = useState(false);
  const [conversation, setConversation] = useState(false);
  const [listenEpoch, setListenEpoch] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const conversationRef = useRef(false);
  conversationRef.current = conversation;
  const [sheetOpen, setSheetOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const voiceStopRef = useRef<(() => void) | null>(null);
  const autoTimer = useRef<number | null>(null);
  const typingLock = useRef(false);
  const dialogHtmlRef = useRef("");
  const stepIdRef = useRef(stepId);
  const askingRef = useRef(false);
  const sheetDrag = useRef<{ y: number; open: boolean } | null>(null);

  const step = content[stepId];

  const scriptChoices = useMemo(
    () => resolveChoices(step?.choices, model),
    [step, model]
  );

  const choices: LisaChoice[] = useMemo(() => {
    if (aiSuggestions?.length) {
      return aiSuggestions.map((label) => ({
        label,
        modelUpdate: { key: "ask", value: label },
      }));
    }
    return scriptChoices;
  }, [aiSuggestions, scriptChoices]);

  const media = useMemo(() => step?.media ?? [], [step?.media]);
  const isCompact = Boolean(step?.isCompact) || thinking || speaking;
  const progress = Math.min(
    0.95,
    (step?.progress ?? 0.2) + chatMessages.filter((m) => m.role === "user").length * 0.06
  );

  const [stickyMedia, setStickyMedia] = useState(media);

  useEffect(() => {
    dialogHtmlRef.current = dialogHtml;
  }, [dialogHtml]);

  useEffect(() => {
    stepIdRef.current = stepId;
  }, [stepId]);

  useEffect(() => {
    if (!media.length) return;
    const pick = media[Math.floor(Math.random() * media.length)]!;
    setStickyMedia([pick]);
  }, [media]);

  const displayMedia = stickyMedia;

  const clearAuto = () => {
    if (autoTimer.current) {
      window.clearTimeout(autoTimer.current);
      autoTimer.current = null;
    }
  };

  const showAssistantReply = useCallback(
    (html: string, opts?: { pushPrior?: boolean }) => {
      clearAuto();
      typingLock.current = false;
      if (opts?.pushPrior !== false && dialogHtmlRef.current) {
        setHistory((h) => [
          ...h,
          { id: stepIdRef.current, dialogHtml: dialogHtmlRef.current },
        ]);
      }
      setStepId("chat");
      setDialogHtml(sanitizeDialogHtml(html));
      setTypingDone(false);
      setExpanded(false);
      setDocumentTitle("AVA | Sewer Squad");
    },
    []
  );

  const playVoice = useCallback(
    (html: string, opts?: { force?: boolean }): Promise<void> => {
      if (!opts?.force && mutedRef.current) return Promise.resolve();
      const clean = sanitizeDialogHtml(html);
      if (!clean || clean === "…" || /thinking…|je réfléchis/i.test(clean)) {
        return Promise.resolve();
      }
      voiceStopRef.current?.();
      const ambient = audioRef.current;
      setSpeaking(true);
      // Scale with reply length ,  fixed 30s was cutting long answers mid-sentence
      const approx = stripDialogHtml(clean).length;
      const speakWatchdog = window.setTimeout(() => {
        voiceStopRef.current?.();
        setSpeaking(false);
      }, Math.min(180_000, Math.max(25_000, 8_000 + approx * 75)));
      const { stop, done } = speakDooogs(clean, locale, {
        onStart: () => {
          if (ambient) ambient.volume = 0.06;
        },
        onEnd: () => {
          if (ambient && !mutedRef.current) ambient.volume = 0.28;
          setSpeaking(false);
        },
      });
      voiceStopRef.current = () => {
        stop();
        setSpeaking(false);
      };
      return done.finally(() => {
        window.clearTimeout(speakWatchdog);
        setSpeaking(false);
      });
    },
    [locale]
  );

  const stopVoice = useCallback(() => {
    voiceStopRef.current?.();
    voiceStopRef.current = null;
    setSpeaking(false);
  }, []);

  const askDog = useCallback(
    async (userText: string, opts?: { fromMic?: boolean }) => {
      const text = userText.trim();
      if (!text || askingRef.current) return;
      if (text.startsWith("(") && text.endsWith(")")) {
        setToast(text.replace(/^\(|\)$/g, ""));
        window.setTimeout(() => setToast(null), 3200);
        return;
      }

      const fromMic = Boolean(opts?.fromMic);

      // Voice in → voice out. Text in → text only (keep sound off).
      if (fromMic) {
        unlockDooogsAudio();
        mutedRef.current = false;
        setMuted(false);
      } else {
        stopVoice();
        mutedRef.current = true;
        setMuted(true);
        const ambient = audioRef.current;
        if (ambient) {
          ambient.pause();
          ambient.volume = 0;
        }
      }

      askingRef.current = true;
      setThinking(true);
      setExpanded(true);

      const nextMessages: ChatMessage[] = [
        ...chatMessages,
        { role: "user", content: text },
      ];
      setChatMessages(nextMessages);

      if (dialogHtmlRef.current) {
        setHistory((h) => [
          ...h,
          { id: stepIdRef.current, dialogHtml: dialogHtmlRef.current },
        ]);
      }
      setStepId("chat");
      setDialogHtml("…");
      setTypingDone(false);
      setExpanded(false);

      const safety = window.setTimeout(() => {
        askingRef.current = false;
        setThinking(false);
        setSpeaking(false);
      }, 40_000);

      let replyHtml = "";
      try {
        const turn = await runAvaChatTurn(text, locale, chatMessages, loadSession(), {
          timeoutMs: 35_000,
        });
        replyHtml = turn.reply;
        setChatMessages((m) => [
          ...m,
          { role: "assistant", content: turn.reply },
        ]);
        setAiSuggestions(turn.suggestions);
        showAssistantReply(turn.reply, { pushPrior: false });
        if (turn.lead?.booked && turn.lead.confirmationCode) {
          const code = turn.lead.confirmationCode;
          const price =
            turn.lead.quotedPriceCad > 0
              ? ` · $${turn.lead.quotedPriceCad}`
              : "";
          setToast(`Saved to dashboard · ${code}${price}`);
          window.setTimeout(() => setToast(null), 4200);
        }
      } catch {
        const offline = offlineAvaReply(text, locale, nextMessages);
        replyHtml = offline.reply;
        setChatMessages((m) => [
          ...m,
          { role: "assistant", content: offline.reply },
        ]);
        setAiSuggestions(offline.suggestions);
        showAssistantReply(offline.reply, { pushPrior: false });
      } finally {
        window.clearTimeout(safety);
        setThinking(false);
        askingRef.current = false;
      }

      if (replyHtml && fromMic) {
        try {
          await playVoice(replyHtml, { force: true });
        } catch {
          /* ignore */
        }
      }
      // Don't auto-reopen the mic ,  user taps to talk again
      if (conversationRef.current) {
        setConversation(false);
      }
    },
    [chatMessages, locale, showAssistantReply, playVoice, stopVoice]
  );

  const goTo = useCallback(
    (
      nextId: string,
      opts?: { pushHistory?: boolean; modelPatch?: LisaModel; keepDialog?: boolean }
    ) => {
      const next = content[nextId];
      if (!next) return;
      clearAuto();
      typingLock.current = false;
      setHistory((h) => {
        if (opts?.pushHistory === false || opts?.keepDialog) return h;
        if (!dialogHtml) return h;
        return [...h, { id: stepId, dialogHtml }];
      });
      if (opts?.modelPatch) {
        setModel((m) => ({ ...m, ...opts.modelPatch }));
      }
      setStepId(nextId);
      if (!opts?.keepDialog) {
        const html = next.dialog?.list ? pickDialog(next.dialog.list) : "";
        setDialogHtml(sanitizeDialogHtml(html));
        setTypingDone(false);
        setExpanded(false);
      } else {
        // Keep the full greeting on screen; only unlock chat choices
        setTypingDone(true);
        setExpanded(true);
      }
      setDocumentTitle("AVA | Sewer Squad");
    },
    [content, dialogHtml, stepId]
  );

  useEffect(() => {
    // Start a fresh AVA lead session when the site opens
    if (!loadSession()) {
      const s = freshSession();
      saveSession(s);
    }
  }, []);

  useEffect(() => {
    const intro = content.intro;
    if (!intro) return;
    setDialogHtml(sanitizeDialogHtml(avaGreetingHtml()));
  }, [content]);

  // Facebook / LinkedIn: keep the chat sheet open so the ask bar is always usable
  useEffect(() => {
    if (isInAppBrowser()) {
      setSheetOpen(true);
      setExpanded(true);
    }
  }, []);

  useEffect(() => {
    document.title = documentTitle;
  }, [documentTitle]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.28;
    if (!muted) {
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [muted]);

  // Replies speak via playVoice(); unmute speaks from the sound button click.
  // (Avoid an effect here ,  it would cancel gesture-started speech on re-render.)

  const onTypingComplete = useCallback(() => {
    if (typingLock.current) return;
    typingLock.current = true;
    setTypingDone(true);
    setExpanded(true);
    // Open sheet on mobile once content is ready (suggestions / reply)
    if (typeof window !== "undefined" && window.innerWidth <= 1023) {
      setSheetOpen(true);
    }

    if (step?.next && stepId !== "chat" && !thinking) {
      const delay = 600;
      clearAuto();
      autoTimer.current = window.setTimeout(() => {
        // Stay on the full greeting — don’t swap in a separate short line
        goTo(step.next!, { keepDialog: true });
      }, delay);
    }
  }, [step, stepId, thinking, goTo]);

  function handleChoice(choice: LisaChoice) {
    if (choice.clickToCopy) {
      void navigator.clipboard.writeText(choice.clickToCopy.toCopy);
      setToast(choice.clickToCopy.confirmation);
      window.setTimeout(() => setToast(null), 2200);
      return;
    }
    if (choice.href && isSafeHttpUrl(choice.href)) {
      window.open(choice.href, "_blank", "noopener,noreferrer");
      return;
    }
    if (choice.emit === "form-retry") {
      setChatMessages([]);
      setAiSuggestions(null);
      goTo("chat", { pushHistory: false });
      setHistory([]);
      return;
    }

      const ask =
      (choice.modelUpdate?.key === "ask" && choice.modelUpdate.value) ||
      (!choice.target ? stripHtml(choice.label) : null);

    if (ask) {
      void askDog(ask);
      return;
    }

    const patch: LisaModel = {};
    if (choice.modelUpdate) {
      patch[choice.modelUpdate.key] =
        choice.modelUpdate.value ?? stripHtml(choice.label);
    }
    if (choice.target) goTo(choice.target, { modelPatch: patch });
    else if (Object.keys(patch).length) setModel((m) => ({ ...m, ...patch }));
  }

  function handleBack() {
    clearAuto();
    setHistory((h) => {
      if (!h.length) {
        goTo("chat", { pushHistory: false });
        return [];
      }
      const prev = h[h.length - 1];
      const rest = h.slice(0, -1);
      setStepId(prev.id);
      setDialogHtml(prev.dialogHtml);
      setTypingDone(true);
      setExpanded(true);
      return rest;
    });
  }

  function handleSheetClick() {
    if (!typingDone) {
      onTypingComplete();
      return;
    }
    if (typeof window !== "undefined" && window.innerWidth <= 1023) {
      setSheetOpen(true);
      return;
    }
    if (step?.next && stepId !== "chat" && !thinking) {
      goTo(step.next, { keepDialog: true });
    }
  }

  function onSheetPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (typeof window !== "undefined" && window.innerWidth > 1023) return;
    sheetDrag.current = { y: e.clientY, open: sheetOpen };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onSheetPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const drag = sheetDrag.current;
    if (!drag) return;
    const dy = drag.y - e.clientY;
    if (!drag.open && dy > 36) setSheetOpen(true);
    if (drag.open && dy < -36) setSheetOpen(false);
  }

  function onSheetPointerUp() {
    sheetDrag.current = null;
  }

  function handleAskSubmit(text: string, meta?: { fromMic?: boolean }) {
    const fromMic = Boolean(meta?.fromMic);
    if (fromMic) {
      unlockDooogsAudio();
    } else {
      stopVoice();
    }
    setSheetOpen(true);
    void askDog(text, { fromMic });
  }

  if (!step) {
    return <div className="c-lisa">Missing step.</div>;
  }

  const showAskBar = true;

  return (
    <div
      className={clsx(
        "c-lisa",
        isCompact && "is-compact",
        sheetOpen ? "is-sheet-open" : "is-sheet-closed"
      )}
      style={{ ["--progress" as string]: String(progress) }}
    >
      <audio ref={audioRef} src={withBase("/assets/lisa/fx/ambient.mp3")} loop preload="auto" />

      <LisaMedia
        media={displayMedia}
        muted={muted}
        clip={typingDone && !thinking && !speaking ? "idle" : "talk"}
      />

      <div className="c-lisa_main" onClick={handleSheetClick}>
        <button
          type="button"
          className="c-lisa_sheet-handle"
          aria-label={sheetOpen ? "Collapse panel" : "Expand panel"}
          aria-expanded={sheetOpen}
          onClick={(e) => {
            e.stopPropagation();
            setSheetOpen((v) => !v);
          }}
          onPointerDown={onSheetPointerDown}
          onPointerMove={onSheetPointerMove}
          onPointerUp={onSheetPointerUp}
          onPointerCancel={onSheetPointerUp}
        />

        <div className={clsx("c-lisa_step", "c-lisa-step", expanded && "-expanded")}>
          <div
            className="c-lisa_sheet-chrome"
            onClick={(e) => e.stopPropagation()}
          >
            {showAskBar ? (
              <DooogsAskBar
                locale={locale}
                disabled={thinking || speaking}
                conversation={conversation}
                onConversationChange={(v) => {
                  setConversation(v);
                  if (v) {
                    setSheetOpen(true);
                    unlockDooogsAudio();
                    mutedRef.current = false;
                    setMuted(false);
                  } else {
                    stopVoice();
                  }
                }}
                listenEpoch={listenEpoch}
                onInterrupt={stopVoice}
                onSubmit={handleAskSubmit}
                onNotice={(message) => {
                  setToast(message);
                  window.setTimeout(() => setToast(null), 3200);
                }}
                placeholder={
                  locale === "fr" ? "Demandez-moi n'importe quoi" : "ask me anything"
                }
              />
            ) : null}
          </div>

          <div className="c-lisa_sheet-body">
            {history.length > 0 ? (
              <button
                type="button"
                className="c-lisa-step_previous"
                aria-label={stripHtml(history[history.length - 1]?.dialogHtml ?? "")}
                onClick={(e) => {
                  e.stopPropagation();
                  handleBack();
                }}
                dangerouslySetInnerHTML={{
                  __html: sanitizeDialogHtml(
                    history[history.length - 1]?.dialogHtml ?? ""
                  ),
                }}
              />
            ) : null}

            <LisaDialog
              key={`dlg-${chatMessages.length}-${dialogHtml.length}-${dialogHtml.slice(0, 48)}`}
              html={dialogHtml}
              showCursor={!typingDone}
              instant={
                (stepId === "intro" || stepId === "chat") &&
                chatMessages.length === 0
              }
              onComplete={onTypingComplete}
            />

            <div className="c-lisa-step_content" onClick={(e) => e.stopPropagation()}>
              {choices.length > 0 && !thinking ? (
                <div className="c-lisa-step_choices" role="group" aria-label={locale === "fr" ? "Suggestions" : "Suggestions"}>
                  {choices.map((choice) => (
                    <button
                      key={choice.label}
                      type="button"
                      className="c-lisa_button -primary c-lisa-step_choice"
                      onClick={() => {
                        setSheetOpen(true);
                        handleChoice(choice);
                      }}
                    >
                      {stripHtml(choice.label) || choice.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {thinking ? <span className="c-lisa_loading" /> : null}
            </div>
          </div>
        </div>
      </div>

      {history.length > 0 || stepId !== "intro" ? (
        <button
          type="button"
          className="c-lisa_back"
          aria-label={locale === "fr" ? "Retour" : "Back"}
          onClick={handleBack}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9 15 4 10l5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4 10h9.5a5.5 5.5 0 0 1 0 11H12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}

      <button
        type="button"
        className={clsx("c-lisa_sound", muted && "-muted")}
        aria-label={locale === "fr" ? "Son / voix d’AVA" : "Sound / AVA voice"}
        aria-pressed={!muted}
        onClick={() => {
          unlockDooogsAudio();
          setMuted((m) => {
            const next = !m;
            mutedRef.current = next;
            // Speak current reply inside the click gesture (no setTimeout)
            if (m && dialogHtmlRef.current && dialogHtmlRef.current !== "…") {
              playVoice(dialogHtmlRef.current, { force: true });
            } else if (!m) {
              stopVoice();
            }
            return next;
          });
        }}
      >
        <span className="c-lisa_sound-icon -on" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M4 9v6h3l5 4V5L7 9H4zm11.5 3a3.5 3.5 0 0 0-1.5-2.9v5.8a3.5 3.5 0 0 0 1.5-2.9zm-1.5-7v1.5a6.5 6.5 0 0 1 0 11v1.5a8 8 0 0 0 0-14z" />
          </svg>
        </span>
        <span className="c-lisa_sound-icon -off" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M4 9v6h3l5 4V5L7 9H4zm12.5 1.5 1.8-1.8 1.4 1.4-1.8 1.8 1.8 1.8-1.4 1.4-1.8-1.8-1.8 1.8-1.4-1.4 1.8-1.8-1.8-1.8 1.4-1.4 1.8 1.8z" />
          </svg>
        </span>
      </button>

      <div className="c-lisa_progress" aria-hidden="true" />

      {toast ? (
        <div className="c-lisa_toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
