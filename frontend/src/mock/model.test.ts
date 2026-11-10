import test from 'node:test'
import assert from 'node:assert/strict'
import { mockReducer, validateProject } from './model.ts'
import { createMockState, importCandidates } from './data.ts'

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
