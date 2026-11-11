import { validateProject, type Workspace, type Project, type Command } from './model.ts'

// shortcut: this file format uses mock DTOs; migrate it when backend config models are connected.
export function exportConfig(workspaces: Workspace[]): string {
  return JSON.stringify({ format: 'dwrk-mock', schemaVersion: 1, workspaces }, null, 2)
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Cấu trúc config không hợp lệ.')
  return value as Record<string, unknown>
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Config có trường văn bản không hợp lệ.')
  return value
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Config có danh sách không hợp lệ.')
  return value
}

export function parseConfig(text: string): Workspace[] {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error('File không phải JSON hợp lệ.') }
  const config = object(raw)
  if (config.format !== 'dwrk-mock' || config.schemaVersion !== 1) throw new Error('Chỉ hỗ trợ config DWRK mock phiên bản 1.')
  const ids = new Set<string>()
  function id(value: unknown): string {
    const result = string(value)
    if (!result.trim() || ids.has(result)) throw new Error('ID trong config phải có giá trị và không trùng nhau.')
    ids.add(result)
    return result
  }
  const workspaces = array(config.workspaces).map(value => {
    const w = object(value)
    const workspace: Workspace = {
      id: id(w.id), name: string(w.name), rootPath: string(w.rootPath),
      projects: array(w.projects).map(value => {
        const p = object(value)
        if (!['react', 'spring', 'go', 'docker', 'java', 'typescript'].includes(string(p.technology))) throw new Error('Công nghệ project không được hỗ trợ.')
        const project: Project = {
          id: id(p.id), name: string(p.name), directory: string(p.directory),
          technology: p.technology as Project['technology'], technologyLabel: string(p.technologyLabel),
          branch: string(p.branch), primaryCommandId: string(p.primaryCommandId),
          commands: array(p.commands).map(value => {
            const c = object(value)
            if (c.kind !== 'service' && c.kind !== 'task') throw new Error('Loại command không hợp lệ.')
            const command: Command = { id: id(c.id), name: string(c.name), kind: c.kind, run: string(c.run) }
            if (c.stop !== undefined) command.stop = string(c.stop)
            if (c.port !== undefined) {
              if (typeof c.port !== 'number') throw new Error('Cổng phải là số.')
              command.port = c.port
            }
            if (c.healthCheck !== undefined) {
              const h = object(c.healthCheck)
              if (typeof h.intervalMs !== 'number' || typeof h.timeoutMs !== 'number' || typeof h.expectedStatus !== 'number') throw new Error('Thông số health check phải là số.')
              command.healthCheck = { url: string(h.url), intervalMs: h.intervalMs, timeoutMs: h.timeoutMs, expectedStatus: h.expectedStatus }
            }
            return command
          }),
        }
        const error = validateProject(project)
        if (error) throw new Error(`${project.name}: ${error}`)
        return project
      }),
    }
    if (!workspace.name.trim() || !/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(workspace.rootPath)) throw new Error('Workspace cần tên và đường dẫn tuyệt đối.')
    return workspace
  })
  if (!workspaces.length) throw new Error('File chưa có workspace nào.')
  return workspaces
}

export function copyConfig(workspaces: Workspace[]): Workspace[] {
  return workspaces.map(workspace => ({
    ...workspace, id: crypto.randomUUID(), name: `${workspace.name} (import)`,
    projects: workspace.projects.map(project => {
      const commands = project.commands.map(command => ({ ...command, id: crypto.randomUUID() }))
      return { ...project, id: crypto.randomUUID(), commands, primaryCommandId: commands[project.commands.findIndex(command => command.id === project.primaryCommandId)].id }
    }),
  }))
}
