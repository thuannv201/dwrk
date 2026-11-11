import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Workspace } from '@/lib/model'
import { DesktopService } from '../../../bindings/changeme'

export function NewWorkspaceDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (w: Workspace) => Promise<void> }) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent><DialogHeader><DialogTitle>Workspace mới</DialogTitle><DialogDescription>Tạo workspace rồi chọn project để import. Không tự chạy command.</DialogDescription></DialogHeader>
    <form className="space-y-5" onSubmit={async event => { event.preventDefault(); if (!name.trim() || !path.trim()) { setError('Nhập tên và thư mục workspace.'); return }; setBusy(true); try { await onCreate({ id: crypto.randomUUID(), name: name.trim(), rootPath: path, projects: [], startCommandIds: [], resources: [] }) } catch (e) { setError(String(e)) } finally { setBusy(false) } }}>
      <label className="block text-xs">Tên workspace<Input autoFocus className="mt-2" value={name} onChange={e => setName(e.target.value)} /></label><label className="block text-xs">Thư mục gốc<div className="mt-2 flex gap-2"><Input value={path} onChange={e => setPath(e.target.value)} /><Button type="button" variant="outline" onClick={async () => { try { const path = await DesktopService.PickDirectory(); if (path) setPath(path) } catch (e) { setError(String(e)) } }}>Chọn thư mục</Button></div></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Hủy</Button><Button disabled={busy}>Tạo & import project</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
}
