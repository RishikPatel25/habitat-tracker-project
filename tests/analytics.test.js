import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDashboardAnalytics, buildMonthlyReportData, getDaysInMonth, getWeekRanges } from '../src/features/analytics/calculations.js';

const today = new Date(2026, 9, 17, 12);
const habit = { id: 'h1', title: 'Read', emoji: '📖', startDate: '2026-10-01', schedule: [0, 1, 2, 3, 4, 5, 6] };

test('future pre-marks are planned and included in projected month overall, not completed count', () => {
  const result = calculateDashboardAnalytics({ habits: [habit], checksData: { '2026-9': { h1: { 2: true, 17: true, 31: true } } }, year: 2026, month: 9, now: today });
  assert.equal(result.done, 2);
  assert.equal(result.planned, 1);
  assert.equal(result.monthGoal, 31);
  assert.equal(result.remaining, 28);
  assert.ok(Math.abs(result.overallPercent - (300 / 31)) < 1e-10);
  assert.equal(result.dailyRates[16], 100);
});

test('planned checks render in the correct fifth week and day bar', () => {
  const result = calculateDashboardAnalytics({ habits: [habit], checksData: { '2026-9': { h1: { 29: true } } }, year: 2026, month: 9, now: today });
  assert.equal(result.weekly.length, 5);
  assert.equal(result.weekly[4].plannedDone, 1);
  assert.equal(result.weekly[4].start, 25);
  assert.equal(result.weekly[4].plannedGoal, 7);
  assert.ok(Math.abs(result.weekly[4].rate - (100 / 7)) < 1e-10);
  assert.equal(result.dailyBars[28], 100);
  assert.equal(result.dailyRates[28], null);
});

test('a future month has no actual progress until the month begins', () => {
  const result = calculateDashboardAnalytics({ habits: [habit], checksData: {}, year: 2026, month: 11, now: today });
  assert.equal(result.done, 0);
  assert.equal(result.planned, 0);
  assert.equal(result.overallPercent, 0);
  assert.ok(result.dailyRates.every((value) => value === null));
});

test('monthly report excludes future and pre-start checks', () => {
  const result = buildMonthlyReportData({ habits: [{ ...habit, startDate: '2026-10-05' }], archivedHabits: [], checksData: { '2026-9': { h1: { 2: true, 5: true, 17: true, 20: true } } }, moodData: {}, sleepData: {}, year: 2026, month: 9, now: today });
  assert.equal(result.rows[0].goal, 13);
  assert.equal(result.rows[0].done, 2);
  assert.equal(result.rows[0].missed, 11);
});

test('zero habits and zero eligible occurrences return finite empty metrics', () => {
  const noHabits = calculateDashboardAnalytics({ habits: [], checksData: {}, year: 2026, month: 9, now: today });
  assert.equal(noHabits.monthGoal, 0); assert.equal(noHabits.overallPercent, null); assert.equal(noHabits.averageDailyRate, null); assert.equal(noHabits.done, 0);
  const noSchedule = calculateDashboardAnalytics({ habits: [{ ...habit, schedule: [] }], checksData: {}, year: 2026, month: 9, now: today });
  assert.equal(noSchedule.monthGoal, 0); assert.equal(noSchedule.overallPercent, null); assert.equal(noSchedule.averageDailyRate, null);
  for (const result of [noHabits, noSchedule]) assert.ok(JSON.stringify(result).indexOf('NaN') < 0);
});

test('daily and habit rates use only scheduled eligible occurrences and keep calculation precision', () => {
  const habits = [
    { ...habit, schedule: [1, 3] },
    { id: 'h2', title: 'Stretch', startDate: '2026-10-01', schedule: [1] },
  ];
  // Oct 5 is Monday; Oct 7 is Wednesday. One of two occurrences is complete.
  const result = calculateDashboardAnalytics({ habits, checksData: { '2026-9': { h1: { 5: true }, h2: {} } }, year: 2026, month: 9, now: new Date(2026, 9, 7, 12) });
  assert.equal(result.dailyRates[4], 50);
  assert.equal(result.habitStats.find((entry) => entry.id === 'h1').percentage, 50);
  assert.equal(result.habitStats.find((entry) => entry.id === 'h2').goal, 1);
  assert.equal(result.dailyRates[5], null); // Tuesday has no eligible scheduled habit.
});

test('a single completed eligible occurrence yields a 100 percent daily rate and partial calendar week rate', () => {
  const fridayHabit = { ...habit, schedule: [5] };
  const result = calculateDashboardAnalytics({ habits: [fridayHabit], checksData: { '2026-9': { h1: { 2: true } } }, year: 2026, month: 9, now: new Date(2026, 9, 2, 12) });
  assert.equal(result.dailyRates[1], 100);
  assert.equal(result.weekly[0].done, 1);
  assert.equal(result.weekly[0].goal, 1);
  assert.equal(result.weekly[0].rate, 100);
});

test('one completion among six eligible habits is 16.67 percent for the day', () => {
  const sixHabits = Array.from({ length: 6 }, (_, index) => ({ ...habit, id: `h${index + 1}` }));
  const result = calculateDashboardAnalytics({ habits: sixHabits, checksData: { '2026-9': { h1: { 5: true } } }, year: 2026, month: 9, now: new Date(2026, 9, 5, 12) });
  assert.equal(result.dailyDone[4], 1);
  assert.equal(result.dailyGoal[4], 6);
  assert.ok(Math.abs(result.dailyRates[4] - (100 / 6)) < 1e-10);
  assert.ok(result.overallPercent < 100);
});

test('daily progress counts every scheduled active checkbox even when habit starts differ', () => {
  const habits = [
    { ...habit, id: 'h1', startDate: '2026-10-01' },
    { ...habit, id: 'h2', startDate: '2026-10-04', backfilledDates: ['2026-10-03'] },
    { ...habit, id: 'h3', startDate: '2026-10-05', backfilledDates: ['2026-10-03'] },
  ];
  const calculate = (checkedIds) => calculateDashboardAnalytics({
    habits,
    checksData: { '2026-9': Object.fromEntries(checkedIds.map((id) => [id, { 3: true }])) },
    year: 2026, month: 9, now: new Date(2026, 9, 3, 12),
  });
  assert.ok(Math.abs(calculate(['h2']).dailyRates[2] - (100 / 3)) < 1e-10);
  assert.ok(Math.abs(calculate(['h1', 'h2']).dailyRates[2] - (200 / 3)) < 1e-10);
  assert.equal(calculate(['h1', 'h2', 'h3']).dailyRates[2], 100);
  assert.equal(calculate(['h2']).dailyGoal[2], 3);
});

test('seven-day average matches the plotted daily-rate mean across month boundaries', () => {
  const older = { ...habit, startDate: '2026-09-01' };
  const newHabit = { id: 'h2', title: 'New', startDate: '2026-10-05', schedule: [0, 1, 2, 3, 4, 5, 6] };
  const result = calculateDashboardAnalytics({ habits: [older, newHabit], checksData: { '2026-9': { h1: { 5: true } } }, year: 2026, month: 9, now: new Date(2026, 9, 5, 12) });
  assert.equal(result.dailyRates[4], 50);
  assert.ok(Math.abs(result.dailyAverage[4] - (50 / 7)) < 1e-10);
  assert.equal(result.averageDailyRate, result.dailyAverage[4]);

  const boundary = calculateDashboardAnalytics({ habits: [older], checksData: { '2026-8': { h1: { 30: true } } }, year: 2026, month: 9, now: new Date(2026, 9, 1, 12) });
  assert.equal(boundary.dailyRates[0], 0);
  assert.ok(Math.abs(boundary.dailyAverage[0] - (100 / 7)) < 1e-10); // Prior-month eligible days are part of the seven-day window.
});

test('acceptance denominators remain occurrence based for monthly, weekly, and per-habit rates', () => {
  const dailyHabit = { ...habit, startDate: '2026-09-01' };
  const monthly = calculateDashboardAnalytics({ habits: [dailyHabit], checksData: { '2026-8': { h1: Object.fromEntries([1,2,3,4,5,6,7,8,9].map((day) => [day, true])) } }, year: 2026, month: 8, now: new Date(2026, 8, 30, 12) });
  assert.equal(monthly.monthGoal, 30);
  assert.equal(monthly.done, 9);
  assert.equal(monthly.done / monthly.monthGoal * 100, 30);

  const fourHabits = Array.from({ length: 4 }, (_, index) => ({ ...dailyHabit, id: `w${index}` }));
  const weeklyChecks = { '2026-8': { w0: { 1: true, 2: true }, w1: { 3: true }, w2: { 4: true }, w3: { 5: true } } };
  const weekly = calculateDashboardAnalytics({ habits: fourHabits, checksData: weeklyChecks, year: 2026, month: 8, now: new Date(2026, 8, 30, 12) });
  assert.equal(weekly.weekly[0].goal, 20);
  assert.equal(weekly.weekly[0].done, 5);
  assert.equal(weekly.weekly[0].rate, 25);

  const personal = calculateDashboardAnalytics({ habits: [dailyHabit], checksData: { '2026-8': { h1: { 1: true, 2: true, 3: true, 4: true, 5: true } } }, year: 2026, month: 8, now: new Date(2026, 8, 27, 12) });
  assert.equal(personal.habitStats[0].goal, 27);
  assert.equal(personal.habitStats[0].actual, 5);
  assert.ok(Math.abs(personal.habitStats[0].percentage - (5 / 27 * 100)) < 1e-10);
});

test('duplicate habit IDs count once in every denominator', () => {
  const duplicate = { ...habit };
  const result = calculateDashboardAnalytics({ habits: [habit, duplicate], checksData: { '2026-9': { h1: { 5: true } } }, year: 2026, month: 9, now: new Date(2026, 9, 5, 12) });
  assert.equal(result.habitStats.length, 1);
  assert.equal(result.dailyGoal[4], 1);
  assert.equal(result.dailyRates[4], 100);
});

test('calendar weeks handle partial boundaries and weeks spanning month edges', () => {
  assert.deepEqual(getWeekRanges(2026, 9), [{ start: 1, end: 3 }, { start: 4, end: 10 }, { start: 11, end: 17 }, { start: 18, end: 24 }, { start: 25, end: 31 }]);
  assert.equal(getWeekRanges(2026, 0)[0].start, 1);
  const result = calculateDashboardAnalytics({ habits: [habit], checksData: { '2026-9': { h1: { 31: true } }, '2026-10': { h1: { 1: true } } }, year: 2026, month: 9, now: new Date(2026, 10, 2, 12) });
  assert.equal(result.done, 1); // October 31 is included; November 1 stays in the November record.
  assert.equal(result.weekly.length, 5);
  assert.equal(getWeekRanges(2021, 4).length, 6); // Saturday-starting 31-day month has six calendar weeks.
});

test('February day counts respect leap years', () => {
  assert.equal(getDaysInMonth(2024, 1), 29);
  assert.equal(getDaysInMonth(2025, 1), 28);
  assert.equal(getDaysInMonth(2026, 8), 30);
  assert.equal(getDaysInMonth(2026, 9), 31);
  const leap = calculateDashboardAnalytics({ habits: [{ ...habit, startDate: '2024-02-01' }], checksData: {}, year: 2024, month: 1, now: new Date(2024, 1, 29, 12) });
  assert.equal(leap.monthGoal, 29);
});

test('archived habits do not enter active dashboard goals but reports retain history until archive date', () => {
  const archived = { ...habit, archivedAt: '2026-10-10' };
  const active = calculateDashboardAnalytics({ habits: [], checksData: {}, year: 2026, month: 9, now: today });
  const report = buildMonthlyReportData({ habits: [], archivedHabits: [archived], checksData: { '2026-9': { h1: { 5: true, 12: true } } }, moodData: {}, sleepData: {}, year: 2026, month: 9, now: today });
  assert.equal(active.monthGoal, 0);
  assert.equal(report.rows[0].done, 1);
  assert.equal(report.rows[0].goal, 10);
});

test('month switching reads only the selected month and checkbox changes recalculate totals', () => {
  const checksData = { '2026-9': { h1: { 3: true } }, '2026-10': { h1: { 3: true, 4: true } } };
  const now = new Date(2026, 10, 10, 12);
  const october = calculateDashboardAnalytics({ habits: [habit], checksData, year: 2026, month: 9, now });
  const november = calculateDashboardAnalytics({ habits: [habit], checksData, year: 2026, month: 10, now });
  assert.equal(october.done, 1); assert.equal(november.done, 2);
  checksData['2026-9'].h1[4] = true;
  const updated = calculateDashboardAnalytics({ habits: [habit], checksData, year: 2026, month: 9, now });
  assert.equal(updated.done, 2); assert.ok(updated.overallPercent > october.overallPercent);
});

test('seven calendar-day moving average ignores dates with no eligible occurrences', () => {
  const scheduled = { ...habit, schedule: [1, 3, 5] };
  const result = calculateDashboardAnalytics({ habits: [scheduled], checksData: { '2026-9': { h1: { 5: true } } }, year: 2026, month: 9, now: new Date(2026, 9, 10, 12) });
  assert.ok(Math.abs(result.dailyAverage[4] - (100 / 3)) < 1e-10); // Scheduled zero days count even before this habit's individual tracking start.
  assert.ok(Math.abs(result.dailyAverage[5] - (100 / 3)) < 1e-10); // Tuesday is unscheduled and omitted from the rolling mean.
  assert.ok(Math.abs(result.dailyAverage[9] - (100 / 3)) < 1e-10); // Oct 5 is 100%; Oct 7 and 9 are scheduled zero days.
  assert.equal(result.averageDailyRate, result.dailyAverage[result.latestElapsedDay]);
});

test('invalid selected month returns safe finite empty analytics', () => {
  const result = calculateDashboardAnalytics({ habits: [habit], checksData: {}, year: 2026, month: 12, now: today });
  assert.equal(result.monthGoal, 0); assert.equal(result.overallPercent, null); assert.equal(result.averageDailyRate, null); assert.deepEqual(result.dailyRates, []);
});


