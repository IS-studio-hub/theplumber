/**
 * Sewer Squad business knowledge for Robby (v1).
 * Sourced from https://www.sewersquad.ca/ and related pages.
 */

export const SEWER_SQUAD = {
  name: "Sewer Squad",
  tagline: "In Your Neighbourhood. In Your Price Range. And in Your Basement, Fast.",
  phone: "647-699-2212",
  phoneTel: "+16476992212",
  email: "info@sewersquad.ca",
  website: "https://www.sewersquad.ca/",
  hours: "Open 24 hours, 7 days a week, including weekends. No after-hours fees.",
  rating: "4.9★ on Google from 1,000+ GTA homeowners",
  founded: "Started in 2017 by Phil, after nearly 15 years in the trade",
  addresses: [
    {
      label: "Ajax HQ",
      line: "520 Westney Road South, Unit 3, Ajax, ON L1S 7H4",
    },
    {
      label: "Hamilton",
      line: "472 Barton St E, Hamilton, ON L8L 2Y8",
    },
  ],
  serviceAreas: [
    "Ajax",
    "Aurora",
    "Barrie",
    "Brampton",
    "Burlington",
    "Cobourg",
    "Courtice",
    "East York",
    "Etobicoke",
    "Georgina",
    "Hamilton",
    "Markham",
    "Mississauga",
    "Newmarket",
    "North York",
    "Oakville",
    "Oshawa",
    "Peterborough",
    "Pickering",
    "Richmond Hill",
    "Scarborough",
    "Toronto",
    "Vaughan",
    "Whitby",
  ],
  services: [
    {
      id: "emergency",
      name: "Emergency Plumbing",
      blurb: "Licensed help when plumbing problems can’t wait: burst pipes, flooding, sewage backups.",
      avgJobCad: 450,
    },
    {
      id: "drain",
      name: "Drain Cleaning",
      blurb: "Clogs cleared and water flowing again in sinks, tubs, and main lines.",
      avgJobCad: 280,
    },
    {
      id: "sewer-clear",
      name: "Sewer Line Clear + Camera",
      blurb: "Main sewer line clear plus camera inspection.",
      priceCad: 88,
      priceNote: "$88 + HST. Everyday price for one main line clear + camera. Residential; conditions apply.",
      avgJobCad: 320,
    },
    {
      id: "sewer-backup",
      name: "Sewer Backup",
      blurb: "When sewage strikes, the Squad shows up fast.",
      avgJobCad: 650,
    },
    {
      id: "leak",
      name: "Leak Detection & Repair",
      blurb: "Find hidden leaks before they cause serious damage. No guessing games.",
      avgJobCad: 380,
    },
    {
      id: "toilet",
      name: "Toilet Repair",
      blurb: "Running, rocking, or clogged. Common toilet problems fixed fast.",
      avgJobCad: 220,
    },
    {
      id: "sump",
      name: "Sump Pumps",
      blurb: "Installations, repairs, and backups to keep basements dry.",
      priceCad: 149,
      priceNote: "$149 sump pump check promo (residential; conditions apply; expires July 31, 2026).",
      avgJobCad: 900,
    },
    {
      id: "water",
      name: "Water Filtration & Softeners",
      blurb: "Cleaner, softer water for taste, skin, and plumbing performance.",
      avgJobCad: 1200,
    },
    {
      id: "camera",
      name: "Sewer Camera Inspection",
      blurb: "Waterproof camera to spot cracks, roots, and clogs without unnecessary digging.",
      avgJobCad: 250,
    },
    {
      id: "commercial",
      name: "Commercial Plumbing",
      blurb: "Offices, restaurants, warehouses, multi-residential. Fast response 24/7.",
      avgJobCad: 750,
    },
  ],
  offers: [
    {
      id: "88-clear",
      title: "$88 Sewer Line Clear + Camera",
      detail:
        "Clear one main sewer line and inspect with camera for $88 + HST. Everyday price (not a gimmick). Residential only; conditions apply. Extra work quoted upfront.",
      estimatedRevenueCad: 320,
    },
    {
      id: "sump-check",
      title: "$149 Sump Pump Check",
      detail: "Protect your home from flooding. Residential; not valid with other offers. Expires July 31, 2026.",
      estimatedRevenueCad: 900,
    },
    {
      id: "25-off",
      title: "$25 off any plumbing or drain repair",
      detail: "Residential; conditions apply. Expires June 30, 2026.",
      estimatedRevenueCad: 250,
    },
  ],
  promises: [
    "Upfront pricing. You’ll know the cost before work begins",
    "No after-hours / overtime fees",
    "Same-day service across the GTA when available",
    "Real humans answer the phone, not a call centre",
    "Booties on, clean-up after. We treat your home like ours",
    "Text with tech name, photo, and arrival window",
    "Payment plans available",
  ],
  faqs: [
    {
      q: "Do you offer upfront pricing?",
      a: "Yes. We explain the issue and cost clearly before we begin. No surprise bills.",
    },
    {
      q: "Are there after-hours fees?",
      a: "No. We’re open 24/7 with no overtime charges.",
    },
    {
      q: "How fast can you get here?",
      a: "Most GTA calls are same-day. Emergencies are prioritized. Call 647-699-2212 anytime.",
    },
    {
      q: "What’s included in the $88 sewer clear?",
      a: "Clearing one main sewer line plus a camera inspection of that line. If the issue is beyond the main drain, we give upfront options before more work.",
    },
    {
      q: "Do you handle older plumbing / lead lines?",
      a: "Yes. Cast iron, clay, PVC, PEX, and Toronto lead service lines. For lead, the City may cover part of replacement, and we walk you through it.",
    },
    {
      q: "Can tree roots block drains?",
      a: "Yes, especially in older neighbourhoods. We use drain cameras to find roots and damage fast.",
    },
    {
      q: "What needs urgent attention?",
      a: "Burst pipes, sewage backups, and leaks near electrical. Call 647-699-2212 ASAP.",
    },
    {
      q: "Commercial properties?",
      a: "Yes. Restaurants, offices, warehouses, gyms, multi-residential. 24/7 emergency commercial plumbing.",
    },
  ],
} as const;

export type ServiceId = (typeof SEWER_SQUAD.services)[number]["id"];

export function knowledgeContextBlock(): string {
  const s = SEWER_SQUAD;
  return [
    `Business: ${s.name}`,
    `Phone (24/7): ${s.phone}`,
    `Email: ${s.email}`,
    `Hours: ${s.hours}`,
    `Addresses: ${s.addresses.map((a) => a.line).join(" | ")}`,
    `Service areas (GTA+): ${s.serviceAreas.join(", ")}`,
    `Services: ${s.services
      .map((x) => {
        const note = "priceNote" in x && x.priceNote ? ` (${x.priceNote})` : "";
        return `${x.name}: ${x.blurb}${note}`;
      })
      .join("; ")}`,
    `Offers: ${s.offers.map((o) => `${o.title}: ${o.detail}`).join(" | ")}`,
    `Promises: ${s.promises.join("; ")}`,
    `FAQs: ${s.faqs.map((f) => `Q:${f.q} A:${f.a}`).join(" | ")}`,
    `Rating: ${s.rating}`,
  ].join("\n");
}
