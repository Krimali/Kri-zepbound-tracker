"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Entry = {
  id: string;
  entry_date: string; // YYYY-MM-DD
  week_number: number;
  day_in_week: number; // Tue=1 ... Mon=7
  weight: number | null;
  steps: number | null;
  calories: number | null;
  protein: number | null;
  fiber: number | null;
  fat: number | null;
  carbs: number | null;
  mood: string | null;
  dose_mg: number | null;
};

type GoalRow = {
  id: number | string;
  start_weight: number | null;
  goal_weight: number | null;
  start_waist: number | null;
  goal_waist: number | null;
};

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dayNameFromISO(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

function rangeLabel(startISO: string, endISO: string) {
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(s)} – ${fmt(e)}`;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function formatMaybe(n: number | null | undefined) {
  if (n == null) return "—";
  // show integer without decimals; else one decimal
  return Number.isInteger(n) ? String(n) : String(round1(n));
}

export default function Dashboard() {
  // ---------- Auth ----------
  const [authed, setAuthed] = useState<boolean>(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authStatus, setAuthStatus] = useState<string>("");

  // ---------- Data ----------
  const [status, setStatus] = useState("Loading...");
  const [goals, setGoals] = useState<GoalRow | null>(null);

  const [todayRow, setTodayRow] = useState<Entry | null>(null);
  const [latestRow, setLatestRow] = useState<Entry | null>(null);
  const [weekEntries, setWeekEntries] = useState<Entry[]>([]);

  const [weeklyOverview, setWeeklyOverview] = useState<
    {
      week: number;
      start: string;
      end: string;
      dose: number | null;
      startWt: number | null;
      endWt: number | null;
      rowsDesc: Entry[]; // descending by date (newest first)
    }[]
  >([]);

  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);

  const t = useMemo(() => todayISO(), []);

  // 1) boot auth + subscribe
  useEffect(() => {
    let mounted = true;

    async function boot() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      const has = !!data.session;
      setAuthed(has);
      setStatus(has ? "Loading..." : "🔒 Please sign in");
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      const has = !!session;
      setAuthed(has);
      setStatus(has ? "Loading..." : "🔒 Please sign in");
    });

    boot();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // 2) load data only when authed
  useEffect(() => {
    if (!authed) return;

    async function load() {
      try {
        setStatus("Loading...");

        // goals (single row)
        const { data: g, error: gErr } = await supabase
          .from("goals")
          .select("*")
          .limit(1)
          .maybeSingle();
        if (gErr) throw gErr;
        setGoals((g as any) ?? null);

        // today row
        const { data: tRow, error: tErr } = await supabase
          .from("entries")
          .select("*")
          .eq("entry_date", t)
          .maybeSingle();
        if (tErr) throw tErr;
        setTodayRow((tRow as any) ?? null);

        // latest entry (for current weight)
        const { data: lRow, error: lErr } = await supabase
          .from("entries")
          .select("*")
          .order("entry_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lErr) throw lErr;
        setLatestRow((lRow as any) ?? null);

        // active week number (prefer today, else latest)
        const activeWeek =
          (tRow as any)?.week_number ?? (lRow as any)?.week_number ?? null;

        // week entries for averages
        if (activeWeek != null) {
          const { data: wRows, error: wErr } = await supabase
            .from("entries")
            .select("*")
            .eq("week_number", activeWeek)
            .order("entry_date", { ascending: true });
          if (wErr) throw wErr;
          setWeekEntries((wRows as any) ?? []);
        } else {
          setWeekEntries([]);
        }

        // weekly overview
        const { data: all, error: allErr } = await supabase
          .from("entries")
          .select("*")
          .order("week_number", { ascending: false })
          .order("entry_date", { ascending: false })
          .limit(500);
        if (allErr) throw allErr;

        const byWeek = new Map<number, Entry[]>();
        for (const r of ((all as any) ?? []) as Entry[]) {
          byWeek.set(r.week_number, [...(byWeek.get(r.week_number) ?? []), r]);
        }

        const overview = Array.from(byWeek.entries())
          .sort((a, b) => b[0] - a[0])
          .slice(0, 12)
          .map(([week, rows]) => {
            const asc = [...rows].sort((a, b) =>
              a.entry_date.localeCompare(b.entry_date)
            );
            const desc = [...asc].reverse();

            const start = asc[0]?.entry_date ?? "";
            const end = asc[asc.length - 1]?.entry_date ?? "";
            const startWt = asc[0]?.weight ?? null;
            const endWt = asc[asc.length - 1]?.weight ?? null;

            // dose: first non-null in week
            const dose = asc.find((x) => x.dose_mg != null)?.dose_mg ?? null;

            return { week, start, end, dose, startWt, endWt, rowsDesc: desc };
          });

        setWeeklyOverview(overview);

        if (activeWeek != null) setExpandedWeek(activeWeek);

        setStatus("✅ Loaded");
      } catch (e: any) {
        console.error(e);
        setStatus(`❌ ${e?.message ?? "Load failed"}`);
      }
    }

    load();
  }, [authed, t]);

  const weekAvg = useMemo(() => {
    const nums = (key: keyof Entry) =>
      weekEntries
        .map((r) => (typeof r[key] === "number" ? (r[key] as number) : null))
        .filter((x) => x != null) as number[];

    const avg = (arr: number[]) =>
      arr.length ? round1(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    return {
      steps: avg(nums("steps")),
      calories: avg(nums("calories")),
      protein: avg(nums("protein")),
      fiber: avg(nums("fiber")),
      fat: avg(nums("fat")),
    };
  }, [weekEntries]);

  // metrics
  const currentWeight = latestRow?.weight ?? null;
  const startWeight = goals?.start_weight ?? null;
  const targetWeight = goals?.goal_weight ?? null;

  const totalLost =
    currentWeight != null && startWeight != null
      ? round1(startWeight - currentWeight)
      : null;

  const toGoal =
    currentWeight != null && targetWeight != null
      ? round1(currentWeight - targetWeight)
      : null;

  const bannerWeek = todayRow?.week_number ?? latestRow?.week_number ?? null;
  const bannerDay = todayRow?.day_in_week ?? latestRow?.day_in_week ?? null;

  // FIX: dose should not be empty if you have one in either today, latest, or this week's rows
  const bannerDose =
    todayRow?.dose_mg ??
    latestRow?.dose_mg ??
    weekEntries.find((e) => e.dose_mg != null)?.dose_mg ??
    null;

  async function sendMagicLink() {
    const email = authEmail.trim();
    if (!email) {
      setAuthStatus("Enter your email first.");
      return;
    }
    setAuthStatus("Sending magic link...");

    const redirectTo =
      process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${redirectTo}/` },
    });

    if (error) {
      console.error(error);
      setAuthStatus(`❌ ${error.message}`);
      return;
    }
    setAuthStatus("✅ Check your email for the sign-in link.");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // ---------- Auth gate UI ----------
  if (!authed) {
    return (
      <div style={{ padding: 28, maxWidth: 520, margin: "0 auto" }}>
        {/* If you already have a header in layout.tsx, you can remove this */}
        

        <div style={{ height: 16 }} />

        <div style={{ border: "1px solid #eee", borderRadius: 20, padding: 18, background: "white" }}>
          <div style={{ fontSize: 18, fontWeight: 950, marginBottom: 10 }}>Sign in</div>

          <div style={{ opacity: 0.7, marginBottom: 12 }}>
            This is a private app. Sign in to view and edit your data.
          </div>

          <input
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            placeholder="you@example.com"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #ddd",
              outline: "none",
            }}
          />

          <div style={{ height: 10 }} />

          <button
            onClick={sendMagicLink}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #111",
              background: "#111",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Send magic link
          </button>

          <div style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>
            {status}
            {authStatus ? <div style={{ marginTop: 6 }}>{authStatus}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Main Dashboard UI ----------
  return (
    <div style={{ padding: 28, maxWidth: 1100, margin: "0 auto" }}>
      {/* If you already have a header in layout.tsx, remove <Header/> and the actions row below */}
    

      <div style={{ height: 12 }} />

      {/* actions row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ opacity: 0.8, fontWeight: 800 }}>{status}</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>

          <button onClick={signOut} style={{ ...pillLinkStyle, cursor: "pointer" }}>
            Sign out
          </button>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* Today banner */}
      <div
        style={{
          borderRadius: 20,
          padding: 18,
          color: "white",
          background: "linear-gradient(90deg, #7c3aed, #db2777)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", opacity: 0.95 }}>
          Today • {dayNameFromISO(t)}, {t}
        </div>

        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <MiniStat label="Week" value={bannerWeek != null ? String(bannerWeek) : "—"} />
          <MiniStat label="Day" value={bannerDay != null ? String(bannerDay) : "—"} />
          <MiniStat label="Dose" value={bannerDose != null ? `${bannerDose} mg` : "—"} />
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* Weight progress */}
      <Card title="⚖️ Weight Progress">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <BigStat label="Starting" value={formatMaybe(startWeight)} suffix="lbs" />
          <BigStat label="Lost" value={formatMaybe(totalLost)} suffix="lbs" />
          <BigStat label="Current" value={formatMaybe(currentWeight)} suffix="lbs" />
          <BigStat label="To Goal" value={formatMaybe(toGoal)} suffix="lbs" />
        </div>

        <div style={{ marginTop: 10, opacity: 0.7 }}>
          Goal: {formatMaybe(targetWeight)} lbs{" "}
          {startWeight != null && targetWeight != null && currentWeight != null ? (
            <span style={{ fontWeight: 800 }}>
              • {Math.round(((startWeight - currentWeight) / (startWeight - targetWeight)) * 100)}% there
            </span>
          ) : null}
        </div>
      </Card>

      <div style={{ height: 14 }} />

      {/* Week averages */}
      <Card title={`📊 Week ${bannerWeek ?? "—"} Averages`}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ChipStat label="Protein" value={formatMaybe(weekAvg.protein)} suffix="g" />
          <ChipStat label="Fiber" value={formatMaybe(weekAvg.fiber)} suffix="g" />
          <ChipStat label="Fat" value={formatMaybe(weekAvg.fat)} suffix="g" />
          <ChipStat label="Calories" value={formatMaybe(weekAvg.calories)} />
          <ChipStat label="Steps" value={formatMaybe(weekAvg.steps)} />
        </div>
      </Card>

      <div style={{ height: 14 }} />

      {/* Weekly overview */}
      <Card title="📋 Weekly Overview (tap week to expand)">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.7 }}>
                <th style={{ padding: "10px 8px" }}>Week</th>
                <th style={{ padding: "10px 8px" }}>Dose</th>
                <th style={{ padding: "10px 8px" }}>Start</th>
                <th style={{ padding: "10px 8px" }}>End</th>
                <th style={{ padding: "10px 8px" }}>WoW</th>
                <th style={{ padding: "10px 8px" }}>Total</th>
              </tr>
            </thead>

            <tbody>
              {weeklyOverview.map((w) => {
                const isOpen = expandedWeek === w.week;

                const wow =
                  w.startWt != null && w.endWt != null
                    ? round1(w.endWt - w.startWt)
                    : null;

                const total =
                  startWeight != null && w.endWt != null
                    ? round1(w.endWt - startWeight)
                    : null;

                return (
                  <React.Fragment key={w.week}>
                    <tr
                      onClick={() => setExpandedWeek(isOpen ? null : w.week)}
                      style={{
                        borderTop: "1px solid #eee",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <td style={{ padding: "10px 8px", fontWeight: 900 }}>
                        {isOpen ? "▾" : "▸"} W{w.week}{" "}
                        <span style={{ fontWeight: 500, opacity: 0.7 }}>
                          ({rangeLabel(w.start, w.end)})
                        </span>
                      </td>
                      <td style={{ padding: "10px 8px" }}>
                        {w.dose != null ? `${w.dose}mg` : "—"}
                      </td>
                      <td style={{ padding: "10px 8px" }}>{formatMaybe(w.startWt)}</td>
                      <td style={{ padding: "10px 8px" }}>{formatMaybe(w.endWt)}</td>
                      <td
                        style={{
                          padding: "10px 8px",
                          color: wow != null && wow > 0 ? "#b45309" : "#047857",
                          fontWeight: 800,
                        }}
                      >
                        {formatMaybe(wow)}
                      </td>
                      <td style={{ padding: "10px 8px", color: "#047857", fontWeight: 800 }}>
                        {formatMaybe(total)}
                      </td>
                    </tr>

                    {isOpen ? (
                      <tr>
                        <td colSpan={6} style={{ padding: "10px 8px", background: "#fafafa" }}>
                          <table
                            style={{
                              width: "100%",
                              borderCollapse: "collapse",
                              background: "white",
                              borderRadius: 12,
                            }}
                          >
                            <thead>
                              <tr style={{ textAlign: "left", opacity: 0.7 }}>
                                <th style={{ padding: "10px 8px" }}>Day</th>
                                <th style={{ padding: "10px 8px" }}>Weight</th>
                                <th style={{ padding: "10px 8px" }}>Δ Weight</th>
                                <th style={{ padding: "10px 8px" }}>Calories</th>
                                <th style={{ padding: "10px 8px" }}>Protein</th>
                                <th style={{ padding: "10px 8px" }}>Steps</th>
                              </tr>
                            </thead>
                            <tbody>
                              {w.rowsDesc.map((r, idx) => {
                                const older =
                                  idx < w.rowsDesc.length - 1 ? w.rowsDesc[idx + 1] : null;

                                const delta =
                                  older?.weight != null && r.weight != null
                                    ? round1(r.weight - older.weight)
                                    : null;

                                return (
                                  <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                                    <td style={{ padding: "10px 8px", fontWeight: 900 }}>
                                      D{r.day_in_week}
                                      <span
                                        style={{
                                          marginLeft: 8,
                                          opacity: 0.6,
                                          fontWeight: 600,
                                        }}
                                      >
                                        ({r.entry_date})
                                      </span>
                                    </td>
                                    <td style={{ padding: "10px 8px", fontWeight: 900 }}>
                                      {formatMaybe(r.weight)}
                                    </td>
                                    <td style={{ padding: "10px 8px", fontWeight: 800 }}>
                                      <span
                                        style={{
                                          color:
                                            delta == null
                                              ? "#6b7280"
                                              : delta > 0
                                              ? "#dc2626"
                                              : "#059669",
                                          fontWeight: 700,
                                        }}
                                      >
                                        {formatMaybe(delta)}
                                      </span>
                                    </td>
                                    <td style={{ padding: "10px 8px" }}>{formatMaybe(r.calories)}</td>
                                    <td style={{ padding: "10px 8px" }}>
                                      {r.protein != null ? `${formatMaybe(r.protein)}g` : "—"}
                                    </td>
                                    <td style={{ padding: "10px 8px" }}>{formatMaybe(r.steps)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12 }}>
          <Link href="/journey" style={{ fontWeight: 900 }}>
            View full journey →
          </Link>
        </div>
      </Card>
    </div>
  );
}

// ---------- Header (safe default; remove if you already have global header in layout.tsx) ----------
function Header() {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <div>
        <div style={{ fontSize: 26, fontWeight: 950 }}>Zepbound Journey</div>
        <div style={{ opacity: 0.7 }}>Track your transformation 🎉</div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Link href="/" style={pillLinkStyle}>
          🏠 Dashboard
        </Link>
        <Link href="/measurements" style={pillLinkStyle}>
          📏 Measurements
        </Link>
        <Link href="/journey" style={pillLinkStyle}>
          🗺️ My Journey
        </Link>
      </div>
    </div>
  );
}

const pillLinkStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "white",
  fontWeight: 900,
  textDecoration: "none",
  color: "#111",
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 20, padding: 18, background: "white" }}>
      <div style={{ fontSize: 20, fontWeight: 950, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 90 }}>
      <div style={{ fontSize: 12, opacity: 0.85 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 950 }}>{value}</div>
    </div>
  );
}

function BigStat({ label, value, suffix }: { label: string; value: any; suffix?: string }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 16, padding: 14, minWidth: 160 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 950 }}>
        {value} <span style={{ fontSize: 12, opacity: 0.6 }}>{suffix}</span>
      </div>
    </div>
  );
}

function ChipStat({ label, value, suffix }: { label: string; value: any; suffix?: string }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 16, padding: 14, minWidth: 150 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 950 }}>
        {value}
        {suffix ? <span style={{ fontSize: 12, opacity: 0.6 }}> {suffix}</span> : null}
      </div>
    </div>
  );
}