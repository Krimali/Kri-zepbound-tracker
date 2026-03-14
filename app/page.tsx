"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { weekNumberFromISO, dayInWeekFromISO, weekRangeFromWeekNumber } from "@/lib/calendar";

type Entry = {
  id: string;
  entry_date: string;
  week_number: number;
  day_in_week: number;
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

type Exercise = {
  id: string;
  entry_id: string;
  exercise_type: string | null;
  minutes: number | null;
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

type TrendMode = "weekly" | "monthly" | "daily";

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
  const sameYear = s.getFullYear() === e.getFullYear();
  const startText = s.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endText = e.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (sameYear) {
    const endNoMonth = e.toLocaleDateString(undefined, { day: "numeric", year: "numeric" });
    return `${startText} – ${endNoMonth}`.replace(/(\d{4})$/, `${e.getFullYear()}`);
  }
  return `${startText} – ${endText}`;
}

function weekRangeLabelWithYear(startISO: string, endISO: string) {
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");
  const startText = s.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endText = e.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${startText} – ${endText}`;
}

function shortDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dayShortLabel(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" });
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

function lbsToKgText(n: number | null | undefined) {
  if (n == null) return "—";
  return `${round1(n * 0.453592)} kg`;
}

function bodyLossPercent(startWeight: number | null | undefined, lost: number | null | undefined) {
  if (startWeight == null || lost == null || startWeight === 0) return null;
  return round1((lost / startWeight) * 100);
}

function signed(n: number | null | undefined) {
  if (n == null) return "—";
  const rounded = round1(n);
  return `${rounded > 0 ? "+" : ""}${formatMaybe(rounded)}`;
}

function getExerciseMeta(type: string) {
  const t = type.toLowerCase();
  if (t.includes("weight")) return { icon: "🏋️", label: "Weights" };
  if (t.includes("yoga")) return { icon: "🧘", label: "Yoga" };
  if (t.includes("band")) return { icon: "💪", label: "Bands" };
  if (t.includes("walk")) return { icon: "🚶", label: "Walking" };
  return { icon: "✨", label: type };
}

export default function Dashboard() {
  const [authed, setAuthed] = useState<boolean>(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authStatus, setAuthStatus] = useState<string>("");

  const [status, setStatus] = useState("Loading...");
  const [goals, setGoals] = useState<GoalRow | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);

  const [todayRow, setTodayRow] = useState<Entry | null>(null);
  const [latestRow, setLatestRow] = useState<Entry | null>(null);
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [exercisesByEntry, setExercisesByEntry] = useState<Record<string, Exercise[]>>({});

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

  const [expandedWeeks, setExpandedWeeks] = useState<number[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [trendMode, setTrendMode] = useState<TrendMode>("weekly");

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
        const normalizedToday = tRow
          ? ({ ...(tRow as any), week_number: weekNumberFromISO((tRow as any).entry_date), day_in_week: dayInWeekFromISO((tRow as any).entry_date) } as Entry)
          : null;
        setTodayRow(normalizedToday);

        const { data: lRow, error: lErr } = await supabase
          .from("entries")
          .select("*")
          .order("entry_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lErr) throw lErr;
        const normalizedLatest = lRow
          ? ({ ...(lRow as any), week_number: weekNumberFromISO((lRow as any).entry_date), day_in_week: dayInWeekFromISO((lRow as any).entry_date) } as Entry)
          : null;
        setLatestRow(normalizedLatest);

        const { data: all, error: allErr } = await supabase
          .from("entries")
          .select("*")
          .order("entry_date", { ascending: false })
          .limit(500);
        if (allErr) throw allErr;

        const entries = (((all as any) ?? []) as Entry[]).map((r) => ({
          ...r,
          week_number: weekNumberFromISO(r.entry_date),
          day_in_week: dayInWeekFromISO(r.entry_date),
        }));

        setAllEntries(entries);

        const activeWeek =
          normalizedToday?.week_number ?? normalizedLatest?.week_number ?? null;

        const byWeek = new Map<number, Entry[]>();
        for (const r of entries) {
          byWeek.set(r.week_number, [...(byWeek.get(r.week_number) ?? []), r]);
        }

        const overview = Array.from(byWeek.entries())
          .sort((a, b) => b[0] - a[0])
          .slice(0, 12)
          .map(([week, rows]) => {
            const asc = [...rows].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
            const desc = [...asc].reverse();

            const fullRange = weekRangeFromWeekNumber(week);
            const start = fullRange.start;
            const end = fullRange.end;
            const startWt = asc[0]?.weight ?? null;
            const endWt = asc[asc.length - 1]?.weight ?? null;
            const dose = desc.find((x) => x.dose_mg != null)?.dose_mg ?? null;

            return { week, start, end, dose, startWt, endWt, rowsDesc: desc };
          });

        setWeeklyOverview(overview);

        if (activeWeek != null) {
          setExpandedWeeks([activeWeek]);
          setSelectedWeek(activeWeek);
        } else if (overview.length) {
          setExpandedWeeks([overview[0].week]);
        }

        const entryIds = entries.map((x) => x.id);
        if (entryIds.length) {
          const { data: xRows, error: xErr } = await supabase
            .from("exercises")
            .select("id, entry_id, exercise_type, minutes")
            .in("entry_id", entryIds)
            .order("created_at", { ascending: true });
          if (xErr) throw xErr;

          const map: Record<string, Exercise[]> = {};
          for (const ex of ((xRows as any) ?? []) as Exercise[]) {
            map[ex.entry_id] = map[ex.entry_id] ? [...map[ex.entry_id], ex] : [ex];
          }
          setExercisesByEntry(map);
        } else {
          setExercisesByEntry({});
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
      carbs: avg(nums("carbs")),
      fiber: avg(nums("fiber")),
      fat: avg(nums("fat")),
    };
  }, [selectedWeekRows]);

  const workoutSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of selectedWeekRows) {
      const exercises = exercisesByEntry[row.id] ?? [];
      for (const ex of exercises) {
        if (!ex.exercise_type) continue;
        const meta = getExerciseMeta(ex.exercise_type);
        counts.set(meta.label, (counts.get(meta.label) ?? 0) + 1);
      }
    }

    return ["Weights", "Yoga", "Bands", "Walking"]
      .filter((label) => counts.has(label))
      .map((label) => ({
        label,
        count: counts.get(label) ?? 0,
        icon: getExerciseMeta(label).icon,
      }));
  }, [selectedWeekRows, exercisesByEntry]);

  const weightTrendData = useMemo(() => {
    const nonNullEntries = allEntries.filter((e) => e.weight != null);

    if (trendMode === "daily") {
      const points = nonNullEntries
        .slice()
        .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
        .map((e) => ({
          key: e.entry_date,
          label: dayShortLabel(e.entry_date),
          sublabel: e.entry_date,
          value: e.weight as number,
        }));
      return points;
    }

    const byWeek = new Map<number, Entry[]>();
    for (const r of allEntries) {
      byWeek.set(r.week_number, [...(byWeek.get(r.week_number) ?? []), r]);
    }

    const weekly = Array.from(byWeek.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([week, rows]) => {
        const sorted = [...rows].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
        const latestWeight = [...sorted].reverse().find((x) => x.weight != null)?.weight ?? null;
        return latestWeight == null
          ? null
          : {
              key: `W${week}`,
              label: `W${week}`,
              sublabel: weekRangeLabelWithYear(weekRangeFromWeekNumber(week).start, weekRangeFromWeekNumber(week).end),
              value: latestWeight,
              week,
            };
      })
      .filter(Boolean) as { key: string; label: string; sublabel: string; value: number; week: number }[];

    if (trendMode === "weekly") return weekly;

    const monthly: { key: string; label: string; sublabel: string; value: number }[] = [];
    for (let i = 0; i < weekly.length; i += 4) {
      const chunk = weekly.slice(i, i + 4);
      if (!chunk.length) continue;
      const startWeek = chunk[0].week;
      const endWeek = chunk[chunk.length - 1].week;
      const ending = chunk[chunk.length - 1];
      monthly.push({
        key: `W${startWeek}-W${endWeek}`,
        label: `W${startWeek}–W${endWeek}`,
        sublabel: ending.sublabel,
        value: ending.value,
      });
    }
    return monthly;
  }, [allEntries, trendMode]);

  const currentWeight = latestRow?.weight ?? null;
  const startWeight = goals?.start_weight ?? null;
  const targetWeight = goals?.goal_weight ?? null;

  const totalLost =
    currentWeight != null && startWeight != null
      ? round1(startWeight - currentWeight)
      : null;

  const lostPercent = bodyLossPercent(startWeight, totalLost);

  const toGoal =
    currentWeight != null && targetWeight != null
      ? round1(currentWeight - targetWeight)
      : null;

  const progressPercent =
    startWeight != null && targetWeight != null && currentWeight != null && startWeight !== targetWeight
      ? Math.max(0, Math.min(100, Math.round(((startWeight - currentWeight) / (startWeight - targetWeight)) * 100)))
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
        
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ opacity: 0.85, fontWeight: 800 }}>{status}</div>
          <button onClick={signOut} style={{ ...pillLinkStyle, cursor: "pointer", padding: "8px 12px" }}>
            Sign out
          </button>
        </div>
      </div>

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
        <div
          style={{
            fontWeight: 900,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            opacity: 0.97,
            flex: "1 1 260px",
          }}
        >
          Today • {dayNameFromISO(t)}, {t}
        </div>

        <div
          style={{
            display: "flex",
            gap: 18,
            alignItems: "center",
            marginLeft: "auto",
            justifyContent: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <MiniStat label="Week" value={bannerWeek != null ? String(bannerWeek) : "—"} />
          <MiniStat label="Day" value={bannerDay != null ? String(bannerDay) : "—"} />
          <MiniStat label="Dose" value={bannerDose != null ? `${bannerDose} mg` : "—"} />
        </div>
      </div>

      <div style={{ height: 12 }} />

      <Card title="⚖️ Weight Progress">
        <div style={threeGrid}>
          <BigStat
            label="Starting"
            value={formatMaybe(startWeight)}
            suffix="lbs"
            subtext={lbsToKgText(startWeight)}
            bg="#E6CCB2"
            accent="#6f4a31"
          />
          <BigStat
            label="Current"
            value={formatMaybe(currentWeight)}
            suffix="lbs"
            subtext={lbsToKgText(currentWeight)}
            bg="#EDE0D4"
            accent="#6f4a31"
          />
          <BigStat
            label="Lost"
            value={formatMaybe(totalLost)}
            suffix="lbs"
            subtext={`${lbsToKgText(totalLost)}${lostPercent != null ? ` • ${lostPercent}% body-weight` : ""}`}
            bg="#fff7ed"
            accent="#ea580c"
          />
        </div>

        <div style={{ height: 12 }} />

        <div style={threeGrid}>
          <BigStat
            label="Goal"
            value={formatMaybe(targetWeight)}
            suffix="lbs"
            subtext={lbsToKgText(targetWeight)}
            bg="#aac38a"
            accent="#007730"
          />
          <BigStat
            label="To Goal"
            value={formatMaybe(toGoal)}
            suffix="lbs"
            subtext={lbsToKgText(toGoal)}
            bg="#CFE1B9"
            accent="#007730"
          />
          <ProgressStat value={progressPercent} />
        </div>
      </Card>

      <div style={{ height: 12 }} />

      <Card
        title="📏 Measurements Progress"
        subtitle={
          earliestMeasurementWithWaist || earliestMeasurementWithHip
            ? `From ${shortDate(
                earliestMeasurementWithWaist?.measure_date ?? earliestMeasurementWithHip?.measure_date ?? t
              )} to ${shortDate(
                latestMeasurementWithWaist?.measure_date ?? latestMeasurementWithHip?.measure_date ?? t
              )}`
            : "Add measurements to see progress"
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
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
        </div>
      </Card>

      <div style={{ height: 12 }} />

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

            <div style={{ fontWeight: 800, opacity: 0.75, minWidth: 160, textAlign: "center" }}>
              {selectedWeekMeta ? weekRangeLabelWithYear(selectedWeekMeta.start, selectedWeekMeta.end) : ""}
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
          <BigStat label="Calories" value={formatMaybe(weekAvg.calories)} bg="#fdf2f8" accent="#db2777" />
          <BigStat label="Protein" value={formatMaybe(weekAvg.protein)} suffix="g" bg="#ecfdf5" accent="#10b981" />
          <BigStat label="Carbs" value={formatMaybe(weekAvg.carbs)} suffix="g" bg="#eef2ff" accent="#2563eb" />
          <BigStat label="Fat" value={formatMaybe(weekAvg.fat)} suffix="g" bg="#fef3c7" accent="#d97706" />
          <BigStat label="Fiber" value={formatMaybe(weekAvg.fiber)} suffix="g" bg="#fff7ed" accent="#f59e0b" />
        </div>

        <div style={{ height: 12 }} />

        <div style={twoGrid}>
          <BigStat label="Steps" value={formatWhole(weekAvg.steps)} bg="#FACDD0" accent="#b5000c" />
          <WorkoutSummaryCard items={workoutSummary} />
        </div>
      </Card>

      <div style={{ height: 12 }} />

      <Card
        title="📈 Weight Trend"
        right={
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <TrendToggle value={trendMode} setValue={setTrendMode} option="weekly" label="Weekly" />
            <TrendToggle value={trendMode} setValue={setTrendMode} option="monthly" label="Monthly" />
            <TrendToggle value={trendMode} setValue={setTrendMode} option="daily" label="Daily" />
          </div>
        }
      >
        <WeightTrendChart data={weightTrendData} mode={trendMode} />
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
                const isOpen = expandedWeeks.includes(w.week);

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
                      onClick={() =>
                        setExpandedWeeks((prev) =>
                          prev.includes(w.week)
                            ? prev.filter((x) => x !== w.week)
                            : [...prev, w.week]
                        )
                      }
                      style={{
                        borderTop: "1px solid #eee",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <td style={{ padding: "10px 8px", fontWeight: 900 }}>
                        {isOpen ? "▾" : "▸"} W{w.week}{" "}
                        <span style={{ fontWeight: 500, opacity: 0.7 }}>
                          ({weekRangeLabelWithYear(w.start, w.end)})
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
                              minWidth: 360,
                            }}
                          >
                            <thead>
                              <tr style={{ textAlign: "left", opacity: 0.7 }}>
                                <th style={{ padding: "10px 8px" }}>Day</th>
                                <th style={{ padding: "10px 8px" }}>Weight</th>
                                <th style={{ padding: "10px 8px" }}>Δ</th>
                              </tr>
                            </thead>
                            <tbody>
                              {w.rowsDesc.map((r, idx) => {
                                const older = idx < w.rowsDesc.length - 1 ? w.rowsDesc[idx + 1] : null;
                                const delta =
                                  older?.weight != null && r.weight != null
                                    ? round1(r.weight - older.weight)
                                    : null;

                                return (
                                  <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                                    <td style={{ padding: "10px 8px", fontWeight: 900 }}>
                                      D{r.day_in_week} ({dayShortLabel(r.entry_date)})
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
  padding: "8px 12px",
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

const twoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const threeGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
  subtext,
  bg,
  accent,
}: {
  label: string;
  value: any;
  suffix?: string;
  subtext?: string;
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
      {subtext ? (
        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.65, fontWeight: 700 }}>
          {subtext}
        </div>
      ) : null}
    </div>
  );
}

function ProgressStat({ value }: { value: number | null }) {
  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: 16,
        padding: 14,
        background: "#ecf9de",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 8 }}>Progress</div>
      <div style={{ fontSize: 22, fontWeight: 950, color: "#007730" }}>
        {value != null ? `${value}% there` : "—"}
      </div>
      <div style={{ marginTop: 10, height: 6, background: "#bef6d4", borderRadius: 999, overflow: "hidden" }}>
        <div
          style={{
            width: `${value ?? 0}%`,
            height: "100%",
            background: "linear-gradient(90deg, #007730, #9becbc)",
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
}

function WorkoutSummaryCard({ items }: { items: { label: string; count: number; icon: string }[] }) {
  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: 16,
        padding: 14,
        background: "#FACDD0",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 8 }}>Workouts</div>
      {items.length ? (
        <div style={{ display: "grid", gap: 6 }}>
          {items.map((item) => (
            <div key={item.label} style={{ fontWeight: 600, color: "#b5000c" }}>
              {item.icon} {item.label} ×{item.count}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ opacity: 0.6, fontWeight: 700 }}>No workouts logged</div>
      )}
    </div>
  );
}

function TrendToggle({
  value,
  setValue,
  option,
  label,
}: {
  value: TrendMode;
  setValue: (v: TrendMode) => void;
  option: TrendMode;
  label: string;
}) {
  const active = value === option;
  return (
    <button
      onClick={() => setValue(option)}
      style={{
        borderRadius: 999,
        border: active ? "1px solid #7c3aed" : "1px solid #e5e7eb",
        background: active ? "#f5f3ff" : "white",
        color: active ? "#6d28d9" : "#374151",
        fontWeight: 800,
        padding: "8px 12px",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function WeightTrendChart({
  data,
  mode,
}: {
  data: { key: string; label: string; sublabel: string; value: number }[];
  mode: TrendMode;
}) {
  const height = 300;
  const padLeft = 48;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 44;
  const pointGap = mode === "daily" ? 52 : 76;
  const width = Math.max(720, padLeft + padRight + (Math.max(data.length - 1, 1) * pointGap));
  const minY = 140;
  const maxY = 250;
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

  const y = (v: number) => padTop + ((maxY - v) / (maxY - minY)) * innerH;

  const path = data
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`)
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
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", minWidth: width, height: "auto", display: "block" }}>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={padLeft} x2={width - padRight} y1={y(tick)} y2={y(tick)} stroke="#e5e7eb" strokeWidth="1" />
            <text x={padLeft - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#6b7280">
              {tick}
            </text>
          </g>
        ))}

        <line x1={padLeft} x2={width - padRight} y1={height - padBottom} y2={height - padBottom} stroke="#d1d5db" strokeWidth="1.5" />

        <path d={path} fill="none" stroke="#7c3aed" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {data.map((p, i) => {
          const isFirst = i === 0;
          const isLast = i === data.length - 1;
          const showMidLabel = !isFirst && !isLast && i % 2 === 0;
          const showValueLabel = isFirst || isLast || showMidLabel;
          return (
            <g key={p.key}>
              <circle cx={x(i)} cy={y(p.value)} r="4.5" fill="#db2777" />
              {showValueLabel ? (
                <text x={x(i)} y={y(p.value) - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill="#7c3aed">
                  {formatMaybe(p.value)}
                </text>
              ) : null}
              <text x={x(i)} y={height - padBottom + 18} textAnchor="middle" fontSize="11" fill="#6b7280">
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
