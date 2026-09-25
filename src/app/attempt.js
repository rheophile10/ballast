// The attempt is a fold over its event log. Live test, crash recovery and playback all reduce the same events.
// Event shapes: [t, 'copy', complete] [t,'show',id] [t,'answer',id,value] [t,'break',why] [t,'resume'] [t,'lock',why] [t,'submit']
export const initial = (order) => ({ order, at: 0, answers: {}, breaks: [], open: null, locked: null, started: null, finished: null, shown: {} });

export const step = (s, [t, kind, a, b]) => {
  switch (kind) {
    case 'copy': return { ...s, started: t };
    case 'show': return { ...s, at: Math.max(0, s.order.indexOf(a)), shown: { ...s.shown, [a]: (s.shown[a] || 0) + 1 } };
    case 'answer': return { ...s, answers: { ...s.answers, [a]: b } };
    case 'break': return { ...s, open: { at: t, why: a } };
    case 'resume': return s.open ? { ...s, open: null, breaks: [...s.breaks, { at: s.open.at, ms: t - s.open.at, why: s.open.why }] } : s;
    case 'lock': return { ...s, locked: { at: t, why: a } };
    case 'submit': return { ...s, finished: t, open: null };
    default: return s;
  }
};
export const fold = (order, events) => events.reduce(step, initial(order));

/** What goes in the release. */
export const toRelease = (order, events) => {
  const s = fold(order, events);
  return { started: s.started, finished: s.finished ?? events.at(-1)?.[0] ?? null, answers: s.answers, events, breaks: s.breaks,
    ua: typeof navigator === 'undefined' ? '' : navigator.userAgent };
};
