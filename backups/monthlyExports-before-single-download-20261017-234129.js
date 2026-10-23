import { dateFor, getMonthKey, isScheduled, localISO } from '../analytics/calculations.js';

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\t\r ]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildMonthlyCsv({ report, habits = [], archivedHabits = [], checksData = {} }) {
  const rows = [['Date', 'Habit ID', 'Habit', 'Category', 'Status']];
  const seen = new Set();
  const allHabits = [...habits, ...archivedHabits].filter((habit) => {
    if (!habit?.id || seen.has(habit.id)) return false;
    seen.add(habit.id);
    return true;
  });
  const monthKey = getMonthKey(report.year, report.month);
  const monthChecks = checksData?.[monthKey] || {};

  for (let day = 1; day <= report.endDay; day++) {
    const date = dateFor(report.year, report.month, day), iso = localISO(date);
    for (const habit of allHabits) {
      if (iso < (habit.startDate || '0001-01-01')) continue;
      if (habit.archivedAt && iso > habit.archivedAt) continue;
      if (!isScheduled(habit, date)) continue;
      const done = Boolean(monthChecks[habit.id]?.[day]);
      rows.push([iso, habit.id, habit.title, habit.category || '', done ? 'Completed' : 'Not completed']);
    }
  }

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function makePrintReadyHtml(html) {
  if (typeof html !== 'string' || !/<\/body>/i.test(html)) throw new Error('The monthly report has no closing body element.');
  return html.replace(/<\/body>/i, '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),150));</script></body>');
}

function fitText(context, value, maxWidth) {
  let text = String(value ?? '');
  if (context.measureText(text).width <= maxWidth) return text;
  while (text && context.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
  return text ? `${text}…` : '';
}

function wrapText(context, value, maxWidth, maxLines = 2) {
  const words = String(value ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const consumed = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (consumed < words.length && lines.length) lines[lines.length - 1] = fitText(context, `${lines.at(-1)} ${words.slice(consumed).join(' ')}`, maxWidth);
  return lines.map((line) => fitText(context, line, maxWidth));
}

export function renderMonthlyReportCanvas(report, {
  background = '#11151c', surface = '#191e27', text = '#f2f4f8', muted = '#a4aab5',
  line = '#303640', accent = '#d9dee8', fontFamily = 'system-ui, sans-serif', scale = 2,
  createCanvas = () => document.createElement('canvas'), maxPixelHeight = 16000,
} = {}) {
  const width = 1200, headerHeight = 218, rowHeight = 48;
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const height = headerHeight + Math.max(rows.length, 1) * rowHeight + 32;
  const pixelScale = Math.min(scale, maxPixelHeight / height);
  const canvas = createCanvas();
  canvas.width = Math.round(width * pixelScale);
  canvas.height = Math.round(height * pixelScale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
  context.scale(pixelScale, pixelScale);
  context.fillStyle = background; context.fillRect(0, 0, width, height);
  context.fillStyle = text; context.font = `600 30px ${fontFamily}`;
  context.fillText('Habit Tracker', 40, 48);
  context.fillStyle = muted; context.font = `16px ${fontFamily}`;
  context.fillText(`${report.monthLabel} · Monthly report`, 40, 76);

  const cards = [
    ['Progress', report.percent === null ? '—' : `${report.percent}%`],
    ['Completed', report.done],
    ['Scheduled goal', report.goal],
    ['Remaining', report.missed],
  ];
  const cardY = 98, cardW = 270, cardGap = 12;
  cards.forEach(([label, value], index) => {
    const x = 40 + index * (cardW + cardGap);
    context.fillStyle = surface; context.fillRect(x, cardY, cardW, 74);
    context.strokeStyle = line; context.strokeRect(x + .5, cardY + .5, cardW - 1, 73);
    context.fillStyle = muted; context.font = `14px ${fontFamily}`; context.fillText(label, x + 14, cardY + 25);
    context.fillStyle = text; context.font = `600 24px ${fontFamily}`; context.fillText(String(value), x + 14, cardY + 56);
  });

  const tableY = 202;
  context.fillStyle = surface; context.fillRect(40, tableY, width - 80, 34);
  context.fillStyle = muted; context.font = `600 13px ${fontFamily}`;
  context.fillText('HABIT', 54, tableY + 22);
  context.fillText('DONE / GOAL', 650, tableY + 22);
  context.fillText('PROGRESS', 820, tableY + 22);
  context.fillText('MARK', 1080, tableY + 22);

  if (!rows.length) {
    context.fillStyle = muted; context.font = `16px ${fontFamily}`;
    context.fillText('No habits are available for this reporting period.', 54, tableY + 66);
  }
  rows.forEach((habit, index) => {
    const y = tableY + 34 + index * rowHeight;
    context.strokeStyle = line; context.beginPath(); context.moveTo(40, y + rowHeight); context.lineTo(width - 40, y + rowHeight); context.stroke();
    context.fillStyle = text; context.font = `15px ${fontFamily}`;
    const nameLines = wrapText(context, `${habit.emoji || ''} ${habit.title || ''}`.trim(), 560);
    nameLines.forEach((name, lineIndex) => context.fillText(name, 54, y + 20 + lineIndex * 17));
    context.fillStyle = muted; context.font = `14px ${fontFamily}`;
    context.fillText(`${habit.done} / ${habit.goal}`, 650, y + 27);
    context.fillStyle = surface; context.fillRect(820, y + 15, 190, 9);
    context.fillStyle = accent; context.fillRect(820, y + 15, 190 * Math.max(0, Math.min(100, habit.percent || 0)) / 100, 9);
    context.fillStyle = text; context.fillText(habit.percent === null ? '—' : `${Math.round(habit.percent)}%`, 1020, y + 27);
    context.fillText(habit.grade?.mark || '—', 1090, y + 27);
  });
  return canvas;
}
