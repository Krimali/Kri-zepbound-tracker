"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { weekNumberFromISO, dayInWeekFromISO, weekRangeFromWeekNumber } from "@/lib/calendar";

type Entry = {
  id: string;
  entry_date: string; // YYYY-MM-DD
  week_number: number;
  day_in_week: number; // Tue=1 ... Mon=7
  weight: number | null;
  steps: number | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  mood: string | null;
  dose_mg: number | null;
  is_injection_day: boolean | null;
  injection_site: string | null;
};

type Exercise = {
  id: string;
  entry_id: string;
  exercise_type: string | null;
  minutes: number | null;
};

type GoalRow = {
  id: string;
  start_weight: number | null;
  target_weight: number | null;
};

function fmtDate(iso: string) {
  // iso: YYYY-MM-DD
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function weekdayName(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span style={{ opacity: 0.5 }}>—</span>;
  const isUp = value > 0;
  const color = isUp ? "#b45309" : "#047857";
  const text = (value > 0 ? "+" : "") + String(round1(value));
  return <span style={{ color, fontWeight: 800 }}>{text}</span>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid #eee",
        background: "#fafafa",
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: 18,
        padding: 12,
        background: "linear-gradient(180deg, #ffffff 0%, #fcfcff 100%)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{title}</div>
          {subtitle ? <div style={{ marginTop: 4, opacity: 0.7, fontSize: 13 }}>{subtitle}</div> : null}
        </div>
      </div>
      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  );
}

export default function JourneyPage() {
  const [status, setStatus] = useState("Loading...");
  const [goals, setGoals] = useState<GoalRow | null>(null);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [exercisesByEntry, setExercisesByEntry] = useState<Record<string, Exercise[]>>({});

  const [expandedWeeks, setExpandedWeeks] = useState<number[]>([]);

  useEffect(() => {
    async function load() {
      try {
        setStatus("Loading...");

        // Goals (optional, used for "Total" since starting weight)
        const { data: eRows, error: eErr } = await supabase
          .from("entries")
          .select(
            "id, entry_date, week_number, day_in_week, weight, steps, calories, protein, carbs, fat, fiber, mood, dose_mg, is_injection_day, injection_site"
          )
          .order("entry_date", { ascending: false })
          .limit(400);

        if (eErr) throw eErr;

        const list = ((eRows ?? []) as any as Entry[]).map((r) => ({
          ...r,
          week_number: weekNumberFromISO(r.entry_date),
          day_in_week: dayInWeekFromISO(r.entry_date),
        }));

        setEntries(list);

        // Expand latest week by default
        const latestWeek = list[0]?.week_number ?? null;
        setExpandedWeeks(latestWeek != null ? [latestWeek] : []);

        // Exercises for those entries
        const entryIds = list.map((x) => x.id);
        if (entryIds.length) {
          const { data: xRows, error: xErr } = await supabase
            .from("exercises")
            .select("id, entry_id, exercise_type, minutes")
            .in("entry_id", entryIds)
            .order("created_at", { ascending: true });

          if (xErr) throw xErr;

          const map: Record<string, Exercise[]> = {};
          for (const ex of (xRows ?? []) as any as Exercise[]) {
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
  }, []);

  const weeks = useMemo(() => {
    const byWeek = new Map<number, Entry[]>();

    for (const e of entries) {
      byWeek.set(e.week_number, [...(byWeek.get(e.week_number) ?? []), e]);
    }

    const avg = (vals: (number | null)[]) => {
      const nums = vals.filter((v): v is number => v != null);
      if (!nums.length) return null;
      return round1(nums.reduce((a, b) => a + b, 0) / nums.length);
    };

    return Array.from(byWeek.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([week, weekRows]) => {
        const desc = [...weekRows].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
        const asc = [...weekRows].sort((a, b) => a.entry_date.localeCompare(b.entry_date));

        const fullRange = weekRangeFromWeekNumber(week);
        const startDate = fullRange.start;
        const endDate = fullRange.end;

        const startWt = asc[0]?.weight ?? null;
        const endWt = asc[asc.length - 1]?.weight ?? null;

        const dose = desc.find((x) => x.dose_mg != null)?.dose_mg ?? null;

        const delta =
          startWt != null && endWt != null ? round1(endWt - startWt) : null;

        const startGoalWeight =
          (goals as any)?.start_weight ??
          (goals as any)?.startWeight ??
          null;

        const totalWeight =
          startGoalWeight != null && endWt != null
            ? round1(endWt - startGoalWeight)
            : null;

        const avgCalories = avg(asc.map((x) => x.calories));
        const avgProtein = avg(asc.map((x) => x.protein));
        const avgCarbs = avg(asc.map((x) => x.carbs));
        const avgFat = avg(asc.map((x) => x.fat));
        const avgFiber = avg(asc.map((x) => x.fiber));

        const deltaByDate = new Map<string, number | null>();
        for (let i = 0; i < asc.length; i++) {
          const cur = asc[i];
          const prev = asc[i - 1];
          if (!prev || cur.weight == null || prev.weight == null) {
            deltaByDate.set(cur.entry_date, null);
          } else {
            deltaByDate.set(cur.entry_date, round1(cur.weight - prev.weight));
          }
        }

        return {
          week,
          desc,
          startDate,
          endDate,
          dose,
          startWt,
          endWt,
          delta,
          totalWeight,
          avgCalories,
          avgProtein,
          avgCarbs,
          avgFat,
          avgFiber,
          deltaByDate,
        };
      });
  }, [entries, goals?.start_weight]);

  return (
    <div style={{ maxWidth: 1480, margin: "0 auto", padding: "10px 8px 36px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>My Journey</div>
        </div>
        <div style={{ opacity: 0.75, fontWeight: 700 }}>{status}</div>
      </div>

      <div style={{ height: 16 }} />

      <Card
        title="📋 Detailed Weekly Overview"
        //subtitle="Tap a week row to expand daily breakdown. Days are newest → oldest (D7…D1)."
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.7 }}>
                <th style={{ padding: "10px 8px" }}>Week</th>
                <th style={{ padding: "10px 8px" }}>Dose</th>
                <th style={{ padding: "10px 8px" }}>Start</th>
                <th style={{ padding: "10px 8px" }}>End</th>
                <th style={{ padding: "10px 8px" }}>Delta</th>
                <th style={{ padding: "10px 8px" }}>Total Weight</th>
                <th style={{ padding: "10px 8px" }}>Calories</th>
                <th style={{ padding: "10px 8px" }}>Protein</th>
                <th style={{ padding: "10px 8px" }}>Carbs</th>
                <th style={{ padding: "10px 8px" }}>Fat</th>
                <th style={{ padding: "10px 8px" }}>Fiber</th>
              </tr>
            </thead>

            <tbody>
              {weeks.map((w) => {
                const isOpen = expandedWeeks.includes(w.week);

                return (
                  <FragmentWeek
                    key={w.week}
                    isOpen={isOpen}
                    onToggle={() =>
                      setExpandedWeeks((prev) =>
                        prev.includes(w.week)
                          ? prev.filter((x) => x !== w.week)
                          : [...prev, w.week]
                      )
                    }
                    week={w.week}
                    rangeLabel={
                      w.startDate && w.endDate
                        ? `${fmtDate(w.startDate)} – ${fmtDate(w.endDate)}, ${new Date(
                            w.endDate + "T00:00:00"
                          ).getFullYear()}`
                        : ""
                    }
                    dose={w.dose}
                    startWt={w.startWt}
                    endWt={w.endWt}
                    delta={w.delta}
                    totalWeight={w.totalWeight}
                    avgCalories={w.avgCalories}
                    avgProtein={w.avgProtein}
                    avgCarbs={w.avgCarbs}
                    avgFat={w.avgFat}
                    avgFiber={w.avgFiber}
                    days={w.desc}
                    deltaByDate={w.deltaByDate}
                    exercisesByEntry={exercisesByEntry}
                  />
                );
              })}

              {!weeks.length ? (
                <tr>
                  <td colSpan={11} style={{ padding: 16, opacity: 0.7 }}>
                    No entries yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
          Total uses your <b>Start Weight</b> from the <code>goals</code> table (if set).
        </div>
      </Card>
    </div>
  );
}

function FragmentWeek(props: {
  isOpen: boolean;
  onToggle: () => void;

  week: number;
  rangeLabel: string;

  dose: number | null;
  startWt: number | null;
  endWt: number | null;
  delta: number | null;
  totalWeight: number | null;
  avgCalories: number | null;
  avgProtein: number | null;
  avgCarbs: number | null;
  avgFat: number | null;
  avgFiber: number | null;

  days: Entry[];
  deltaByDate: Map<string, number | null>;
  exercisesByEntry: Record<string, Exercise[]>;
}) {
  const {
    isOpen,
    onToggle,
    week,
    rangeLabel,
    dose,
    startWt,
    endWt,
    delta,
    totalWeight,
    avgCalories,
    avgProtein,
    avgCarbs,
    avgFat,
    avgFiber,
    days,
    deltaByDate,
    exercisesByEntry,
  } = props;

  const deltaColor = delta != null && delta > 0 ? "#b45309" : "#047857";

  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          borderTop: "1px solid #eee",
          cursor: "pointer",
          background: isOpen ? "#faf7ff" : "transparent",
        }}
      >
        <td style={{ padding: "10px 6px", fontWeight: 900 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14 }}>{isOpen ? "▾" : "▸"}</span>
            <span>W{week}</span>
            {rangeLabel ? <span style={{ fontWeight: 700, opacity: 0.6 }}>({rangeLabel})</span> : null}
          </span>
        </td>

        <td style={{ padding: "10px 8px" }}>
          {dose != null ? <Pill>💉 {dose}mg</Pill> : <span style={{ opacity: 0.5 }}>—</span>}
        </td>
        <td style={{ padding: "10px 8px" }}>{startWt ?? "—"}</td>
        <td style={{ padding: "10px 8px" }}>{endWt ?? "—"}</td>
        <td style={{ padding: "10px 8px", fontWeight: 900, color: deltaColor }}>{delta ?? "—"}</td>
        <td style={{ padding: "10px 8px", fontWeight: 900, color: "#047857" }}>{totalWeight ?? "—"}</td>
        <td style={{ padding: "10px 8px" }}>{avgCalories ?? "—"}</td>
        <td style={{ padding: "10px 8px" }}>{avgProtein != null ? `${avgProtein}g` : "—"}</td>
        <td style={{ padding: "10px 8px" }}>{avgCarbs != null ? `${avgCarbs}g` : "—"}</td>
        <td style={{ padding: "10px 8px" }}>{avgFat != null ? `${avgFat}g` : "—"}</td>
        <td style={{ padding: "10px 8px" }}>{avgFiber != null ? `${avgFiber}g` : "—"}</td>
      </tr>

      {isOpen ? (
        <tr style={{ borderTop: "1px solid #eee" }}>
          <td colSpan={11} style={{ padding: 12 }}>
            <div
              style={{
                border: "1px solid #eee",
                borderRadius: 16,
                background: "white",
                overflow: "hidden",
              }}
            >

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 940 }}>
                  <thead>
                    <tr style={{ textAlign: "left", opacity: 0.7 }}>
                      <th style={{ padding: "10px 8px" }}>Day</th>
                      <th style={{ padding: "10px 8px" }}>Weight</th>
                      <th style={{ padding: "10px 8px" }}>Weekly Δ</th>
                      <th style={{ padding: "10px 8px" }}>Calories</th>
                      <th style={{ padding: "10px 8px" }}>Protein</th>
                      <th style={{ padding: "10px 8px" }}>Carbs</th>
                      <th style={{ padding: "10px 8px" }}>Fat</th>
                      <th style={{ padding: "10px 8px" }}>Fiber</th>
                      <th style={{ padding: "10px 8px" }}>Steps</th>
                      <th style={{ padding: "10px 8px" }}>Exercise</th>
                    </tr>
                  </thead>

                  <tbody>
                    {days.map((d) => {
                      const delta = deltaByDate.get(d.entry_date) ?? null;
                      const ex = exercisesByEntry[d.id] ?? [];
                      const short = d.entry_date.slice(5).replace("-", "/");

                      return (
                        <tr key={d.id} style={{ borderTop: "1px solid #f2f2f2", verticalAlign: "top" }}>
                          <td style={{ padding: "10px 8px", fontWeight: 900, minWidth: 170 }}>
                            <div>D{d.day_in_week} ({short})</div>

                            {d.is_injection_day ? (
                              <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <Pill>💉 Injection day</Pill>
                                {d.injection_site ? <Pill>{d.injection_site}</Pill> : null}
                              </div>
                            ) : null}
                          </td>

                          <td style={{ padding: "10px 8px", fontWeight: 900 }}>{d.weight ?? "—"}</td>

                          <td style={{ padding: "10px 8px" }}>
                            <Delta value={delta} />
                          </td>

                          <td style={{ padding: "10px 8px" }}>{d.calories ?? "—"}</td>
                          <td style={{ padding: "10px 8px" }}>{d.protein != null ? `${d.protein}g` : "—"}</td>
                          <td style={{ padding: "10px 8px" }}>{d.carbs != null ? `${d.carbs}g` : "—"}</td>
                          <td style={{ padding: "10px 8px" }}>{d.fat != null ? `${d.fat}g` : "—"}</td>
                          <td style={{ padding: "10px 8px" }}>{d.fiber != null ? `${d.fiber}g` : "—"}</td>
                          <td style={{ padding: "10px 8px" }}>{d.steps ?? "—"}</td>

                          <td style={{ padding: "10px 8px", minWidth: 180 }}>
                            {ex.length ? (
                              <ul style={{ margin: 0, paddingLeft: 18 }}>
                                {ex.map((x) => (
                                  <li key={x.id} style={{ marginBottom: 4 }}>
                                    <span style={{ fontWeight: 800 }}>{x.exercise_type ?? "Exercise"}</span>
                                    {x.minutes != null ? <span style={{ opacity: 0.8 }}> — {x.minutes} min</span> : null}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span style={{ opacity: 0.6 }}>No exercises</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {!days.length ? (
                      <tr>
                        <td colSpan={10} style={{ padding: 12, opacity: 0.7 }}>
                          No days in this week yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}