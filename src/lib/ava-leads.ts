/**
 * AVA lead store (v1) — localStorage for demo + dashboard.
 * Structured so a worker/email webhook can replace persist later.
 */

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
  problem: string;
  urgency: string;
  propertyType: string;
  preferredSlot: string;
  notes: string[];
  messages: { role: "user" | "assistant"; content: string; at: string }[];
  /** Pipeline value shown on dashboard */
  estimatedRevenueCad: number;
  booked: boolean;
  source: "ava-web";
};

const STORAGE_KEY = "ava.sewersquad.leads.v1";
const DEMO_SEEDED = "ava.sewersquad.demo.seeded.v1";

export function estimateRevenue(partial: {
  intent: AvaIntent | null;
  problem?: string;
  booked?: boolean;
}): number {
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

function uid(): string {
  return `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadLeads(): AvaLead[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AvaLead[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLeads(leads: AvaLead[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
  window.dispatchEvent(new CustomEvent("ava-leads-updated"));
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
    problem: "",
    urgency: "",
    propertyType: "",
    preferredSlot: "",
    notes: [],
    messages: [],
    estimatedRevenueCad: 0,
    booked: false,
    source: "ava-web",
  };
}

/** Demo numbers so the owner dashboard never looks empty on first open.
 * Targets the story: ~31 leads → ~14 bookings → ~$18k pipeline. */
export function ensureDemoLeads(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(DEMO_SEEDED) === "1") return;
  const existing = loadLeads();
  if (existing.some((l) => l.id.startsWith("demo_"))) {
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
    "Oakville",
    "Pickering",
  ];
  const problems = [
    "Sewage backup",
    "Main drain slow + camera",
    "Sump pump check",
    "Toilet leak",
    "Burst pipe",
    "$88 clear + camera",
    "Kitchen clog",
    "Water softener quote",
    "Commercial drain",
    "Basement flood",
  ];
  const names = [
    "Alex Chen",
    "Louiedelle M.",
    "Tatjana R.",
    "Brandon K.",
    "Sam Patel",
    "Jordan Lee",
    "Chris N.",
    "Morgan A.",
    "Riley S.",
    "Casey T.",
    "Jamie O.",
    "Avery B.",
    "Quinn H.",
    "Dana W.",
  ];

  const demos: AvaLead[] = [];

  // 14 bookings
  for (let i = 0; i < 14; i++) {
    const problem = problems[i % problems.length]!;
    const booked = true;
    const intent: AvaLead["intent"] =
      i % 3 === 0 ? "emergency" : i % 3 === 1 ? "booking" : "quote";
    demos.push({
      id: `demo_book_${i}`,
      createdAt: new Date(now - (i + 1) * day * 0.7).toISOString(),
      updatedAt: new Date(now - (i + 1) * day * 0.7).toISOString(),
      status: "booking",
      intent,
      name: names[i % names.length]!,
      phone: `416-555-${String(1000 + i).slice(-4)}`,
      email: i % 2 === 0 ? `lead${i}@example.com` : "",
      city: cities[i % cities.length]!,
      problem,
      urgency: intent === "emergency" ? "now" : "this week",
      propertyType: i % 4 === 0 ? "condo" : "house",
      preferredSlot: i % 2 === 0 ? "Today" : "Tomorrow morning",
      notes: ["Demo seed"],
      messages: [],
      estimatedRevenueCad: estimateRevenue({ intent, problem, booked }),
      booked,
      source: "ava-web",
    });
  }

  // 10 qualified (not yet booked) → total leads with contact ≈ 24+ more
  for (let i = 0; i < 10; i++) {
    const problem = problems[(i + 3) % problems.length]!;
    const intent: AvaLead["intent"] = i % 2 === 0 ? "quote" : "booking";
    demos.push({
      id: `demo_qual_${i}`,
      createdAt: new Date(now - (i + 8) * day * 0.5).toISOString(),
      updatedAt: new Date(now - (i + 8) * day * 0.5).toISOString(),
      status: "qualified",
      intent,
      name: names[(i + 4) % names.length]!,
      phone: `905-555-${String(2000 + i).slice(-4)}`,
      email: "",
      city: cities[(i + 2) % cities.length]!,
      problem,
      urgency: "soon",
      propertyType: "house",
      preferredSlot: "",
      notes: ["Demo seed"],
      messages: [],
      estimatedRevenueCad: estimateRevenue({ intent, problem, booked: false }),
      booked: false,
      source: "ava-web",
    });
  }

  // 7 leads (contact only)
  for (let i = 0; i < 7; i++) {
    demos.push({
      id: `demo_lead_${i}`,
      createdAt: new Date(now - (i + 12) * day * 0.4).toISOString(),
      updatedAt: new Date(now - (i + 12) * day * 0.4).toISOString(),
      status: "lead",
      intent: "quote",
      name: names[(i + 7) % names.length]!,
      phone: `647-555-${String(3000 + i).slice(-4)}`,
      email: `quote${i}@example.com`,
      city: cities[(i + 5) % cities.length]!,
      problem: problems[(i + 1) % problems.length]!,
      urgency: "",
      propertyType: "",
      preferredSlot: "",
      notes: ["Demo seed"],
      messages: [],
      estimatedRevenueCad: 220,
      booked: false,
      source: "ava-web",
    });
  }

  // Conversations without contact yet
  for (let i = 0; i < 6; i++) {
    demos.push({
      id: `demo_convo_${i}`,
      createdAt: new Date(now - (i + 1) * day * 0.2).toISOString(),
      updatedAt: new Date(now - (i + 1) * day * 0.2).toISOString(),
      status: "conversation",
      intent: "question",
      name: "",
      phone: "",
      email: "",
      city: cities[i % cities.length]!,
      problem: "Asked about hours / pricing",
      urgency: "",
      propertyType: "",
      preferredSlot: "",
      notes: ["Demo seed"],
      messages: [],
      estimatedRevenueCad: 0,
      booked: false,
      source: "ava-web",
    });
  }

  saveLeads([...demos, ...existing]);
  localStorage.setItem(DEMO_SEEDED, "1");
}

export type DashboardStats = {
  conversations: number;
  leads: number;
  qualified: number;
  bookings: number;
  estimatedRevenueCad: number;
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
  const estimatedRevenueCad = leads
    .filter((l) => ["qualified", "booking"].includes(l.status) || l.booked)
    .reduce((sum, l) => sum + (l.estimatedRevenueCad || 0), 0);
  return {
    conversations,
    leads: leadsCount,
    qualified,
    bookings,
    estimatedRevenueCad,
  };
}

/** “Send lead to business” — v1 persists locally; hooks for future webhook/email. */
export async function sendLeadToBusiness(lead: AvaLead): Promise<{ ok: boolean }> {
  upsertLead(lead);
  try {
    // Optional future: POST to webhook / Cloudflare worker
    const hook = process.env.NEXT_PUBLIC_AVA_LEAD_WEBHOOK;
    if (hook && typeof fetch !== "undefined") {
      await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business: "Sewer Squad",
          phone: "647-699-2212",
          email: "info@sewersquad.ca",
          lead,
        }),
      });
    }
  } catch {
    /* local persist still succeeded */
  }
  return { ok: true };
}
