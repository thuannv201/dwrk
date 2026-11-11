import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Project } from '@/lib/model'
import { DesktopService } from '../../../bindings/changeme'
import type { GitStatus } from '../../../bindings/changeme/internal/tools/models'

export function GitDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [status, setStatus] = useState<GitStatus>()
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => { let cancelled = false; setStatus(undefined); setError(''); DesktopService.GitStatus(project.id).then(value => { if (!cancelled) setStatus(value) }).catch(e => { if (!cancelled) setError(String(e)) }); return () => { cancelled = true } }, [project.id, version])
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Git · {project.name}</DialogTitle><DialogDescription>Chỉ đọc trạng thái local. Ahead/behind chưa fetch; không tự commit, pull hoặc push. M: sửa · A: thêm · D: xóa · ??: chưa theo dõi.</DialogDescription></DialogHeader>{error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}{!error && !status && <p role="status">Đang đọc Git…</p>}{status && <><p className="break-all font-mono text-xs">{status.root}</p><p className="text-sm">Branch: {status.branch} · Upstream: {status.upstream || 'Chưa cấu hình'}</p><p className="text-sm">Ahead {status.ahead} / Behind {status.behind} · {status.changeCount} thay đổi</p><div className="max-h-72 overflow-auto rounded border p-3 font-mono text-xs leading-6">{(status.changes ?? []).map((line, index) => <p className="break-all" key={index}>{line}</p>)}{!status.changeCount && <p>Working tree sạch.</p>}{status.changeCount > 200 && <p>Chỉ hiển thị 200 mục đầu.</p>}</div></>}<Button variant="outline" onClick={() => setVersion(v => v + 1)}>Làm mới</Button></DialogContent></Dialog>
}

