import test from 'node:test'
import assert from 'node:assert/strict'
import { fromWorkspace, toWorkspace, validateProject, isActive, statusLabel } from './model.ts'
import type { Workspace } from '../../bindings/changeme/internal/config/models'

test('UI adapter preserves backend fields when editing a project', () => {
  const original: Workspace = { id: 'w', name: 'Workspace', rootPath: 'D:/test', startCommandIds: ['dev'], resources: [{ id: 'docs', name: 'Docs', kind: 'url', target: 'http://localhost' }], projects: [{ id: 'p', name: 'API', directory: 'D:/test/api', technologies: ['go'], primaryCommandId: 'dev', commands: [{ id: 'dev', name: 'Dev', kind: 'service', driver: 'process', workingDirectory: 'cmd/api', environment: { PROFILE: 'local' }, ports: [8080, 5005], run: 'go run .', url: 'http://localhost:8080' }] }] }
  const view = toWorkspace(original)
  assert.deepEqual(JSON.parse(JSON.stringify(fromWorkspace(view))), original)
  view.projects[0].name = 'Renamed'
  view.projects[0].commands[0].port = 8081
  const result = fromWorkspace(view)
  assert.equal(result.projects![0].name, 'Renamed')
  assert.deepEqual(result.projects![0].commands![0].ports, [8081, 5005])
  assert.deepEqual(result.projects![0].commands![0].environment, { PROFILE: 'local' })
  assert.equal(result.projects![0].commands![0].workingDirectory, 'cmd/api')
})

test('empty projects and all runtime states have usable UI values', () => {
  const w = toWorkspace({ id: 'w', name: 'W', rootPath: '/tmp', projects: [{ id: 'p', name: 'P', directory: '/tmp/p', technologies: null, commands: null }], startCommandIds: null, resources: null })
  assert.equal(validateProject(w.projects[0]), null)
  assert.deepEqual(w.projects[0].commands, [])
  assert.equal(isActive(undefined), false)
  assert.equal(statusLabel(undefined), 'Chưa chạy')
})
