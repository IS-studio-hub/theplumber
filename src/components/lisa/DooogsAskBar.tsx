"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/lisa-types";
import { unlockDooogsAudio } from "@/lib/dooogs-voice";
import { isInAppBrowser } from "@/lib/in-app-browser";

type BrowserRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((ev: {
    results: {
      [i: number]: { [j: number]: { transcript: string }; isFinal: boolean };
      length: number;
    };
  }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognitionCtor(): (new () => BrowserRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => BrowserRec;
    webkitSpeechRecognition?: new () => BrowserRec;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** End-of-turn silence before we send (ElevenLabs-style). */
const END_OF_TURN_MS = 1100;

export function DooogsAskBar({
  locale,
  disabled,
  conversation,
  onConversationChange,
  listenEpoch,
  onSubmit,
  onNotice,
  onInterrupt,
  placeholder,
}: {
  locale: Locale;
  /** True while Dooogs is thinking or speaking ,  mic pauses, conversation stays on */
  disabled?: boolean;
  conversation: boolean;
  onConversationChange: (v: boolean) => void;
  /** Bump after Dooogs finishes speaking to resume listening */
  listenEpoch: number;
  onSubmit: (text: string, meta?: { fromMic?: boolean }) => void;
  onNotice?: (message: string) => void;
  /** Barge-in: stop Dooogs' voice when the user starts talking again */
  onInterrupt?: () => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const [hearing, setHearing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef("");
  const browserRecRef = useRef<BrowserRec | null>(null);
  const conversationRef = useRef(conversation);
  const disabledRef = useRef(Boolean(disabled));
  const turnTimerRef = useRef<number | null>(null);
  const finalsRef = useRef("");
  const submittingRef = useRef(false);
  const wantListenRef = useRef(false);
  const hasText = value.trim().length > 0 && !conversation;

  conversationRef.current = conversation;
  disabledRef.current = Boolean(disabled);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Parent may close conversation after an answer ,  stop listening
  useEffect(() => {
    if (!conversation) {
      wantListenRef.current = false;
      conversationRef.current = false;
      clearTurnTimer();
      hardStopRec();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation]);

  useEffect(() => {
    return () => {
      clearTurnTimer();
      hardStopRec();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause recognition while thinking/speaking; only listen when user opened the mic
  useEffect(() => {
    if (disabled) {
      pauseRec();
      return;
    }
    if (conversationRef.current && wantListenRef.current) {
      startConversationListen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, listenEpoch]);

  function notice(msg: string) {
    onNotice?.(msg);
  }

  function clearTurnTimer() {
    if (turnTimerRef.current) {
      window.clearTimeout(turnTimerRef.current);
      turnTimerRef.current = null;
    }
  }

  function hardStopRec() {
    clearTurnTimer();
    const rec = browserRecRef.current;
    browserRecRef.current = null;
    setHearing(false);
    if (!rec) return;
    try {
      rec.onend = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.abort();
    } catch {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }

  function pauseRec() {
    clearTurnTimer();
    const rec = browserRecRef.current;
    browserRecRef.current = null;
    setHearing(false);
    if (!rec) return;
    try {
      rec.onend = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.stop();
    } catch {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    }
  }

  function scheduleEndOfTurn() {
    clearTurnTimer();
    turnTimerRef.current = window.setTimeout(() => {
      turnTimerRef.current = null;
      const draft = finalsRef.current.trim() || valueRef.current.trim();
      if (draft.length < 2) return;
      if (submittingRef.current || disabledRef.current) return;
      submittingRef.current = true;
      pauseRec();
      setValue("");
      finalsRef.current = "";
      onSubmit(draft, { fromMic: true });
      // Stay silent until the user taps the mic again
      window.setTimeout(() => {
        submittingRef.current = false;
      }, 400);
    }, END_OF_TURN_MS);
  }

  function startConversationListen() {
    if (disabledRef.current || !conversationRef.current) return;
    if (browserRecRef.current) return;

    // LinkedIn / in-app WebViews often expose a broken SpeechRecognition that
    // ends immediately ,  avoid restart loops; ask the user to type instead.
    if (isInAppBrowser()) {
      notice(
        locale === "fr"
          ? "Dans LinkedIn, tape ta question, ou ouvre Safari/Chrome pour la voix."
          : "In LinkedIn, please type your question, or open Safari/Chrome for voice."
      );
      endConversation();
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      const isIOS =
        typeof navigator !== "undefined" &&
        (/iPad|iPhone|iPod/i.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" &&
            (navigator.maxTouchPoints || 0) > 1));
      notice(
        isIOS
          ? locale === "fr"
            ? "Sur iPhone, tape ta question. Safari ne gère pas encore la conversation vocale continue."
            : "On iPhone, please type your question. Safari doesn’t support continuous voice chat yet."
          : locale === "fr"
            ? "Conversation vocale: utilise Chrome ou Edge."
            : "Voice conversation needs Chrome or Edge."
      );
      endConversation();
      return;
    }

    unlockDooogsAudio();
    wantListenRef.current = true;
    finalsRef.current = "";
    submittingRef.current = false;

    const rec = new Ctor();
    rec.lang = locale === "fr" ? "fr-FR" : "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 2;

    rec.onresult = (ev) => {
      if (disabledRef.current || !conversationRef.current) return;

      let interim = "";
      let gotFinal = false;
      for (let i = 0; i < ev.results.length; i++) {
        const row = ev.results[i];
        const piece = row?.[0]?.transcript ?? "";
        if (row?.isFinal) {
          if (piece) {
            finalsRef.current = `${finalsRef.current} ${piece}`
              .replace(/\s+/g, " ")
              .trim();
            gotFinal = true;
          }
        } else {
          interim += piece;
        }
      }

      const next = (finalsRef.current || interim).trim();
      if (next) {
        // Barge-in: user started talking over Dooogs
        if (interim || gotFinal) onInterrupt?.();
        setValue(next);
      }
      if (gotFinal || finalsRef.current) scheduleEndOfTurn();
    };

    rec.onerror = (ev) => {
      const err = ev?.error || "";
      // Keep conversation alive through no-speech gaps
      if (err === "no-speech" || err === "aborted") return;

      if (err === "not-allowed" || err === "service-not-allowed") {
        notice(
          locale === "fr"
            ? "Autorise le micro, ou tape ta question."
            : "Allow microphone access, or type your question."
        );
        endConversation();
        return;
      }
      if (err === "network") {
        notice(
          locale === "fr"
            ? "Réseau micro indisponible. Tape ta question."
            : "Mic network error. Please type your question."
        );
        endConversation();
      }
    };

    rec.onend = () => {
      browserRecRef.current = null;
      setHearing(false);
      // Auto-restart while conversation is live and we're not paused
      if (
        conversationRef.current &&
        wantListenRef.current &&
        !disabledRef.current &&
        !submittingRef.current
      ) {
        window.setTimeout(() => {
          if (
            conversationRef.current &&
            wantListenRef.current &&
            !disabledRef.current
          ) {
            startConversationListen();
          }
        }, 180);
      }
    };

    browserRecRef.current = rec;
    setHearing(true);
    try {
      rec.start();
    } catch {
      browserRecRef.current = null;
      setHearing(false);
      window.setTimeout(() => {
        if (conversationRef.current && !disabledRef.current) {
          startConversationListen();
        }
      }, 320);
    }
  }

  function endConversation() {
    wantListenRef.current = false;
    conversationRef.current = false;
    clearTurnTimer();
    hardStopRec();
    finalsRef.current = "";
    setValue("");
    onConversationChange(false);
  }

  function beginConversation() {
    unlockDooogsAudio();
    onInterrupt?.();
    wantListenRef.current = true;
    conversationRef.current = true; // don't wait for parent re-render
    onConversationChange(true);
    window.setTimeout(() => startConversationListen(), 0);
  }

  function toggleConversation() {
    if (conversation) endConversation();
    else beginConversation();
  }

  function sendTyped() {
    const text = value.trim();
    if (!text || disabled) return;
    if (conversation) {
      // Typed while mic mode was on ,  still a text question (no voice reply)
      pauseRec();
      setValue("");
      finalsRef.current = "";
      onSubmit(text, { fromMic: false });
      return;
    }
    onSubmit(text, { fromMic: false });
    setValue("");
    inputRef.current?.focus();
  }

  const live = conversation && (hearing || Boolean(disabled));

  return (
    <form
      className="c-dooogs-ask"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) sendTyped();
      }}
    >
      <div
        className={clsx(
          "c-dooogs-ask_field",
          live && "-listening",
          conversation && disabled && "-transcribing"
        )}
      >
        <input
          ref={inputRef}
          type="text"
          className="c-dooogs-ask_input"
          value={value}
          disabled={Boolean(disabled) && !conversation}
          placeholder={
            conversation && disabled
              ? locale === "fr"
                ? "AVA répond…"
                : "AVA is answering…"
              : conversation
                ? locale === "fr"
                  ? "Je vous écoute… parlez naturellement"
                  : "Listening… talk naturally"
                : placeholder ||
                  (locale === "fr"
                    ? "Urgence, devis, rendez-vous…"
                    : "Emergency, quote, booking…")
          }
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => unlockDooogsAudio()}
          aria-label={locale === "fr" ? "Votre question" : "Your question"}
        />
        {hasText ? (
          <button
            type="submit"
            className="c-dooogs-ask_action -send"
            aria-label={locale === "fr" ? "Envoyer" : "Send"}
            disabled={Boolean(disabled)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M5 12h12M13 6l6 6-6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className={clsx("c-dooogs-ask_action -mic", conversation && "-on")}
            aria-label={
              conversation
                ? locale === "fr"
                  ? "Arrêter la conversation"
                  : "End conversation"
                : locale === "fr"
                  ? "Conversation vocale"
                  : "Voice conversation"
            }
            aria-pressed={conversation}
            onClick={toggleConversation}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {conversation ? (
                <rect
                  x="7"
                  y="7"
                  width="10"
                  height="10"
                  rx="1.5"
                  fill="currentColor"
                />
              ) : (
                <>
                  <path
                    d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3z"
                    fill="currentColor"
                  />
                  <path
                    d="M5 11a7 7 0 0 0 14 0M12 18v3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </>
              )}
            </svg>
          </button>
        )}
      </div>
    </form>
  );
}
