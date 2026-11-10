import { useEffect, useReducer, useState } from 'react'
import { Activity, BookOpen, CodeXml, Database, Folder, FolderOpen, Moon, Play, Plus, ScanLine, Search, Settings2, Square, Sun, Terminal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatusBar } from '@/components/StatusBar'
import { ProjectList } from '@/features/projects/ProjectList'
import { ProjectDetails } from '@/features/projects/ProjectDetails'
import { ProjectSettingsDialog } from '@/features/projects/ProjectSettingsDialog'
import { ImportProjectsDialog } from '@/features/workspaces/ImportProjectsDialog'
import { NewWorkspaceDialog } from '@/features/workspaces/NewWorkspaceDialog'
import { LogPanel } from '@/features/logs/LogPanel'
import { createMockState } from '@/mock/data'
import { commandsIn, mockReducer, type Command, type Project } from '@/mock/model'
import { cn } from '@/lib/utils'

type Theme = 'dark' | 'light' | 'system'
type Modal = 'import' | 'manual' | 'workspace' | 'settings' | 'running' | { project: Project } | null

function initialTheme(): Theme {
  try { const saved = localStorage.getItem('dwrk.theme'); if (saved === 'light' || saved === 'system') return saved } catch { /* Theme still works when storage is unavailable. */ }
  return 'dark'
}

export default function App() {
  const [state, dispatch] = useReducer(mockReducer, undefined, () => createMockState())
  const [workspaceId, setWorkspaceId] = useState('commerce')
  const [projectId, setProjectId] = useState('iam')
  const [commandId, setCommandId] = useState('iam-local')
  const [workspaceSearch, setWorkspaceSearch] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const [modal, setModal] = useState<Modal>(null)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [notice, setNotice] = useState('')
  const workspace = state.workspaces.find(item => item.id === workspaceId)!
  const project = workspace.projects.find(item => item.id === projectId) ?? workspace.projects[0]
  const command = project?.commands.find(item => item.id === commandId) ?? project?.commands.find(item => item.id === project.primaryCommandId)
  const workspaceCommands = commandsIn(workspace)
  const runningIn = (id: string) => state.runs[id]?.status === 'running'
  const runningCount = workspaceCommands.filter(item => item.kind === 'service' && runningIn(item.id)).length
  const serviceCount = workspaceCommands.filter(item => item.kind === 'service').length
  const totalRunning = Object.values(state.runs).filter(run => run.status === 'running').length
  const visibleProjects = workspace.projects.filter(item => `${item.name} ${item.technologyLabel} ${item.directory}`.toLowerCase().includes(projectSearch.toLowerCase()))

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches))
    apply()
    media.addEventListener('change', apply)
    try { localStorage.setItem('dwrk.theme', theme) } catch { /* Keep session preference without persistent storage. */ }
    return () => media.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 5500); return () => window.clearTimeout(timer) }, [notice])

  function selectProject(item: Project) { setProjectId(item.id); setCommandId(item.primaryCommandId) }
  function selectCommand(id: string) {
    const owner = workspace.projects.find(item => item.commands.some(c => c.id === id))
    if (owner) { setProjectId(owner.id); setCommandId(id) }
  }
  function runCommand(item: Command) {
    selectCommand(item.id)
    const now = Date.now()
    if (item.kind === 'task') { dispatch({ type: 'task', commandId: item.id, now }); setNotice(`Mock: task ${item.name} đã hoàn thành.`) }
    else { dispatch({ type: 'set-running', commandIds: [item.id], running: !runningIn(item.id), now }); setNotice(`Mock: ${runningIn(item.id) ? 'dừng' : 'chạy'} ${item.name}. Không thực thi lệnh thật.`) }
  }
  function batch(running: boolean) {
    const ids = running ? workspace.projects.map(item => item.commands.find(c => c.id === item.primaryCommandId)!).filter(item => item.kind === 'service').map(item => item.id) : workspaceCommands.filter(item => item.kind === 'service').map(item => item.id)
    dispatch({ type: 'set-running', commandIds: ids, running, now: Date.now() })
    setNotice(`Mock: ${running ? 'chạy' : 'dừng'} service của ${workspace.name}. Workspace khác giữ nguyên trạng thái.`)
  }

  return <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
    <header className="flex min-h-12 items-center justify-between gap-3 border-b bg-card px-4 py-2 sm:px-6">
      <div className="flex items-center gap-2.5"><span className="flex size-6 items-center justify-center rounded bg-primary/15 text-primary"><Terminal className="size-4" /></span><span className="text-base font-semibold tracking-tight">dwrk</span><span className="ml-3 hidden text-xs text-muted-foreground sm:inline">Development workspaces</span></div>
      <div className="flex items-center gap-2"><Badge variant="outline" className="border-primary/25 bg-primary/5 text-[10px] tracking-wider text-primary">MOCK DATA</Badge><Button variant="ghost" size="icon-sm" aria-label="Đổi giao diện sáng tối" onClick={() => setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark')}>{theme === 'light' ? <Moon /> : <Sun />}</Button></div>
    </header>

    <div className="grid min-h-0 min-w-0 overflow-y-auto lg:grid-cols-[208px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="flex min-w-0 flex-col border-b bg-card/35 px-3 py-5 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
        <div className="mb-6 hidden items-center gap-3 px-3 lg:flex"><CodeXml className="size-7 text-primary" /><span className="text-xl font-semibold tracking-tight">DevSpace</span></div>
        <div className="relative mb-5"><Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input aria-label="Tìm workspace" placeholder="Tìm workspace" value={workspaceSearch} onChange={event => setWorkspaceSearch(event.target.value)} className="bg-secondary/40 pl-9 text-xs" /></div>
        <p className="mb-3 px-3 text-[10px] font-medium tracking-[0.12em] text-muted-foreground">WORKSPACES</p>
        <nav aria-label="Workspaces" className="flex flex-wrap gap-1 lg:block lg:space-y-1">{state.workspaces.filter(item => item.name.toLowerCase().includes(workspaceSearch.toLowerCase())).map(item => {
          const count = commandsIn(item).filter(c => runningIn(c.id)).length
          return <button key={item.id} aria-pressed={workspace.id === item.id} className={cn('flex min-h-11 items-center gap-3 rounded-md border-l-[3px] border-transparent px-3 py-2 text-left text-sm transition-colors lg:w-full', workspace.id === item.id ? 'border-primary bg-accent text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')} onClick={() => { setWorkspaceId(item.id); setProjectId(item.projects[0]?.id ?? ''); setCommandId(item.projects[0]?.primaryCommandId ?? ''); setProjectSearch(''); setNotice(`Đã chuyển sang ${item.name}. Service đang chạy được giữ nguyên.`) }}><Folder className="size-4 shrink-0" /><span className="min-w-0 flex-1 break-words">{item.name}</span>{count > 0 && <span className="text-[10px] tabular-nums text-success">{count}</span>}</button>
        })}</nav>
        <div className="mt-5 flex flex-wrap gap-1 border-t pt-3 lg:mt-auto lg:block lg:pt-4"><Button variant="ghost" className="justify-start text-xs text-muted-foreground lg:w-full" onClick={() => setModal('running')}><Activity />Đang chạy<span className="ml-auto text-success">{totalRunning}</span></Button><Button variant="ghost" className="justify-start text-xs lg:w-full" onClick={() => setModal('workspace')}><Plus />Workspace mới</Button><Button variant="ghost" className="justify-start text-xs text-muted-foreground lg:w-full" onClick={() => setModal('settings')}><Settings2 />Cài đặt</Button></div>
      </aside>

      <main className="min-w-0 px-4 py-5 sm:px-6 lg:min-h-0 lg:overflow-y-auto xl:px-7">
        <div className="mb-5 flex items-center gap-3 text-xs text-muted-foreground">Workspace<span>/</span><span className="text-foreground">{workspace.name}</span></div>
        <div className="workspace-grid">
          <section className="workspace-content min-w-0" aria-label="Workspace đang chọn">
            <div className="mb-5 flex items-center gap-4"><FolderOpen className="size-8 shrink-0 text-primary" /><div className="min-w-0"><h1 className="break-words text-[28px] font-semibold tracking-[-0.8px]">{workspace.name}</h1><p className="mt-1 text-sm text-muted-foreground">Môi trường phát triển local</p></div></div>
            <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-b pb-5"><div className="flex flex-wrap gap-2.5"><Button onClick={() => batch(true)} disabled={!serviceCount}><Play className="fill-current" />Chạy workspace</Button><Button variant="outline" onClick={() => batch(false)} disabled={!runningCount}><Square className="size-3 fill-current" />Dừng tất cả</Button></div><div className="flex items-center gap-4 text-xs"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-success" />{runningCount} đang chạy</span><span className="flex items-center gap-2 text-muted-foreground"><span className="size-2 rounded-full bg-muted-foreground" />{serviceCount - runningCount} đã dừng</span></div></div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight">Projects <span className="ml-1 text-xs font-normal text-muted-foreground">{workspace.projects.length}</span></h2><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setModal('import')}><ScanLine />Import</Button><Button variant="outline" size="sm" onClick={() => setModal('manual')}><Plus />Thêm project</Button></div></div>
            {workspace.projects.length > 0 && <div className="relative mb-3"><Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input aria-label="Tìm project" placeholder="Tìm project, công nghệ hoặc thư mục…" value={projectSearch} onChange={event => setProjectSearch(event.target.value)} className="h-9 bg-card/50 pl-9 text-xs" /></div>}
            <ProjectList projects={visibleProjects} runs={state.runs} selectedId={project?.id} onSelect={selectProject} onConfigure={item => setModal({ project: item })} onToggle={item => runCommand(item.commands.find(c => c.id === item.primaryCommandId)!)} onRestart={item => { const primary = item.commands.find(c => c.id === item.primaryCommandId)!; if (primary.kind === 'task') runCommand(primary); else { dispatch({ type: 'set-running', commandIds: [primary.id], running: true, restart: true, now: Date.now() }); setNotice(`Mock: chạy lại ${item.name}.`) } }} notify={setNotice} />
            {!visibleProjects.length && <div className="rounded-xl border border-dashed px-5 py-12 text-center"><FolderOpen className="mx-auto mb-3 size-8 text-muted-foreground" /><h3 className="font-medium">{workspace.projects.length ? 'Không tìm thấy project' : 'Workspace chưa có project'}</h3><p className="mt-2 text-xs text-muted-foreground">{workspace.projects.length ? 'Thử tên hoặc công nghệ khác.' : 'Quét thư mục để chọn nội dung import, hoặc thêm từng project.'}</p>{!workspace.projects.length && <Button className="mt-5" onClick={() => setModal('import')}><ScanLine />Quét & import</Button>}</div>}
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-muted-foreground"><button className="flex items-center gap-2 rounded hover:text-primary" onClick={() => setNotice(`Mock: mở ${workspace.rootPath}\\docs`)}><BookOpen className="size-3.5" />Tài liệu</button><button className="flex items-center gap-2 rounded hover:text-primary" onClick={() => setNotice('Mock: mở công cụ database đã cấu hình.')}><Database className="size-3.5" />Database</button><button className="flex items-center gap-2 rounded hover:text-primary" onClick={() => setNotice(`Mock: mở terminal tại ${workspace.rootPath}`)}><Terminal className="size-3.5" />Terminal</button><span className="ml-auto flex min-w-0 items-center gap-1.5 text-[10px]"><Folder className="size-3 shrink-0" /><span className="break-all">{workspace.rootPath}</span></span></div>
          </section>
          {project && command ? <ProjectDetails key={project.id} project={project} command={command} runs={state.runs} onConfigure={() => setModal({ project })} onSelectCommand={selectCommand} onRun={runCommand} notify={setNotice} /> : <aside className="project-detail rounded-xl border bg-card p-6 text-sm text-muted-foreground"><Settings2 className="mb-3 size-5" />Chọn một project để xem cấu hình, lệnh chạy và health check.</aside>}
          <LogPanel key={`${workspace.id}-${command?.id}-${state.runs[command?.id ?? '']?.startedAt}`} workspace={workspace} command={command} run={state.runs[command?.id ?? '']} history={state.history.filter(item => item.workspaceId === workspace.id)} onSelect={selectCommand} />
        </div>
      </main>
    </div>
    <StatusBar projectCount={workspace.projects.length} runningCount={totalRunning} />

    {notice && <div role="status" className="fixed right-4 bottom-14 left-4 z-40 flex items-start gap-3 rounded-lg border border-primary/30 bg-card p-4 text-xs leading-5 shadow-lg sm:left-auto sm:max-w-md"><Activity className="mt-0.5 size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1">{notice}</span><button aria-label="Đóng thông báo" onClick={() => setNotice('')}><X className="size-4 text-muted-foreground" /></button></div>}
    {modal && typeof modal === 'object' && <ProjectSettingsDialog key={modal.project.id} project={modal.project} runningCommandIds={modal.project.commands.filter(item => runningIn(item.id)).map(item => item.id)} onClose={() => setModal(null)} onSave={item => { dispatch({ type: 'save-project', workspaceId, project: item }); setModal(null); setNotice('Đã lưu cấu hình trong phiên mock. Service không tự khởi động lại.') }} />}
    {(modal === 'import' || modal === 'manual') && <ImportProjectsDialog workspace={workspace} manual={modal === 'manual'} onClose={() => setModal(null)} onImport={projects => { dispatch({ type: 'import-projects', workspaceId, projects }); setModal(null); if (projects[0]) selectProject(projects[0]); setNotice(`Đã import ${projects.length} project vào phiên mock; chưa khởi chạy service.`) }} />}
    {modal === 'workspace' && <NewWorkspaceDialog onClose={() => setModal(null)} onCreate={item => { dispatch({ type: 'add-workspace', workspace: item }); setWorkspaceId(item.id); setProjectId(''); setCommandId(''); setProjectSearch(''); setModal('import') }} />}
    {(modal === 'settings' || modal === 'running') && <Dialog open onOpenChange={open => { if (!open) setModal(null) }}><DialogContent><DialogHeader><DialogTitle>{modal === 'settings' ? 'Cài đặt ứng dụng' : 'Service đang chạy'}</DialogTitle><DialogDescription>{modal === 'settings' ? 'Giao diện được ghi nhớ trên trình duyệt/WebView. Cấu hình project và service chỉ tồn tại trong phiên mock.' : 'Các service vẫn giữ trạng thái khi chuyển workspace. Danh sách dưới đây là mô phỏng.'}</DialogDescription></DialogHeader>
      {modal === 'settings' ? <div className="space-y-5"><label className="block text-sm">Giao diện<select aria-label="Giao diện" value={theme} onChange={event => setTheme(event.target.value as Theme)} className="mt-2 block h-10 w-full rounded-md border bg-background px-3"><option value="dark">Tối</option><option value="light">Sáng</option><option value="system">Theo hệ thống</option></select></label><div className="rounded-md border p-3 text-xs leading-6 text-muted-foreground">Múi giờ: Việt Nam (UTC+7)<br />Log: tối đa 200 dòng hiển thị / command trong mock.<br />IDE, terminal, Git, Docker và filesystem chưa kết nối backend.</div></div> : <div className="max-h-80 space-y-2 overflow-auto">{state.workspaces.flatMap(w => w.projects.flatMap(p => p.commands.filter(c => runningIn(c.id)).map(c => <div key={c.id} className="flex items-center justify-between gap-4 rounded-md border p-3"><div><p className="text-sm font-medium">{p.name}</p><p className="mt-1 text-xs text-muted-foreground">{w.name} / {c.name}</p></div><Button variant="outline" size="sm" aria-label={`Dừng service ${p.name}`} onClick={() => dispatch({ type: 'set-running', commandIds: [c.id], running: false, now: Date.now() })}><Square />Dừng</Button></div>)))}{!totalRunning && <p className="py-5 text-center text-muted-foreground">Không có service đang chạy.</p>}</div>}
    </DialogContent></Dialog>}
  </div>
}
