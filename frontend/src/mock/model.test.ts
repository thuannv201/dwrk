import test from 'node:test'
import assert from 'node:assert/strict'
import { mockReducer, validateProject } from './model.ts'
import { createMockState, importCandidates } from './data.ts'
import { copyConfig, exportConfig, parseConfig } from './config.ts'

test('config round trip imports independent copies without changing active runs', () => {
  const initial = createMockState()
  const text = exportConfig(initial.workspaces)
  assert.equal('runs' in JSON.parse(text), false)
  assert.deepEqual(parseConfig(text), initial.workspaces)
  const copies = copyConfig(parseConfig(text))
  const result = mockReducer(initial, { type: 'import-config', workspaces: copies })
  assert.equal(result.workspaces.length, initial.workspaces.length * 2)
  assert.equal(result.runs, initial.runs)
  assert.equal(result.history, initial.history)
  const oldIds = new Set(initial.workspaces.flatMap(w => [w.id, ...w.projects.flatMap(p => [p.id, ...p.commands.map(c => c.id)])]))
  for (const w of copies) {
    assert.equal(oldIds.has(w.id), false)
    for (const p of w.projects) {
      assert.equal(oldIds.has(p.id), false)
      assert.ok(p.commands.some(c => c.id === p.primaryCommandId))
      for (const c of p.commands) {
        assert.equal(oldIds.has(c.id), false)
        assert.equal(result.runs[c.id], undefined)
      }
    }
  }
})

test('config rejects malformed data, unsupported versions and invalid projects', () => {
  assert.throws(() => parseConfig('{'), /JSON/)
  for (const value of [null, [], {}, { format: 'dwrk-mock', schemaVersion: 2 }]) assert.throws(() => parseConfig(JSON.stringify(value)))
  const invalid = (edit: (workspaces: ReturnType<typeof createMockState>['workspaces']) => void) => {
    const state = createMockState()
    edit(state.workspaces)
    assert.throws(() => parseConfig(exportConfig(state.workspaces)))
  }
  invalid(w => { w[0].projects[0].commands[0].port = 70000 })
  invalid(w => { w[0].projects[0].commands[0].kind = 'bad' as never })
  invalid(w => { w[0].projects[0].name = null as never })
  invalid(w => { w[0].projects[0].primaryCommandId = 'missing' })
  invalid(w => { w[0].projects[0].commands[0].id = w[0].id })
  invalid(w => { w[0].projects[1].commands[0].healthCheck!.url = 'file:///secret' })
  invalid(w => { w[0].rootPath = 'relative' })
  assert.throws(() => parseConfig(exportConfig([])))
  const empty = [{ id: 'empty', name: 'Empty', rootPath: '/projects', projects: [] }]
  assert.deepEqual(parseConfig(exportConfig(empty)), empty)
})

test('stopping one workspace preserves another workspace and previous state', () => {
  const initial = createMockState(10000)
  const withPortal = mockReducer(initial, { type: 'set-running', commandIds: ['portal-dev'], running: true, now: 11000 })
  const stopped = mockReducer(withPortal, { type: 'set-running', commandIds: ['frontend-dev', 'iam-local', 'infra-up'], running: false, now: 12000 })
  assert.equal(stopped.runs['portal-dev'].status, 'running')
  assert.equal(stopped.runs['iam-local'].status, 'stopped')
  assert.equal(initial.runs['iam-local'].status, 'running')
})

test('task completion is different from stopping a service', () => {
  const result = mockReducer(createMockState(), { type: 'task', commandId: 'frontend-build', now: 10000 })
  assert.equal(result.runs['frontend-build'].status, 'succeeded')
  assert.equal(result.runs['frontend-dev'].status, 'running')
})

test('an active service cannot be removed or converted into a task', () => {
  const initial = createMockState()
  const project = structuredClone(initial.workspaces[0].projects[1])
  project.commands = project.commands.filter(command => command.id !== 'iam-local')
  project.primaryCommandId = 'iam-test'
  assert.equal(mockReducer(initial, { type: 'save-project', workspaceId: 'commerce', project }), initial)
  const changed = structuredClone(initial.workspaces[0].projects[1])
  changed.commands[0].kind = 'task'
  delete changed.commands[0].healthCheck
  assert.equal(mockReducer(initial, { type: 'save-project', workspaceId: 'commerce', project: changed }), initial)
})

test('import is idempotent and does not start imported services', () => {
  const initial = createMockState()
  const action = { type: 'import-projects' as const, workspaceId: 'commerce', projects: importCandidates(initial.workspaces[0]) }
  const once = mockReducer(initial, action)
  const twice = mockReducer(once, action)
  assert.equal(twice.workspaces[0].projects.length, 6)
  assert.equal(twice.runs[action.projects[0].primaryCommandId], undefined)
})

test('invalid health check and port are rejected before saving', () => {
  const project = structuredClone(createMockState().workspaces[0].projects[1])
  project.commands[0].healthCheck!.url = 'file:///etc/passwd'
  assert.match(validateProject(project)!, /HTTP/)
  project.commands[0].healthCheck!.url = 'http://localhost:8080/health'
  project.commands[0].port = 65536
  assert.match(validateProject(project)!, /65535/)
  project.commands[0].port = 8080
  assert.equal(validateProject(project), null)
})
