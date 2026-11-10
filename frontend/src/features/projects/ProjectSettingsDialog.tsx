import { useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { validateProject, type Command, type Project } from '@/mock/model'

export function ProjectSettingsDialog({ project, runningCommandIds, onClose, onSave }: { project: Project; runningCommandIds: string[]; onClose: () => void; onSave: (project: Project) => void }) {
  const [draft, setDraft] = useState(() => structuredClone(project))
  const [commandId, setCommandId] = useState(project.primaryCommandId)
  const [error, setError] = useState('')
  const command = draft.commands.find(item => item.id === commandId)!
  const commandRunning = runningCommandIds.includes(commandId)
  function updateCommand(values: Partial<Command>) { setDraft(previous => ({ ...previous, commands: previous.commands.map(item => item.id === commandId ? { ...item, ...values } : item) })) }
  function addCommand() {
    const id = crypto.randomUUID()
    setDraft(previous => ({ ...previous, commands: [...previous.commands, { id, name: `Lệnh ${previous.commands.length + 1}`, kind: 'task', run: '' }] }))
    setCommandId(id)
  }
  function removeCommand() {
    const remaining = draft.commands.filter(item => item.id !== commandId)
    setDraft({ ...draft, commands: remaining, primaryCommandId: draft.primaryCommandId === commandId ? remaining[0].id : draft.primaryCommandId })
    setCommandId(remaining[0].id)
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle>Cấu hình project</DialogTitle><DialogDescription>Sửa lệnh và health check cho {project.name}. Thay đổi chỉ lưu trong phiên mock, không chạy lệnh thật.</DialogDescription></DialogHeader>
    <form onSubmit={event => { event.preventDefault(); const message = validateProject(draft); if (message) { setError(message); return }; onSave(draft) }} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-xs font-medium">Tên project<Input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className="mt-2" /></label><label className="space-y-2 text-xs font-medium">Thư mục làm việc<Input value={draft.directory} onChange={event => setDraft({ ...draft, directory: event.target.value })} className="mt-2 font-mono text-xs" /></label></div>
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-secondary/30 p-3"><label className="min-w-0 flex-1 text-xs font-medium">Chọn lệnh<select value={commandId} onChange={event => setCommandId(event.target.value)} className="mt-2 block h-9 w-full rounded-md border bg-background px-2 text-sm">{draft.commands.map(item => <option key={item.id} value={item.id}>{item.name || 'Chưa đặt tên'}</option>)}</select></label><Button type="button" variant="outline" onClick={addCommand}><Plus />Thêm lệnh</Button><Button type="button" variant="ghost" size="icon" aria-label="Xóa lệnh đang chọn" disabled={draft.commands.length === 1 || commandRunning} onClick={removeCommand}><Trash2 /></Button></div>
      <Tabs defaultValue="command" className="gap-4"><TabsList><TabsTrigger value="command">Lệnh thực thi</TabsTrigger><TabsTrigger value="health">Health check</TabsTrigger></TabsList>
        {commandRunning && <p className="text-xs text-muted-foreground">Dừng service trước khi xóa lệnh hoặc đổi sang loại task.</p>}
        <TabsContent value="command" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-medium">Tên lệnh<Input value={command.name} onChange={event => updateCommand({ name: event.target.value })} className="mt-2" /></label><label className="text-xs font-medium">Loại lệnh<select disabled={commandRunning} value={command.kind} onChange={event => updateCommand({ kind: event.target.value as Command['kind'], ...(event.target.value === 'task' ? { healthCheck: undefined, port: undefined, stop: undefined } : {}) })} className="mt-2 block h-9 w-full rounded-md border bg-background px-2"><option value="service">Service — chạy liên tục</option><option value="task">Task — build / test</option></select></label></div>
          <label className="block text-xs font-medium">Lệnh chạy<Textarea value={command.run} onChange={event => updateCommand({ run: event.target.value })} rows={3} className="mt-2 font-mono text-xs" placeholder="npm run dev hoặc .\mvnw.cmd spring-boot:run" /></label>
          {command.kind === 'service' && <div className="grid items-start gap-4 sm:grid-cols-[1fr_120px]"><label className="text-xs font-medium">Lệnh dừng (tùy chọn)<Textarea value={command.stop ?? ''} onChange={event => updateCommand({ stop: event.target.value })} rows={2} className="mt-2 font-mono text-xs" placeholder="Trống: dừng cây tiến trình do app tạo" /></label><label className="text-xs font-medium">Cổng<Input type="number" min={1} max={65535} value={command.port ?? ''} onChange={event => updateCommand({ port: event.target.value === '' ? undefined : Number(event.target.value) })} className="mt-2" /></label></div>}
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.primaryCommandId === commandId} onChange={() => setDraft({ ...draft, primaryCommandId: commandId })} />Dùng làm lệnh mặc định của project</label>
          <p className="text-xs leading-5 text-muted-foreground">Profile Spring có thể thêm vào lệnh bằng tham số phù hợp, ví dụ <code>-Dspring-boot.run.profiles=local</code>. Lưu cấu hình không tự chạy lại service.</p>
        </TabsContent>
        <TabsContent value="health" className="space-y-4">
          {command.kind === 'task' ? <p className="rounded-md border p-4 text-sm text-muted-foreground">Health check dành cho service. Task build/test được kiểm tra bằng kết quả và exit code.</p> : <>
            <label className="flex items-center justify-between rounded-lg border p-3 text-sm">Bật HTTP health check<Switch checked={!!command.healthCheck} onCheckedChange={enabled => updateCommand({ healthCheck: enabled ? { url: `http://localhost:${command.port ?? 8080}/actuator/health`, intervalMs: 10000, timeoutMs: 2000, expectedStatus: 200 } : undefined })} aria-label="Bật health check" /></label>
            {command.healthCheck && <><label className="block text-xs font-medium">URL · HTTP GET<Input value={command.healthCheck.url} onChange={event => updateCommand({ healthCheck: { ...command.healthCheck!, url: event.target.value } })} className="mt-2 font-mono text-xs" placeholder="http://localhost:8080/actuator/health" /></label><div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><label className="text-xs font-medium">Chu kỳ (ms)<Input type="number" min={1000} value={command.healthCheck.intervalMs} onChange={event => updateCommand({ healthCheck: { ...command.healthCheck!, intervalMs: Number(event.target.value) } })} className="mt-2" /></label><label className="text-xs font-medium">Timeout (ms)<Input type="number" min={100} value={command.healthCheck.timeoutMs} onChange={event => updateCommand({ healthCheck: { ...command.healthCheck!, timeoutMs: Number(event.target.value) } })} className="mt-2" /></label><label className="text-xs font-medium">HTTP status<Input type="number" min={200} max={299} value={command.healthCheck.expectedStatus} onChange={event => updateCommand({ healthCheck: { ...command.healthCheck!, expectedStatus: Number(event.target.value) } })} className="mt-2" /></label></div></>}
          </>}
        </TabsContent>
      </Tabs>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Hủy</Button><Button type="submit"><Save />Lưu cấu hình</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
}
