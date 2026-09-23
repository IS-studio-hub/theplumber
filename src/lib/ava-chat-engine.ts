/**
 * AVA v1 chat engine for Sewer Squad.
 * Flow: greet → intent → contact → qualify (2–4) → schedule → send lead.
 * Also answers FAQs / services / pricing from the business KB.
 */

import {
  createLeadDraft,
  estimateRevenue,
  sendLeadToBusiness,
  upsertLead,
  type AvaIntent,
  type AvaLead,
} from "@/lib/ava-leads";
import { knowledgeContextBlock, SEWER_SQUAD } from "@/lib/sewer-squad";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AvaChatTurn = {
  reply: string;
  suggestions: string[];
  source: string;
  lead: AvaLead;
};

export type AvaSession = {
  lead: AvaLead;
  stage: "intent" | "contact" | "qualify" | "schedule" | "done";
  qualifyIndex: number;
  contactField: "name" | "phone" | "email" | "done";
};

const SESSION_KEY = "ava.sewersquad.session.v1";

export function loadSession(): AvaSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AvaSession;
  } catch {
    return null;
  }
}

export function saveSession(s: AvaSession): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  upsertLead(s.lead);
}

export function freshSession(): AvaSession {
  return {
    lead: createLeadDraft(),
    stage: "intent",
    qualifyIndex: 0,
    contactField: "name",
  };
}

function stripHtml(s: string): string {
  return s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
}

function detectIntent(text: string): AvaIntent | null {
  const t = text.toLowerCase();
  if (
    /emergenc|asap|right now|flood|burst|sewage|backup|overflow|can.?t wait|urgent|24\/7|help now/.test(
      t
    )
  ) {
    return "emergency";
  }
  if (/book|appoint|schedul|come out|send (a )?tech|technician|visit/.test(t)) {
    return "booking";
  }
  if (/quote|estimat|how much|price|cost|\$88|promo|coupon|offer/.test(t)) {
    return "quote";
  }
  if (
    /hour|open|area|service|do you|can you|where|faq|sump|toilet|drain|leak|camera|lead pipe|after.?hours/.test(
      t
    )
  ) {
    return "question";
  }
  return null;
}

function extractPhone(text: string): string {
  const m = text.replace(/\s+/g, " ").match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  return m ? m[0].trim() : "";
}

function extractEmail(text: string): string {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : "";
}

function looksLikeName(text: string): boolean {
  const t = text.trim();
  if (extractPhone(t) || extractEmail(t)) return false;
  if (t.length < 2 || t.length > 60) return false;
  if (/^(yes|no|ok|okay|sure|hi|hello|hey)\b/i.test(t)) return false;
  return /^[a-zA-Z][a-zA-Z\s.'-]{1,58}$/.test(t);
}

function findCity(text: string): string {
  const lower = text.toLowerCase();
  for (const city of SEWER_SQUAD.serviceAreas) {
    if (lower.includes(city.toLowerCase())) return city;
  }
  return "";
}

function kbAnswer(text: string): string | null {
  const t = text.toLowerCase();

  if (/\$\s*88|88\s*(dollar|clear|sewer)|sewer line clear|camera inspection/.test(t)) {
    return `Our everyday <strong>$88 sewer line clear + camera</strong> covers clearing <em>one</em> main sewer line and inspecting it with a camera (+ HST). Residential; conditions apply. If it’s beyond the main line, we quote options before more work.<br><br>Want me to get a tech lined up?`;
  }
  if (/hour|open|24|after.?hours|weekend|overtime/.test(t)) {
    return `${SEWER_SQUAD.hours}<br><br>Call <strong>${SEWER_SQUAD.phone}</strong> anytime — real humans answer.`;
  }
  if (
    /service area/.test(t) ||
    ((/where|area|serve|gta|neighbourhood|neighborhood/.test(t) ||
      /toronto|ajax|mississauga|hamilton|markham|vaughan/.test(t)) &&
      /area|serve|near|city|live|cover/.test(t))
  ) {
    return `We’re across the GTA — from Durham to Peel and beyond (Toronto, Ajax, Mississauga, Markham, Hamilton, Vaughan, and more).<br><br>Ajax: ${SEWER_SQUAD.addresses[0].line}<br>Hamilton: ${SEWER_SQUAD.addresses[1].line}<br><br>What city are you in?`;
  }
  if (/price|cost|how much|pricing|upfront|fee/.test(t)) {
    return `We do <strong>upfront pricing</strong> — you’ll know the cost before we start. No after-hours fees. Popular offer: <strong>$88 main sewer clear + camera</strong> (+ HST). Also $149 sump pump check and $25 off plumbing/drain repair (conditions apply).<br><br>Tell me what’s going on and I can help with a quote or booking.`;
  }
  if (/sump/.test(t)) {
    return `Sump pumps — installs, repairs, and backups to stop basement floods. Current promo: <strong>$149 sump pump check</strong> (residential; conditions apply).<br><br>Want a check booked, or is yours failing now?`;
  }
  if (/phone|call|number|contact/.test(t)) {
    return `Call Sewer Squad 24/7 at <strong>${SEWER_SQUAD.phone}</strong> — or keep chatting with me and I’ll take your details for the team.`;
  }

  for (const faq of SEWER_SQUAD.faqs) {
    const keys = faq.q.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
    const hits = keys.filter((k) => t.includes(k)).length;
    if (hits >= 2) return `${faq.a}<br><br>Want me to book a visit or get you a quote?`;
  }

  for (const svc of SEWER_SQUAD.services) {
    const nameBits = svc.name.toLowerCase().split(/\W+/).filter(Boolean);
    if (nameBits.some((b) => b.length > 4 && t.includes(b)) || t.includes(svc.id)) {
      const note = "priceNote" in svc && svc.priceNote ? `<br><br>${svc.priceNote}` : "";
      return `<strong>${svc.name}</strong> — ${svc.blurb}${note}<br><br>I can get your details and have the Squad follow up. Emergency, quote, or booking?`;
    }
  }

  return null;
}

type QualifyQ = { key: keyof AvaLead; ask: string; suggestions: string[] };

function qualifyQuestions(intent: AvaIntent): QualifyQ[] {
  if (intent === "emergency") {
    return [
      {
        key: "problem",
        ask: "What’s happening right now — flood, sewage backup, burst pipe, no water, or something else?",
        suggestions: ["Sewage backup", "Burst pipe / flood", "No drains working", "Major leak"],
      },
      {
        key: "city",
        ask: "What city / neighbourhood are you in?",
        suggestions: ["Toronto", "Ajax", "Mississauga", "Hamilton"],
      },
      {
        key: "urgency",
        ask: "Is water actively flooding or can it wait a few hours?",
        suggestions: ["Flooding now", "Standing sewage", "Within a few hours", "Today"],
      },
      {
        key: "propertyType",
        ask: "House, condo, or commercial?",
        suggestions: ["House", "Condo", "Commercial"],
      },
    ];
  }
  if (intent === "booking") {
    return [
      {
        key: "problem",
        ask: "What do you need done — drain clear, leak, toilet, sump, camera, or other?",
        suggestions: ["$88 sewer clear + camera", "Toilet / clog", "Leak", "Sump pump"],
      },
      {
        key: "city",
        ask: "What city should we come to?",
        suggestions: ["Toronto", "Ajax", "Markham", "Brampton"],
      },
      {
        key: "preferredSlot",
        ask: "When works best — today, tomorrow morning, or later this week?",
        suggestions: ["Today", "Tomorrow morning", "This week", "Weekend"],
      },
      {
        key: "propertyType",
        ask: "House, condo, or commercial?",
        suggestions: ["House", "Condo", "Commercial"],
      },
    ];
  }
  // quote (+ question that converts)
  return [
    {
      key: "problem",
      ask: "What service are you looking to price — sewer clear, drain, leak, toilet, sump, or something else?",
      suggestions: ["$88 clear + camera", "Drain clog", "Leak repair", "Sump pump"],
    },
    {
      key: "city",
      ask: "Which city is the property in?",
      suggestions: ["Toronto", "Ajax", "Vaughan", "Oakville"],
    },
    {
      key: "urgency",
      ask: "How soon do you need this — ASAP, this week, or just planning ahead?",
      suggestions: ["ASAP", "This week", "Planning ahead"],
    },
    {
      key: "propertyType",
      ask: "House, condo, or commercial?",
      suggestions: ["House", "Condo", "Commercial"],
    },
  ];
}

function appendMsg(lead: AvaLead, role: "user" | "assistant", content: string) {
  lead.messages.push({
    role,
    content: stripHtml(content),
    at: new Date().toISOString(),
  });
}

function refreshRevenue(lead: AvaLead) {
  lead.estimatedRevenueCad = estimateRevenue({
    intent: lead.intent,
    problem: lead.problem,
    booked: lead.booked,
  });
}

async function maybeLlmFaq(
  text: string,
  locale: "en" | "fr",
  history: ChatMessage[]
): Promise<string | null> {
  void locale;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const system = `You are AVA, front-desk assistant for Sewer Squad (GTA plumbing & drains).
Answer in short HTML using <br> for line breaks. No markdown.
Use ONLY this business knowledge:\n${knowledgeContextBlock()}
Never invent prices. Phone is ${SEWER_SQUAD.phone}. After answering, invite quote / book / emergency.`;
    const res = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: "openai",
        temperature: 0.4,
        max_tokens: 420,
        messages: [
          { role: "system", content: system },
          ...history.slice(-8),
          { role: "user", content: text },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    if (raw.length < 20) return null;
    return raw
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\n{2,}/g, "<br><br>")
      .replace(/\n/g, "<br>");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function runAvaChatTurn(
  userText: string,
  locale: "en" | "fr",
  history: ChatMessage[],
  sessionIn?: AvaSession | null,
  opts?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<AvaChatTurn> {
  void opts;
  const text = userText.trim();
  let session = sessionIn || loadSession() || freshSession();
  const lead = session.lead;
  appendMsg(lead, "user", text);

  const suggest = (items: string[]): string[] => items.slice(0, 4);

  // ——— Stage: intent ———
  if (session.stage === "intent") {
    const intent = detectIntent(text);
    const quick = kbAnswer(text);

    if (intent === "question" || (!intent && quick)) {
      lead.intent = intent || "question";
      lead.status = "conversation";
      const answer =
        quick ||
        (await maybeLlmFaq(text, locale, history)) ||
        `Happy to help. Sewer Squad handles drains, leaks, toilets, sump pumps, sewer backups, and emergencies across the GTA — 24/7 at <strong>${SEWER_SQUAD.phone}</strong>.<br><br>Want a <strong>quote</strong>, to <strong>book</strong>, or is this an <strong>emergency</strong>?`;
      appendMsg(lead, "assistant", answer);
      refreshRevenue(lead);
      saveSession(session);
      return {
        reply: answer,
        suggestions: suggest(["Emergency help", "Get a quote", "Book a visit", "$88 clear + camera"]),
        source: quick ? "kb" : "ava",
        lead,
      };
    }

    if (!intent) {
      const reply = `No problem — are you looking for an <strong>emergency</strong>, a <strong>quote</strong>, to <strong>book</strong> a visit, or just have a <strong>question</strong>?`;
      appendMsg(lead, "assistant", reply);
      saveSession(session);
      return {
        reply,
        suggestions: suggest(["Emergency", "Get a quote", "Book a visit", "I have a question"]),
        source: "flow",
        lead,
      };
    }

    lead.intent = intent;
    lead.problem = lead.problem || text;
    const city = findCity(text);
    if (city) lead.city = city;

    if (intent === "emergency") {
      session.stage = "contact";
      session.contactField = "name";
      const reply = `Got it — we’ll treat this as an <strong>emergency</strong>. You can also call <strong>${SEWER_SQUAD.phone}</strong> now (24/7).<br><br>Meanwhile I’ll pass your details to the Squad. What’s your <strong>name</strong>?`;
      appendMsg(lead, "assistant", reply);
      saveSession(session);
      return {
        reply,
        suggestions: suggest(["Call 647-699-2212", "My name is…"]),
        source: "flow",
        lead,
      };
    }

    session.stage = "contact";
    session.contactField = "name";
    const label =
      intent === "booking" ? "booking" : intent === "quote" ? "quote" : "request";
    const reply = `Perfect — I’ll help with your <strong>${label}</strong>.<br><br>What’s your <strong>name</strong>?`;
    appendMsg(lead, "assistant", reply);
    saveSession(session);
    return {
      reply,
      suggestions: suggest(["Alex", "Sam", "Jordan"]),
      source: "flow",
      lead,
    };
  }

  // ——— Stage: contact ———
  if (session.stage === "contact") {
    const phone = extractPhone(text);
    const email = extractEmail(text);

    if (session.contactField === "name") {
      if (phone && !lead.phone) lead.phone = phone;
      if (email && !lead.email) lead.email = email;
      if (looksLikeName(text) || (!phone && !email && text.length >= 2)) {
        lead.name = text.replace(/^(my name is|i am|i'm|this is)\s+/i, "").trim();
      }
      if (!lead.name) {
        const reply = `Thanks — what name should the tech ask for?`;
        appendMsg(lead, "assistant", reply);
        saveSession(session);
        return { reply, suggestions: suggest(["Alex", "Sam"]), source: "flow", lead };
      }
      session.contactField = "phone";
      const reply = `Thanks, <strong>${lead.name}</strong>. What’s the best <strong>phone number</strong> (or email) to reach you?`;
      appendMsg(lead, "assistant", reply);
      lead.status = "lead";
      refreshRevenue(lead);
      saveSession(session);
      return {
        reply,
        suggestions: suggest(["647-555-0100", "email@example.com"]),
        source: "flow",
        lead,
      };
    }

    if (session.contactField === "phone") {
      if (phone) lead.phone = phone;
      if (email) lead.email = email;
      if (!lead.phone && !lead.email) {
        const reply = `I need a phone or email so the Squad can follow up — what’s best?`;
        appendMsg(lead, "assistant", reply);
        saveSession(session);
        return {
          reply,
          suggestions: suggest(["647-555-0100", "Use my email"]),
          source: "flow",
          lead,
        };
      }
      session.contactField = "done";
      session.stage = "qualify";
      session.qualifyIndex = 0;
      const qs = qualifyQuestions(lead.intent || "quote");
      const q0 = qs[0]!;
      const reply = `Great — I’ve got your contact. ${q0.ask}`;
      appendMsg(lead, "assistant", reply);
      refreshRevenue(lead);
      await sendLeadToBusiness(lead);
      saveSession(session);
      return { reply, suggestions: suggest(q0.suggestions), source: "flow", lead };
    }
  }

  // ——— Stage: qualify ———
  if (session.stage === "qualify") {
    const intent = lead.intent || "quote";
    const qs = qualifyQuestions(intent);
    const current = qs[session.qualifyIndex];
    if (current) {
      const city = findCity(text);
      if (current.key === "city" && city) lead.city = city;
      else if (current.key === "city") lead.city = text.trim();
      else if (current.key === "problem") lead.problem = text.trim();
      else if (current.key === "urgency") lead.urgency = text.trim();
      else if (current.key === "propertyType") lead.propertyType = text.trim();
      else if (current.key === "preferredSlot") lead.preferredSlot = text.trim();
      else {
        lead.notes.push(`${String(current.key)}: ${text.trim()}`);
      }
    }

    session.qualifyIndex += 1;
    if (session.qualifyIndex < qs.length && session.qualifyIndex < 4) {
      const next = qs[session.qualifyIndex]!;
      lead.status = "qualified";
      refreshRevenue(lead);
      const reply = next.ask;
      appendMsg(lead, "assistant", reply);
      await sendLeadToBusiness(lead);
      saveSession(session);
      return { reply, suggestions: suggest(next.suggestions), source: "flow", lead };
    }

    lead.status = "qualified";
    refreshRevenue(lead);
    session.stage = "schedule";
    const reply =
      intent === "emergency"
        ? `Thanks — I’ve flagged this for the Squad. Prefer a <strong>callback ASAP</strong>, or should we aim for a <strong>same-day visit</strong>? You can also call <strong>${SEWER_SQUAD.phone}</strong> now.`
        : `Thanks — you’re qualified. Want me to <strong>schedule a call</strong> or book an <strong>appointment window</strong>?`;
    appendMsg(lead, "assistant", reply);
    await sendLeadToBusiness(lead);
    saveSession(session);
    return {
      reply,
      suggestions: suggest(
        intent === "emergency"
          ? ["Callback ASAP", "Same-day visit", `Call ${SEWER_SQUAD.phone}`]
          : ["Schedule a call", "Book appointment", "Morning visit", "Afternoon visit"]
      ),
      source: "flow",
      lead,
    };
  }

  // ——— Stage: schedule ———
  if (session.stage === "schedule") {
    lead.preferredSlot = lead.preferredSlot || text.trim();
    lead.booked = true;
    lead.status = "booking";
    refreshRevenue(lead);
    session.stage = "done";
    const reply = `You’re all set, <strong>${lead.name || "there"}</strong>. I’ve sent your lead to <strong>Sewer Squad</strong> — estimated pipeline value ~$${lead.estimatedRevenueCad.toLocaleString("en-CA")}.<br><br>A real human will follow up${
      lead.preferredSlot ? ` (${lead.preferredSlot})` : ""
    }. For immediate help: <strong>${SEWER_SQUAD.phone}</strong>.<br><br>Anything else I can help with?`;
    appendMsg(lead, "assistant", reply);
    await sendLeadToBusiness(lead);
    saveSession(session);
    return {
      reply,
      suggestions: suggest(["That’s all, thanks", "Another question", "$88 clear details"]),
      source: "flow",
      lead,
    };
  }

  // ——— Stage: done — free Q&A, can start new ———
  if (/^(new|start over|another (job|request)|reset)/i.test(text)) {
    session = freshSession();
    const reply = `Hi, how can we help? Emergency, quote, booking, or a quick question?`;
    appendMsg(session.lead, "assistant", reply);
    saveSession(session);
    return {
      reply,
      suggestions: suggest(["Emergency", "Get a quote", "Book a visit", "Hours & areas"]),
      source: "flow",
      lead: session.lead,
    };
  }

  const more =
    kbAnswer(text) ||
    (await maybeLlmFaq(text, locale, history)) ||
    `I can help with another question, or start a new quote/booking. For the Squad direct: <strong>${SEWER_SQUAD.phone}</strong>.`;
  appendMsg(lead, "assistant", more);
  saveSession(session);
  return {
    reply: more,
    suggestions: suggest(["Start a new request", "Call 647-699-2212", "Service areas", "Pricing"]),
    source: "kb",
    lead,
  };
}

export function offlineAvaReply(
  text: string,
  locale: "en" | "fr",
  history: ChatMessage[]
): AvaChatTurn {
  // Sync fallback used if async path throws
  const session = loadSession() || freshSession();
  void locale;
  void history;
  const quick = kbAnswer(text);
  const reply =
    quick ||
    `Hi — I’m AVA with Sewer Squad. Tell me if this is an emergency, quote, booking, or question. Or call <strong>${SEWER_SQUAD.phone}</strong> 24/7.`;
  appendMsg(session.lead, "user", text);
  appendMsg(session.lead, "assistant", reply);
  saveSession(session);
  return {
    reply,
    suggestions: ["Emergency", "Get a quote", "Book a visit", "Hours"],
    source: "offline",
    lead: session.lead,
  };
}

export function avaGreetingHtml(): string {
  return `Hi, how can we help?<br><br>I’m <strong>AVA</strong> for <strong>Sewer Squad</strong> — plumbing & drains across the GTA, 24/7. Emergency, quote, booking, or a quick question?`;
}
