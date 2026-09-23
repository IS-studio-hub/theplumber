"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  computeStats,
  ensureDemoLeads,
  loadLeads,
  type AvaLead,
  type DashboardStats,
} from "@/lib/ava-leads";
import { SEWER_SQUAD } from "@/lib/sewer-squad";

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

export default function AvaDashboardPage() {
  const routeParams = useParams();
  const locale = (routeParams?.locale as string) || "en";
  const [leads, setLeads] = useState<AvaLead[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    conversations: 0,
    leads: 0,
    qualified: 0,
    bookings: 0,
    estimatedRevenueCad: 0,
  });

  useEffect(() => {
    ensureDemoLeads();
    const refresh = () => {
      const all = loadLeads();
      setLeads(all);
      setStats(computeStats(all));
    };
    refresh();
    window.addEventListener("ava-leads-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("ava-leads-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const funnel = useMemo(
    () => [
      { key: "conversations", label: "Conversations", value: stats.conversations },
      { key: "leads", label: "Leads", value: stats.leads },
      { key: "qualified", label: "Qualified leads", value: stats.qualified },
      { key: "bookings", label: "Bookings", value: stats.bookings },
    ],
    [stats]
  );

  const fr = locale === "fr";

  return (
    <div className="ava-dash">
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
        }
        .ava-dash_sub {
          margin: 0;
          opacity: 0.7;
          max-width: 36rem;
          line-height: 1.45;
        }
        .ava-dash_back {
          text-decoration: none;
          color: inherit;
          font-size: 0.9rem;
          opacity: 0.75;
          border-bottom: 1px solid currentColor;
        }
        .ava-dash_hero {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 1.25rem;
          margin-bottom: 1.75rem;
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
          max-width: 28rem;
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
          padding: 1.25rem 1.35rem;
          border-radius: 4px;
          margin-bottom: 1.75rem;
          line-height: 1.5;
        }
        .ava-dash_story strong { font-weight: 600; }
        .ava-dash_table-wrap {
          background: #fff;
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 4px;
          overflow: auto;
        }
        .ava-dash_table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.92rem;
        }
        .ava-dash_table th,
        .ava-dash_table td {
          text-align: left;
          padding: 0.85rem 1rem;
          border-bottom: 1px solid rgba(0,0,0,0.06);
          vertical-align: top;
        }
        .ava-dash_table th {
          font-size: 0.7rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          opacity: 0.55;
          font-weight: 500;
        }
        .ava-dash_pill {
          display: inline-block;
          font-size: 0.72rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          padding: 0.2rem 0.45rem;
          border: 1px solid rgba(0,0,0,0.15);
          border-radius: 2px;
        }
        .ava-dash_pill.-booking { background: #111; color: #fff; border-color: #111; }
        .ava-dash_pill.-qualified { background: #e8f0e9; border-color: #c5d8c8; }
      `}</style>

      <div className="ava-dash_top">
        <div>
          <h1 className="ava-dash_title">
            {fr ? "Tableau de bord AVA" : "AVA Dashboard"}
          </h1>
          <p className="ava-dash_sub">
            {fr
              ? `Ce que AVA génère pour ${SEWER_SQUAD.name} — conversations, leads, rendez-vous, pipeline estimé.`
              : `What AVA is generating for ${SEWER_SQUAD.name} — conversations, leads, bookings, and estimated pipeline.`}
          </p>
        </div>
        <Link className="ava-dash_back" href={`/${locale}`}>
          {fr ? "← Retour au chat AVA" : "← Back to AVA chat"}
        </Link>
      </div>

      <div className="ava-dash_hero">
        <div className="ava-dash_revenue">
          <label>{fr ? "Pipeline estimé" : "Estimated pipeline"}</label>
          <strong>{money(stats.estimatedRevenueCad)}</strong>
          <p>
            {fr
              ? `AVA a généré ${stats.leads} leads → ${stats.bookings} réservations → ${money(stats.estimatedRevenueCad)} de pipeline estimé.`
              : `AVA generated ${stats.leads} leads → ${stats.bookings} bookings → ${money(stats.estimatedRevenueCad)} estimated pipeline.`}
          </p>
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
            Ce n’est pas “un chatbot à 500&nbsp;$ / mois” — c’est un{" "}
            <strong>moteur de leads</strong> pour Sewer Squad. Chaque conversation
            qualifiée apparaît ici avec une valeur de pipeline estimée.
          </>
        ) : (
          <>
            This isn’t “a $500/month chatbot” — it’s a{" "}
            <strong>lead engine</strong> for Sewer Squad. Every qualified
            conversation shows up here with an estimated pipeline value.
          </>
        )}
      </div>

      <div className="ava-dash_table-wrap">
        <table className="ava-dash_table">
          <thead>
            <tr>
              <th>{fr ? "Quand" : "When"}</th>
              <th>{fr ? "Statut" : "Status"}</th>
              <th>{fr ? "Intention" : "Intent"}</th>
              <th>{fr ? "Contact" : "Contact"}</th>
              <th>{fr ? "Problème" : "Problem"}</th>
              <th>{fr ? "Ville" : "City"}</th>
              <th>{fr ? "Valeur" : "Value"}</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  {fr
                    ? "Aucune conversation pour l’instant — ouvrez le chat AVA."
                    : "No conversations yet — open the AVA chat."}
                </td>
              </tr>
            ) : (
              leads.map((l) => (
                <tr key={l.id}>
                  <td>
                    {new Date(l.createdAt).toLocaleString(fr ? "fr-CA" : "en-CA", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>
                    <span
                      className={`ava-dash_pill${
                        l.status === "booking"
                          ? " -booking"
                          : l.status === "qualified"
                            ? " -qualified"
                            : ""
                      }`}
                    >
                      {statusLabel(l.status)}
                    </span>
                  </td>
                  <td>{l.intent || "—"}</td>
                  <td>
                    <div>{l.name || "—"}</div>
                    <div style={{ opacity: 0.65, fontSize: "0.85em" }}>
                      {l.phone || l.email || ""}
                    </div>
                  </td>
                  <td style={{ maxWidth: "14rem" }}>{l.problem || "—"}</td>
                  <td>{l.city || "—"}</td>
                  <td>
                    {l.estimatedRevenueCad > 0
                      ? money(l.estimatedRevenueCad)
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
