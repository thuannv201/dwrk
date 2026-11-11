import { useEffect, useMemo, useRef, useState } from 'react'
import { Events } from '@wailsio/runtime'
import { Activity, ArrowRightLeft, BookOpen, CodeXml, Folder, FolderOpen, Moon, Play, Plus, RefreshCw, ScanLine, Search, Settings2, Square, Sun, Terminal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatusBar } from '@/components/StatusBar'
import { ProjectList } from '@/features/projects/ProjectList'
import { ProjectDetails } from '@/features/projects/ProjectDetails'
import { ProjectSettingsDialog } from '@/features/projects/ProjectSettingsDialog'
import { GitDialog } from '@/features/projects/GitDialog'
import { ImportProjectsDialog } from '@/features/workspaces/ImportProjectsDialog'
import { ConfigDialog } from '@/features/workspaces/ConfigDialog'
import { NewWorkspaceDialog } from '@/features/workspaces/NewWorkspaceDialog'
import { WorkspaceSettingsDialog } from '@/features/workspaces/WorkspaceSettingsDialog'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { LogPanel } from '@/features/logs/LogPanel'
import { commandsIn, fromProject, fromWorkspace, isActive, toWorkspace, statusLabel, type Command, type Project, type Run, type Workspace, type HistoryEntry } from '@/lib/model'
import { ConfigService, DesktopService, RuntimeService } from '../../bindings/changeme'
import type { Config } from '../../bindings/changeme/internal/config/models'
import { AppCloseRequested } from '../../bindings/events'
import { cn } from '@/lib/utils'

type Modal = 'config' | 'import' | 'manual' | 'workspace' | 'workspace-settings' | 'settings' | 'running' | 'quit' | { project: Project; git?: boolean } | null
const empty: Workspace = { id: '', name: 'Chưa có workspace', rootPath: '', projects: [], resources: [], startCommandIds: [] }

export default function App() {
  const [config, setConfig] = useState<Config | null>(null)
  const [runs, setRuns] = useState<Record<string, Run>>({})
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [commandId, setCommandId] = useState('')
  const [workspaceSearch, setWorkspaceSearch] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const [modal, setModal] = useState<Modal>(null)
  const [notice, setNotice] = useState('')
  const [loadError, setLoadError] = useState('')
  const [restoreConfirm, setRestoreConfirm] = useState(false)
  const [pending, setPending] = useState<string[]>([])
  const pendingRef = useRef(new Set<string>())
  const workspaces = useMemo(() => (config?.workspaces ?? []).map(toWorkspace), [config])
  const workspace = workspaces.find(w => w.id === workspaceId) ?? workspaces[0] ?? empty
  const project = workspace.projects.find(p => p.id === projectId) ?? workspace.projects[0]
  const command = project?.commands.find(c => c.id === commandId) ?? project?.commands.find(c => c.id === project.primaryCommandId) ?? project?.commands[0]
  const workspaceCommands = commandsIn(workspace)
  const active = (id: string) => isActive(runs[id])
  const runningCount = workspaceCommands.filter(c => c.kind === 'service' && active(c.id)).length
  const totalRunning = Object.values(runs).filter(r => isActive(r)).length
  const visibleProjects = workspace.projects.filter(p => `${p.name} ${p.technologyLabel} ${p.directory}`.toLowerCase().includes(projectSearch.toLowerCase()))
  const theme = config?.settings.theme ?? 'dark'

  function apply(c: Config, preferred?: string) { setConfig(c); setLoadError(''); setWorkspaceId(previous => preferred ?? ((c.workspaces ?? []).some(w => w.id === previous) ? previous : c.lastWorkspaceId ?? c.workspaces?.[0]?.id ?? '')) }
  async function load() { try { apply(await ConfigService.GetConfig()) } catch (e) { setLoadError(String(e)) } }
  useEffect(() => { void load(); return Events.On(AppCloseRequested, () => setModal('quit')) }, [])
  useEffect(() => { if (workspace.id) void RuntimeService.RefreshWorkspace(workspace.id).catch(e => setNotice(String(e))) }, [workspace.id])
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches))
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply)
  }, [theme])
  useEffect(() => {
    let cancelled = false; let timer: number
    async function poll() {
      try {
        const snapshot = await RuntimeService.Snapshot(command?.id ?? '')
        if (!cancelled) { setRuns(Object.fromEntries(Object.entries(snapshot.runs ?? {}).flatMap(([id, run]) => run ? [[id, { ...run, logs: run.logs ?? [] }]] : []))); setHistory(snapshot.history ?? []) }
      } catch (e) { if (!cancelled) setNotice(`Không lấy được trạng thái: ${String(e)}`) }
      if (!cancelled) timer = window.setTimeout(poll, document.hidden ? 2500 : 750)
    }
    if (config) void poll()
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [!!config, command?.id])
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 7000); return () => window.clearTimeout(timer) }, [notice])

  async function perform(key: string, operation: () => Promise<unknown>, message?: string) {
    if (pendingRef.current.has(key)) return
    pendingRef.current.add(key); setPending([...pendingRef.current])
    try { await operation(); if (message) setNotice(message) } catch (e) { setNotice(String(e)) } finally { pendingRef.current.delete(key); setPending([...pendingRef.current]) }
  }
  function selectProject(p: Project) { setProjectId(p.id); setCommandId(p.primaryCommandId || p.commands[0]?.id || '') }
  function selectCommand(id: string) { const owner = workspace.projects.find(p => p.commands.some(c => c.id === id)); if (owner) { setProjectId(owner.id); setCommandId(id) } }
  function runCommand(c: Command) { selectCommand(c.id); void perform(c.id, () => active(c.id) ? RuntimeService.Stop(c.id, false) : RuntimeService.Start(c.id)) }
  async function saveWorkspace(w: Workspace) { apply(await ConfigService.SaveWorkspace(fromWorkspace(w), config!.revision), w.id) }
  function selectWorkspace(w: Workspace) { void perform('config', async () => { apply(await ConfigService.SelectWorkspace(w.id, config!.revision), w.id); setProjectId(''); setCommandId(''); setProjectSearch('') }) }

  return <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
    <header className="flex min-h-12 items-center justify-between gap-3 border-b bg-card px-4 py-2 sm:px-6"><div className="flex items-center gap-2.5"><Terminal className="size-5 text-primary" /><span className="text-base font-semibold">dwrk</span><span className="ml-3 hidden text-xs text-muted-foreground sm:inline">Development workspaces</span></div><div className="flex items-center gap-2"><Badge variant="outline">LOCAL</Badge><Button variant="ghost" size="icon-sm" aria-label="Tải lại cấu hình" onClick={() => void load()}><RefreshCw /></Button><Button variant="ghost" size="icon-sm" aria-label="Đổi giao diện sáng tối" disabled={!config || pending.includes('config')} onClick={() => void perform('config', async () => apply(await ConfigService.SaveSettings({ ...config!.settings, theme: document.documentElement.classList.contains('dark') ? 'light' : 'dark' }, config!.revision)))}>{theme === 'light' ? <Moon /> : <Sun />}</Button></div></header>
    <div className="grid min-h-0 min-w-0 overflow-y-auto lg:grid-cols-[208px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="flex min-w-0 flex-col border-b bg-card/35 px-3 py-5 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0"><div className="mb-6 hidden items-center gap-3 px-3 lg:flex"><CodeXml className="size-7 text-primary" /><span className="text-xl font-semibold">DevSpace</span></div><div className="relative mb-5"><Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input aria-label="Tìm workspace" placeholder="Tìm workspace" value={workspaceSearch} onChange={e => setWorkspaceSearch(e.target.value)} className="pl-9 text-xs" /></div><p className="mb-3 px-3 text-[10px] tracking-widest text-muted-foreground">WORKSPACES</p>
        <nav aria-label="Workspaces" className="flex flex-wrap gap-1 lg:block lg:space-y-1">{workspaces.filter(w => w.name.toLowerCase().includes(workspaceSearch.toLowerCase())).map(w => <button key={w.id} disabled={pending.includes('config')} aria-pressed={workspace.id === w.id} className={cn('flex min-h-11 items-center gap-3 rounded border-l-[3px] border-transparent px-3 py-2 text-left text-sm lg:w-full', workspace.id === w.id ? 'border-primary bg-accent' : 'text-muted-foreground hover:bg-secondary')} onClick={() => selectWorkspace(w)}><Folder className="size-4 shrink-0" /><span className="min-w-0 flex-1 break-words">{w.name}</span><span className="text-[10px] text-success">{commandsIn(w).filter(c => active(c.id)).length || ''}</span></button>)}</nav>
        <div className="mt-5 flex flex-wrap gap-1 border-t pt-3 lg:mt-auto lg:block"><Button variant="ghost" className="justify-start text-xs lg:w-full" onClick={() => setModal('running')}><Activity />Đang hoạt động<span className="ml-auto text-success">{totalRunning}</span></Button><Button variant="ghost" className="justify-start text-xs lg:w-full" disabled={!config} onClick={() => setModal('workspace')}><Plus />Workspace mới</Button><Button variant="ghost" className="justify-start text-xs lg:w-full" disabled={!config} onClick={() => setModal('settings')}><Settings2 />Cài đặt</Button><Button variant="ghost" className="justify-start text-xs lg:w-full" disabled={!config} onClick={() => setModal('config')}><ArrowRightLeft />Import / Export config</Button></div>
      </aside>
      <main className="min-w-0 px-4 py-5 sm:px-6 lg:min-h-0 lg:overflow-y-auto xl:px-7">
        {loadError && <div role="alert" className="mb-5 rounded border border-destructive p-4 text-sm text-destructive">{loadError}<p className="mt-2">Cần chạy app qua Wails để kết nối Go. Nếu config lỗi, file gốc được giữ nguyên.</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" onClick={() => void load()}>Thử lại</Button><Button variant="outline" disabled={pending.includes('config')} onClick={() => restoreConfirm ? void perform('config', async () => { apply(await ConfigService.RestoreBackup()); setRestoreConfirm(false) }, 'Đã phục hồi backup; file lỗi được giữ trong bản .rejected.') : setRestoreConfirm(true)}>{restoreConfirm ? 'Xác nhận phục hồi backup' : 'Phục hồi config từ backup'}</Button></div></div>}
        {!config && !loadError && <p role="status">Đang tải cấu hình…</p>}
        {config && <><div className="mb-5 flex items-center gap-3 text-xs text-muted-foreground">Workspace<span>/</span><span className="text-foreground">{workspace.name}</span></div><div className="workspace-grid">
          <section className="workspace-content min-w-0" aria-label="Workspace đang chọn"><div className="mb-5 flex items-center gap-4"><FolderOpen className="size-8 shrink-0 text-primary" /><div className="min-w-0 flex-1"><h1 className="break-words text-[28px] font-semibold tracking-tight">{workspace.name}</h1><p className="mt-1 text-sm text-muted-foreground">Môi trường phát triển local</p></div>{workspace.id && <Button variant="ghost" size="icon" aria-label="Cấu hình workspace" onClick={() => setModal('workspace-settings')}><Settings2 /></Button>}</div>
            {workspace.id ? <><div className="mb-5 flex flex-wrap items-center gap-3 border-b pb-5"><Button disabled={!workspace.startCommandIds.length || pending.includes('batch')} onClick={() => void perform('batch', () => RuntimeService.Workspace(workspace.id, true))}><Play />Chạy workspace</Button><Button variant="outline" disabled={!workspaceCommands.some(c => c.kind === 'service' && active(c.id)) || pending.includes('batch')} onClick={() => void perform('batch', () => RuntimeService.Workspace(workspace.id, false))}><Square />Dừng tất cả</Button><span className="text-xs text-muted-foreground">{runningCount} service hoạt động</span></div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Projects <span className="text-xs font-normal text-muted-foreground">{workspace.projects.length}</span></h2><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setModal('import')}><ScanLine />Import</Button><Button variant="outline" size="sm" onClick={() => setModal('manual')}><Plus />Thêm project</Button></div></div>
              {!!workspace.projects.length && <Input aria-label="Tìm project" placeholder="Tìm project, công nghệ hoặc thư mục…" className="mb-3" value={projectSearch} onChange={e => setProjectSearch(e.target.value)} />}
              <ProjectList projects={visibleProjects} runs={runs} busyIds={pending} selectedId={project?.id} onSelect={selectProject} onConfigure={p => setModal({ project: p })} onToggle={p => { const c = p.commands.find(c => c.id === p.primaryCommandId); if (c) runCommand(c) }} onRestart={p => { const c = p.commands.find(c => c.id === p.primaryCommandId); if (c) void perform(c.id, () => RuntimeService.Restart(c.id)) }} onGit={p => setModal({ project: p, git: true })} onOpenURL={c => void perform('open', () => DesktopService.OpenCommandURL(c.id))} />
              {!visibleProjects.length && <div className="rounded-xl border border-dashed px-5 py-12 text-center"><FolderOpen className="mx-auto mb-3 size-8 text-muted-foreground" /><h3>{workspace.projects.length ? 'Không tìm thấy project' : 'Workspace chưa có project'}</h3><p className="mt-2 text-xs text-muted-foreground">Quét thư mục hoặc thêm project thủ công. Cấu hình command trước khi chạy.</p></div>}
              <div className="mt-5 flex flex-wrap items-center gap-3 text-xs"><Button variant="ghost" size="sm" onClick={() => void perform('open', () => DesktopService.OpenWorkspace(workspace.id, 'docs'))}><BookOpen />Docs</Button><Button variant="ghost" size="sm" onClick={() => void perform('open', () => DesktopService.OpenWorkspace(workspace.id, 'terminal'))}><Terminal />Terminal</Button><Button variant="ghost" size="sm" onClick={() => void perform('open', () => DesktopService.OpenWorkspace(workspace.id, 'folder'))}><FolderOpen />Thư mục</Button>{workspace.resources.map(r => <Button key={r.id} variant="outline" size="sm" onClick={() => void perform('open', () => DesktopService.OpenResource(r.id))}>{r.name}</Button>)}</div><p className="mt-3 break-all font-mono text-[10px] text-muted-foreground">{workspace.rootPath}</p>
            </> : <div className="rounded-xl border border-dashed p-8 text-center"><p className="mb-4 text-sm text-muted-foreground">Tạo workspace đầu tiên hoặc import một file config.</p><Button onClick={() => setModal('workspace')}><Plus />Tạo workspace</Button></div>}
          </section>
          {project ? <ProjectDetails key={project.id} project={project} command={command} runs={runs} busyIds={pending} onConfigure={() => setModal({ project })} onSelectCommand={selectCommand} onRun={runCommand} onForceStop={c => void perform(c.id, () => RuntimeService.Stop(c.id, true))} onOpen={kind => void perform('open', () => DesktopService.OpenProject(project.id, kind))} notify={setNotice} /> : <aside className="project-detail rounded-xl border bg-card p-6 text-sm text-muted-foreground">Chọn project để xem cấu hình và command.</aside>}
          <LogPanel timeZone={config.settings.timeZone} key={`${workspace.id}-${command?.id}-${runs[command?.id ?? '']?.id}`} workspace={workspace} command={command} run={runs[command?.id ?? '']} history={history.filter(h => h.workspaceId === workspace.id)} onSelect={selectCommand} />
        </div></>}
      </main>
    </div>
    <StatusBar projectCount={workspace.projects.length} runningCount={totalRunning} timeZone={config?.settings.timeZone} />
    {notice && <div role="status" className="fixed right-4 bottom-14 left-4 z-50 flex items-start gap-3 rounded-lg border bg-card p-4 text-xs leading-5 shadow-lg sm:left-auto sm:max-w-md"><Activity className="size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 break-words">{notice}</span><button aria-label="Đóng thông báo" onClick={() => setNotice('')}><X className="size-4" /></button></div>}
    {modal && typeof modal === 'object' && (modal.git ? <GitDialog project={modal.project} onClose={() => setModal(null)} /> : <ProjectSettingsDialog project={modal.project} runningCommandIds={modal.project.commands.filter(c => active(c.id)).map(c => c.id)} onClose={() => setModal(null)} onSave={async p => { const previous = workspace.projects.find(item => item.id === p.id)!; const next = { ...workspace, projects: workspace.projects.map(item => item.id === p.id ? p : item), startCommandIds: workspace.startCommandIds.filter(id => p.commands.some(c => c.id === id && c.kind === 'service') || !previous.commands.some(c => c.id === id)) }; await saveWorkspace(next); setModal(null); setNotice('Đã lưu cấu hình project.') }} />)}
    {(modal === 'import' || modal === 'manual') && <ImportProjectsDialog workspace={workspace} manual={modal === 'manual'} onClose={() => setModal(null)} onImport={async projects => { apply(await ConfigService.ImportProjects(workspace.id, projects.map(fromProject), config!.revision)); if (projects[0]) selectProject(projects[0]); setModal(null) }} />}
    {modal === 'workspace' && <NewWorkspaceDialog onClose={() => setModal(null)} onCreate={async w => { await saveWorkspace(w); setProjectId(''); setCommandId(''); setModal('import') }} />}
    {modal === 'workspace-settings' && <WorkspaceSettingsDialog workspace={workspace} onClose={() => setModal(null)} onSave={async w => { await saveWorkspace(w); setModal(null) }} onRemove={async () => { apply(await ConfigService.RemoveWorkspace(workspace.id, config!.revision)); setModal(null) }} />}
    {modal === 'settings' && config && <SettingsDialog settings={config.settings} onClose={() => setModal(null)} onSave={async settings => { apply(await ConfigService.SaveSettings(settings, config.revision)); setModal(null) }} />}
    {modal === 'config' && <ConfigDialog workspaces={workspaces} workspaceId={workspace.id} notify={setNotice} onClose={() => setModal(null)} onImport={async text => { const c = await ConfigService.ImportConfig(text, config!.revision); apply(c, c.workspaces?.[c.workspaces.length - 1]?.id); setWorkspaceSearch(''); setProjectSearch(''); setModal(null) }} />}
    {(modal === 'running' || modal === 'quit') && <Dialog open onOpenChange={open => { if (!open) setModal(null) }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{modal === 'quit' ? 'Dừng tiến trình trước khi thoát' : 'Command đang hoạt động'}</DialogTitle><DialogDescription>{modal === 'quit' ? 'Dừng các tiến trình do app tạo rồi thoát, hoặc hủy để tiếp tục. Container Compose không bị dừng ngầm.' : 'Chuyển workspace giữ nguyên các command đang chạy.'}</DialogDescription></DialogHeader><div className="max-h-80 space-y-2 overflow-y-auto">{Object.values(runs).filter(r => isActive(r)).map(r => <div key={r.id} className="flex items-center justify-between gap-2 rounded border p-3"><div className="min-w-0"><p className="break-words text-sm">{workspaces.flatMap(w => w.projects).find(p => p.id === r.projectId)?.name} / {workspaces.flatMap(w => commandsIn(w)).find(c => c.id === r.commandId)?.name}</p><p className="text-xs text-muted-foreground">{statusLabel(r)}</p></div><Button variant="outline" size="sm" disabled={pending.includes(r.commandId)} onClick={() => void perform(r.commandId, () => RuntimeService.Stop(r.commandId, false))}>Dừng</Button>{r.status === 'unknown' && <Button variant="destructive" size="sm" onClick={() => void perform(r.commandId, () => RuntimeService.Stop(r.commandId, true))}>Buộc dừng</Button>}</div>)}{!totalRunning && <p className="text-sm text-muted-foreground">Không có command đang hoạt động.</p>}</div>{modal === 'quit' && <DialogFooter><Button variant="outline" onClick={() => setModal(null)}>Hủy thoát</Button><Button disabled={pending.includes('quit')} onClick={() => void perform('quit', async () => { await RuntimeService.StopOwned(); await DesktopService.Quit() })}>Dừng tiến trình & thoát</Button></DialogFooter>}</DialogContent></Dialog>}
  </div>
}