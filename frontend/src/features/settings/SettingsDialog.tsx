import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Settings } from '../../../bindings/changeme/internal/config/models'

export function SettingsDialog({ settings, onClose, onSave }: { settings: Settings; onClose: () => void; onSave: (settings: Settings) => Promise<void> }) {
  const [draft, setDraft] = useState(() => structuredClone(settings))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Cài đặt ứng dụng</DialogTitle><DialogDescription>Công cụ dùng executable và từng đối số riêng. Để trống executable để dùng mặc định.</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={async event => { event.preventDefault(); setBusy(true); try { await onSave(draft) } catch (error) { setError(String(error)) } finally { setBusy(false) } }}>
      <label className="block text-sm">Giao diện<select className="mt-2 block h-10 w-full rounded border bg-background px-3" value={draft.theme} onChange={e => setDraft({ ...draft, theme: e.target.value })}><option value="dark">Tối</option><option value="light">Sáng</option><option value="system">Theo hệ thống</option></select></label>
      <label className="block text-sm">Múi giờ IANA<Input className="mt-2" value={draft.timeZone} onChange={e => setDraft({ ...draft, timeZone: e.target.value })} /></label>
      {(['editor', 'terminal', 'shell'] as const).map(key => <fieldset key={key} className="space-y-2 rounded-md border p-3"><legend className="px-1 text-sm">{key === 'editor' ? 'IDE / Editor' : key === 'terminal' ? 'Terminal' : 'Shell chạy command'}</legend><label className="block text-xs">Executable<Input className="mt-1 font-mono text-xs" value={draft[key].executable} onChange={e => setDraft({ ...draft, [key]: { ...draft[key], executable: e.target.value } })} placeholder={key === 'shell' ? 'Mặc định PowerShell trên Windows' : 'Đường dẫn executable'} /></label><label className="block text-xs">Đối số · mỗi dòng một đối số<Textarea className="mt-1 font-mono text-xs" rows={2} value={(draft[key].args ?? []).join('\n')} onChange={e => setDraft({ ...draft, [key]: { ...draft[key], args: e.target.value ? e.target.value.split('\n') : [] } })} /></label></fieldset>)}
      <p className="text-xs leading-5 text-muted-foreground">Editor/terminal thay {'{directory}'} bằng đường dẫn project trong từng đối số. Shell nhận chuỗi command ở đối số cuối. Command có thể thực thi mã trên máy; chỉ chạy nội dung bạn đã kiểm tra.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Hủy</Button><Button disabled={busy}>Lưu cài đặt</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
}
