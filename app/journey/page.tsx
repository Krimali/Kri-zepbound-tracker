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
    <div style={{ border: "1px solid #eee", borderRadius: 20, padding: 18, background: "white" }}>
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

  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setStatus("Loading...");

        // Goals (optional, used for "Total" since starting weight)
        const { data: eRows, error: eErr } = await supabase
          .from("entries")
          .select(
            "id, entry_date, week_number, day_in_week, weight, steps, calories, protein, mood, dose_mg, is_injection_day, injection_site"
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
        setExpandedWeek(latestWeek);

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
    // Group by week_number. Entries already newest-first.
    const byWeek = new Map<number, Entry[]>();
    for (const e of entries) {
      byWeek.set(e.week_number, [...(byWeek.get(e.week_number) ?? []), e]);
    }

    // Sort weeks desc
    return Array.from(byWeek.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([week, weekRows]) => {
        // We want days displayed DESC (latest day on top), but we also need an ASC version to compute deltas.
        const desc = [...weekRows].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
        const asc = [...weekRows].sort((a, b) => a.entry_date.localeCompare(b.entry_date));

        const fullRange = weekRangeFromWeekNumber(week);
        const startDate = fullRange.start;
        const endDate = fullRange.end;

        const startWt = asc[0]?.weight ?? null;
        const endWt = asc[asc.length - 1]?.weight ?? null;

        const dose = asc.find((x) => x.dose_mg != null)?.dose_mg ?? null;

        const wow = startWt != null && endWt != null ? round1(endWt - startWt) : null;
        const total =
          goals?.start_weight != null && endWt != null ? round1(endWt - goals.start_weight) : null;

        // Delta per day: compare this day to the previous measurement day (older day in the same week)
        // We compute in ASC order, then lookup when rendering DESC.
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
          wow,
          total,
          deltaByDate,
        };
      });
  }, [entries, goals?.start_weight]);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "22px 18px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>My Journey</div>
        </div>
        <div style={{ opacity: 0.75, fontWeight: 700 }}>{status}</div>
      </div>

      <div style={{ height: 16 }} />

      <Card
        title="📋 Weekly Overview"
        //subtitle="Tap a week row to expand daily breakdown. Days are newest → oldest (D7…D1)."
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
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
              {weeks.map((w) => {
                const isOpen = expandedWeek === w.week;

                return (
                  <FragmentWeek
                    key={w.week}
                    isOpen={isOpen}
                    onToggle={() => setExpandedWeek(isOpen ? null : w.week)}
                    week={w.week}
                    rangeLabel={
                      w.startDate && w.endDate
                        ? `${fmtDate(w.startDate)} – ${fmtDate(w.endDate)}`
                        : ""
                    }
                    dose={w.dose}
                    startWt={w.startWt}
                    endWt={w.endWt}
                    wow={w.wow}
                    total={w.total}
                    days={w.desc}
                    deltaByDate={w.deltaByDate}
                    exercisesByEntry={exercisesByEntry}
                  />
                );
              })}

              {!weeks.length ? (
                <tr>
                  <td colSpan={6} style={{ padding: 16, opacity: 0.7 }}>
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
  wow: number | null;
  total: number | null;

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
    wow,
    total,
    days,
    deltaByDate,
    exercisesByEntry,
  } = props;

  const wowColor = wow != null && wow > 0 ? "#b45309" : "#047857";

  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          borderTop: "1px solid #eee",
          cursor: "pointer",
          background: isOpen ? "#fafafa" : "transparent",
        }}
      >
        <td style={{ padding: "12px 8px", fontWeight: 900 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14 }}>{isOpen ? "▾" : "▸"}</span>
            <span>W{week}</span>
            {rangeLabel ? <span style={{ fontWeight: 700, opacity: 0.6 }}>({rangeLabel})</span> : null}
          </span>
        </td>

        <td style={{ padding: "12px 8px" }}>{dose != null ? <Pill>💉 {dose}mg</Pill> : <span style={{ opacity: 0.5 }}>—</span>}</td>
        <td style={{ padding: "12px 8px" }}>{startWt ?? "—"}</td>
        <td style={{ padding: "12px 8px" }}>{endWt ?? "—"}</td>
        <td style={{ padding: "12px 8px", fontWeight: 900, color: wowColor }}>{wow ?? "—"}</td>
        <td style={{ padding: "12px 8px", fontWeight: 900, color: "#047857" }}>{total ?? "—"}</td>
      </tr>

      {isOpen ? (
        <tr style={{ borderTop: "1px solid #eee" }}>
          <td colSpan={6} style={{ padding: 12 }}>
            <div style={{ border: "1px solid #eee", borderRadius: 16, background: "white", overflow: "hidden" }}>
              

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                  <thead>
                    <tr style={{ textAlign: "left", opacity: 0.7 }}>
                      <th style={{ padding: "10px 12px" }}>Day</th>
                      <th style={{ padding: "10px 12px" }}>Weight</th>
                      <th style={{ padding: "10px 12px" }}>Δ Weight</th>
                      <th style={{ padding: "10px 12px" }}>Calories</th>
                      <th style={{ padding: "10px 12px" }}>Protein</th>
                      <th style={{ padding: "10px 12px" }}>Steps</th>
                      <th style={{ padding: "10px 12px" }}>Exercises</th>
                    </tr>
                  </thead>

                  <tbody>
                    {days.map((d) => {
                      const delta = deltaByDate.get(d.entry_date) ?? null;
                      const ex = exercisesByEntry[d.id] ?? [];

                      return (
                        <tr key={d.id} style={{ borderTop: "1px solid #f2f2f2", verticalAlign: "top" }}>
                          <td style={{ padding: "12px 12px" }}>
                            <div style={{ fontWeight: 900 }}>D{d.day_in_week}</div>
                            <div style={{ opacity: 0.7, fontSize: 12 }}>{weekdayName(d.entry_date)}</div>
                            <div style={{ opacity: 0.7, fontSize: 12 }}>{d.entry_date}</div>
                            {d.is_injection_day ? (
                              <div style={{ marginTop: 6 }}>
                                <Pill>💉 Injection day</Pill>
                              </div>
                            ) : null}
                          </td>

                          <td style={{ padding: "12px 12px", fontWeight: 900 }}>{d.weight ?? "—"}</td>

                          <td style={{ padding: "12px 12px" }}>
                            <Delta value={delta} />
                          </td>

                          <td style={{ padding: "12px 12px" }}>{d.calories ?? "—"}</td>
                          <td style={{ padding: "12px 12px" }}>{d.protein != null ? `${d.protein}g` : "—"}</td>
                          <td style={{ padding: "12px 12px" }}>{d.steps ?? "—"}</td>

                          <td style={{ padding: "12px 12px" }}>
                            {ex.length ? (
                              <ul style={{ margin: 0, paddingLeft: 18 }}>
                                {ex.map((x) => (
                                  <li key={x.id} style={{ marginBottom: 4 }}>
                                    <span style={{ fontWeight: 800 }}>
                                      {x.exercise_type ?? "Exercise"}
                                    </span>
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
                        <td colSpan={7} style={{ padding: 14, opacity: 0.7 }}>
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