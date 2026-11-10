import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Workspace } from '@/mock/model'

export function NewWorkspaceDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (workspace: Workspace) => void }) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('D:\\Projects\\')
  const [error, setError] = useState('')
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent><DialogHeader><DialogTitle>Workspace mới</DialogTitle><DialogDescription>Tạo workspace trong phiên mock, sau đó chọn project để import.</DialogDescription></DialogHeader>
    <form className="space-y-5" onSubmit={event => { event.preventDefault(); if (!name.trim() || !/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(path)) { setError('Nhập tên và đường dẫn tuyệt đối của workspace.'); return }; onCreate({ id: crypto.randomUUID(), name: name.trim(), rootPath: path.trim(), projects: [] }) }}>
      <label className="block text-xs font-medium">Tên workspace<Input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="Tên dự án" className="mt-2" /></label><label className="block text-xs font-medium">Thư mục gốc<Input value={path} onChange={event => setPath(event.target.value)} className="mt-2 font-mono text-xs" /></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Hủy</Button><Button type="submit">Tạo & chọn nội dung import</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
}
