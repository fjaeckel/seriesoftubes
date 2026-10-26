// Statistics for scripts/perf-bench.js.
// Is the head really slower or faster, or is it the machine? Shared CI runners swing a single run by ±30% on
// identical code, so a difference only counts when it is big (15%) AND the samples say it is real: a two-sided
// Mann–Whitney U test (no assumption about how the timings are spread), p below 0.01.
function mannWhitneyP(a, b) {
  const all = [...a.map((v) => [v, 0]), ...b.map((v) => [v, 1])].sort((x, y) => x[0] - y[0]);
  const n1 = a.length, n2 = b.length, N = n1 + n2, rank = new Array(N);
  let ties = 0;
  for (let i = 0; i < N;) { let j = i; while (j + 1 < N && all[j + 1][0] === all[i][0]) j++; const r = (i + j) / 2 + 1, t = j - i + 1; for (let k = i; k <= j; k++) rank[k] = r; ties += t * t * t - t; i = j + 1; }
  const r1 = all.reduce((sum, [, g], i) => sum + (g === 0 ? rank[i] : 0), 0), U = r1 - n1 * (n1 + 1) / 2;
  const sd = Math.sqrt(n1 * n2 / 12 * ((N + 1) - ties / (N * (N - 1))));
  if (!sd) return 1;
  const z = (Math.abs(U - n1 * n2 / 2) - 0.5) / sd;
  // Two-sided p from the normal approximation (fine from about 8 samples a side).
  const t = 1 / (1 + 0.2316419 * z), d = 0.3989423 * Math.exp(-z * z / 2);
  return Math.min(1, 2 * d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))));
}

module.exports = { mannWhitneyP };
