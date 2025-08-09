const ABBR = new Set(['mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'inc.', 'etc.', 'e.g.', 'i.e.', 'u.s.', 'u.k.']);

export function segmentText(text) {
  const out = [];
  let cur = '';
  for (const ch of text) {
    cur += ch;
    if (/[.?!]/.test(ch)) {
      const tail = cur.trim().toLowerCase().split(/\s+/).slice(-2).join(' ');
      if (!ABBR.has(tail)) {
        out.push({ text: cur.trim(), pauseMs: /[?!]/.test(ch) ? 250 : 180 });
        cur = '';
      }
    } else if (ch === '\n') {
      out.push({ text: cur.trim(), pauseMs: 200 });
      cur = '';
    }
  }
  if (cur.trim()) out.push({ text: cur.trim(), pauseMs: 80 });
  return out;
}

export function enforceTokenBudget(chunks, tokenizeFn, maxTokens = 120) {
  const result = [];
  for (const c of chunks) {
    const tokens = tokenizeFn(c.text);
    if (tokens.length <= maxTokens) {
      result.push(c);
    } else {
      const mid = Math.floor(tokens.length / 2);
      const leftText = tokens.slice(0, mid).join(' ');
      const rightText = tokens.slice(mid).join(' ');
      result.push(
        ...enforceTokenBudget(
          [
            { text: leftText, pauseMs: c.pauseMs },
            { text: rightText, pauseMs: c.pauseMs },
          ],
          tokenizeFn,
          maxTokens,
        ),
      );
    }
  }
  return result;
}


