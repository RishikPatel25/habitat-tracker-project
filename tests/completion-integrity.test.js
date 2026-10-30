import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDashboardAnalytics, buildMonthlyReportData, dateFor, isHabitEligibleOnDate, isBeforeHabitStart, getDaysInMonth, getWeekRanges } from '../src/features/analytics/calculations.js';
import { persistCompletion } from '../src/features/tracking/completions.js';
import { buildMonthlyCsv } from '../src/features/exports/monthlyExports.js';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const day = (d) => `2026-10-${String(d).padStart(2, '0')}`;
const habits = Array.from({ length: 5 }, (_, i) => ({
  id: `h${i + 1}`, title: `Habit ${i + 1}`, startDate: day(1), schedule: [0, 1, 2, 3, 4, 5, 6],
  inactivePeriods: [{ startDate: day(8), endDate: '2026-10-31' }],
}));
const analyze = (checksData, habitSet = habits) => calculateDashboardAnalytics({ habits: habitSet, checksData, year: 2026, month: 9, now: new Date(2026, 10, 1, 12) });

test('all 35 eligible opportunities yield 35/35 and 100 percent', () => {
  const checksData = { '2026-9': Object.fromEntries(habits.map((habit) => [habit.id, Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i + 1, true]))])) };
  const result = analyze(checksData);
  assert.equal(result.monthGoal, 35);
  assert.equal(result.done, 35);
  assert.equal(result.remaining, 0);
  assert.equal(result.overallPercent, 100);
});

test('10 of 35 opportunities yield exact partial completion', () => {
  const checksData = { '2026-9': Object.fromEntries(habits.map((habit, hi) => [habit.id, Object.fromEntries(Array.from({ length: 7 }, (_, di) => [di + 1, hi * 7 + di < 10]))])) };
  const result = analyze(checksData);
  assert.equal(result.monthGoal, 35);
  assert.equal(result.done, 10);
  assert.equal(result.remaining, 25);
  assert.equal(result.overallPercent, 10 / 35 * 100);
});

test('screenshot scenario reconciles 38 done, 35 planned, and 41 left out of 114', () => {
  const snapshotHabits = [
    { id: 'bath', title: 'bath', startDate: day(1), schedule: [0, 1, 2, 3, 4, 5, 6] },
    { id: 'gym', title: 'gym', startDate: day(1), schedule: [0, 1, 2, 3, 4, 5, 6] },
    ...['drink', 'walk', 'journal', 'stretch'].map((id) => ({ id, title: id, startDate: day(19), schedule: [0, 1, 2, 3, 4, 5, 6] })),
  ];
  const records = { bath: {}, gym: {}, drink: {}, walk: {}, journal: {}, stretch: {} };
  for (let d = 1; d <= 19; d++) { records.bath[d] = true; records.gym[d] = true; }
  for (let d = 20; d <= 31; d++) { records.bath[d] = true; records.gym[d] = true; }
  for (let d = 20; d <= 22; d++) { records.drink[d] = true; records.walk[d] = true; records.journal[d] = true; }
  records.stretch[20] = true; records.stretch[21] = true;
  const result = calculateDashboardAnalytics({ habits: snapshotHabits, checksData: { '2026-9': records }, year: 2026, month: 9, now: new Date(2026, 9, 19, 12) });
  assert.equal(result.monthGoal, 114);
  assert.equal(result.done, 38);
  assert.equal(result.planned, 35);
  assert.equal(result.monthRemaining, 41);
  assert.equal(result.projectedPercent, (38 + 35) / 114 * 100);
  assert.equal(result.goalToDate, 42);
  assert.equal(result.remaining, 4);
  assert.equal(result.overallPercent, 38 / 42 * 100);
  const afterOneTick = structuredClone(records);
  afterOneTick.drink[19] = true;
  const withOneTick = calculateDashboardAnalytics({ habits: snapshotHabits, checksData: { '2026-9': afterOneTick }, year: 2026, month: 9, now: new Date(2026, 9, 19, 12) });
  const justStarted = withOneTick.habitStats.find((habit) => habit.id === 'drink');
  assert.equal(justStarted.actual, 1);
  assert.equal(justStarted.goal, 1);
  assert.equal(justStarted.percentage, 100); // 100% of eligible days through today, not of the full month.
  assert.ok(withOneTick.overallPercent < 100);
  assert.equal(withOneTick.dailyDone[18], 3);
  assert.equal(withOneTick.dailyGoal[18], 6);
  assert.equal(withOneTick.dailyRates[18], 3 / 6 * 100); // Daily progress uses every scheduled active habit checkbox.
  assert.equal(isHabitEligibleOnDate(snapshotHabits[2], dateFor(2026, 9, 18)), false);
  assert.equal(isHabitEligibleOnDate(snapshotHabits[2], dateFor(2026, 9, 19)), true);
});

test('backfilling one earlier day adds only that opportunity and keeps remaining stable', () => {
  const habit = { id: 'new', title: 'New habit', startDate: day(27), schedule: [0, 1, 2, 3, 4, 5, 6] };
  const initial = analyze({}, [habit]);
  assert.equal(initial.monthGoal, 5);
  assert.equal(initial.remaining, 5);
  assert.equal(isBeforeHabitStart(habit, dateFor(2026, 9, 1)), true);
  assert.equal(isHabitEligibleOnDate(habit, dateFor(2026, 9, 1)), false);

  const backfilledHabit = { ...habit, backfilledDates: [day(1)] };
  const backfilled = analyze({ '2026-9': { new: { 1: true } } }, [backfilledHabit]);
  assert.equal(backfilled.monthGoal, initial.monthGoal + 1);
  assert.equal(backfilled.done, 1);
  assert.equal(backfilled.remaining, initial.remaining);
  assert.equal(isHabitEligibleOnDate(backfilledHabit, dateFor(2026, 9, 1)), true);
  assert.equal(isHabitEligibleOnDate(backfilledHabit, dateFor(2026, 9, 2)), false); // Intervening untracked days stay excluded.

  const onSchedule = analyze({ '2026-9': { new: { 1: true, 27: true } } }, [backfilledHabit]);
  assert.equal(onSchedule.monthGoal, initial.monthGoal + 1);
  assert.equal(onSchedule.done, 2);
  assert.equal(onSchedule.remaining, initial.remaining - 1);
});

test('rapid check/uncheck persists each latest value exactly once and feeds analytics from that record', () => {
  const checksData = {}, storage = new MemoryStorage();
  const persist = (value) => { storage.setItem('checks', JSON.stringify(value)); return true; };
  for (const checked of [true, false, true, true, false, true]) assert.equal(persistCompletion(checksData, '2026-9', 'h1', 1, checked, persist), true);
  assert.deepEqual(JSON.parse(storage.getItem('checks')), checksData);
  const result = analyze(checksData, [habits[0]]);
  assert.equal(result.done, 1);
  assert.equal(result.habitStats[0].actual, 1);
});

test('failed persistence restores prior state including absent keys and makes no analytics contribution', () => {
  const checksData = {};
  assert.equal(persistCompletion(checksData, '2026-9', 'h1', 1, true, () => false), false);
  assert.deepEqual(checksData, {});
  assert.equal(analyze(checksData, [habits[0]]).done, 0);
  checksData['2026-9'] = { h1: { 1: false } };
  assert.equal(persistCompletion(checksData, '2026-9', 'h1', 1, true, () => { throw new Error('quota'); }), false);
  assert.equal(checksData['2026-9'].h1[1], false);
});

test('save and refresh round trip retains the same completion and dependent counts', () => {
  const checksData = {}, storage = new MemoryStorage();
  assert.equal(persistCompletion(checksData, '2026-9', 'h1', 3, true, (value) => { storage.setItem('ht_checks', JSON.stringify(value)); return true; }), true);
  const refreshed = JSON.parse(storage.getItem('ht_checks'));
  assert.deepEqual(analyze(refreshed, [habits[0]]), analyze(checksData, [habits[0]]));
  assert.equal(refreshed['2026-9'].h1[3], true);
});

test('non-boolean truthy records never appear checked or inflate dashboard and report counts', () => {
  const malformed = { '2026-9': { h1: { 1: 'true', 2: 1, 3: 'false', 4: true } } };
  const oneHabit = [habits[0]], result = analyze(malformed, oneHabit);
  assert.equal(result.done, 1);
  assert.equal(result.habitStats[0].actual, 1);
  const report = buildMonthlyReportData({ habits: oneHabit, archivedHabits: [], checksData: malformed, moodData: {}, sleepData: {}, year: 2026, month: 9, now: new Date(2026, 10, 1, 12) });
  assert.equal(report.rows[0].done, 1);
  const csv = buildMonthlyCsv({ report, habits: oneHabit, checksData: malformed });
  assert.match(csv, /"2026-10-01","h1","Habit 1","","Not completed"/);
  assert.match(csv, /"2026-10-04","h1","Habit 1","","Completed"/);
});

test('analytics invariants hold and recalculation is deterministic', () => {
  const checksData = { '2026-9': Object.fromEntries(habits.map((habit) => [habit.id, { 1: true, 2: false, 3: true, 4: true }])) };
  const first = analyze(checksData), second = analyze(checksData);
  assert.deepEqual(second, first);
  assert.ok(first.done <= first.monthGoal);
  assert.ok(first.remaining >= 0);
  assert.equal(first.done + first.planned + first.remaining, first.monthGoal);
  assert.ok(first.overallPercent >= 0 && first.overallPercent <= 100);
  assert.equal(analyze(checksData, [...habits].reverse()).done, first.done);
});

test('Test E: screenshot-style regression fixture (Drink water 7/8, Walk 10k 0/1 yields 78% overall and 2 left)', () => {
  const drinkWater = { id: 'drink', title: 'Drink water', startDate: '2026-10-22', schedule: [0, 1, 2, 3, 4, 5, 6] };
  const walk10k = { id: 'walk', title: 'Walk 10k steps', startDate: '2026-10-29', schedule: [0, 1, 2, 3, 4, 5, 6] };
  const checksData = {
    '2026-9': {
      drink: { 22: true, 23: true, 24: true, 25: true, 26: true, 27: true, 28: true },
      walk: {},
    },
  };
  const now = new Date(2026, 9, 29, 12);
  const result = calculateDashboardAnalytics({ habits: [drinkWater, walk10k], checksData, year: 2026, month: 9, now });

  const drinkStats = result.habitStats.find((h) => h.id === 'drink');
  const walkStats = result.habitStats.find((h) => h.id === 'walk');

  assert.equal(drinkStats.actual, 7);
  assert.equal(drinkStats.goal, 8);
  assert.equal(Math.round(drinkStats.percentage), 88);

  assert.equal(walkStats.actual, 0);
  assert.equal(walkStats.goal, 1);
  assert.equal(walkStats.percentage, 0);

  assert.equal(result.goalToDate, 9);
  assert.equal(result.done, 7);
  assert.equal(result.remaining, 2);
  assert.equal(result.done + result.remaining, result.goalToDate);
  assert.equal(Math.round(result.overallPercent), 78);

  assert.equal(result.monthGoal, 13);
  assert.equal(result.planned, 0);
  assert.equal(result.monthRemaining, 6);
  assert.equal(result.done + result.planned + result.monthRemaining, result.monthGoal);
  assert.equal(Math.round(result.projectedPercent), 54);
});

test('Test D: two habits with different schedules exclude unscheduled days and aggregate occurrences', () => {
  const daily = { id: 'h_daily', title: 'Daily', startDate: '2026-10-01', schedule: [0, 1, 2, 3, 4, 5, 6] };
  const mwf = { id: 'h_mwf', title: 'MWF', startDate: '2026-10-01', schedule: [1, 3, 5] };
  const checksData = {
    '2026-9': {
      h_daily: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true },
      h_mwf: { 2: true, 5: false, 7: true },
    },
  };
  const result = calculateDashboardAnalytics({ habits: [daily, mwf], checksData, year: 2026, month: 9, now: new Date(2026, 9, 7, 12) });
  assert.equal(result.goalToDate, 10);
  assert.equal(result.done, 9);
  assert.equal(result.remaining, 1);
  assert.equal(result.overallPercent, 90);
});

test('Test A: empty tracker returns finite null/zero metrics with no NaN or misleading 100%', () => {
  const result = calculateDashboardAnalytics({ habits: [], checksData: {}, year: 2026, month: 9, now: new Date(2026, 9, 15, 12) });
  assert.equal(result.goalToDate, 0);
  assert.equal(result.monthGoal, 0);
  assert.equal(result.done, 0);
  assert.equal(result.remaining, 0);
  assert.equal(result.overallPercent, null);
  assert.equal(result.projectedPercent, null);
  assert.equal(result.averageDailyRate, null);
  assert.equal(result.habitStats.length, 0);
  assert.ok(result.dailyRates.every((r) => r === null));
  assert.equal(Number.isNaN(result.done), false);
});

test('Test F: daily average uses unrounded trailing 7-day mean, agrees with header label, and omits unscheduled days', () => {
  const daily = { id: 'daily_f', title: 'Daily F', startDate: '2026-10-01', schedule: [0, 1, 2, 3, 4, 5, 6] };
  // Oct 1..7: check days 1, 2, 4 (3 out of 7 completed = rates: 100, 100, 0, 100, 0, 0, 0)
  const checksData = {
    '2026-9': {
      daily_f: { 1: true, 2: true, 4: true },
    },
  };
  const result = calculateDashboardAnalytics({ habits: [daily], checksData, year: 2026, month: 9, now: new Date(2026, 9, 7, 12) });
  // Rates for days 1..7:
  assert.equal(result.dailyRates[0], 100);
  assert.equal(result.dailyRates[1], 100);
  assert.equal(result.dailyRates[2], 0);
  assert.equal(result.dailyRates[3], 100);
  assert.equal(result.dailyRates[4], 0);
  assert.equal(result.dailyRates[5], 0);
  assert.equal(result.dailyRates[6], 0);
  // Day 7 trailing 7-day average: (100 + 100 + 0 + 100 + 0 + 0 + 0) / 7 = 300 / 7 ≈ 42.857%
  const day7Avg = result.dailyAverage[6];
  assert.ok(Math.abs(day7Avg - (300 / 7)) < 1e-10);
  // The header label metric (averageDailyRate) must agree exactly with the latest point on the plotted line:
  assert.equal(result.averageDailyRate, day7Avg);
});

test('Test G: weekly boundaries follow Sunday-Saturday convention and partition every day exactly once', () => {
  const ranges = getWeekRanges(2026, 9); // October 2026
  assert.equal(ranges.length, 5);
  assert.equal(ranges[0].start, 1);
  assert.equal(ranges[0].end, 3); // Oct 1 (Thu) .. Oct 3 (Sat)
  assert.equal(ranges[1].start, 4);
  assert.equal(ranges[1].end, 10); // Oct 4 (Sun) .. Oct 10 (Sat)
  assert.equal(ranges[4].start, 25);
  assert.equal(ranges[4].end, 31); // Oct 25 (Sun) .. Oct 31 (Sat)

  // Verify full partition of 31 days with no gaps and no overlap:
  let expectedNext = 1;
  for (const range of ranges) {
    assert.equal(range.start, expectedNext);
    assert.ok(range.end >= range.start);
    expectedNext = range.end + 1;
  }
  assert.equal(expectedNext - 1, 31);
});

test('Test H: future and planned checks never count as actual completions', () => {
  const habit = { id: 'h_plan', title: 'Plan Habit', startDate: '2026-10-01', schedule: [0, 1, 2, 3, 4, 5, 6] };
  const now = new Date(2026, 9, 15, 12);
  const checksData = {
    '2026-9': {
      h_plan: { 10: true, 25: true, 26: true }, // 10 is past, 25 and 26 are future
    },
  };
  const result = calculateDashboardAnalytics({ habits: [habit], checksData, year: 2026, month: 9, now });
  assert.equal(result.done, 1);
  assert.equal(result.planned, 2);
  assert.equal(result.goalToDate, 15);
  assert.equal(result.remaining, 14); // 15 - 1
  assert.equal(result.overallPercent, 1 / 15 * 100);
  // Future dates have null dailyRates (not actual), but plannedDays is true:
  assert.equal(result.dailyRates[24], null);
  assert.equal(result.plannedDays[24], true);
  assert.equal(result.dailyBars[24], 100);
});

test('Test K: leap years and month boundaries handle local calendar noon safely', () => {
  assert.equal(getDaysInMonth(2024, 1), 29); // Leap Feb 2024
  assert.equal(getDaysInMonth(2025, 1), 28); // Non-leap Feb 2025
  const leapHabit = { id: 'leap', title: 'Leap', startDate: '2024-02-01', schedule: [0, 1, 2, 3, 4, 5, 6] };
  const leapResult = calculateDashboardAnalytics({ habits: [leapHabit], checksData: {}, year: 2024, month: 1, now: new Date(2024, 1, 29, 12) });
  assert.equal(leapResult.monthGoal, 29);
  assert.equal(leapResult.goalToDate, 29);
});

test('Test L: deterministic recalculation and state consistency across exports and goals', () => {
  const habit = { id: 'h_reg', title: 'Reg Habit', startDate: '2026-10-01', schedule: [0, 1, 2, 3, 4, 5, 6] };
  const checksData = { '2026-9': { h_reg: { 1: true, 2: true, 3: false } } };
  const res1 = calculateDashboardAnalytics({ habits: [habit], checksData, year: 2026, month: 9, now: new Date(2026, 9, 3, 12) });
  const res2 = calculateDashboardAnalytics({ habits: [habit], checksData, year: 2026, month: 9, now: new Date(2026, 9, 3, 12) });
  assert.deepEqual(res1, res2);
  assert.equal(res1.done, 2);
  assert.equal(res1.goalToDate, 3);
  assert.equal(res1.remaining, 1);
  assert.equal(res1.overallPercent, 2 / 3 * 100);
});
