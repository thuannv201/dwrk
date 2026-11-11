import type * as Config from '../../bindings/changeme/internal/config/models'
import type * as Runtime from '../../bindings/changeme/internal/runner/models'

export type HealthCheck = Config.HealthCheck
export type Command = Omit<Config.Command, 'kind' | 'run' | 'healthCheck' | 'compose'> & { kind: 'service' | 'task'; run: string; port?: number; healthCheck?: Config.HealthCheck; compose?: Config.Compose }
export type Project = Omit<Config.Project, 'commands' | 'primaryCommandId' | 'technologies'> & { commands: Command[]; primaryCommandId: string; technologies: string[]; technology: 'react' | 'spring' | 'go' | 'docker' | 'java' | 'typescript'; technologyLabel: string; branch: string }
export type Workspace = Omit<Config.Workspace, 'projects' | 'startCommandIds' | 'resources'> & { projects: Project[]; startCommandIds: string[]; resources: Config.Resource[] }
export type Run = Omit<Runtime.Run, 'logs'> & { logs: Runtime.Log[] }
export type HistoryEntry = Runtime.History

export function toProject(p: Config.Project): Project {
  const technologies = p.technologies ?? []
  const technology = ['react', 'spring', 'go', 'docker', 'java', 'typescript'].find(t => technologies.includes(t)) as Project['technology'] | undefined
  return { ...p, technologies, technology: technology ?? 'typescript', technologyLabel: technologies.join(' · ') || 'Project', branch: 'Git', primaryCommandId: p.primaryCommandId ?? '', commands: (p.commands ?? []).map(c => ({ ...c, kind: c.kind as Command['kind'], run: c.run ?? '', port: c.ports?.[0], healthCheck: c.healthCheck ?? undefined, compose: c.compose ?? undefined })) }
}
export function toWorkspace(w: Config.Workspace): Workspace { return { ...w, projects: (w.projects ?? []).map(toProject), startCommandIds: w.startCommandIds ?? [], resources: w.resources ?? [] } }
export function fromProject(p: Project): Config.Project {
  const { technology, technologyLabel, branch, ...value } = p
  return { ...value, commands: p.commands.map(c => { const { port, ...value } = c; return { ...value, ports: [...(port ? [port] : []), ...(c.ports ?? []).slice(1)] } }) }
}
export function fromWorkspace(w: Workspace): Config.Workspace { return { ...w, projects: w.projects.map(fromProject) } }
export function commandsIn(w: Workspace) { return w.projects.flatMap(p => p.commands) }
export function isActive(run?: Run) { return !!run && ['starting', 'running', 'stopping', 'unknown'].includes(run.status) }
export function isBusy(run?: Run) { return !!run && ['starting', 'stopping'].includes(run.status) }
export function statusLabel(run?: Run) { return ({ starting: 'Đang khởi động', running: 'Đang chạy', stopping: 'Đang dừng', stopped: 'Đã dừng', succeeded: 'Thành công', failed: 'Thất bại', cancelled: 'Đã hủy', unknown: 'Chưa xác định' } as Record<string, string>)[run?.status ?? ''] ?? 'Chưa chạy' }

export function validateProject(p: Project): string | null {
  if (!p.name.trim() || !/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(p.directory)) return 'Nhập tên và đường dẫn tuyệt đối của project.'
  if (p.primaryCommandId && !p.commands.some(c => c.id === p.primaryCommandId)) return 'Lệnh mặc định không tồn tại.'
  const names = new Set<string>()
  for (const c of p.commands) {
    if (!c.name.trim() || names.has(c.name.trim().toLowerCase())) return 'Tên lệnh cần có giá trị và không trùng nhau.'
    names.add(c.name.trim().toLowerCase())
    if (c.driver !== 'docker-compose' && !c.run.trim()) return 'Nhập lệnh thực thi.'
    if (c.port !== undefined && (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535)) return 'Cổng phải từ 1 đến 65535.'
  }
  return null
}
