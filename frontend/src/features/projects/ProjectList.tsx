import { ExternalLink, Folder, GitBranch, Play, RotateCw, Settings2, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TechnologyIcon } from '@/components/icons/TechnologyIcon'
import { cn } from '@/lib/utils'
import { isActive, isBusy, statusLabel, type Command, type Project, type Run } from '@/lib/model'

export function ProjectList({ projects, runs, busyIds, selectedId, onSelect, onConfigure, onToggle, onRestart, onGit, onOpenURL }: {
  projects: Project[]; runs: Record<string, Run>; busyIds: string[]; selectedId?: string
  onSelect: (p: Project) => void; onConfigure: (p: Project) => void; onToggle: (p: Project) => void; onRestart: (p: Project) => void; onGit: (p: Project) => void; onOpenURL: (c: Command) => void
}) {
  return <div className="space-y-2.5">{projects.map(p => {
    const command = p.commands.find(c => c.id === p.primaryCommandId)
    const run = command ? runs[command.id] : undefined
    const running = isActive(run)
    const busy = !!command && (isBusy(run) || busyIds.includes(command.id) || busyIds.includes('batch'))
    return <article key={p.id} className={cn('project-row rounded-lg border bg-card px-3.5 py-3.5', selectedId === p.id && 'border-primary bg-accent/35 ring-1 ring-primary/15')}>
      <button onClick={() => onSelect(p)} aria-pressed={selectedId === p.id} className="flex min-w-0 items-center gap-3 rounded text-left"><TechnologyIcon technology={p.technology} /><span className="min-w-0"><span className="block break-words text-[15px] font-semibold">{p.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{p.technologyLabel}</span></span></button>
      <div className="project-location space-y-1.5 text-xs text-muted-foreground"><div className="flex items-start gap-2"><Folder className="mt-0.5 size-3.5 shrink-0" /><span className="break-all">{p.directory}</span></div><button className="flex items-center gap-2 hover:text-foreground" onClick={() => onGit(p)}><GitBranch className="size-3.5" />Xem Git</button></div>
      <div className="project-controls flex flex-col items-end gap-2 max-[440px]:flex-row max-[440px]:justify-between"><div className="flex flex-wrap justify-end gap-2"><span className={cn('rounded border px-2 py-1 text-[11px]', running ? 'border-success/20 bg-success/10 text-success' : 'text-muted-foreground')}>{command ? statusLabel(run) : 'Chưa cấu hình command'}</span>{command?.port && <span className="rounded border px-2 py-1 font-mono text-[11px]">:{command.port}</span>}</div><div className="flex items-center gap-0.5"><Button variant="ghost" size="icon-sm" aria-label={`Cấu hình ${p.name}`} onClick={() => onConfigure(p)}><Settings2 /></Button>{command && (command.port || command.url) && <Button variant="ghost" size="icon-sm" aria-label={`Mở ${p.name} trên trình duyệt`} onClick={() => onOpenURL(command)}><ExternalLink /></Button>}<Button disabled={!command || busy} variant="ghost" size="icon-sm" aria-label={`Chạy lại ${p.name}`} onClick={() => onRestart(p)}><RotateCw /></Button><Button disabled={!command || busy} variant="ghost" size="icon-sm" aria-label={`${running ? 'Dừng' : 'Chạy'} ${p.name}`} onClick={() => onToggle(p)} className="text-primary">{running ? <Square /> : <Play />}</Button></div></div>
    </article>
  })}</div>
}
