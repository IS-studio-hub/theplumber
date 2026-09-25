"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AllowPageScroll } from "@/components/layout/AllowPageScroll";
import {
  clearDemoLeads,
  computeStats,
  ensureDemoLeads,
  leadDisplayValue,
  loadLeads,
  subscribeLeads,
  type AvaLead,
  type DashboardStats,
} from "@/lib/ava-leads";
import { SEWER_SQUAD } from "@/lib/sewer-squad";

type Filter = "all" | "bookings" | "qualified" | "leads" | "live";

function money(n: number): string {
  return n.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });
}

function statusLabel(s: AvaLead["status"]): string {
  if (s === "booking") return "Booking";
  if (s === "qualified") return "Qualified";
  if (s === "lead") return "Lead";
  return "Conversation";
}

function whenLabel(l: AvaLead, fr: boolean): string {
  if (l.preferredSlot) return l.preferredSlot;
  if (l.appointmentWindow) return l.appointmentWindow;
  if (l.intent === "emergency") return fr ? "ASAP / urgences" : "ASAP / same-day";
  return "-";
}

function isLiveLead(l: AvaLead): boolean {
  return !l.id.startsWith("demo_");
}

export default function AvaDashboardPage() {
  const routeParams = useParams();
  const locale = (routeParams?.locale as string) || "en";
  const fr = locale === "fr";
  const [leads, setLeads] = useState<AvaLead[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    conversations: 0,
    leads: 0,
    qualified: 0,
    bookings: 0,
    estimatedRevenueCad: 0,
    quotedRevenueCad: 0,
  });
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [livePulse, setLivePulse] = useState(false);

  useEffect(() => {
    ensureDemoLeads();
    const refresh = () => {
      const all = loadLeads();
      setLeads(all);
      setStats(computeStats(all));
      setLivePulse(true);
      window.setTimeout(() => setLivePulse(false), 900);
    };
    refresh();
    return subscribeLeads(refresh);
  }, []);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (filter === "bookings") return l.booked || l.status === "booking";
      if (filter === "qualified") return l.status === "qualified";
      if (filter === "leads")
        return ["lead", "qualified", "booking"].includes(l.status);
      if (filter === "live") return isLiveLead(l);
      return true;
    });
  }, [leads, filter]);

  const selected = useMemo(
    () => leads.find((l) => l.id === selectedId) || null,
    [leads, selectedId]
  );

  const liveCount = leads.filter(isLiveLead).length;

  const funnel = useMemo(
    () => [
      { key: "conversations", label: fr ? "Conversations" : "Conversations", value: stats.conversations },
      { key: "leads", label: fr ? "Leads" : "Leads", value: stats.leads },
      { key: "qualified", label: fr ? "Qualifiés" : "Qualified", value: stats.qualified },
      { key: "bookings", label: fr ? "Réservations" : "Bookings", value: stats.bookings },
    ],
    [stats, fr]
  );

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: fr ? "Tout" : "All" },
    { id: "live", label: fr ? `Chat (${liveCount})` : `From chat (${liveCount})` },
    { id: "bookings", label: fr ? "Réservations" : "Bookings" },
    { id: "qualified", label: fr ? "Qualifiés" : "Qualified" },
    { id: "leads", label: fr ? "Leads" : "Leads" },
  ];

  return (
    <div className="ava-dash">
      <AllowPageScroll />
      <style>{`
        .ava-dash {
          min-height: 100vh;
          padding: calc(var(--header-height) + 1.5rem) clamp(1rem, 4vw, 3rem) 4rem;
          background:
            radial-gradient(1200px 600px at 10% -10%, #e8eef5 0%, transparent 55%),
            radial-gradient(900px 500px at 100% 0%, #f3efe8 0%, transparent 50%),
            #f7f7f5;
          color: #111;
          font-family: var(--font-ui);
        }
        .ava-dash_top {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 2rem;
        }
        .ava-dash_title {
          font-family: var(--font-display);
          font-size: clamp(1.8rem, 4vw, 2.6rem);
          font-weight: 500;
          letter-spacing: -0.02em;
          margin: 0 0 0.35rem;
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }
        .ava-dash_live {
          width: 0.55rem;
          height: 0.55rem;
          border-radius: 50%;
          background: #6fc22c;
          box-shadow: 0 0 0 0 rgba(111, 194, 44, 0.5);
          transition: box-shadow 0.3s ease;
        }
        .ava-dash_live.-pulse {
          box-shadow: 0 0 0 8px rgba(111, 194, 44, 0);
        }
        .ava-dash_sub {
          margin: 0;
          opacity: 0.7;
          max-width: 40rem;
          line-height: 1.45;
        }
        .ava-dash_actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
        .ava-dash_back, .ava-dash_ghost {
          display: inline-flex;
          align-items: center;
          text-decoration: none;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 0.45em 1.1em;
          cursor: pointer;
          font-family: inherit;
        }
        .ava-dash_back {
          color: #fff;
          background: linear-gradient(165deg, #e6ff9c 0%, #b6f05a 16%, #8ed63f 48%, #6fc22c 84%, #54a81a 100%);
          border: 2px solid #1a2c6b;
          text-shadow: none;
          box-shadow: inset 0 1.5px 0 rgba(255,255,255,0.78),
            inset 0 12px 16px rgba(255,255,255,0.16),
            inset 0 -10px 14px rgba(48,100,10,0.2),
            -7px 10px 18px rgba(19,32,86,0.26);
        }
        .ava-dash_ghost {
          background: #fff;
          border: 1px solid rgba(0,0,0,0.15);
          color: #111;
        }
        .ava-dash_hero {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 1.25rem;
          margin-bottom: 1.25rem;
        }
        @media (max-width: 900px) {
          .ava-dash_hero { grid-template-columns: 1fr; }
        }
        .ava-dash_revenue {
          background: #111;
          color: #f7f7f5;
          padding: 1.75rem 1.5rem;
          border-radius: 4px;
        }
        .ava-dash_revenue label {
          display: block;
          font-size: 0.75rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          opacity: 0.65;
          margin-bottom: 0.5rem;
        }
        .ava-dash_revenue strong {
          display: block;
          font-family: var(--font-display);
          font-size: clamp(2.4rem, 6vw, 3.6rem);
          font-weight: 500;
          letter-spacing: -0.03em;
          line-height: 1;
        }
        .ava-dash_revenue p {
          margin: 0.85rem 0 0;
          opacity: 0.75;
          line-height: 1.4;
          max-width: 32rem;
        }
        .ava-dash_revenue .ava-dash_quoted {
          margin-top: 1rem;
          padding-top: 0.85rem;
          border-top: 1px solid rgba(255,255,255,0.12);
          font-size: 0.9rem;
          opacity: 0.9;
        }
        .ava-dash_funnel {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
        }
        .ava-dash_metric {
          background: #fff;
          border: 1px solid rgba(0,0,0,0.08);
          padding: 1.1rem 1rem;
          border-radius: 4px;
        }
        .ava-dash_metric span {
          display: block;
          font-size: 0.72rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          opacity: 0.55;
          margin-bottom: 0.4rem;
        }
        .ava-dash_metric b {
          font-family: var(--font-display);
          font-size: 1.85rem;
          font-weight: 500;
        }
        .ava-dash_story {
          background: #fff;
          border: 1px solid rgba(0,0,0,0.08);
          padding: 1.1rem 1.25rem;
          border-radius: 4px;
          margin-bottom: 1.25rem;
          line-height: 1.5;
          font-size: 0.95rem;
        }
        .ava-dash_story strong { font-weight: 600; }
        .ava-dash_filters {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
          margin-bottom: 0.85rem;
        }
        .ava-dash_filter {
          border: 1px solid rgba(0,0,0,0.12);
          background: #fff;
          border-radius: 999px;
          padding: 0.35rem 0.85rem;
          font-size: 0.78rem;
          letter-spacing: 0.04em;
          cursor: pointer;
          font-family: inherit;
        }
        .ava-dash_filter.-on {
          background: #111;
          color: #fff;
          border-color: #111;
        }
        .ava-dash_layout {
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          gap: 1rem;
          align-items: start;
        }
        @media (max-width: 1000px) {
          .ava-dash_layout { grid-template-columns: 1fr; }
        }
        .ava-dash_table-wrap {
          background: #fff;
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 4px;
          overflow: auto;
        }
        .ava-dash_table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
        }
        .ava-dash_table th,
        .ava-dash_table td {
          text-align: left;
          padding: 0.8rem 0.9rem;
          border-bottom: 1px solid rgba(0,0,0,0.06);
          vertical-align: top;
        }
        .ava-dash_table th {
          font-size: 0.68rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          opacity: 0.55;
          font-weight: 500;
        }
        .ava-dash_table tr {
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .ava-dash_table tr:hover { background: #fafaf8; }
        .ava-dash_table tr.-on { background: #f0f4ea; }
        .ava-dash_pill {
          display: inline-block;
          font-size: 0.7rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          padding: 0.2rem 0.45rem;
          border: 1px solid rgba(0,0,0,0.15);
          border-radius: 2px;
        }
        .ava-dash_pill.-booking { background: #111; color: #fff; border-color: #111; }
        .ava-dash_pill.-qualified { background: #e8f0e9; border-color: #c5d8c8; }
        .ava-dash_detail {
          background: #fff;
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 4px;
          padding: 1.25rem 1.35rem;
          position: sticky;
          top: calc(var(--header-height) + 1rem);
        }
        .ava-dash_detail h2 {
          font-family: var(--font-display);
          font-size: 1.35rem;
          font-weight: 500;
          margin: 0 0 0.35rem;
        }
        .ava-dash_detail .muted {
          opacity: 0.6;
          font-size: 0.85rem;
          margin-bottom: 1rem;
        }
        .ava-dash_dl {
          display: grid;
          gap: 0.65rem;
          margin: 0 0 1.1rem;
        }
        .ava-dash_dl div {
          display: grid;
          grid-template-columns: 7.5rem 1fr;
          gap: 0.5rem;
          font-size: 0.9rem;
          line-height: 1.35;
        }
        .ava-dash_dl dt {
          opacity: 0.55;
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding-top: 0.15rem;
        }
        .ava-dash_dl dd { margin: 0; }
        .ava-dash_price {
          font-family: var(--font-display);
          font-size: 1.6rem;
          font-weight: 500;
          margin: 0 0 0.25rem;
        }
        .ava-dash_msgs {
          max-height: 12rem;
          overflow: auto;
          border-top: 1px solid rgba(0,0,0,0.06);
          padding-top: 0.85rem;
          font-size: 0.82rem;
          line-height: 1.4;
        }
        .ava-dash_msgs p { margin: 0 0 0.55rem; }
        .ava-dash_msgs .role {
          font-size: 0.65rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          opacity: 0.5;
        }
        .ava-dash_empty {
          opacity: 0.65;
          padding: 1.5rem 0.5rem;
          text-align: center;
        }
      `}</style>

      <div className="ava-dash_top">
        <div>
          <h1 className="ava-dash_title">
            <span
              className={`ava-dash_live${livePulse ? " -pulse" : ""}`}
              title={fr ? "Synchronisé avec le chat" : "Synced with Robby chat"}
            />
            {fr ? "Tableau de bord Robby" : "Robby Dashboard"}
          </h1>
          <p className="ava-dash_sub">
            {fr
              ? `Rendez-vous, contacts, prix et leads synchronisés depuis le chat Robby pour ${SEWER_SQUAD.name}.`
              : `Appointments, contacts, pricing, and leads synced live from the Robby chat for ${SEWER_SQUAD.name}.`}
          </p>
        </div>
        <div className="ava-dash_actions">
          <button
            type="button"
            className="ava-dash_ghost"
            onClick={() => {
              clearDemoLeads();
              setLeads(loadLeads());
              setStats(computeStats(loadLeads()));
              setSelectedId(null);
            }}
          >
            {fr ? "Retirer démos" : "Clear demos"}
          </button>
          <Link className="ava-dash_back" href={`/${locale}`}>
            {fr ? "← Chat Robby" : "← Robby chat"}
          </Link>
        </div>
      </div>

      <div className="ava-dash_hero">
        <div className="ava-dash_revenue">
          <label>{fr ? "Pipeline estimé" : "Estimated pipeline"}</label>
          <strong>{money(stats.estimatedRevenueCad)}</strong>
          <p>
            {fr
              ? `Robby a généré ${stats.leads} leads → ${stats.bookings} réservations → ${money(stats.estimatedRevenueCad)} de pipeline.`
              : `Robby generated ${stats.leads} leads → ${stats.bookings} bookings → ${money(stats.estimatedRevenueCad)} estimated pipeline.`}
          </p>
          <div className="ava-dash_quoted">
            {fr ? "Prix cités (réservations)" : "Quoted on bookings"}:{" "}
            <strong>{money(stats.quotedRevenueCad)}</strong>
          </div>
        </div>
        <div className="ava-dash_funnel">
          {funnel.map((m) => (
            <div className="ava-dash_metric" key={m.key}>
              <span>{m.label}</span>
              <b>{m.value}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="ava-dash_story">
        {fr ? (
          <>
            Chaque conversation Robby enregistre automatiquement le <strong>contact</strong>, le{" "}
            <strong>service</strong>, le <strong>prix</strong>, le <strong>créneau</strong> et le
            code de confirmation. Ouvrez une ligne pour voir le dossier complet.
          </>
        ) : (
          <>
            Every Robby conversation automatically saves <strong>contact info</strong>,{" "}
            <strong>service</strong>, <strong>price</strong>, <strong>appointment window</strong>, and
            confirmation code. Open a row for the full appointment file.
          </>
        )}
      </div>

      <div className="ava-dash_filters">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`ava-dash_filter${filter === f.id ? " -on" : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="ava-dash_layout">
        <div className="ava-dash_table-wrap">
          <table className="ava-dash_table">
            <thead>
              <tr>
                <th>{fr ? "Quand" : "Logged"}</th>
                <th>{fr ? "Statut" : "Status"}</th>
                <th>{fr ? "Contact" : "Contact"}</th>
                <th>{fr ? "Service" : "Service"}</th>
                <th>{fr ? "RDV" : "Appointment"}</th>
                <th>{fr ? "Prix" : "Price"}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="ava-dash_empty">
                      {fr
                        ? "Rien ici pour le moment. Ouvrez le chat Robby et réservez un rendez-vous."
                        : "Nothing here yet. Open Robby chat and book an appointment."}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((l) => (
                  <tr
                    key={l.id}
                    className={selectedId === l.id ? "-on" : ""}
                    onClick={() => setSelectedId(l.id)}
                  >
                    <td>
                      {new Date(l.updatedAt || l.createdAt).toLocaleString(
                        fr ? "fr-CA" : "en-CA",
                        {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
                      {!isLiveLead(l) ? (
                        <div style={{ opacity: 0.45, fontSize: "0.75em" }}>demo</div>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`ava-dash_pill${
                          l.status === "booking" || l.booked
                            ? " -booking"
                            : l.status === "qualified"
                              ? " -qualified"
                              : ""
                        }`}
                      >
                        {statusLabel(l.status)}
                      </span>
                    </td>
                    <td>
                      <div>{l.name || "-"}</div>
                      <div style={{ opacity: 0.65, fontSize: "0.85em" }}>
                        {l.phone || l.email || ""}
                      </div>
                    </td>
                    <td style={{ maxWidth: "12rem" }}>
                      {l.serviceName || l.problem || "-"}
                      {l.city ? (
                        <div style={{ opacity: 0.6, fontSize: "0.85em" }}>{l.city}</div>
                      ) : null}
                    </td>
                    <td style={{ maxWidth: "10rem" }}>{whenLabel(l, fr)}</td>
                    <td>
                      {leadDisplayValue(l) > 0 ? money(leadDisplayValue(l)) : "-"}
                      {l.confirmationCode ? (
                        <div style={{ opacity: 0.55, fontSize: "0.75em" }}>
                          {l.confirmationCode}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <aside className="ava-dash_detail">
          {selected ? (
            <>
              <h2>{selected.name || (fr ? "Sans nom" : "Unnamed lead")}</h2>
              <div className="muted">
                {selected.confirmationCode
                  ? `${fr ? "Confirmation" : "Confirmation"} ${selected.confirmationCode}`
                  : statusLabel(selected.status)}
                {" · "}
                {selected.intent || "-"}
                {isLiveLead(selected)
                  ? fr
                    ? " · depuis le chat"
                    : " · from chat"
                  : fr
                    ? " · démo"
                    : " · demo"}
              </div>

              {(selected.quotedPriceCad > 0 || selected.estimatedRevenueCad > 0) && (
                <div style={{ marginBottom: "1rem" }}>
                  <div className="ava-dash_price">
                    {money(leadDisplayValue(selected))}
                  </div>
                  <div style={{ opacity: 0.65, fontSize: "0.85rem" }}>
                    {selected.priceNote ||
                      (fr ? "Valeur pipeline estimée" : "Quoted / estimated value")}
                  </div>
                </div>
              )}

              <dl className="ava-dash_dl">
                <div>
                  <dt>{fr ? "Téléphone" : "Phone"}</dt>
                  <dd>{selected.phone || "-"}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{selected.email || "-"}</dd>
                </div>
                <div>
                  <dt>{fr ? "Adresse" : "Address"}</dt>
                  <dd>
                    {[selected.address, selected.city].filter(Boolean).join(", ") || "-"}
                  </dd>
                </div>
                <div>
                  <dt>{fr ? "Service" : "Service"}</dt>
                  <dd>{selected.serviceName || selected.problem || "-"}</dd>
                </div>
                <div>
                  <dt>{fr ? "Problème" : "Problem"}</dt>
                  <dd>{selected.problem || "-"}</dd>
                </div>
                <div>
                  <dt>{fr ? "RDV" : "Appointment"}</dt>
                  <dd>
                    {whenLabel(selected, fr)}
                    {selected.appointmentDate
                      ? ` · ${selected.appointmentDate}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>{fr ? "Propriété" : "Property"}</dt>
                  <dd>{selected.propertyType || "-"}</dd>
                </div>
                <div>
                  <dt>{fr ? "Urgence" : "Urgency"}</dt>
                  <dd>{selected.urgency || "-"}</dd>
                </div>
              </dl>

              {selected.messages?.length ? (
                <div className="ava-dash_msgs">
                  {selected.messages.slice(-8).map((m, i) => (
                    <p key={`${m.at}-${i}`}>
                      <span className="role">
                        {m.role === "user" ? (fr ? "Client" : "Customer") : "Robby"}
                      </span>
                      <br />
                      {m.content.slice(0, 220)}
                      {m.content.length > 220 ? "…" : ""}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="muted">
                  {fr
                    ? "Pas encore de transcription."
                    : "No chat transcript yet."}
                </div>
              )}
            </>
          ) : (
            <div className="ava-dash_empty">
              {fr
                ? "Sélectionnez une ligne pour voir le dossier complet: contact, prix, rendez-vous, transcription."
                : "Select a row to open the full file: contact, price, appointment, and chat transcript."}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
