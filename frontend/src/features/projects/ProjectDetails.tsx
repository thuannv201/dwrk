import { Check, Code2, Copy, Folder, HeartPulse, Pencil, Play, Settings2, Square, Terminal } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TechnologyIcon } from '@/components/icons/TechnologyIcon'
import type { Command, Project, Run } from '@/mock/model'

export function ProjectDetails({ project, command, runs, onConfigure, onSelectCommand, onRun, notify }: {
  project: Project; command: Command; runs: Record<string, Run>
  onConfigure: () => void; onSelectCommand: (id: string) => void; onRun: (command: Command) => void; notify: (message: string) => void
}) {
  const [copied, setCopied] = useState(false)
  async function copyCommand() {
    try { await navigator.clipboard.writeText(command.run); setCopied(true) } catch { notify('Không thể truy cập clipboard. Bạn có thể chọn và sao chép lệnh.') }
  }
  return <aside className="project-detail min-w-0 rounded-xl border bg-card p-5" aria-label={`Chi tiết ${project.name}`}>
    <div className="mb-5 flex items-center gap-3"><TechnologyIcon technology={project.technology} className="size-9" /><div className="min-w-0 flex-1"><h2 className="break-words text-xl font-semibold tracking-tight">{project.name}</h2><p className="mt-0.5 text-xs text-muted-foreground">{project.technologyLabel}</p></div><Button variant="ghost" size="icon-sm" aria-label="Cấu hình project đang chọn" onClick={onConfigure}><Settings2 /></Button></div>
    <Tabs defaultValue="overview" className="gap-4">
      <TabsList variant="line" className="w-full justify-start border-b pb-2"><TabsTrigger value="overview">Tổng quan</TabsTrigger><TabsTrigger value="commands">Lệnh chạy <span className="ml-1 text-[10px] text-muted-foreground">{project.commands.length}</span></TabsTrigger></TabsList>
      <TabsContent value="overview" className="space-y-5 pt-2">
        <div><h3 className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><Terminal className="size-4" />{command.name}</h3><div className="flex items-start gap-1 rounded-md border bg-background p-2.5"><code className="min-w-0 flex-1 break-all font-mono text-xs leading-6">{command.run}</code><Button variant="ghost" size="icon-xs" aria-label="Sao chép lệnh" onClick={copyCommand}>{copied ? <Check /> : <Copy />}</Button></div></div>
        <div><h3 className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><Folder className="size-4" />Thư mục làm việc</h3><p className="break-all font-mono text-xs leading-5">{project.directory}</p></div>
        <div><div className="mb-2 flex items-center justify-between"><h3 className="flex items-center gap-2 text-xs text-muted-foreground"><HeartPulse className="size-4" />Health check</h3><Button variant="ghost" size="icon-xs" aria-label="Sửa health check" onClick={onConfigure}><Pencil /></Button></div>
          {command.healthCheck ? <><button className="break-all text-left text-xs leading-5 text-primary hover:underline" onClick={() => notify(`Mock: kiểm tra ${command.healthCheck!.url}`)}>{command.healthCheck.url}</button><p className="mt-2 text-[11px] text-muted-foreground">Mỗi {command.healthCheck.intervalMs / 1000}s · timeout {command.healthCheck.timeoutMs}ms</p><p className="mt-1 text-[11px] text-muted-foreground">Chưa thực hiện kiểm tra thật.</p></> : <p className="text-xs text-muted-foreground">Chưa cấu hình kiểm tra sẵn sàng.</p>}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t pt-5"><Button variant="outline" onClick={() => notify(`Mock: mở IDE tại ${project.directory}`)}><Code2 />Mở IDE</Button><Button variant="outline" onClick={() => notify(`Mock: mở terminal tại ${project.directory}`)}><Terminal />Terminal</Button></div>
      </TabsContent>
      <TabsContent value="commands" className="space-y-3 pt-2">{project.commands.map(item => <div key={item.id} className="rounded-md border bg-background/50 p-3"><div className="flex items-center gap-2"><button className="min-w-0 flex-1 break-words text-left text-sm font-medium hover:text-primary" onClick={() => onSelectCommand(item.id)}>{item.name}</button><span className="text-[10px] uppercase text-muted-foreground">{item.kind}</span><Button variant="ghost" size="icon-sm" aria-label={`Thực hiện ${item.name}`} onClick={() => onRun(item)}>{runs[item.id]?.status === 'running' ? <Square /> : <Play />}</Button></div><code className="mt-2 block break-all text-[11px] leading-5 text-muted-foreground">{item.run}</code></div>)}<Button variant="outline" className="w-full" onClick={onConfigure}><Settings2 />Thêm / sửa lệnh</Button></TabsContent>
    </Tabs>
  </aside>
}
