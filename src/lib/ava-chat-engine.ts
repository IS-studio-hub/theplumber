/**
 * Robby chat engine for Sewer Squad.
 * Human-like multi-turn booking: harvest every field from each message,
 * acknowledge what’s known, ask only for gaps, confirm price + appointment,
 * then sync the full lead to the shared dashboard store.
 */

import {
  applyServiceToLead,
  createLeadDraft,
  estimateRevenue,
  formatLeadSummary,
  makeConfirmationCode,
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
  stage: "intent" | "collect" | "confirm" | "done";
  /** Soft reminder of last asked field. Never blocks accepting other fields */
  askFor: CollectField | null;
};

type CollectField =
  | "name"
  | "phone"
  | "email"
  | "city"
  | "address"
  | "problem"
  | "slot"
  | "propertyType"
  | "urgency";

const SESSION_KEY = "ava.sewersquad.session.v2";

export function loadSession(): AvaSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      const legacy = sessionStorage.getItem("ava.sewersquad.session.v1");
      if (!legacy) return null;
      const old = JSON.parse(legacy) as {
        lead?: AvaLead;
        stage?: string;
        contactField?: string;
      };
      if (!old?.lead) return null;
      const stage: AvaSession["stage"] =
        old.stage === "done"
          ? "done"
          : old.stage === "schedule"
            ? "confirm"
            : old.stage === "intent"
              ? "intent"
              : "collect";
      return { lead: old.lead, stage, askFor: "name" };
    }
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
    askFor: null,
  };
}

function stripHtml(s: string): string {
  return s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
}

function suggest(items: string[]): string[] {
  return items.filter(Boolean).slice(0, 4);
}

function appendMsg(lead: AvaLead, role: "user" | "assistant", content: string) {
  lead.messages.push({
    role,
    content: stripHtml(content),
    at: new Date().toISOString(),
  });
  // Keep transcript bounded
  if (lead.messages.length > 80) {
    lead.messages = lead.messages.slice(-80);
  }
}

function refreshPricing(lead: AvaLead) {
  if (lead.problem || lead.serviceId) {
    applyServiceToLead(lead, `${lead.problem} ${lead.serviceName}`);
  }
  lead.estimatedRevenueCad = estimateRevenue({
    intent: lead.intent,
    problem: lead.problem,
    serviceId: lead.serviceId,
    quotedPriceCad: lead.quotedPriceCad,
    booked: lead.booked,
  });
}

function detectIntent(text: string): AvaIntent | null {
  const t = text.toLowerCase();
  if (
    /emergenc|asap|right now|flood|burst|sewage|backup|overflow|can.?t wait|urgent|24\/7|help now|standing water/.test(
      t
    )
  ) {
    return "emergency";
  }
  if (/book|appoint|schedul|come out|send (a )?tech|technician|visit|come by/.test(t)) {
    return "booking";
  }
  if (/quote|estimat|how much|price|cost|\$88|promo|coupon|offer|how much would/.test(t)) {
    return "quote";
  }
  if (
    /hour|open|area|service|do you|can you|where|faq|sump|toilet|drain|leak|camera|lead pipe|after.?hours|what.?s included|payment plan/.test(
      t
    )
  ) {
    return "question";
  }
  if (
    /clog|toilet|leak|sump|sewer|drain|pipe|flood|backup|camera|softener/.test(t) &&
    t.length > 12
  ) {
    return "booking";
  }
  return null;
}

function extractPhone(text: string): string {
  const m = text
    .replace(/\s+/g, " ")
    .match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  return m ? m[0].trim() : "";
}

function extractEmail(text: string): string {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : "";
}

const SLOT_WORDS =
  /today|tomorrow|asap|morning|afternoon|evening|week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|am\b|pm\b|same.?day|schedul|appoint/;

function looksLikeName(text: string): boolean {
  const t = text.trim();
  if (extractPhone(t) || extractEmail(t)) return false;
  if (t.length < 2 || t.length > 60) return false;
  if (
    /^(yes|no|ok|okay|sure|hi|hello|hey|thanks|thank you|yep|yeah|please|house|condo|commercial|skip)\b/i.test(
      t
    )
  )
    return false;
  if (SLOT_WORDS.test(t.toLowerCase())) return false;
  if (/clog|toilet|leak|sump|sewer|drain|pipe|flood|backup|camera|\$/.test(t.toLowerCase()))
    return false;
  if (findCity(t)) return false;
  if (/^\d/.test(t)) return false;
  return /^[a-zA-Z][a-zA-Z\s.'-]{1,58}$/.test(t);
}

function findCity(text: string): string {
  const lower = text.toLowerCase();
  // Longer city names first to avoid partials
  const cities = [...SEWER_SQUAD.serviceAreas].sort((a, b) => b.length - a.length);
  for (const city of cities) {
    if (lower.includes(city.toLowerCase())) return city;
  }
  return "";
}

function extractAddress(text: string): string {
  const t = text.trim();
  if (
    /\d{1,5}\s+[A-Za-z]/.test(t) &&
    /st|street|ave|avenue|rd|road|blvd|dr|drive|cres|court|unit|#|way|lane|ln\b/i.test(t)
  ) {
    return t
      .replace(/^(my address is|address is|i live at|we.?re at|at)\s+/i, "")
      .trim();
  }
  if (/^(unit|apt|suite)\s*\d+/i.test(t)) return t;
  return "";
}

function extractSlot(text: string): { preferred: string; window: string; dateIso: string } {
  const t = text.toLowerCase();
  const preferred = text.trim();
  let window = "";
  let dateIso = "";

  const now = new Date();
  if (/today|asap|right now|as soon|same.?day|immediately/.test(t)) {
    window = /morning/.test(t)
      ? "morning"
      : /afternoon/.test(t)
        ? "afternoon"
        : /evening/.test(t)
          ? "evening"
          : "same-day";
    dateIso = now.toISOString().slice(0, 10);
  } else if (/tomorrow/.test(t)) {
    const d = new Date(now.getTime() + 86_400_000);
    dateIso = d.toISOString().slice(0, 10);
    window = /morning/.test(t)
      ? "morning"
      : /afternoon/.test(t)
        ? "afternoon"
        : /evening/.test(t)
          ? "evening"
          : "flexible";
  } else if (/weekend|saturday|sunday/.test(t)) {
    window = "weekend";
  } else if (/this week|weekday|monday|tuesday|wednesday|thursday|friday/.test(t)) {
    window = "this week";
  } else if (/morning|afternoon|evening|am\b|pm\b/.test(t)) {
    window = /morning|am\b/.test(t)
      ? "morning"
      : /afternoon|pm\b/.test(t)
        ? "afternoon"
        : "evening";
  }

  const isSlot =
    SLOT_WORDS.test(t) ||
    /book|visit|come/.test(t) ||
    Boolean(window);

  if (!isSlot && preferred.length > 40) {
    return { preferred: "", window: "", dateIso: "" };
  }
  return {
    preferred: isSlot ? preferred : "",
    window,
    dateIso,
  };
}

function extractProperty(text: string): string {
  const t = text.toLowerCase();
  if (/condo|apartment|apt\b/.test(t)) return "condo";
  if (/commercial|restaurant|office|warehouse|business/.test(t)) return "commercial";
  if (/house|home|detached|townhouse|bungalow|residential/.test(t)) return "house";
  return "";
}

function extractUrgency(text: string): string {
  const t = text.toLowerCase();
  if (/flood|standing|actively|right now|asap|emergency|overflow/.test(t)) return "now";
  if (/today|same.?day|few hours/.test(t)) return "today";
  if (/this week|soon/.test(t)) return "this week";
  if (/planning|no rush|whenever|flexible/.test(t)) return "planning";
  return "";
}

function extractProblemSnippet(text: string): string {
  const t = text.trim();
  const lower = t.toLowerCase();
  if (
    !/clog|toilet|leak|sump|sewer|drain|pipe|flood|backup|camera|softener|plumbing|\$88|clear|running|overflow|root|jet|hydro/.test(
      lower
    )
  ) {
    return "";
  }
  // Prefer a focused clause if the message is compound
  const clauses = t.split(/[,.]|\band\b|\balso\b/i).map((c) => c.trim()).filter(Boolean);
  const hit = clauses.find((c) =>
    /clog|toilet|leak|sump|sewer|drain|pipe|flood|backup|camera|softener|\$88|clear/.test(
      c.toLowerCase()
    )
  );
  const raw = (hit || t)
    .replace(
      /(?:my name is|i am|i'm|this is|name'?s)\s+[A-Za-z][A-Za-z\s.'-]{1,40}/gi,
      ""
    )
    .replace(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(
      /\b(in|at|near)\s+(Toronto|Ajax|Mississauga|Markham|Hamilton|Vaughan|Brampton|Scarborough|Oakville|Oshawa|Pickering|Whitby|North York|East York|Etobicoke|Newmarket|Richmond Hill|Barrie|Burlington|Aurora|Georgina|Courtice|Cobourg|Peterborough)\b/gi,
      ""
    )
    .replace(
      /\b(today|tomorrow|asap|this week|weekend|morning|afternoon|evening|same.?day)\b/gi,
      ""
    )
    .replace(/^(i (need|have|want)|we (need|have)|looking for|please|hi|hello|hey)\s+/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return raw.length > 3 ? raw : t;
}

/** Snapshot of which fields were empty before harvest, for natural acks. */
function emptyKeys(lead: AvaLead): Set<string> {
  const s = new Set<string>();
  if (!lead.name) s.add("name");
  if (!lead.phone) s.add("phone");
  if (!lead.email) s.add("email");
  if (!lead.city) s.add("city");
  if (!lead.address) s.add("address");
  if (!lead.problem && !lead.serviceId) s.add("problem");
  if (!lead.preferredSlot && !lead.appointmentWindow) s.add("slot");
  if (!lead.propertyType) s.add("property");
  if (!lead.urgency) s.add("urgency");
  return s;
}

function acknowledgeCaptured(lead: AvaLead, before: Set<string>): string {
  const bits: string[] = [];
  if (before.has("name") && lead.name) bits.push(`thanks <strong>${lead.name}</strong>`);
  if (before.has("problem") && (lead.serviceName || lead.problem)) {
    bits.push(`noted <strong>${lead.serviceName || lead.problem}</strong>`);
  }
  if (before.has("city") && lead.city) bits.push(`in <strong>${lead.city}</strong>`);
  if (before.has("slot") && (lead.preferredSlot || lead.appointmentWindow)) {
    bits.push(`for <strong>${lead.preferredSlot || lead.appointmentWindow}</strong>`);
  }
  if (before.has("phone") && lead.phone) bits.push(`got your number`);
  if (before.has("email") && lead.email && !lead.phone) bits.push(`got your email`);
  if (before.has("address") && lead.address) bits.push(`address saved`);
  if (before.has("property") && lead.propertyType) bits.push(`${lead.propertyType}`);
  if (before.has("urgency") && lead.urgency) bits.push(`urgency: ${lead.urgency}`);
  if (!bits.length) return "";
  if (bits.length === 1) return `${bits[0]!.charAt(0).toUpperCase()}${bits[0]!.slice(1)}. `;
  const last = bits.pop()!;
  return `${bits.join(", ")}, and ${last}. `;
}

/** Pull every field we can from a single user message. */
function harvestFields(lead: AvaLead, text: string, askFor: CollectField | null): void {
  const phone = extractPhone(text);
  const email = extractEmail(text);
  const city = findCity(text);
  const address = extractAddress(text);
  const property = extractProperty(text);
  const urgency = extractUrgency(text);
  const slot = extractSlot(text);
  const problemBit = extractProblemSnippet(text);

  if (phone) lead.phone = phone;
  if (email) lead.email = email;
  if (city) lead.city = city;
  if (address) lead.address = address;
  if (property) lead.propertyType = property;
  if (urgency) lead.urgency = urgency;
  if (slot.preferred) {
    lead.preferredSlot = slot.preferred;
    if (slot.window) lead.appointmentWindow = slot.window;
    if (slot.dateIso) lead.appointmentDate = slot.dateIso;
  }

  const nameMatch = text.match(
    /(?:my name is|i am|i'm|this is|name'?s|call me)\s+([A-Za-z][A-Za-z\s.'-]{1,40})/i
  );
  if (nameMatch?.[1]) {
    lead.name = nameMatch[1].trim().replace(/\s+(and|in|from|at|,).*$/i, "").trim();
  } else if (askFor === "name" && looksLikeName(text)) {
    lead.name = text.trim();
  } else if (
    !lead.name &&
    looksLikeName(text) &&
    !city &&
    !slot.preferred &&
    !problemBit &&
    !phone
  ) {
    lead.name = text.trim();
  }

  if (askFor === "city" && !city && text.trim().length < 40 && !phone && !email) {
    const cleaned = text.trim().replace(/^(i'?m in|we'?re in|in)\s+/i, "");
    if (!SLOT_WORDS.test(cleaned.toLowerCase())) lead.city = cleaned;
  }

  if (askFor === "address" && !address && text.trim().length > 5 && !phone) {
    if (!/skip|later|n\/a/i.test(text)) {
      lead.address = text.replace(/^(my address is|address is)\s+/i, "").trim();
    }
  }

  if (problemBit) {
    if (
      !lead.problem ||
      askFor === "problem" ||
      problemBit.length > lead.problem.length ||
      (!lead.serviceId && problemBit)
    ) {
      lead.problem = problemBit;
    }
    applyServiceToLead(lead, lead.problem);
  } else if (askFor === "problem" && text.trim().length > 3) {
    lead.problem = text
      .replace(/^(i (need|have|want)|we (need|have)|looking for|please)\s+/i, "")
      .trim();
    applyServiceToLead(lead, lead.problem);
  }

  if (askFor === "slot" && text.trim()) {
    lead.preferredSlot = text.trim();
    const s = extractSlot(text);
    if (s.window) lead.appointmentWindow = s.window;
    if (s.dateIso) lead.appointmentDate = s.dateIso;
  }

  if (askFor === "propertyType" && text.trim()) {
    lead.propertyType = extractProperty(text) || text.trim();
  }

  if (askFor === "urgency" && text.trim()) {
    lead.urgency = extractUrgency(text) || text.trim();
  }

  // Contact when asking for phone but they gave email
  if (askFor === "phone" && email && !phone) {
    lead.email = email;
  }

  refreshPricing(lead);
}

function missingFields(lead: AvaLead): CollectField[] {
  const need: CollectField[] = [];
  if (!lead.name) need.push("name");
  if (!lead.phone && !lead.email) need.push("phone");
  if (!lead.problem && !lead.serviceId) need.push("problem");
  if (!lead.city) need.push("city");
  if (lead.intent === "emergency") {
    if (!lead.urgency) need.push("urgency");
  } else {
    if (!lead.preferredSlot && !lead.appointmentWindow) need.push("slot");
  }
  // Soft optional, only after core fields (skip if user deferred)
  const coreDone =
    Boolean(lead.name) &&
    Boolean(lead.phone || lead.email) &&
    Boolean(lead.problem || lead.serviceId) &&
    Boolean(lead.city) &&
    (lead.intent === "emergency"
      ? Boolean(lead.urgency)
      : Boolean(lead.preferredSlot || lead.appointmentWindow));
  const addressDeferred = lead.notes.some((n) => /address deferred/i.test(n));
  if (coreDone && !lead.address && !addressDeferred) need.push("address");
  // propertyType is harvested when volunteered. Never blocks booking
  return need;
}

function askPrompt(field: CollectField, lead: AvaLead): { ask: string; suggestions: string[] } {
  switch (field) {
    case "name":
      return {
        ask: `Who should we put this under? What’s your <strong>name</strong>?`,
        suggestions: ["Alex", "Sam", "Jordan"],
      };
    case "phone":
      return {
        ask: `${lead.name ? `<strong>${lead.name}</strong>, ` : ""}best <strong>phone number</strong> (or email) so the tech can reach you?`,
        suggestions: ["647-555-0100", "I’ll use email"],
      };
    case "email":
      return {
        ask: `What’s a good <strong>email</strong>?`,
        suggestions: ["name@email.com"],
      };
    case "problem":
      return {
        ask: `What are we fixing? Drain, toilet, leak, sump, sewer backup, or the <strong>$88 clear + camera</strong>?`,
        suggestions: [
          "$88 sewer clear + camera",
          "Sewage backup",
          "Kitchen drain clog",
          "Sump pump check",
        ],
      };
    case "city":
      return {
        ask: `Which <strong>city</strong> should we come to?`,
        suggestions: ["Toronto", "Ajax", "Mississauga", "Hamilton"],
      };
    case "address":
      return {
        ask: `${lead.city ? `In ${lead.city}. ` : ""}Street <strong>address</strong>? Optional, but it helps the tech. Or say skip.`,
        suggestions: ["Skip for now", "I’ll text it later"],
      };
    case "slot":
      return {
        ask: `When works best? <strong>Today</strong>, <strong>tomorrow morning</strong>, or later this week?`,
        suggestions: ["Today", "Tomorrow morning", "This week", "Weekend"],
      };
    case "propertyType":
      return {
        ask: `Is it a <strong>house</strong>, <strong>condo</strong>, or <strong>commercial</strong> spot?`,
        suggestions: ["House", "Condo", "Commercial"],
      };
    case "urgency":
      return {
        ask: `Is water <strong>actively flooding</strong>, or can it wait a few hours?`,
        suggestions: ["Flooding now", "Standing sewage", "Within a few hours", "Today"],
      };
  }
}

function priceLine(lead: AvaLead): string {
  if (lead.quotedPriceCad === 88) {
    return `<strong>$88 + HST</strong> for one main sewer line clear + camera (residential; conditions apply). Extra work quoted upfront.`;
  }
  if (lead.quotedPriceCad === 149 && /sump/i.test(lead.serviceName || lead.problem)) {
    return `<strong>$149</strong> sump pump check (residential promo; conditions apply).`;
  }
  if (lead.quotedPriceCad > 0) {
    return `Typical range around <strong>$${lead.quotedPriceCad.toLocaleString("en-CA")}</strong>. Exact price is quoted <em>before</em> any work.`;
  }
  return `You’ll get <strong>upfront pricing</strong> before any work begins. No surprise bills.`;
}

function confirmationHtml(lead: AvaLead): string {
  const when =
    lead.preferredSlot ||
    lead.appointmentWindow ||
    (lead.intent === "emergency" ? "ASAP / same-day priority" : "TBD");
  const svc = lead.serviceName || lead.problem || "Plumbing visit";
  const dateBit = lead.appointmentDate
    ? ` (${new Date(lead.appointmentDate + "T12:00:00").toLocaleDateString("en-CA", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })})`
    : "";
  return [
    `Here’s everything I’ve got. Does this look right?`,
    ``,
    `<strong>${lead.name}</strong> · ${lead.phone || lead.email}`,
    `${lead.address ? `${lead.address}, ` : ""}${lead.city || "GTA"}`,
    `<strong>${svc}</strong>${lead.propertyType ? ` · ${lead.propertyType}` : ""}`,
    `When: <strong>${when}</strong>${dateBit}`,
    priceLine(lead),
    ``,
    `Reply <strong>yes</strong> to lock it in (it’ll show on the Robby dashboard), or tell me what to change.`,
  ].join("<br>");
}

function bookedHtml(lead: AvaLead): string {
  const when = lead.preferredSlot || lead.appointmentWindow || "as discussed";
  return [
    `You’re booked, <strong>${lead.name || "there"}</strong>. Confirmation <strong>${lead.confirmationCode}</strong>.`,
    ``,
    `Saved to the Squad dashboard:`,
    formatLeadSummary(lead).replace(/ · /g, "<br>"),
    ``,
    `A real human from Sewer Squad will follow up about <strong>${when}</strong>. For immediate help call <strong>${SEWER_SQUAD.phone}</strong> (24/7).`,
    ``,
    `Anything else I can help with?`,
  ].join("<br>");
}

function kbAnswer(text: string): string | null {
  const t = text.toLowerCase();

  if (/\$\s*88|88\s*(dollar|clear|sewer)|sewer line clear|camera inspection/.test(t)) {
    return `Our everyday <strong>$88 sewer line clear + camera</strong> covers clearing <em>one</em> main sewer line and inspecting it with a camera (+ HST). Residential; conditions apply. If it’s beyond the main line, we quote options before more work.<br><br>Want me to get that booked for you?`;
  }
  if (/hour|open|24|after.?hours|weekend|overtime/.test(t)) {
    return `${SEWER_SQUAD.hours}<br><br>Call <strong>${SEWER_SQUAD.phone}</strong> anytime. Real humans answer.`;
  }
  if (
    /service area/.test(t) ||
    ((/where|area|serve|gta|neighbourhood|neighborhood/.test(t) ||
      /toronto|ajax|mississauga|hamilton|markham|vaughan/.test(t)) &&
      /area|serve|near|city|live|cover/.test(t))
  ) {
    return `We’re across the GTA, from Durham to Peel and beyond (Toronto, Ajax, Mississauga, Markham, Hamilton, Vaughan, and more).<br><br>Ajax: ${SEWER_SQUAD.addresses[0].line}<br>Hamilton: ${SEWER_SQUAD.addresses[1].line}<br><br>What city are you in? I can start a booking.`;
  }
  if (/price|cost|how much|pricing|upfront|fee/.test(t)) {
    return `We do <strong>upfront pricing</strong>, so you’ll know the cost before we start. No after-hours fees. Popular options: <strong>$88 main sewer clear + camera</strong> (+ HST), <strong>$149 sump pump check</strong>, and $25 off plumbing/drain repair (conditions apply).<br><br>Tell me what’s going on and I’ll quote what’s listed and book you in.`;
  }
  if (/sump/.test(t)) {
    return `Sump pumps: installs, repairs, and backups. Current promo: <strong>$149 sump pump check</strong> (residential; conditions apply).<br><br>Want that check booked, or is yours failing now?`;
  }
  if (/payment plan|financ/.test(t)) {
    return `Yes, <strong>payment plans</strong> are available. The tech can walk you through options on site after an upfront quote.<br><br>Want to book a visit?`;
  }
  if (/boot|clean|mess|shoe/.test(t)) {
    return `We wear booties, clean up after ourselves, and treat your home like our own. That’s just how Sewer Squad shows up.<br><br>Need a visit booked?`;
  }
  if (/phone|call|number|contact/.test(t)) {
    return `Call Sewer Squad 24/7 at <strong>${SEWER_SQUAD.phone}</strong>, or keep chatting and I’ll take your details for the team.`;
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
      return `<strong>${svc.name}</strong>. ${svc.blurb}${note}<br><br>I can book that or get your details for a callback. Emergency, quote, or booking?`;
    }
  }

  return null;
}

async function maybeLlmFaq(
  text: string,
  locale: "en" | "fr",
  history: ChatMessage[],
  lead: AvaLead
): Promise<string | null> {
  void locale;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const known = formatLeadSummary(lead);
    const system = `You are Robby, a warm, sharp front-desk assistant for Sewer Squad (GTA plumbing & drains).
Speak naturally like a helpful human dispatcher. Short, clear, never robotic or salesy.
Answer in short HTML using <br> for line breaks. No markdown fences. Never use em dashes. Prefer commas, periods, or short sentences.
Use ONLY this business knowledge:\n${knowledgeContextBlock()}
Never invent prices beyond what's listed. Phone is ${SEWER_SQUAD.phone}.
What we already know about this customer: ${known || "(nothing yet)"}.
After answering, invite quote / book / emergency when it fits. Don't re-ask for info we already have.
If they already shared a problem, acknowledge it by name.`;
    const res = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: "openai",
        temperature: 0.55,
        max_tokens: 420,
        messages: [
          { role: "system", content: system },
          ...history.slice(-10),
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
      .replace(/\u2014/g, ". ")
      .replace(/\u2013/g, "-")
      .replace(/\n{2,}/g, "<br><br>")
      .replace(/\n/g, "<br>");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isAffirmative(text: string): boolean {
  return /^(yes|yep|yeah|yup|sure|ok|okay|correct|sounds good|looks good|confirm|book it|lock it|please|go ahead|that'?s right|absolutely|perfect|do it)\b/i.test(
    text.trim()
  );
}

function isNegative(text: string): boolean {
  return /^(no|nope|wrong|change|fix|incorrect|wait)/i.test(text.trim());
}

function advanceCollect(session: AvaSession, ack = ""): AvaChatTurn {
  const lead = session.lead;
  const missing = missingFields(lead);
  const coreMissing = missing.filter((f) => f !== "address" && f !== "propertyType");

  if (lead.name && (lead.phone || lead.email)) {
    lead.status = lead.status === "conversation" ? "lead" : lead.status;
  }

  if (coreMissing.length === 0 && (lead.problem || lead.serviceId)) {
    // Soft-ask address once, then confirm
    if (missing.includes("address") && session.askFor !== "address") {
      session.askFor = "address";
      lead.status = "qualified";
      refreshPricing(lead);
      const { ask, suggestions } = askPrompt("address", lead);
      const reply = `${ack}${ask}`;
      appendMsg(lead, "assistant", reply);
      void sendLeadToBusiness(lead);
      saveSession(session);
      return { reply, suggestions: suggest(suggestions), source: "flow", lead };
    }

    lead.status = "qualified";
    refreshPricing(lead);
    session.stage = "confirm";
    session.askFor = null;
    const reply = `${ack}${confirmationHtml(lead)}`;
    appendMsg(lead, "assistant", reply);
    void sendLeadToBusiness(lead);
    saveSession(session);
    return {
      reply,
      suggestions: suggest([
        "Yes, book it",
        "Change the time",
        "Change the address",
        "Call instead",
      ]),
      source: "flow",
      lead,
    };
  }

  const next =
    coreMissing[0] ||
    (missing.includes("address") ? "address" : missing[0]) ||
    "slot";
  session.askFor = next;
  lead.status =
    lead.name && (lead.phone || lead.email)
      ? lead.problem || lead.serviceId
        ? "qualified"
        : "lead"
      : lead.status;
  refreshPricing(lead);
  const { ask, suggestions } = askPrompt(next, lead);

  let bridge = ack;
  if (!bridge && lead.serviceName && next !== "problem" && lead.quotedPriceCad > 0) {
    if (lead.quotedPriceCad === 88 || lead.quotedPriceCad === 149) {
      bridge = `That’s listed at <strong>$${lead.quotedPriceCad}</strong> for ${lead.serviceName}. `;
    }
  }

  const reply = `${bridge}${ask}`;
  appendMsg(lead, "assistant", reply);
  void sendLeadToBusiness(lead);
  saveSession(session);
  return { reply, suggestions: suggest(suggestions), source: "flow", lead };
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
  if (
    (session.stage as string) === "contact" ||
    (session.stage as string) === "qualify" ||
    (session.stage as string) === "schedule"
  ) {
    session.stage = "collect";
  }
  const lead = session.lead;
  appendMsg(lead, "user", text);

  // --- Stage: intent ---
  if (session.stage === "intent") {
    const intent = detectIntent(text);
    const quick = kbAnswer(text);

    if (intent === "question" || (!intent && quick)) {
      lead.intent = intent || "question";
      lead.status = "conversation";
      const before = emptyKeys(lead);
      harvestFields(lead, text, null);
      const ack = acknowledgeCaptured(lead, before);
      // If they dumped booking details inside a question, start collecting
      if (lead.name && (lead.phone || lead.email) && (lead.problem || lead.serviceId)) {
        lead.intent = lead.intent === "question" ? "booking" : lead.intent;
        session.stage = "collect";
        return advanceCollect(session, ack);
      }
      const answer =
        quick ||
        (await maybeLlmFaq(text, locale, history, lead)) ||
        `Happy to help. Sewer Squad handles drains, leaks, toilets, sump pumps, sewer backups, and emergencies across the GTA. Call 24/7 at <strong>${SEWER_SQUAD.phone}</strong>.<br><br>Want a <strong>quote</strong>, to <strong>book</strong>, or is this an <strong>emergency</strong>?`;
      const reply = ack ? `${ack}${answer}` : answer;
      appendMsg(lead, "assistant", reply);
      refreshPricing(lead);
      saveSession(session);
      return {
        reply,
        suggestions: suggest([
          "Emergency help",
          "Get a quote",
          "Book a visit",
          "$88 clear + camera",
        ]),
        source: quick ? "kb" : "ava",
        lead,
      };
    }

    if (!intent) {
      const reply = `No problem. Are you looking for an <strong>emergency</strong>, a <strong>quote</strong>, to <strong>book</strong> a visit, or just have a <strong>question</strong>?`;
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
    const before = emptyKeys(lead);
    harvestFields(lead, text, null);
    if (!lead.problem) {
      const snip = extractProblemSnippet(text);
      if (snip) {
        lead.problem = snip;
        applyServiceToLead(lead, snip);
      } else if (!lead.serviceId) {
        lead.problem = text;
        applyServiceToLead(lead, text);
      }
    }
    const ack = acknowledgeCaptured(lead, before);

    if (intent === "emergency") {
      session.stage = "collect";
      if (lead.name && (lead.phone || lead.email) && lead.city) {
        return advanceCollect(session, ack);
      }
      const reply = `${ack}Treating this as an <strong>emergency</strong>. You can also call <strong>${SEWER_SQUAD.phone}</strong> right now (24/7).<br><br>${
        lead.name
          ? askPrompt(missingFields(lead)[0] || "phone", lead).ask
          : `What’s your <strong>name</strong>?`
      }`;
      session.askFor = lead.name ? missingFields(lead)[0] || "phone" : "name";
      appendMsg(lead, "assistant", reply);
      refreshPricing(lead);
      saveSession(session);
      return {
        reply,
        suggestions: suggest([`Call ${SEWER_SQUAD.phone}`, "My name is…"]),
        source: "flow",
        lead,
      };
    }

    session.stage = "collect";
    if (lead.name && (lead.phone || lead.email) && (lead.problem || lead.serviceId) && lead.city) {
      return advanceCollect(session, ack);
    }

    const label =
      intent === "booking" ? "booking" : intent === "quote" ? "quote" : "request";
    const opener = lead.serviceName
      ? `Perfect. I’ll get your <strong>${lead.serviceName}</strong> ${label} started.`
      : `Perfect. I’ll help with your <strong>${label}</strong>.`;

    if (!lead.name) {
      session.askFor = "name";
      const reply = `${ack || ""}${opener}<br><br>What’s your <strong>name</strong>?`;
      appendMsg(lead, "assistant", reply);
      saveSession(session);
      return {
        reply,
        suggestions: suggest(["Alex", "Sam", "Jordan"]),
        source: "flow",
        lead,
      };
    }
    return advanceCollect(session, ack || `${opener} `);
  }

  // --- Stage: collect ---
  if (session.stage === "collect") {
    const midFaq =
      /how much|what.?s included|hours|after.?hours|do you (offer|serve)|payment plan|booties|clean up/i.test(
        text
      ) &&
      !extractPhone(text) &&
      session.askFor !== "problem";
    if (midFaq) {
      const quick = kbAnswer(text);
      if (quick) {
        const next = missingFields(lead).filter(
          (f) => f !== "address" && f !== "propertyType"
        )[0] || missingFields(lead)[0];
        const follow = next ? `<br><br>${askPrompt(next, lead).ask}` : "";
        if (next) session.askFor = next;
        const reply = `${quick}${follow}`;
        appendMsg(lead, "assistant", reply);
        saveSession(session);
        return {
          reply,
          suggestions: suggest(
            next ? askPrompt(next, lead).suggestions : ["Continue booking", "Yes, book it"]
          ),
          source: "kb",
          lead,
        };
      }
    }

    if (
      session.askFor === "address" &&
      /skip|later|no thanks|don'?t have|text it|n\/a|pass/i.test(text)
    ) {
      lead.notes.push("Address deferred");
      session.askFor = null;
      return advanceCollect(session, "No problem. We can grab the address later. ");
    }

    if (
      session.askFor === "propertyType" &&
      /skip|later|n\/a|pass|don'?t know/i.test(text)
    ) {
      lead.notes.push("Property type deferred");
      session.askFor = null;
      return advanceCollect(session, "All good. ");
    }

    const before = emptyKeys(lead);
    harvestFields(lead, text, session.askFor);
    const ack = acknowledgeCaptured(lead, before);
    return advanceCollect(session, ack);
  }

  // --- Stage: confirm ---
  if (session.stage === "confirm") {
    if (isAffirmative(text)) {
      lead.booked = true;
      lead.status = "booking";
      if (!lead.confirmationCode) lead.confirmationCode = makeConfirmationCode();
      if (!lead.preferredSlot && lead.intent === "emergency") {
        lead.preferredSlot = "ASAP / same-day";
        lead.appointmentWindow = "same-day";
        lead.urgency = lead.urgency || "now";
      }
      if (!lead.appointmentDate && lead.appointmentWindow === "same-day") {
        lead.appointmentDate = new Date().toISOString().slice(0, 10);
      }
      refreshPricing(lead);
      lead.notes.push(`Booked via Robby chat at ${new Date().toISOString()}`);
      session.stage = "done";
      session.askFor = null;
      const reply = bookedHtml(lead);
      appendMsg(lead, "assistant", reply);
      await sendLeadToBusiness(lead);
      saveSession(session);
      return {
        reply,
        suggestions: suggest([
          "That’s all, thanks",
          "Another booking",
          "$88 clear details",
          `Call ${SEWER_SQUAD.phone}`,
        ]),
        source: "flow",
        lead,
      };
    }

    if (isNegative(text) || /change|update|wrong|fix|actually/i.test(text)) {
      harvestFields(lead, text, null);
      if (/time|slot|when|schedule|tomorrow|today/i.test(text)) {
        session.stage = "collect";
        session.askFor = "slot";
        lead.preferredSlot = "";
        lead.appointmentWindow = "";
        const reply = `No problem. When works better?`;
        appendMsg(lead, "assistant", reply);
        saveSession(session);
        return {
          reply,
          suggestions: suggest(["Today", "Tomorrow morning", "This week"]),
          source: "flow",
          lead,
        };
      }
      if (/address|street|location/i.test(text)) {
        session.stage = "collect";
        session.askFor = "address";
        const reply = `Sure. What’s the correct address?`;
        appendMsg(lead, "assistant", reply);
        saveSession(session);
        return { reply, suggestions: suggest(["Skip for now"]), source: "flow", lead };
      }
      if (/phone|email|number|contact/i.test(text)) {
        session.stage = "collect";
        session.askFor = "phone";
        lead.phone = "";
        const reply = `Got it. What’s the best phone or email?`;
        appendMsg(lead, "assistant", reply);
        saveSession(session);
        return { reply, suggestions: suggest(["647-555-0100"]), source: "flow", lead };
      }
      if (/name/i.test(text)) {
        session.stage = "collect";
        session.askFor = "name";
        lead.name = "";
        const reply = `What’s the correct name?`;
        appendMsg(lead, "assistant", reply);
        saveSession(session);
        return { reply, suggestions: suggest([]), source: "flow", lead };
      }
      if (/city|town|area/i.test(text)) {
        session.stage = "collect";
        session.askFor = "city";
        lead.city = "";
        const reply = `Which city should we use?`;
        appendMsg(lead, "assistant", reply);
        saveSession(session);
        return {
          reply,
          suggestions: suggest(["Toronto", "Ajax", "Mississauga", "Hamilton"]),
          source: "flow",
          lead,
        };
      }
      if (/service|problem|job|work|need|price/i.test(text)) {
        session.stage = "collect";
        session.askFor = "problem";
        const reply = `What should we change the service to?`;
        appendMsg(lead, "assistant", reply);
        saveSession(session);
        return {
          reply,
          suggestions: suggest(["$88 clear + camera", "Drain clog", "Leak", "Sump check"]),
          source: "flow",
          lead,
        };
      }
      harvestFields(lead, text, null);
      refreshPricing(lead);
      const reply = confirmationHtml(lead);
      appendMsg(lead, "assistant", reply);
      await sendLeadToBusiness(lead);
      saveSession(session);
      return {
        reply,
        suggestions: suggest(["Yes, book it", "Change the time", "Change service"]),
        source: "flow",
        lead,
      };
    }

    harvestFields(lead, text, null);
    refreshPricing(lead);
    const reply = confirmationHtml(lead);
    appendMsg(lead, "assistant", reply);
    await sendLeadToBusiness(lead);
    saveSession(session);
    return {
      reply,
      suggestions: suggest(["Yes, book it", "Change the time", "Call instead"]),
      source: "flow",
      lead,
    };
  }

  // --- Stage: done --- 
  if (/^(new|start over|another (job|request|booking)|reset)/i.test(text)) {
    session = freshSession();
    const reply = `Fresh start. Emergency, quote, booking, or a quick question?`;
    appendMsg(session.lead, "assistant", reply);
    saveSession(session);
    return {
      reply,
      suggestions: suggest(["Emergency", "Get a quote", "Book a visit", "Hours & areas"]),
      source: "flow",
      lead: session.lead,
    };
  }

  if (/book|quote|emergency|appoint|another/i.test(text)) {
    const prev = lead;
    session = freshSession();
    session.lead.intent = detectIntent(text);
    if (prev.phone) session.lead.phone = prev.phone;
    if (prev.email) session.lead.email = prev.email;
    if (prev.name) session.lead.name = prev.name;
    if (prev.city) session.lead.city = prev.city;
    if (prev.address) session.lead.address = prev.address;
    if (prev.propertyType) session.lead.propertyType = prev.propertyType;
    session.stage = "collect";
    harvestFields(session.lead, text, null);
    appendMsg(session.lead, "user", text);
    const ack = prev.name
      ? `Welcome back, <strong>${prev.name}</strong>. I still have your contact. `
      : "";
    return advanceCollect(session, ack);
  }

  const more =
    kbAnswer(text) ||
    (await maybeLlmFaq(text, locale, history, lead)) ||
    `I can help with another question, or start a new quote/booking. For the Squad direct: <strong>${SEWER_SQUAD.phone}</strong>.`;
  appendMsg(lead, "assistant", more);
  saveSession(session);
  return {
    reply: more,
    suggestions: suggest([
      "Start a new booking",
      `Call ${SEWER_SQUAD.phone}`,
      "Service areas",
      "Pricing",
    ]),
    source: "kb",
    lead,
  };
}

export function offlineAvaReply(
  text: string,
  locale: "en" | "fr",
  history: ChatMessage[]
): AvaChatTurn {
  const session = loadSession() || freshSession();
  void locale;
  void history;
  const quick = kbAnswer(text);
  const reply =
    quick ||
    `Hi, I’m Robby with Sewer Squad. Tell me if this is an emergency, quote, booking, or question. Or call <strong>${SEWER_SQUAD.phone}</strong> 24/7.`;
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
  return `Hi, how can we help?<br><br>I’m <strong>Robby</strong> for <strong>Sewer Squad</strong>. Plumbing and drains across the GTA, 24/7. Emergency, quote, booking, or a quick question?`;
}
