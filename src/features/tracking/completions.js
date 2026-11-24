/** Apply a single canonical habit/date value and restore the previous value if persistence fails. */
export function persistCompletion(checksData, monthKey, habitId, day, checked, persist) {
  if (!checksData || typeof checksData !== 'object' || Array.isArray(checksData)
    || typeof monthKey !== 'string' || typeof habitId !== 'string'
    || !Number.isInteger(day) || day < 1 || day > 31 || ![true, false, 'planned'].includes(checked)
    || typeof persist !== 'function') return false;

  const monthExisted = Object.hasOwn(checksData, monthKey);
  if (!checksData[monthKey] || typeof checksData[monthKey] !== 'object' || Array.isArray(checksData[monthKey])) checksData[monthKey] = {};
  const habitExisted = Object.hasOwn(checksData[monthKey], habitId);
  if (!checksData[monthKey][habitId] || typeof checksData[monthKey][habitId] !== 'object' || Array.isArray(checksData[monthKey][habitId])) checksData[monthKey][habitId] = {};
  const dayKey = String(day), dayExisted = Object.hasOwn(checksData[monthKey][habitId], dayKey);
  const previous = checksData[monthKey][habitId][dayKey];
  checksData[monthKey][habitId][dayKey] = checked;

  let saved = false;
  try { saved = persist(checksData) === true; } catch { saved = false; }
  if (saved) return true;

  if (dayExisted) checksData[monthKey][habitId][dayKey] = previous;
  else delete checksData[monthKey][habitId][dayKey];
  if (!Object.keys(checksData[monthKey][habitId]).length && !habitExisted) delete checksData[monthKey][habitId];
  if (!Object.keys(checksData[monthKey]).length && !monthExisted) delete checksData[monthKey];
  return false;
}

/** Convert legacy future premarks into a state that cannot become completed at midnight. */
export function migrateFutureCompletions(checksData, now = new Date()) {
  if (!checksData || typeof checksData !== 'object' || Array.isArray(checksData)
    || !(now instanceof Date) || !Number.isFinite(now.getTime())) return 0;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  let migrated = 0;
  for (const [key, month] of Object.entries(checksData)) {
    const match = /^(\d{1,4})-(\d{1,2})$/.exec(key);
    if (!match || !month || typeof month !== 'object' || Array.isArray(month)) continue;
    const year = Number(match[1]), monthIndex = Number(match[2]);
    if (monthIndex < 0 || monthIndex > 11) continue;
    for (const log of Object.values(month)) {
      if (!log || typeof log !== 'object' || Array.isArray(log)) continue;
      for (const [rawDay, value] of Object.entries(log)) {
        if (value !== true || !/^\d+$/.test(rawDay)) continue;
        const day = Number(rawDay), date = new Date(year, monthIndex, day, 12);
        if (date.getFullYear() !== year || date.getMonth() !== monthIndex || date.getDate() !== day || date <= today) continue;
        log[rawDay] = 'planned'; migrated++;
      }
    }
  }
  return migrated;
}

/** Resolve a checkbox action into an actual completion or a future plan. */
export function completionValueForInteraction(currentValue, checked, { isFuture = false, isToday = false } = {}) {
  if (typeof checked !== 'boolean') return null;
  if (isFuture) return checked ? 'planned' : false;
  if (isToday && currentValue === 'planned' && !checked) return true;
  return checked;
}
