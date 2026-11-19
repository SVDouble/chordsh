/** Next-change forecasting is measured separately from note-to-chord recognition. */
import { it } from 'vitest';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { DEFAULT_SETTINGS, type PredictionSettings } from '../src/config/settings';
import { chordToken, predictedChord, predictTokens, type PredictionModel } from '../src/engine/prediction';
import { PREDICTION_MODEL } from '../src/engine/predictionModel';
import { TRANSITIONS } from '../src/engine/transitions';
import { suggestNext } from '../src/engine/coach';
import { predictionExamples } from './eval/prediction';
import { corpora, loadPiece, pieceIds, split } from './eval/truth';

it('evaluate next-chord prediction', () => {
  const validation = !!process.env.VALIDATE;
  const sp = process.env.SPLIT ?? 'test';
  if (!validation && !['tune', 'test'].includes(sp)) throw new Error('Use SPLIT=tune or test.');
  const model: PredictionModel = validation
    ? JSON.parse(fs.readFileSync('local/prediction-validation-model.json', 'utf8'))
    : PREDICTION_MODEL;
  const sets = corpora().map((corpus) => {
    let ids = pieceIds(corpus).filter((id) => split(corpus, id) === (validation ? 'tune' : sp));
    if (validation) ids = ids.slice(Math.floor(ids.length * 0.8));
    return { corpus, pieces: ids.length, examples: ids.flatMap((id) => predictionExamples(loadPiece(corpus, id))) };
  });
  function evaluate(settings: PredictionSettings, variant: 'learned' | 'root' = 'learned', ideas = true) {
    const cache = new Map<string, { probabilities: number[]; ranking: number[]; ideas: number[] }>();
    const rows = sets.map((set) => {
      let top1 = 0,
        top3 = 0,
        top5 = 0,
        nll = 0,
        idea1 = 0,
        idea3 = 0,
        ideaAll = 0;
      for (const example of set.examples) {
        const { history, next } = example;
        const key = { tonic: 0, mode: example.key.mode };
        const id = `${key.mode}:${history.join(':')}`;
        let result = cache.get(id);
        if (!result) {
          let probabilities = predictTokens(key.mode, history, settings, model);
          if (variant === 'root') {
            const mode = key.mode === 'major' ? 0 : 1;
            const root = Math.floor(history.at(-1)! / 5);
            probabilities = probabilities.map((_, to) => {
              const degree = Math.floor(to / 5);
              const qualityCounts = model.unigram[mode].slice(degree * 5, degree * 5 + 5);
              const quality = (qualityCounts[to % 5] + 0.2) / (qualityCounts.reduce((sum, n) => sum + n, 0) + 1);
              return TRANSITIONS.probabilities[mode][root][degree] * quality;
            });
            probabilities[history.at(-1)!] = 0;
            const total = probabilities.reduce((sum, p) => sum + p, 0);
            probabilities = probabilities.map((p) => p / total);
          }
          const chords = history.map((token) => predictedChord(token, key, 'triads'));
          const moves = ideas ? suggestNext(key, chords.at(-1)!, 'triads', null, chords, settings, model) : [];
          result = {
            probabilities,
            ranking: [...probabilities.keys()].sort((a, b) => probabilities[b] - probabilities[a]),
            ideas: moves.map((move) => chordToken(move.chord, key)),
          };
          cache.set(id, result);
        }
        top1 += Number(result.ranking[0] === next);
        top3 += Number(result.ranking.slice(0, 3).includes(next));
        top5 += Number(result.ranking.slice(0, 5).includes(next));
        nll -= Math.log(result.probabilities[next]);
        idea1 += Number(result.ideas[0] === next);
        idea3 += Number(result.ideas.slice(0, 3).includes(next));
        ideaAll += Number(result.ideas.includes(next));
      }
      const n = set.examples.length;
      if (!n) throw new Error(`No prediction examples: ${set.corpus}`);
      return {
        corpus: set.corpus,
        pieces: set.pieces,
        changes: n,
        top1: top1 / n,
        top3: top3 / n,
        top5: top5 / n,
        nll: nll / n,
        idea1: idea1 / n,
        idea3: idea3 / n,
        coverage: ideaAll / n,
      };
    });
    const average = (field: keyof (typeof rows)[number]) =>
      rows.reduce((sum, row) => sum + Number(row[field]), 0) / rows.length;
    return {
      rows,
      nll: average('nll'),
      ideaScore: (average('idea1') + average('idea3')) / 2,
      idea1: average('idea1'),
      idea3: average('idea3'),
    };
  }
  if (validation) {
    let best = { ...DEFAULT_SETTINGS.prediction };
    let loss = Infinity;
    for (const priorStrength of [0.1, 0.5, 1, 2, 5, 10, 20, 50])
      for (const contextStrength of [0.1, 0.5, 1, 2, 5, 10, 20, 50]) {
        const settings = { ...best, priorStrength, contextStrength };
        const score = evaluate(settings, 'learned', false);
        if (score.nll < loss) {
          best = settings;
          loss = score.nll;
        }
      }
    let bestScore = -Infinity;
    for (const learnedWeight of [0, 0.25, 0.5, 0.7, 0.85, 1]) {
      const settings = { ...best, learnedWeight };
      const score = evaluate(settings);
      console.log(
        `weight ${learnedWeight}: idea @1 ${(100 * score.idea1).toFixed(2)} @3 ${(100 * score.idea3).toFixed(2)}`,
      );
      if (score.ideaScore > bestScore) {
        best = settings;
        bestScore = score.ideaScore;
      }
    }
    console.log('INNER-TUNE SELECTED', JSON.stringify(best), `NLL ${loss.toFixed(4)}`);
    fs.writeFileSync('local/prediction-selected.json', JSON.stringify(best));
    return;
  }
  const settings = DEFAULT_SETTINGS.prediction;
  const variants = {
    'root-only baseline': evaluate(settings, 'root', false),
    'quality, one chord': evaluate({ ...settings, useSequence: false }, 'learned', false),
    'quality, two chords': evaluate(settings),
    'rule-based Ideas': evaluate({ ...settings, learnedWeight: 0 }),
  };
  const pct = (n: number) => (100 * n).toFixed(1);
  const lines = [
    '| model | corpus | pieces | changes | next @1 / @3 / @5 | NLL ↓ | Ideas @1 / @3 / coverage |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const [label, result] of Object.entries(variants)) {
    for (const row of result.rows)
      lines.push(
        `| ${label} | ${row.corpus}${row.corpus === 'jazz' ? ' *' : ''} | ${row.pieces} | ${row.changes} | ${label === 'rule-based Ideas' ? '—' : `${pct(row.top1)} / ${pct(row.top3)} / ${pct(row.top5)}`} | ${label === 'rule-based Ideas' ? '—' : row.nll.toFixed(3)} | ${label.includes('baseline') || label.includes('one chord') ? '—' : `${pct(row.idea1)} / ${pct(row.idea3)} / ${pct(row.coverage)}`} |`,
      );
    console.log(label, 'macro NLL', result.nll.toFixed(4), 'Ideas', pct(result.idea1), pct(result.idea3));
  }
  const report = lines.join('\n');
  console.log(`split: ${sp}\n${report}`);
  if (process.env.WRITE) {
    const git = execSync('git rev-parse --short HEAD').toString().trim();
    const dirty = !!execSync('git status --porcelain -- src/config src/engine src/theory scripts').toString().trim();
    const record = {
      date: new Date().toISOString().slice(0, 10),
      git,
      dirty,
      split: sp,
      settings,
      dataSha256: model.dataSha256,
      variants,
    };
    fs.appendFileSync('benchmarks/prediction-history.jsonl', JSON.stringify(record) + '\n');
    fs.writeFileSync(
      'benchmarks/PREDICTION.md',
      `# Next-chord prediction\n\n${record.date} · commit ${git}${dirty ? ' (modified working tree)' : ''} · split ${sp}\n\nReproduce: \`npm run fetch-data && npm run train:prediction && SPLIT=${sp} WRITE=1 npm run benchmark:prediction\`.\n\nRoot and family of the next harmonic change, given annotated preceding chords and local key.\nThis measures continuation ranking, not recognition from notes or extension/inversion prediction.\nRepeated labels, rests and key changes do not create cross-boundary examples. Jazz (*) uses chart labels.\nEach corpus contributes equally to macro averages; within a corpus each change counts once.\nIdeas metrics use the visible list (four main and five colour alternatives by default), with the\nrule-only baseline and learned model evaluated on identical examples. Scores are not calibrated creative probabilities.\n\nSettings: \`${JSON.stringify(settings)}\`\n\n${report}\n`,
    );
  }
});
