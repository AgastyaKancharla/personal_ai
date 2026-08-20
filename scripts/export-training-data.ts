// Exports parse_log into train/eval JSONL for future fine-tuning.
// Run with: npm run export-training-data
//
// Split is chronological (last 20% by created_at), never random — a random
// split would leak later phrasing habits into training and make the eval
// score a lie.

import { writeFileSync } from 'fs';
import { supabaseServer } from '../lib/supabase';

interface ParseLogRow {
  raw_text: string;
  output: unknown;
  accepted: boolean | null;
  corrected: unknown;
  created_at: string;
}

interface TrainingExample {
  input: string;
  output: { actions: unknown };
}

async function main() {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from('parse_log')
    .select('raw_text, output, accepted, corrected, created_at')
    .order('created_at', { ascending: true });

  if (error) throw error;
  const rows = (data ?? []) as ParseLogRow[];

  const examples: TrainingExample[] = [];
  for (const row of rows) {
    if (row.accepted === true) {
      examples.push({ input: row.raw_text, output: { actions: row.output } });
    } else if (row.accepted === false && row.corrected != null) {
      examples.push({ input: row.raw_text, output: { actions: row.corrected } });
    }
    // accepted === null (undecided) or accepted === false with no
    // correction supplied: no verified ground truth, excluded.
  }

  const evalCount = Math.round(examples.length * 0.2);
  const trainCount = examples.length - evalCount;
  const train = examples.slice(0, trainCount);
  const evalSet = examples.slice(trainCount);

  const toJsonl = (rows: TrainingExample[]) => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');

  writeFileSync('train.jsonl', toJsonl(train));
  writeFileSync('eval.jsonl', toJsonl(evalSet));

  console.log(`Exported ${examples.length} labelled examples from ${rows.length} logged parses.`);
  console.log(`  train.jsonl: ${train.length}`);
  console.log(`  eval.jsonl:  ${evalSet.length}`);
  if (examples.length < 500) {
    console.log(`\nStill below the ~500-entry / 100-correction trigger for Phase 4 — keep logging.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
