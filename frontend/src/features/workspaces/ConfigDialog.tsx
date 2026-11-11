import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toWorkspace, type Workspace } from '@/lib/model'
import { ConfigService, DesktopService } from '../../../bindings/changeme'

export function ConfigDialog({ workspaces, workspaceId, onClose, onImport, notify }: { workspaces: Workspace[]; workspaceId: string; onClose: () => void; onImport: (text: string) => Promise<void>; notify: (message: string) => void }) {
  const [selected, setSelected] = useState(workspaceId ? [workspaceId] : [])
  const [preview, setPreview] = useState<Workspace[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const readVersion = useRef(0)
  async function download() { setBusy(true); setError(''); try { if (await DesktopService.ExportConfig(selected)) notify('Đã xuất config JSON.') } catch (e) { setError(String(e)) } finally { setBusy(false) } }
  async function readFile(file?: File) {
    const version = ++readVersion.current; setPreview([]); setText(''); setError(''); setReading(!!file); if (!file) return
    try { if (file.size > 5 * 1024 * 1024) throw new Error('Chọn file tối đa 5 MiB.'); const text = await file.text(); const workspaces = await ConfigService.PreviewConfig(text); if (version === readVersion.current) { setPreview((workspaces ?? []).map(toWorkspace)); setText(text) } } catch (e) { if (version === readVersion.current) setError(String(e)) } finally { if (version === readVersion.current) setReading(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Import / Export config</DialogTitle><DialogDescription>Chia sẻ workspace bằng file JSON. Không xuất log, trạng thái chạy hoặc thiết lập công cụ trên máy.</DialogDescription></DialogHeader>
    <Tabs defaultValue="export" className="gap-4"><TabsList><TabsTrigger value="export">Export</TabsTrigger><TabsTrigger value="import">Import</TabsTrigger></TabsList>
      <TabsContent value="export" className="space-y-4"><div className="max-h-64 space-y-2 overflow-y-auto">{workspaces.map(w => <label key={w.id} className="flex items-center gap-3 rounded border p-3 text-sm"><input type="checkbox" checked={selected.includes(w.id)} onChange={e => setSelected(e.target.checked ? [...selected, w.id] : selected.filter(id => id !== w.id))} /><span className="min-w-0 flex-1 break-words">{w.name}</span><span className="text-xs text-muted-foreground">{w.projects.length} project</span></label>)}</div><p className="text-xs text-muted-foreground">Kiểm tra command và biến môi trường trước khi chia sẻ. Không đưa mật khẩu/token vào config.</p><Button disabled={!selected.length || busy} onClick={() => void download()}><Download />Xuất {selected.length} workspace</Button></TabsContent>
      <TabsContent value="import" className="space-y-4"><label className="block text-sm">Chọn config DWRK (.json)<Input className="mt-2" type="file" accept=".json,application/json" disabled={busy} onChange={e => void readFile(e.target.files?.[0])} /></label><p className="text-xs leading-5 text-muted-foreground">Backend kiểm tra file trước khi import. Thêm thành bản sao với ID mới, giữ nguyên đường dẫn và không tự chạy command.</p>{reading && <p role="status">Đang đọc…</p>}<div className="max-h-64 space-y-2 overflow-auto">{preview.map(w => <div key={w.id} className="rounded border p-3 text-sm">{w.name} · {w.projects.length} project<p className="mt-1 break-all font-mono text-xs text-muted-foreground">{w.rootPath}</p></div>)}</div><Button disabled={reading || busy || !preview.length} onClick={async () => { setBusy(true); try { await onImport(text) } catch (e) { setError(String(e)) } finally { setBusy(false) } }}><Upload />Import {preview.length || ''} workspace</Button></TabsContent>
    </Tabs>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </DialogContent></Dialog>
}
