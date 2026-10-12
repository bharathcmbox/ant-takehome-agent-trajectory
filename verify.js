// Runs all five scorers over all four fixture scenarios and prints the
// results. Nothing here is hardcoded against expected_scores -- every
// result is computed fresh so it can be diffed against the fixtures by eye.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  contentDlpRegex,
  recipientAllowlist,
  trajectorySingleAgent,
  behavioralBaseline,
  crossAgentLineage,
} from './scorers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadJSON(relPath) {
  return JSON.parse(readFileSync(path.join(__dirname, relPath), 'utf8'));
}

const world = loadJSON('fixtures/world.json');

const scenarios = [
  { id: 'S1', ...pick(loadJSON('fixtures/scenario_S1_naive.json')) },
  { id: 'S2', ...pick(loadJSON('fixtures/scenario_S2_main.json')) },
  { id: 'C1', ...pick(loadJSON('fixtures/scenario_C1_C2_controls.json').C1) },
  { id: 'C2', ...pick(loadJSON('fixtures/scenario_C1_C2_controls.json').C2) },
];

function pick(scenario) {
  return { title: scenario.title, steps: scenario.steps };
}

const LAYERS = [
  ['content_dlp_regex', contentDlpRegex],
  ['recipient_allowlist', recipientAllowlist],
  ['trajectory_single_agent', trajectorySingleAgent],
  ['behavioral_baseline', behavioralBaseline],
  ['cross_agent_lineage', crossAgentLineage],
];

const RESULT_WIDTH = Math.max(...['pass', 'weak', 'medium', 'block', 'high'].map((r) => r.length));
const LAYER_WIDTH = Math.max(...LAYERS.map(([name]) => name.length));

function pad(s, w) {
  return s + ' '.repeat(Math.max(0, w - s.length));
}

for (const scenario of scenarios) {
  console.log(`\n=== ${scenario.id}: ${scenario.title} ===`);
  for (const [name, fn] of LAYERS) {
    const { result, reason } = fn(scenario.steps, world);
    console.log(`  ${pad(name, LAYER_WIDTH)}  ${pad(result, RESULT_WIDTH)}  ${reason}`);
  }
}
console.log('');
