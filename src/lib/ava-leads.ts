/**
 * Robby lead + appointment store (browser localStorage for static site).
 * Chat and dashboard share this store; CustomEvent keeps tabs in sync.
 */

import { SEWER_SQUAD, type ServiceId } from "@/lib/sewer-squad";

export type AvaIntent = "quote" | "emergency" | "booking" | "question";

export type LeadStatus = "conversation" | "lead" | "qualified" | "booking";

export type AvaLead = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: LeadStatus;
  intent: AvaIntent | null;
  name: string;
  phone: string;
  email: string;
  city: string;
  /** Street / unit when collected */
  address: string;
  problem: string;
  urgency: string;
  propertyType: string;
  /** Free-text preference (“Tomorrow morning”) */
  preferredSlot: string;
  /** ISO date when parseable */
  appointmentDate: string;
  /** e.g. "09:00–12:00" or "morning" */
  appointmentWindow: string;
  serviceId: ServiceId | "";
  serviceName: string;
  /** Quoted / listed price shown to customer (CAD) */
  quotedPriceCad: number;
  priceNote: string;
  confirmationCode: string;
  notes: string[];
  messages: { role: "user" | "assistant"; content: string; at: string }[];
  /** Pipeline value on dashboard (often ≈ quoted or avg job) */
  estimatedRevenueCad: number;
  booked: boolean;
  source: "ava-web";
};

const STORAGE_KEY = "ava.sewersquad.leads.v2";
const LEGACY_KEY = "ava.sewersquad.leads.v1";
const DEMO_SEEDED = "ava.sewersquad.demo.seeded.v2";

export function matchService(text: string): {
  id: ServiceId;
  name: string;
  quotedPriceCad: number;
  priceNote: string;
  estimatedRevenueCad: number;
} | null {
  const t = text.toLowerCase();
  const offer88 = /\$?\s*88|sewer\s*line\s*clear|clear\s*\+?\s*camera|main\s*(sewer|line)\s*clear/.test(
    t
  );
  if (offer88) {
    const svc = SEWER_SQUAD.services.find((s) => s.id === "sewer-clear")!;
    return {
      id: svc.id,
      name: svc.name,
      quotedPriceCad: 88,
      priceNote: svc.priceNote || "$88 + HST",
      estimatedRevenueCad: 320,
    };
  }
  if (/sump/.test(t) && /check|inspect|promo|149/.test(t)) {
    const svc = SEWER_SQUAD.services.find((s) => s.id === "sump")!;
    return {
      id: svc.id,
      name: svc.name,
      quotedPriceCad: 149,
      priceNote: svc.priceNote || "$149 sump pump check",
      estimatedRevenueCad: 900,
    };
  }

  const scored = SEWER_SQUAD.services
    .map((svc) => {
      const bits = `${svc.name} ${svc.id} ${svc.blurb}`.toLowerCase();
      let score = 0;
      for (const w of bits.split(/\W+/).filter((x) => x.length > 3)) {
        if (t.includes(w)) score += 1;
      }
      if (svc.id === "drain" && /clog|drain|slow\s*sink|bathtub/.test(t)) score += 3;
      if (svc.id === "toilet" && /toilet|running\s*toilet/.test(t)) score += 3;
      if (svc.id === "leak" && /leak|drip|wet\s*wall/.test(t)) score += 3;
      if (svc.id === "emergency" && /emergenc|burst|flood|sewage\s*backup/.test(t))
        score += 3;
      if (svc.id === "sewer-backup" && /backup|sewage|sewer\s*backup/.test(t)) score += 3;
      if (svc.id === "camera" && /camera\s*inspect/.test(t)) score += 2;
      if (svc.id === "commercial" && /commercial|restaurant|warehouse/.test(t))
        score += 2;
      if (svc.id === "water" && /softener|filtration|hard\s*water/.test(t)) score += 2;
      if (svc.id === "sump" && /sump/.test(t)) score += 3;
      return { svc, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 2) return null;
  const svc = best.svc;
  const listed = "priceCad" in svc && typeof svc.priceCad === "number" ? svc.priceCad : 0;
  return {
    id: svc.id,
    name: svc.name,
    quotedPriceCad: listed || svc.avgJobCad,
    priceNote:
      "priceNote" in svc && svc.priceNote
        ? svc.priceNote
        : `Typical range around $${svc.avgJobCad}. Exact price quoted upfront on site`,
    estimatedRevenueCad: svc.avgJobCad,
  };
}

export function estimateRevenue(partial: {
  intent: AvaIntent | null;
  problem?: string;
  serviceId?: string;
  quotedPriceCad?: number;
  booked?: boolean;
}): number {
  if (partial.quotedPriceCad && partial.quotedPriceCad > 0) {
    // Listed promo prices understate pipeline; use avg job when small
    if (partial.quotedPriceCad < 200) {
      const matched = matchService(partial.problem || partial.serviceId || "");
      return matched?.estimatedRevenueCad || Math.max(partial.quotedPriceCad, 280);
    }
    return partial.quotedPriceCad;
  }
  const matched = matchService(
    `${partial.problem || ""} ${partial.serviceId || ""}`
  );
  if (matched) {
    return partial.booked
      ? Math.round(matched.estimatedRevenueCad * 1.1)
      : matched.estimatedRevenueCad;
  }
  const p = `${partial.problem || ""}`.toLowerCase();
  let base = 280;
  if (partial.intent === "emergency") base = 450;
  if (partial.intent === "booking") base = 380;
  if (partial.intent === "quote") base = 320;
  if (partial.intent === "question") base = 220;
  if (/sewer|backup|sewage|main\s*line|camera/.test(p)) base = Math.max(base, 320);
  if (/sump/.test(p)) base = Math.max(base, 900);
  if (/burst|flood|water\s*heater|commercial/.test(p)) base = Math.max(base, 650);
  if (/toilet|clog|drain/.test(p)) base = Math.max(base, 250);
  if (partial.booked) base = Math.round(base * 1.15);
  return base;
}

export function applyServiceToLead(lead: AvaLead, text: string): void {
  const matched = matchService(text || lead.problem);
  if (!matched) return;
  lead.serviceId = matched.id;
  lead.serviceName = matched.name;
  lead.quotedPriceCad = matched.quotedPriceCad;
  lead.priceNote = matched.priceNote;
  lead.estimatedRevenueCad = estimateRevenue({
    intent: lead.intent,
    problem: lead.problem || text,
    serviceId: matched.id,
    quotedPriceCad: matched.quotedPriceCad,
    booked: lead.booked,
  });
}

function uid(): string {
  return `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeConfirmationCode(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `SS-${n}`;
}

function migrateLead(raw: Partial<AvaLead> & { id: string }): AvaLead {
  const draft = createLeadDraft();
  return {
    ...draft,
    ...raw,
    address: raw.address || "",
    appointmentDate: raw.appointmentDate || "",
    appointmentWindow: raw.appointmentWindow || "",
    serviceId: (raw.serviceId as ServiceId | "") || "",
    serviceName: raw.serviceName || "",
    quotedPriceCad: raw.quotedPriceCad || 0,
    priceNote: raw.priceNote || "",
    confirmationCode: raw.confirmationCode || "",
    notes: Array.isArray(raw.notes) ? raw.notes : [],
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    source: "ava-web",
  };
}

export function loadLeads(): AvaLead[] {
  if (typeof window === "undefined") return [];
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        raw = legacy;
        localStorage.setItem(STORAGE_KEY, legacy);
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<AvaLead>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l): l is Partial<AvaLead> & { id: string } => Boolean(l?.id))
      .map(migrateLead)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  } catch {
    return [];
  }
}

export function saveLeads(leads: AvaLead[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
  // Keep legacy key in sync for older tabs
  localStorage.setItem(LEGACY_KEY, JSON.stringify(leads));
  window.dispatchEvent(new CustomEvent("ava-leads-updated"));
  try {
    const bc = new BroadcastChannel("ava-sewersquad-leads");
    bc.postMessage({ type: "updated" });
    bc.close();
  } catch {
    /* BroadcastChannel optional */
  }
}

export function upsertLead(lead: AvaLead): AvaLead {
  const all = loadLeads();
  const i = all.findIndex((l) => l.id === lead.id);
  const next = { ...lead, updatedAt: new Date().toISOString() };
  if (i >= 0) all[i] = next;
  else all.unshift(next);
  saveLeads(all);
  return next;
}

export function deleteLead(id: string): void {
  saveLeads(loadLeads().filter((l) => l.id !== id));
}

export function clearDemoLeads(): void {
  saveLeads(loadLeads().filter((l) => !l.id.startsWith("demo_")));
  localStorage.setItem(DEMO_SEEDED, "1");
}

export function createLeadDraft(): AvaLead {
  const now = new Date().toISOString();
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    status: "conversation",
    intent: null,
    name: "",
    phone: "",
    email: "",
    city: "",
    address: "",
    problem: "",
    urgency: "",
    propertyType: "",
    preferredSlot: "",
    appointmentDate: "",
    appointmentWindow: "",
    serviceId: "",
    serviceName: "",
    quotedPriceCad: 0,
    priceNote: "",
    confirmationCode: "",
    notes: [],
    messages: [],
    estimatedRevenueCad: 0,
    booked: false,
    source: "ava-web",
  };
}

/** Optional demo seed so empty dashboards still show the product story. */
export function ensureDemoLeads(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(DEMO_SEEDED) === "1") return;
  const existing = loadLeads();
  if (existing.some((l) => l.id.startsWith("demo_"))) {
    localStorage.setItem(DEMO_SEEDED, "1");
    return;
  }
  // Only seed when there are no real leads yet
  if (existing.length > 0) {
    localStorage.setItem(DEMO_SEEDED, "1");
    return;
  }

  const now = Date.now();
  const day = 86_400_000;
  const cities = [
    "Toronto",
    "Ajax",
    "Mississauga",
    "Markham",
    "Hamilton",
    "Vaughan",
    "Brampton",
    "Scarborough",
  ];
  const samples: Array<{
    problem: string;
    intent: AvaIntent;
    status: LeadStatus;
    booked: boolean;
    slot?: string;
  }> = [
    {
      problem: "$88 sewer clear + camera",
      intent: "booking",
      status: "booking",
      booked: true,
      slot: "Tomorrow morning",
    },
    {
      problem: "Sewage backup",
      intent: "emergency",
      status: "booking",
      booked: true,
      slot: "ASAP / same-day",
    },
    {
      problem: "Sump pump check",
      intent: "quote",
      status: "booking",
      booked: true,
      slot: "Saturday",
    },
    {
      problem: "Kitchen drain clog",
      intent: "booking",
      status: "qualified",
      booked: false,
    },
    {
      problem: "Toilet leak",
      intent: "quote",
      status: "lead",
      booked: false,
    },
  ];

  const names = ["Alex Chen", "Louiedelle M.", "Tatjana R.", "Brandon K.", "Sam Patel"];
  const demos: AvaLead[] = samples.map((s, i) => {
    const lead = createLeadDraft();
    lead.id = `demo_${s.status}_${i}`;
    lead.createdAt = new Date(now - (i + 1) * day * 0.6).toISOString();
    lead.updatedAt = lead.createdAt;
    lead.status = s.status;
    lead.intent = s.intent;
    lead.name = names[i % names.length]!;
    lead.phone = `416-555-${String(1000 + i).slice(-4)}`;
    lead.email = i % 2 === 0 ? `lead${i}@example.com` : "";
    lead.city = cities[i % cities.length]!;
    lead.address = i % 2 === 0 ? `${100 + i} King St W` : "";
    lead.problem = s.problem;
    lead.preferredSlot = s.slot || "";
    lead.appointmentWindow = s.slot || "";
    lead.propertyType = i % 3 === 0 ? "condo" : "house";
    lead.urgency = s.intent === "emergency" ? "now" : "this week";
    lead.booked = s.booked;
    lead.notes = ["Demo seed"];
    applyServiceToLead(lead, s.problem);
    if (s.booked) {
      lead.confirmationCode = makeConfirmationCode();
      lead.status = "booking";
    }
    return lead;
  });

  saveLeads([...demos, ...existing]);
  localStorage.setItem(DEMO_SEEDED, "1");
}

export type DashboardStats = {
  conversations: number;
  leads: number;
  qualified: number;
  bookings: number;
  estimatedRevenueCad: number;
  quotedRevenueCad: number;
};

export function computeStats(leads: AvaLead[]): DashboardStats {
  const conversations = leads.length;
  const leadsCount = leads.filter((l) =>
    ["lead", "qualified", "booking"].includes(l.status)
  ).length;
  const qualified = leads.filter((l) =>
    ["qualified", "booking"].includes(l.status)
  ).length;
  const bookings = leads.filter((l) => l.status === "booking" || l.booked).length;
  const pipeline = leads.filter(
    (l) => ["qualified", "booking"].includes(l.status) || l.booked
  );
  const estimatedRevenueCad = pipeline.reduce(
    (sum, l) => sum + (l.estimatedRevenueCad || 0),
    0
  );
  const quotedRevenueCad = leads
    .filter((l) => l.booked || l.status === "booking")
    .reduce((sum, l) => sum + (l.quotedPriceCad || l.estimatedRevenueCad || 0), 0);
  return {
    conversations,
    leads: leadsCount,
    qualified,
    bookings,
    estimatedRevenueCad,
    quotedRevenueCad,
  };
}

/** Subscribe to lead/appointment updates across tabs and this window. */
export function subscribeLeads(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const refresh = () => onChange();
  window.addEventListener("ava-leads-updated", refresh);
  window.addEventListener("storage", refresh);
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel("ava-sewersquad-leads");
    bc.onmessage = () => refresh();
  } catch {
    /* optional */
  }
  return () => {
    window.removeEventListener("ava-leads-updated", refresh);
    window.removeEventListener("storage", refresh);
    try {
      bc?.close();
    } catch {
      /* ignore */
    }
  };
}

function appointmentsApiUrl(): string | null {
  if (typeof window === "undefined") return null;
  // Same-origin only. GH Pages has no /api; local Next does.
  const host = window.location.hostname;
  if (host.endsWith("github.io")) return null;
  const base =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BASE_PATH) || "";
  const prefix = base && !base.startsWith("http") ? base.replace(/\/$/, "") : "";
  return `${prefix}/api/appointments`;
}

/** Persist locally, mirror to /api/appointments when available, optional webhook. */
export async function sendLeadToBusiness(lead: AvaLead): Promise<{ ok: boolean }> {
  upsertLead(lead);
  const payload = {
    business: "Sewer Squad",
    phone: SEWER_SQUAD.phone,
    email: SEWER_SQUAD.email,
    lead,
  };
  try {
    const api = appointmentsApiUrl();
    if (api && typeof fetch !== "undefined") {
      await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null);
    }
  } catch {
    /* local persist still succeeded */
  }
  try {
    const hook = process.env.NEXT_PUBLIC_AVA_LEAD_WEBHOOK;
    if (hook && typeof fetch !== "undefined") {
      await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
  } catch {
    /* local persist still succeeded */
  }
  return { ok: true };
}

/** Booked appointments first, then qualified, for dashboard focus views. */
export function listAppointments(leads: AvaLead[] = loadLeads()): AvaLead[] {
  return leads.filter((l) => l.booked || l.status === "booking" || l.status === "qualified");
}

export function leadDisplayValue(lead: AvaLead): number {
  if (lead.quotedPriceCad > 0) return lead.quotedPriceCad;
  return lead.estimatedRevenueCad || 0;
}

export function formatLeadSummary(lead: AvaLead): string {
  const bits = [
    lead.name && `Name: ${lead.name}`,
    lead.phone && `Phone: ${lead.phone}`,
    lead.email && `Email: ${lead.email}`,
    lead.city && `City: ${lead.city}`,
    lead.address && `Address: ${lead.address}`,
    (lead.serviceName || lead.problem) &&
      `Service: ${lead.serviceName || lead.problem}`,
    lead.quotedPriceCad > 0 &&
      `Price: $${lead.quotedPriceCad}${lead.priceNote ? ` (${lead.priceNote})` : ""}`,
    (lead.preferredSlot || lead.appointmentWindow) &&
      `When: ${lead.preferredSlot || lead.appointmentWindow}`,
    lead.propertyType && `Property: ${lead.propertyType}`,
    lead.confirmationCode && `Confirmation: ${lead.confirmationCode}`,
  ].filter(Boolean);
  return bits.join(" · ");
}
