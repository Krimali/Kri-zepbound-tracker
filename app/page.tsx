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

type MeasurementRow = {
  id: string;
  measure_date: string;
  waist: number | null;
  hip: number | null;
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

function shortDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function formatMaybe(n: number | null | undefined) {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : String(round1(n));
}

function formatWhole(n: number | null | undefined) {
  if (n == null) return "—";
  return String(Math.round(n));
}

function signed(n: number | null | undefined) {
  if (n == null) return "—";
  const rounded = round1(n);
  return `${rounded > 0 ? "+" : ""}${formatMaybe(rounded)}`;
}

export default function Dashboard() {
  // ---------- Auth ----------
  const [authed, setAuthed] = useState<boolean>(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authStatus, setAuthStatus] = useState<string>("");

  // ---------- Data ----------
  const [status, setStatus] = useState("Loading...");
  const [goals, setGoals] = useState<GoalRow | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);

  const [todayRow, setTodayRow] = useState<Entry | null>(null);
  const [latestRow, setLatestRow] = useState<Entry | null>(null);

  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [weeklyOverview, setWeeklyOverview] = useState<
    {
      week: number;
      start: string;
      end: string;
      dose: number | null;
      startWt: number | null;
      endWt: number | null;
      rowsDesc: Entry[];
    }[]
  >([]);

  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  const t = useMemo(() => todayISO(), []);

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

  useEffect(() => {
    if (!authed) return;

    async function load() {
      try {
        setStatus("Loading...");

        const { data: g, error: gErr } = await supabase
          .from("goals")
          .select("*")
          .limit(1)
          .maybeSingle();
        if (gErr) throw gErr;
        setGoals((g as any) ?? null);

        const { data: mRows, error: mErr } = await supabase
          .from("measurements")
          .select("id, measure_date, waist, hip")
          .order("measure_date", { ascending: true });
        if (mErr) throw mErr;
        setMeasurements(((mRows as any) ?? []) as MeasurementRow[]);

        const { data: tRow, error: tErr } = await supabase
          .from("entries")
          .select("*")
          .eq("entry_date", t)
          .maybeSingle();
        if (tErr) throw tErr;
        setTodayRow((tRow as any) ?? null);

        const { data: lRow, error: lErr } = await supabase
          .from("entries")
          .select("*")
          .order("entry_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lErr) throw lErr;
        setLatestRow((lRow as any) ?? null);

        const { data: all, error: allErr } = await supabase
          .from("entries")
          .select("*")
          .order("week_number", { ascending: false })
          .order("entry_date", { ascending: false })
          .limit(500);
        if (allErr) throw allErr;

        const entries = (((all as any) ?? []) as Entry[]);
        setAllEntries(entries);

        const activeWeek =
          (tRow as any)?.week_number ?? (lRow as any)?.week_number ?? null;

        const byWeek = new Map<number, Entry[]>();
        for (const r of entries) {
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

            const dose = desc.find((x) => x.dose_mg != null)?.dose_mg ?? null;

            return { week, start, end, dose, startWt, endWt, rowsDesc: desc };
          });

        setWeeklyOverview(overview);

        if (activeWeek != null) {
          setExpandedWeek(activeWeek);
          setSelectedWeek(activeWeek);
        } else if (overview.length) {
          setExpandedWeek(overview[0].week);
          setSelectedWeek(overview[0].week);
        }

        setStatus("✅ Loaded");
      } catch (e: any) {
        console.error(e);
        setStatus(`❌ ${e?.message ?? "Load failed"}`);
      }
    }

    load();
  }, [authed, t]);

  const selectedWeekRows = useMemo(() => {
    if (selectedWeek == null) return [];
    return allEntries
      .filter((r) => r.week_number === selectedWeek)
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  }, [allEntries, selectedWeek]);

  const selectedWeekMeta = useMemo(() => {
    return weeklyOverview.find((w) => w.week === selectedWeek) ?? null;
  }, [weeklyOverview, selectedWeek]);

  const weekAvg = useMemo(() => {
    const nums = (key: keyof Entry) =>
      selectedWeekRows
        .map((r) => (typeof r[key] === "number" ? (r[key] as number) : null))
        .filter((x) => x != null) as number[];

    const avg = (arr: number[]) =>
      arr.length ? round1(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const avgWhole = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    return {
      steps: avgWhole(nums("steps")),
      calories: avg(nums("calories")),
      protein: avg(nums("protein")),
      fiber: avg(nums("fiber")),
      fat: avg(nums("fat")),
    };
  }, [selectedWeekRows]);

  // Weight Trend Chart by Week
    const weightTrend = useMemo(() => {
      const byWeek = new Map<number, Entry[]>();

      for (const r of allEntries) {
        byWeek.set(r.week_number, [...(byWeek.get(r.week_number) ?? []), r]);
      }

      return Array.from(byWeek.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([week, rows]) => {
          const sorted = [...rows].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
          const latestWeight = [...sorted].reverse().find((x) => x.weight != null)?.weight ?? null;
          return {
            week,
            weight: latestWeight,
          };
        })
        .filter((x) => x.weight != null) as { week: number; weight: number }[];
    }, [allEntries]);

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
  const bannerDose =
    todayRow?.dose_mg ??
    latestRow?.dose_mg ??
    selectedWeekRows.find((e) => e.dose_mg != null)?.dose_mg ??
    null;

  const weekList = weeklyOverview.map((w) => w.week);
  const selectedWeekIndex = selectedWeek != null ? weekList.indexOf(selectedWeek) : -1;
  const canGoOlder = selectedWeekIndex >= 0 && selectedWeekIndex < weekList.length - 1;
  const canGoNewer = selectedWeekIndex > 0;

  const earliestMeasurementWithWaist = measurements.find((m) => m.waist != null) ?? null;
  const latestMeasurementWithWaist = [...measurements].reverse().find((m) => m.waist != null) ?? null;
  const earliestMeasurementWithHip = measurements.find((m) => m.hip != null) ?? null;
  const latestMeasurementWithHip = [...measurements].reverse().find((m) => m.hip != null) ?? null;

  const waistDelta =
    earliestMeasurementWithWaist?.waist != null && latestMeasurementWithWaist?.waist != null
      ? round1(latestMeasurementWithWaist.waist - earliestMeasurementWithWaist.waist)
      : null;

  const hipDelta =
    earliestMeasurementWithHip?.hip != null && latestMeasurementWithHip?.hip != null
      ? round1(latestMeasurementWithHip.hip - earliestMeasurementWithHip.hip)
      : null;

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

  if (!authed) {
    return (
      <div style={{ padding: "16px 12px 28px", maxWidth: 520, margin: "0 auto" }}>
        <div
          style={{
            border: "1px solid #eee",
            borderRadius: 18,
            padding: 16,
            background: "white",
          }}
        >
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

  return (
    <div style={{ padding: "12px 12px 40px", maxWidth: 1100, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <div style={{ opacity: 0.85, fontWeight: 800 }}>{status}</div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={signOut} style={{ ...pillLinkStyle, cursor: "pointer", padding: "8px 12px" }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Today banner */}
      <div
        style={{
          borderRadius: 20,
          padding: 16,
          color: "white",
          background: "linear-gradient(90deg, #7c3aed, #db2777)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", opacity: 0.97 }}>
          Today • {dayNameFromISO(t)}, {t}
        </div>

        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <MiniStat label="Week" value={bannerWeek != null ? String(bannerWeek) : "—"} />
          <MiniStat label="Day" value={bannerDay != null ? String(bannerDay) : "—"} />
          <MiniStat label="Dose" value={bannerDose != null ? `${bannerDose} mg` : "—"} />
        </div>
      </div>

      <div style={{ height: 12 }} />

      {/* Weight progress */}
      <Card title="⚖️ Weight Progress">
        <div style={statsGrid}>
          <BigStat
            label="Starting"
            value={formatMaybe(startWeight)}
            suffix="lbs"
            bg="#f8f7ff"
            accent="#7c3aed"
          />
          <BigStat
            label="Lost"
            value={formatMaybe(totalLost)}
            suffix="lbs"
            bg="#ecfdf5"
            accent="#059669"
          />
          <BigStat
            label="Current"
            value={formatMaybe(currentWeight)}
            suffix="lbs"
            bg="#eef2ff"
            accent="#2563eb"
          />
          <BigStat
            label="To Goal"
            value={formatMaybe(toGoal)}
            suffix="lbs"
            bg="#fff7ed"
            accent="#ea580c"
          />
        </div>

        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            borderRadius: 14,
            background: "#faf7ff",
            border: "1px solid #eee",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 800 }}>
            Goal: {formatMaybe(targetWeight)} lbs
          </div>

          {startWeight != null && targetWeight != null && currentWeight != null ? (
            <div style={{ color: "#7c3aed", fontWeight: 900 }}>
              {Math.round(
                ((startWeight - currentWeight) / (startWeight - targetWeight)) * 100
              )}
              % there
            </div>
          ) : null}
        </div>
      </Card>

      <div style={{ height: 12 }} />

      {/* Measurements progress */}
      <Card
        title="📏 Measurements Progress"
        subtitle={
          earliestMeasurementWithWaist || earliestMeasurementWithHip
            ? `From ${shortDate(
                earliestMeasurementWithWaist?.measure_date ??
                  earliestMeasurementWithHip?.measure_date ??
                  t
              )} to ${shortDate(
                latestMeasurementWithWaist?.measure_date ??
                  latestMeasurementWithHip?.measure_date ??
                  t
              )}`
            : "Add measurements to see progress"
        }
      >
        <div style={statsGrid}>
          <BigStat
            label="Waist Start"
            value={formatMaybe(earliestMeasurementWithWaist?.waist)}
            suffix="cm"
            bg="#fff7ed"
            accent="#f97316"
          />
          <BigStat
            label="Waist Latest"
            value={formatMaybe(latestMeasurementWithWaist?.waist)}
            suffix="cm"
            bg="#fff7ed"
            accent="#ea580c"
          />
          <BigStat
            label="Waist Δ"
            value={signed(waistDelta)}
            suffix="cm"
            bg="#fff7ed"
            accent={waistDelta != null && waistDelta <= 0 ? "#059669" : "#dc2626"}
          />
          </div>
          <div style={statsGrid}>
          <BigStat
            label="Hip Start"
            value={formatMaybe(earliestMeasurementWithHip?.hip)}
            suffix="cm"
            bg="#eff6ff"
            accent="#2563eb"
          />
          <BigStat
            label="Hip Latest"
            value={formatMaybe(latestMeasurementWithHip?.hip)}
            suffix="cm"
            bg="#eff6ff"
            accent="#1d4ed8"
          />
          <BigStat
            label="Hip Δ"
            value={signed(hipDelta)}
            suffix="cm"
            bg="#eff6ff"
            accent={hipDelta != null && hipDelta <= 0 ? "#059669" : "#dc2626"}
          />
        </div>
      </Card>

      <div style={{ height: 12 }} />

      {/* Week averages */}
      <Card
        title={`📊 Week ${selectedWeek ?? "—"} Averages`}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => {
                if (!canGoOlder) return;
                setSelectedWeek(weekList[selectedWeekIndex + 1]);
              }}
              disabled={!canGoOlder}
              style={{ ...navBtn, opacity: canGoOlder ? 1 : 0.4 }}
            >
              ‹
            </button>

            <div style={{ fontWeight: 800, opacity: 0.75, minWidth: 96, textAlign: "center" }}>
              {selectedWeekMeta ? rangeLabel(selectedWeekMeta.start, selectedWeekMeta.end) : ""}
            </div>

            <button
              onClick={() => {
                if (!canGoNewer) return;
                setSelectedWeek(weekList[selectedWeekIndex - 1]);
              }}
              disabled={!canGoNewer}
              style={{ ...navBtn, opacity: canGoNewer ? 1 : 0.4 }}
            >
              ›
            </button>
          </div>
        }
      >
        <div style={statsGrid}>
          <BigStat
            label="Protein"
            value={formatMaybe(weekAvg.protein)}
            suffix="g"
            bg="#ecfdf5"
            accent="#10b981"
          />
          <BigStat
            label="Fiber"
            value={formatMaybe(weekAvg.fiber)}
            suffix="g"
            bg="#fff7ed"
            accent="#f59e0b"
          />
          <BigStat
            label="Fat"
            value={formatMaybe(weekAvg.fat)}
            suffix="g"
            bg="#fef3c7"
            accent="#d97706"
          />
          <BigStat
            label="Calories"
            value={formatMaybe(weekAvg.calories)}
            bg="#fdf2f8"
            accent="#db2777"
          />
          <BigStat
            label="Steps"
            value={formatWhole(weekAvg.steps)}
            bg="#eff6ff"
            accent="#2563eb"
          />
        </div>
      </Card>

            <div style={{ height: 12 }} />

      <Card title="📈 Weight Trend"> <WeightTrendChart data={weightTrend} />
      </Card>

      <div style={{ height: 12 }} />

      <Card title="📋 Weekly Overview (tap week to expand)">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.7 }}>
                <th style={{ padding: "10px 8px" }}>Week</th>
                <th style={{ padding: "10px 8px" }}>Dose</th>
                <th style={{ padding: "10px 8px" }}>Start</th>
                <th style={{ padding: "10px 8px" }}>End</th>
                <th style={{ padding: "10px 8px" }}>Weekly Δ</th>
                <th style={{ padding: "10px 8px" }}>Total</th>
              </tr>
            </thead>

            <tbody>
              {weeklyOverview.map((w) => {
                const isOpen = expandedWeek === w.week;

                const currentIndex = weeklyOverview.findIndex((x) => x.week === w.week);
                const prevWeek = currentIndex < weeklyOverview.length - 1 ? weeklyOverview[currentIndex + 1] : null;

                const wow =
                  w.endWt != null && prevWeek?.endWt != null
                    ? round1(w.endWt - prevWeek.endWt)
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

const pillLinkStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "white",
  fontWeight: 900,
  textDecoration: "none",
  color: "#111",
};

const navBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "white",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 22,
  lineHeight: "1",
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: 18,
        padding: 14,
        background: "white",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 950 }}>{title}</div>
          {subtitle ? <div style={{ marginTop: 4, opacity: 0.65, fontSize: 13 }}>{subtitle}</div> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      {children}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 74 }}>
      <div style={{ fontSize: 12, opacity: 0.9 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 950 }}>{value}</div>
    </div>
  );
}

function BigStat({
  label,
  value,
  suffix,
  bg,
  accent,
}: {
  label: string;
  value: any;
  suffix?: string;
  bg?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: 16,
        padding: 14,
        minWidth: 0,
        background: bg ?? "white",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.4)",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 950, color: accent ?? "#111827" }}>
        {value} <span style={{ fontSize: 12, opacity: 0.7 }}>{suffix}</span>
      </div>
    </div>
  );
}
function WeightTrendChart({
  data,
}: {
  data: { week: number; weight: number }[];
}) {
  const width = 900;
  const height = 280;
  const padLeft = 48;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 38;

  const minY = 140;
  const maxY = 240;

  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  if (!data.length) {
    return (
      <div
        style={{
          height: 220,
          border: "1px solid #eee",
          borderRadius: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6b7280",
        }}
      >
        No weight data yet.
      </div>
    );
  }

  const x = (i: number) =>
    padLeft + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);

  const y = (v: number) =>
    padTop + ((maxY - v) / (maxY - minY)) * innerH;

  const path = data
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.weight)}`)
    .join(" ");

  const yTicks = [140, 160, 180, 200, 220, 240, 250];

  return (
    <div
      style={{
        width: "100%",
        overflowX: "auto",
        border: "1px solid #eee",
        borderRadius: 16,
        background: "linear-gradient(180deg, #ffffff 0%, #fafafa 100%)",
      }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", minWidth: 640, height: "auto", display: "block" }}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={y(tick)}
              y2={y(tick)}
              stroke="#e5e7eb"
              strokeWidth="1"
            />
            <text
              x={padLeft - 8}
              y={y(tick) + 4}
              textAnchor="end"
              fontSize="11"
              fill="#6b7280"
            >
              {tick}
            </text>
          </g>
        ))}

        <line
          x1={padLeft}
          x2={width - padRight}
          y1={height - padBottom}
          y2={height - padBottom}
          stroke="#d1d5db"
          strokeWidth="1.5"
        />

        <path
          d={path}
          fill="none"
          stroke="#7c3aed"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {data.map((p, i) => (
          <g key={p.week}>
            <circle cx={x(i)} cy={y(p.weight)} r="4.5" fill="#db2777" />
            <text
              x={x(i)}
              y={height - padBottom + 18}
              textAnchor="middle"
              fontSize="11"
              fill="#6b7280"
            >
              W{p.week}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}