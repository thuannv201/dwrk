// shortcut: frontend-only fixtures and DTOs; replace with generated Go models when backend integration starts.
export type HealthCheck = { url: string; intervalMs: number; timeoutMs: number; expectedStatus: number }
export type Command = {
  id: string
  name: string
  kind: 'service' | 'task'
  run: string
  stop?: string
  port?: number
  healthCheck?: HealthCheck
}
export type Project = {
  id: string
  name: string
  directory: string
  technology: 'react' | 'spring' | 'go' | 'docker' | 'java' | 'typescript'
  technologyLabel: string
  branch: string
  primaryCommandId: string
  commands: Command[]
}
export type Workspace = { id: string; name: string; rootPath: string; projects: Project[] }
export type LogEntry = { sequence: number; timestamp: number; stream: 'stdout' | 'stderr'; level: 'INFO' | 'WARN' | 'ERROR'; message: string }
export type Run = { status: 'running' | 'stopped' | 'succeeded'; startedAt?: number; endedAt?: number; logs: LogEntry[] }
export type HistoryEntry = { workspaceId: string; timestamp: number; message: string }
export type MockState = { workspaces: Workspace[]; runs: Record<string, Run>; history: HistoryEntry[] }
export type MockAction =
  | { type: 'set-running'; commandIds: string[]; running: boolean; now: number; restart?: boolean }
  | { type: 'task'; commandId: string; now: number }
  | { type: 'save-project'; workspaceId: string; project: Project }
  | { type: 'import-projects'; workspaceId: string; projects: Project[] }
  | { type: 'add-workspace'; workspace: Workspace }

export function commandsIn(workspace: Workspace) {
  return workspace.projects.flatMap(project => project.commands)
}

export function validateProject(project: Project): string | null {
  if (!project.name.trim() || !project.directory.trim()) return 'Tên và thư mục project không được để trống.'
  if (!/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(project.directory)) return 'Nhập đường dẫn tuyệt đối đến thư mục project.'
  if (!project.commands.some(command => command.id === project.primaryCommandId)) return 'Chọn một lệnh mặc định của project.'
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const command of project.commands) {
    if (!command.name.trim() || !command.run.trim()) return 'Mỗi lệnh cần tên và nội dung thực thi.'
    if (ids.has(command.id) || names.has(command.name.trim().toLowerCase())) return 'Tên lệnh trong project không được trùng nhau.'
    ids.add(command.id)
    names.add(command.name.trim().toLowerCase())
    if (command.port !== undefined && (!Number.isInteger(command.port) || command.port < 1 || command.port > 65535)) return 'Cổng phải là số nguyên từ 1 đến 65535.'
    if (command.kind === 'task' && command.healthCheck) return 'Task build/test không có health check.'
    if (command.healthCheck) {
      const health = command.healthCheck
      try {
        const url = new URL(health.url)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return 'Health check cần URL HTTP/HTTPS, không chứa mật khẩu.'
      } catch { return 'URL health check không hợp lệ.' }
      if (!Number.isInteger(health.intervalMs) || health.intervalMs < 1000 || !Number.isInteger(health.timeoutMs) || health.timeoutMs < 100) return 'Health check: chu kỳ tối thiểu 1 giây, timeout tối thiểu 100 ms.'
      if (!Number.isInteger(health.expectedStatus) || health.expectedStatus < 200 || health.expectedStatus > 299) return 'HTTP status mong đợi phải từ 200 đến 299.'
    }
  }
  return null
}

export function mockReducer(state: MockState, action: MockAction): MockState {
  if (action.type === 'add-workspace') {
    if (state.workspaces.some(w => w.id === action.workspace.id)) return state
    return { ...state, workspaces: [...state.workspaces, action.workspace] }
  }
  if (action.type === 'save-project' || action.type === 'import-projects') {
    if (action.type === 'save-project' && validateProject(action.project)) return state
    if (action.type === 'save-project') {
      const previous = state.workspaces.find(w => w.id === action.workspaceId)?.projects.find(p => p.id === action.project.id)
      if (previous?.commands.some(command => state.runs[command.id]?.status === 'running' && !action.project.commands.some(next => next.id === command.id && next.kind === 'service'))) return state
    }
    return {
      ...state,
      workspaces: state.workspaces.map(workspace => {
        if (workspace.id !== action.workspaceId) return workspace
        if (action.type === 'save-project') return { ...workspace, projects: workspace.projects.map(project => project.id === action.project.id ? action.project : project) }
        const directories = new Set(workspace.projects.map(project => project.directory.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()))
        const imported = action.projects.filter(project => {
          const key = project.directory.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
          if (directories.has(key) || validateProject(project)) return false
          directories.add(key)
          return true
        })
        return { ...workspace, projects: [...workspace.projects, ...imported] }
      }),
    }
  }
  const runs = { ...state.runs }
  const history = [...state.history]
  const ids = action.type === 'task' ? [action.commandId] : action.commandIds
  for (const workspace of state.workspaces) for (const project of workspace.projects) for (const command of project.commands) {
    if (!ids.includes(command.id)) continue
    const previous = runs[command.id]
    if (action.type === 'task') {
      if (command.kind !== 'task') continue
      runs[command.id] = { status: 'succeeded', startedAt: action.now, endedAt: action.now, logs: [
        { sequence: 1, timestamp: action.now, stream: 'stdout', level: 'INFO', message: `$ ${command.run}` },
        { sequence: 2, timestamp: action.now, stream: 'stdout', level: 'INFO', message: 'Task hoàn thành — exit code 0 (mô phỏng).' },
      ] }
      history.unshift({ workspaceId: workspace.id, timestamp: action.now, message: `${project.name} / ${command.name}: hoàn thành task (mock)` })
    } else {
      if (command.kind !== 'service' || !command.run.trim()) continue
      if (!action.restart && (previous?.status === 'running') === action.running) continue
      const logs = action.running ? [] : [...(previous?.logs ?? [])]
      logs.push({ sequence: (logs[logs.length - 1]?.sequence ?? 0) + 1, timestamp: action.now, stream: 'stdout', level: 'INFO', message: action.running ? `$ ${command.run}` : 'Service đã dừng (mô phỏng).' })
      if (action.running) logs.push({ sequence: 2, timestamp: action.now, stream: 'stdout', level: 'INFO', message: 'Service đang chạy — dữ liệu mô phỏng, chưa thực thi lệnh thật.' })
      runs[command.id] = { status: action.running ? 'running' : 'stopped', startedAt: action.running ? action.now : previous?.startedAt, endedAt: action.running ? undefined : action.now, logs: logs.slice(-200) }
      history.unshift({ workspaceId: workspace.id, timestamp: action.now, message: `${project.name} / ${command.name}: ${action.running ? action.restart ? 'chạy lại' : 'chạy' : 'dừng'} (mock)` })
    }
  }
  return { ...state, runs, history: history.slice(0, 50) }
}
