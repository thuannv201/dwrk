import { ExternalLink, Folder, GitBranch, Play, RotateCw, Settings2, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TechnologyIcon } from '@/components/icons/TechnologyIcon'
import { cn } from '@/lib/utils'
import type { MockState, Project } from '@/mock/model'

export function ProjectList({ projects, runs, selectedId, onSelect, onConfigure, onToggle, onRestart, notify }: {
  projects: Project[]; runs: MockState['runs']; selectedId?: string
  onSelect: (project: Project) => void; onConfigure: (project: Project) => void
  onToggle: (project: Project) => void; onRestart: (project: Project) => void; notify: (message: string) => void
}) {
  return <div className="space-y-2.5">{projects.map(project => {
    const command = project.commands.find(c => c.id === project.primaryCommandId)!
    const running = runs[command.id]?.status === 'running'
    return <article key={project.id} className={cn('project-row rounded-lg border bg-card px-3.5 py-3.5 transition-colors', selectedId === project.id && 'border-primary bg-accent/35 ring-1 ring-primary/15')}>
      <button onClick={() => onSelect(project)} aria-pressed={selectedId === project.id} className="flex min-w-0 items-center gap-3 rounded text-left outline-offset-4">
        <TechnologyIcon technology={project.technology} />
        <span className="min-w-0"><span className="block break-words text-[15px] font-semibold tracking-tight">{project.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{project.technologyLabel}</span></span>
      </button>
      <div className="project-location space-y-1.5 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-start gap-2"><Folder className="mt-0.5 size-3.5 shrink-0" /><span className="min-w-0 break-all">{project.directory}</span></div>
        <button className="flex items-center gap-2 rounded font-mono hover:text-foreground" onClick={() => notify(`Mock: mở Git terminal tại ${project.directory}`)} aria-label={`Git ${project.name}`}><GitBranch className="size-3.5" />{project.branch}</button>
      </div>
      <div className="project-controls flex flex-col items-end gap-2 max-[440px]:flex-row max-[440px]:items-center max-[440px]:justify-between min-[1650px]:flex-row min-[1650px]:items-center min-[1650px]:gap-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]', running ? 'border-success/20 bg-success/10 text-success' : 'border-border bg-secondary text-muted-foreground')}><span className={cn('size-1.5 rounded-full', running ? 'bg-success' : 'bg-muted-foreground')} />{running ? 'Đang chạy' : 'Đã dừng'}</span>
          {command.port && <span className="rounded-md border bg-secondary/70 px-2 py-1 font-mono text-[11px]">:{command.port}</span>}
        </div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" aria-label={`Cấu hình ${project.name}`} onClick={() => onConfigure(project)}><Settings2 /></Button>
          {command.port && <Button variant="ghost" size="icon-sm" aria-label={`Mở ${project.name} trên trình duyệt`} onClick={() => notify(`Mock: mở http://localhost:${command.port}`)}><ExternalLink /></Button>}
          <Button variant="ghost" size="icon-sm" aria-label={`Chạy lại ${project.name}`} onClick={() => onRestart(project)}><RotateCw /></Button>
          <Button variant="ghost" size="icon-sm" aria-label={`${running ? 'Dừng' : 'Chạy'} ${project.name}`} onClick={() => onToggle(project)} className={cn(!running && 'text-primary')}>{running ? <Square /> : <Play />}</Button>
        </div>
      </div>
    </article>
  })}</div>
}
