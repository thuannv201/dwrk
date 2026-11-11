import { useEffect, useRef, useState } from 'react'
import { Check, FolderGit2, ScanLine } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TechnologyIcon } from '@/components/icons/TechnologyIcon'
import { toProject, type Project, type Workspace } from '@/lib/model'
import { DesktopService } from '../../../bindings/changeme'

export function ImportProjectsDialog({ workspace, manual, onClose, onImport }: { workspace: Workspace; manual: boolean; onClose: () => void; onImport: (projects: Project[]) => Promise<void> }) {
  const [path, setPath] = useState(workspace.rootPath)
  const [name, setName] = useState('')
  const [run, setRun] = useState('')
  const [technology, setTechnology] = useState('typescript')
  const [candidates, setCandidates] = useState<Project[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const request = useRef(0)
  const existing = (p: Project) => workspace.projects.some(item => item.directory.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase() === p.directory.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase())
  useEffect(() => () => { request.current++; void DesktopService.CancelScan().catch(() => {}) }, [])
  async function scan() {
    const id = ++request.current; setScanning(true); setCandidates([]); setSelected([]); setError(''); setWarnings([])
    try { const result = await DesktopService.Scan(path); if (request.current !== id) return; setCandidates((result.projects ?? []).map(toProject)); setWarnings(result.warnings ?? []) } catch (e) { if (request.current === id) setError(String(e)) } finally { if (request.current === id) setScanning(false) }
  }
  async function submit() {
    setBusy(true); setError('')
    try {
      if (manual) {
        const id = crypto.randomUUID(), commandId = crypto.randomUUID()
        await onImport([toProject({ id, name: name.trim(), directory: path, technologies: [technology], primaryCommandId: run.trim() ? commandId : '', commands: run.trim() ? [{ id: commandId, name: 'Run local', kind: 'service', driver: 'process', run, workingDirectory: '.', environment: {} }] : [] })])
      } else await onImport(candidates.filter(p => selected.includes(p.id)))
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{manual ? 'Thêm project' : 'Quét & import project'}</DialogTitle><DialogDescription>{manual ? 'Thêm thư mục và lệnh chạy do bạn cấu hình.' : 'Quét thư mục thật, bỏ qua thư mục build/dependency và symlink. Chỉ import mục đã chọn; không tự tạo hay chạy command.'}</DialogDescription></DialogHeader>
    {manual && <label className="text-xs">Tên project<Input className="mt-2" value={name} onChange={e => setName(e.target.value)} /></label>}
    <label className="text-xs">Thư mục<div className="mt-2 flex gap-2"><Input value={path} disabled={scanning} onChange={e => { setPath(e.target.value); setCandidates([]); setSelected([]) }} /><Button variant="outline" disabled={scanning} onClick={async () => { try { const path = await DesktopService.PickDirectory(); if (path) { setPath(path); setCandidates([]); setSelected([]) } } catch (e) { setError(String(e)) } }}>Chọn</Button>{!manual && <Button disabled={scanning} onClick={() => void scan()}><ScanLine />Quét</Button>}</div></label>
    {manual && <><label className="text-xs">Công nghệ<select className="mt-2 block h-9 w-full rounded border bg-background px-2" value={technology} onChange={e => setTechnology(e.target.value)}>{['react', 'spring', 'go', 'docker', 'java', 'typescript'].map(t => <option key={t}>{t}</option>)}</select></label><label className="text-xs">Lệnh chạy · tùy chọn<Input className="mt-2 font-mono text-xs" value={run} onChange={e => setRun(e.target.value)} /></label></>}
    {scanning && <div role="status" className="flex items-center justify-between text-sm">Đang quét…<Button variant="outline" onClick={() => { request.current++; setScanning(false); void DesktopService.CancelScan().catch(e => setError(String(e))) }}>Hủy quét</Button></div>}
    {!manual && !scanning && <div className="max-h-80 overflow-auto rounded border"><p className="flex items-center gap-2 border-b p-3 text-xs text-muted-foreground"><FolderGit2 className="size-4" />{candidates.length} project · {selected.length} được chọn</p>{candidates.map(p => <label key={p.id} className="flex items-center gap-3 border-b p-3 last:border-0"><input type="checkbox" disabled={existing(p)} checked={selected.includes(p.id)} onChange={e => setSelected(e.target.checked ? [...selected, p.id] : selected.filter(id => id !== p.id))} /><TechnologyIcon technology={p.technology} /><span className="min-w-0 flex-1 text-sm">{p.name}<span className="mt-1 block break-all text-xs text-muted-foreground">{p.directory}</span></span>{existing(p) && <span className="flex items-center gap-1 text-xs text-success"><Check className="size-3" />Đã import</span>}</label>)}</div>}
    {warnings.map((warning, index) => <p key={index} className="break-all text-xs text-amber-600">{warning}</p>)}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Hủy</Button><Button disabled={busy || scanning || (manual ? !name.trim() : !selected.length)} onClick={() => void submit()}>{manual ? 'Thêm project' : `Import ${selected.length} project`}</Button></DialogFooter>
  </DialogContent></Dialog>
}
