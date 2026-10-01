import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { AGENT_ROLES, parseAgentModels } from '../src/config.mjs';
import { CodexRunner } from '../src/codex-runner.mjs';
import { Database } from '../src/database.mjs';

test('role assignments are parsed with and without an effort', () => {
  assert.deepEqual(parseAgentModels('repair=cheap-model'), {
    repair: { model: 'cheap-model', effort: null },
  });
  assert.deepEqual(parseAgentModels('repair=cheap:low, reviewer=strong:high'), {
    repair: { model: 'cheap', effort: 'low' },
    reviewer: { model: 'strong', effort: 'high' },
  });
  // Unset keeps today's behaviour: every role shares the Codex configuration.
  for (const empty of [undefined, null, '', '   ', ',,']) {
    assert.deepEqual(parseAgentModels(empty), {});
  }
});

test('a typo in a role name fails loudly instead of quietly doing nothing', () => {
  // A silent typo reads exactly like "the feature does not work", which is the
  // one outcome that cannot be debugged from the outside.
  assert.throws(() => parseAgentModels('repiar=cheap'), /bilinmeyen rol: "repiar"/);
  assert.throws(() => parseAgentModels('builder=cheap'), /bilinmeyen rol/);
  assert.throws(() => parseAgentModels('repair'), /okunamadı/);
  assert.throws(() => parseAgentModels('repair='), /okunamadı/);
  assert.throws(() => parseAgentModels('repair=a:b:c'), /okunamadı/);
  assert.throws(() => parseAgentModels('repair=a,repair=b'), /aynı rolü iki kez/);
});

// Roles that exist as pipeline tasks but never run a Codex agent: the
// orchestrator runs the quality gate itself, so there is no model to choose.
const GATE_ONLY_ROLES = new Set(['test']);

test('every role that actually runs an agent can be assigned', () => {
  // A role the pipeline drives with an agent but the parser rejects would be
  // unassignable, and the mismatch would only surface as a config error at boot.
  const source = fs.readFileSync(new URL('../src/orchestrator.mjs', import.meta.url), 'utf8');
  const declared = new Set([...source.matchAll(/\brole:\s*'([a-z_]+)'/g)].map(match => match[1]));
  const agentRoles = [...declared].filter(role => !GATE_ONLY_ROLES.has(role));
  assert.ok(agentRoles.length >= 10, `orchestrator rolleri okunamadı: ${agentRoles.length}`);
  for (const role of agentRoles) {
    assert.ok(AGENT_ROLES.includes(role), `atanamayan agent rolü: ${role}`);
  }
  // And nothing listed as assignable is actually a gate the Studio runs itself.
  for (const role of AGENT_ROLES) {
    assert.equal(GATE_ONLY_ROLES.has(role), false, `kapı görevi atanabilir sanılıyor: ${role}`);
  }
});

test('the runner asks for a model only when one is assigned', () => {
  // An unassigned role must pass no flag at all, so Codex keeps deciding.
  assert.deepEqual(CodexRunner.modelArgs(), []);
  assert.deepEqual(CodexRunner.modelArgs({ model: null, effort: null }), []);
  assert.deepEqual(CodexRunner.modelArgs({ model: 'cheap' }), ['--model', 'cheap']);
  assert.deepEqual(CodexRunner.modelArgs({ model: 'cheap', effort: 'low' }), [
    '--model', 'cheap', '-c', 'model_reasoning_effort=low',
  ]);
  // Effort without a model is still honoured: it is a separate Codex setting.
  assert.deepEqual(CodexRunner.modelArgs({ effort: 'high' }), [
    '-c', 'model_reasoning_effort=high',
  ]);
});

test('the assigned model reaches the Codex invocation', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-model-'));
  const script = path.join(directory, 'fake-codex.js');
  // Echoes its own argv back as the agent message, so the test reads the real
  // command line rather than trusting the builder.
  fs.writeFileSync(script, [
    'const event = { type: "item.completed", item: { type: "agent_message", text: process.argv.slice(2).join(" ") } };',
    'process.stdout.write(JSON.stringify(event) + "\\n");',
  ].join('\n'), 'utf8');

  const runner = new CodexRunner(script);
  const withModel = await runner.run({
    workspace: directory, prompt: 'merhaba', onEvent: () => {}, model: 'cheap', effort: 'low',
  });
  assert.match(withModel, /--model cheap/);
  assert.match(withModel, /-c model_reasoning_effort=low/);

  const withoutModel = await runner.run({
    workspace: directory, prompt: 'merhaba', onEvent: () => {},
  });
  assert.doesNotMatch(withoutModel, /--model/);
  assert.doesNotMatch(withoutModel, /model_reasoning_effort/);
});

test('an agent run records what was requested, and null when nothing was', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-agent-model-'));
  const database = new Database(path.join(directory, 'studio.db'));
  database.createProject({
    id: 'aaaaaaaaaaaa', name: 'Model Kaydı', prompt: 'spec', status: 'queued',
    workspace_path: directory,
  });

  const pinned = database.createAgentRun('aaaaaaaaaaaa', 'Repair Agent', 'repair', directory);
  database.updateAgentRun(pinned, { model: 'cheap', reasoning_effort: 'low' });
  const free = database.createAgentRun('aaaaaaaaaaaa', 'Mobile Reviewer', 'reviewer', directory);

  const runs = database.listAgentRuns('aaaaaaaaaaaa');
  const byRole = Object.fromEntries(runs.map(run => [run.role, run]));
  assert.equal(byRole.repair.model, 'cheap');
  assert.equal(byRole.repair.reasoning_effort, 'low');
  // Null is the honest value: the exec JSON stream reports no model, so an
  // unpinned role means "Codex's own configuration decided" — not a guess.
  assert.equal(byRole.reviewer.model, null);
  assert.equal(byRole.reviewer.reasoning_effort, null);
  database.close();
});
