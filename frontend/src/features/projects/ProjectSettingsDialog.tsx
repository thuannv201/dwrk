import { useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { validateProject, type Command, type Project } from '@/lib/model'

export function ProjectSettingsDialog({ project, runningCommandIds, onClose, onSave }: { project: Project; runningCommandIds: string[]; onClose: () => void; onSave: (project: Project) => Promise<void> }) {
  const [draft, setDraft] = useState(() => structuredClone(project))
  const [commandId, setCommandId] = useState(project.primaryCommandId || project.commands[0]?.id || '')
  const [environment, setEnvironment] = useState<Record<string, string>>(() => Object.fromEntries(project.commands.map(c => [c.id, Object.entries(c.environment ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')])))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const command = draft.commands.find(c => c.id === commandId)
  const active = runningCommandIds.includes(commandId)
  function update(values: Partial<Command>) { setDraft({ ...draft, commands: draft.commands.map(c => c.id === commandId ? { ...c, ...values } : c) }) }
  function add() { const id = crypto.randomUUID(); setDraft({ ...draft, primaryCommandId: draft.primaryCommandId || id, commands: [...draft.commands, { id, name: `Lệnh ${draft.commands.length + 1}`, kind: 'task', run: '', workingDirectory: '.', environment: {} }] }); setCommandId(id) }
  function remove() { const commands = draft.commands.filter(c => c.id !== commandId); setDraft({ ...draft, commands, primaryCommandId: draft.primaryCommandId === commandId ? commands[0]?.id ?? '' : draft.primaryCommandId }); setCommandId(commands[0]?.id ?? '') }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError('')
    try {
      const next = { ...draft, commands: draft.commands.map(c => {
        const values: Record<string, string> = {}
        for (const line of (environment[c.id] ?? '').split('\n').filter(line => line.trim())) { const index = line.indexOf('='); if (index < 1) throw new Error('Mỗi biến môi trường cần dạng KEY=VALUE.'); const key = line.slice(0, index).trim(); if (key in values) throw new Error('Biến môi trường bị trùng.'); values[key] = line.slice(index + 1) }
        return { ...c, environment: values }
      }) }
      const message = validateProject(next); if (message) throw new Error(message)
      setBusy(true); await onSave(next)
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Cấu hình project</DialogTitle><DialogDescription>Cấu hình được lưu trên máy. Lưu không tự chạy hoặc khởi động lại command.</DialogDescription></DialogHeader>
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs">Tên project<Input className="mt-2" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label className="text-xs">Thư mục project<Input className="mt-2 font-mono text-xs" value={draft.directory} onChange={e => setDraft({ ...draft, directory: e.target.value })} /></label></div>
      <div className="flex flex-wrap gap-2"><select aria-label="Chọn lệnh" className="min-w-0 flex-1 rounded border bg-background px-2" value={commandId} onChange={e => setCommandId(e.target.value)}>{!command && <option value="">Chưa có command</option>}{draft.commands.map(c => <option key={c.id} value={c.id}>{c.name || 'Chưa đặt tên'}</option>)}</select><Button type="button" variant="outline" onClick={add}><Plus />Thêm lệnh</Button><Button type="button" variant="ghost" size="icon" disabled={!command || active} aria-label="Xóa lệnh đang chọn" onClick={remove}><Trash2 /></Button></div>
      {command && <>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs">Tên lệnh<Input className="mt-2" value={command.name} onChange={e => update({ name: e.target.value })} /></label><label className="text-xs">Loại lệnh<select disabled={active} className="mt-2 block h-9 w-full rounded border bg-background px-2" value={command.kind} onChange={e => update({ kind: e.target.value as Command['kind'], driver: e.target.value === 'service' ? 'process' : undefined, compose: undefined, healthCheck: undefined, port: undefined, ports: [], stop: undefined, url: undefined })}><option value="service">Service — chạy liên tục</option><option value="task">Task — build / test</option></select></label></div>
        {command.kind === 'service' && <label className="block text-xs">Cách chạy<select disabled={active} className="mt-2 block h-9 w-full rounded border bg-background px-2" value={command.driver ?? 'process'} onChange={e => update({ driver: e.target.value, ...(e.target.value === 'docker-compose' ? { run: '', stop: undefined, healthCheck: undefined, compose: { projectName: 'dwrk-local', files: ['compose.yaml'], services: [] } } : { compose: undefined }) })}><option value="process">Process</option><option value="docker-compose">Docker Compose</option></select></label>}
        <label className="block text-xs">Thư mục chạy tương đối trong project<Input className="mt-2 font-mono text-xs" value={command.workingDirectory} onChange={e => update({ workingDirectory: e.target.value })} placeholder="." /></label>
        {command.driver === 'docker-compose' && command.compose ? <div className="space-y-3 rounded border p-3"><label className="block text-xs">Compose project name<Input className="mt-1" value={command.compose.projectName} onChange={e => update({ compose: { ...command.compose!, projectName: e.target.value } })} /></label><label className="block text-xs">Compose files · mỗi dòng một file tương đối<Textarea className="mt-1 font-mono text-xs" value={(command.compose.files ?? []).join('\n')} onChange={e => update({ compose: { ...command.compose!, files: e.target.value.split('\n') } })} /></label><label className="block text-xs">Services · cách nhau bằng dấu phẩy, trống là toàn bộ<Input className="mt-1" value={(command.compose.services ?? []).join(',')} onChange={e => update({ compose: { ...command.compose!, services: e.target.value ? e.target.value.split(',') : [] } })} /></label></div> : <>
          <label className="block text-xs">Lệnh chạy<Textarea className="mt-2 font-mono text-xs" rows={3} value={command.run} onChange={e => update({ run: e.target.value })} /></label>
          {command.kind === 'service' && <label className="block text-xs">Lệnh dừng · trống để dừng cây tiến trình do app tạo<Textarea className="mt-2 font-mono text-xs" value={command.stop ?? ''} onChange={e => update({ stop: e.target.value || undefined })} /></label>}
        </>}
        {command.kind === 'service' && <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs">Cổng<Input className="mt-2" type="number" min={1} max={65535} value={command.port ?? ''} onChange={e => update({ port: e.target.value ? Number(e.target.value) : undefined })} /></label><label className="text-xs">URL mở trên trình duyệt<Input className="mt-2" value={command.url ?? ''} onChange={e => update({ url: e.target.value || undefined })} /></label></div>}
        <label className="block text-xs">Biến môi trường · mỗi dòng KEY=VALUE<Textarea className="mt-2 font-mono text-xs" value={environment[command.id] ?? ''} onChange={e => setEnvironment({ ...environment, [command.id]: e.target.value })} /></label><p className="text-xs text-muted-foreground">Không lưu mật khẩu/token ở đây. Command kế thừa môi trường của app.</p>
        {command.kind === 'service' && command.driver !== 'docker-compose' && <div className="space-y-3 rounded border p-3"><label className="flex items-center justify-between text-sm">HTTP health check<Switch checked={!!command.healthCheck} onCheckedChange={enabled => update({ healthCheck: enabled ? { url: `http://localhost:${command.port ?? 8080}/health`, intervalMs: 10000, timeoutMs: 2000, expectedStatus: 200 } : undefined })} /></label>{command.healthCheck && <><Input aria-label="Health URL" value={command.healthCheck.url} onChange={e => update({ healthCheck: { ...command.healthCheck!, url: e.target.value } })} /><div className="grid gap-3 sm:grid-cols-3">{(['intervalMs', 'timeoutMs', 'expectedStatus'] as const).map(key => <label key={key} className="text-xs">{key}<Input type="number" className="mt-1" value={command.healthCheck![key]} onChange={e => update({ healthCheck: { ...command.healthCheck!, [key]: Number(e.target.value) } })} /></label>)}</div></>}</div>}
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.primaryCommandId === command.id} onChange={() => setDraft({ ...draft, primaryCommandId: command.id })} />Lệnh mặc định</label>
        {active && <p className="text-xs text-muted-foreground">Command đang hoạt động. Cấu hình mới áp dụng lần chạy sau; Stop dùng cấu hình của lần chạy hiện tại.</p>}
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Hủy</Button><Button disabled={busy}><Save />Lưu cấu hình</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
}
