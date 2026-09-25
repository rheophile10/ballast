// Scoring and rollups. Pure functions over the source test and an attempt. See SPEC.md §9.
const tagKey = (t) => t.includes(':') ? t : t;

/** `marks` = {itemId: number} for short-answer items marked by the RTC. */
export const scoreAttempt = (test, attempt, marks = {}) => {
  const answers = attempt.answers || {};
  const perItem = test.items.map((it) => {
    const a = answers[it.id];
    let got = 0, pending = false;
    if (it.type === 'mc') got = a === it.key ? it.worth : 0;
    else if (it.type === 'match') got = it.pairs.reduce((n, p) => n + ((a || {})[p.id] === p.id ? 1 : 0), 0);
    else if (it.type === 'short') { if (it.id in marks) got = Math.min(Number(marks[it.id]) || 0, it.worth); else pending = true; }
    return { id: it.id, area: it.area || null, ref: it.ref, tags: it.tags, worth: it.worth, got, pending, answered: a !== undefined && a !== '' };
  });
  const total = perItem.reduce((n, i) => n + i.worth, 0), score = perItem.reduce((n, i) => n + i.got, 0);
  const roll = (keyOf) => {
    const m = {};
    for (const i of perItem) for (const k of [].concat(keyOf(i)).filter(Boolean)) {
      m[k] ??= { correct: 0, total: 0 }; m[k].correct += i.got; m[k].total += i.worth;
    }
    return m;
  };
  const areas = (test.areas.length ? test.areas : [...new Set(perItem.map((i) => i.area))].map((id) => ({ id, label: id })))
    .map((a) => ({ ...a, ...(roll((i) => i.area)[a.id] || { correct: 0, total: 0 }) }));
  const refs = roll((i) => i.ref);
  const read = Object.entries(refs).filter(([, v]) => v.correct < v.total)
    .map(([ref, v]) => ({ ref, missed: v.total - v.correct, area: perItem.find((i) => i.ref.includes(ref))?.area || null }))
    .sort((x, y) => y.missed - x.missed || x.ref.localeCompare(y.ref));
  const grade = total ? score / total : 0;
  return { score, total, grade, pass: grade >= (test.settings.pass ?? 0.9), pending: perItem.filter((i) => i.pending).length,
    areas, tags: roll((i) => i.tags.map(tagKey)), read, perItem };
};

/** Class rollup over many scored attempts. */
export const summarize = (test, scored) => {
  const byItem = test.items.map((it) => {
    const rows = scored.map((s) => s.perItem.find((i) => i.id === it.id));
    const n = rows.length, fraction = rows.reduce((a, r) => a + r.got / it.worth, 0);
    return { id: it.id, area: it.area || null, ref: it.ref, n, correct: rows.filter((r) => r.got === it.worth).length, difficulty: n ? 1 - fraction / n : 0 };
  });
  const byArea = test.areas.map((a) => {
    const c = scored.map((s) => s.areas.find((x) => x.id === a.id)).filter(Boolean);
    return { ...a, mean: c.length ? c.reduce((n, x) => n + (x.total ? x.correct / x.total : 0), 0) / c.length : 0 };
  });
  return { n: scored.length, passed: scored.filter((s) => s.pass).length, mean: scored.length ? scored.reduce((n, s) => n + s.grade, 0) / scored.length : 0,
    byItem: byItem.sort((x, y) => y.difficulty - x.difficulty), byArea };
};
