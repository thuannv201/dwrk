import { useState } from 'react'
import { Check, FolderGit2, ScanLine } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TechnologyIcon } from '@/components/icons/TechnologyIcon'
import { importCandidates } from '@/mock/data'
import { validateProject, type Project, type Workspace } from '@/mock/model'

export function ImportProjectsDialog({ workspace, manual, onClose, onImport }: { workspace: Workspace; manual: boolean; onClose: () => void; onImport: (projects: Project[]) => void }) {
  const [path, setPath] = useState(manual ? `${workspace.rootPath}\\my-project` : workspace.rootPath)
  const [name, setName] = useState('')
  const [run, setRun] = useState('npm run dev')
  const [technology, setTechnology] = useState<Project['technology']>('react')
  const [candidates, setCandidates] = useState<Project[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState('')
  const existing = (project: Project) => workspace.projects.some(item => item.directory.replace(/\\/g, '/').toLowerCase() === project.directory.replace(/\\/g, '/').toLowerCase())
  function scan() {
    if (!/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(path)) { setError('Nhập đường dẫn tuyệt đối để mô phỏng quét.'); return }
    const found = importCandidates({ ...workspace, rootPath: path.replace(/[\\/]$/, '') })
    setCandidates(found)
    setSelected(found.filter(project => !existing(project)).map(project => project.id))
    setError('')
  }
  function submitManual() {
    const id = crypto.randomUUID(), commandId = crypto.randomUUID()
    const project: Project = { id, name: name.trim(), directory: path.trim(), technology, technologyLabel: technology, branch: 'main', primaryCommandId: commandId, commands: [{ id: commandId, name: 'Run local', kind: 'service', run }] }
    const message = validateProject(project)
    if (message) { setError(message); return }
    if (existing(project)) { setError('Thư mục đã có trong workspace.'); return }
    onImport([project])
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>{manual ? 'Thêm project' : 'Quét & import project'}</DialogTitle><DialogDescription>{manual ? 'Thêm một thư mục và cấu hình lệnh chạy trong phiên mock.' : 'Kết quả quét là dữ liệu mẫu. Chọn các mục cần import; không truy cập filesystem hoặc chạy lệnh thật.'}</DialogDescription></DialogHeader>
    {manual && <label className="text-xs font-medium">Tên project<Input value={name} onChange={event => setName(event.target.value)} placeholder="my-project" className="mt-2" /></label>}
    <label className="text-xs font-medium">{manual ? 'Thư mục project' : 'Thư mục cần quét'}<div className="mt-2 flex gap-2"><Input value={path} onChange={event => { setPath(event.target.value); setCandidates(null) }} className="min-w-0 font-mono text-xs" />{!manual && <Button onClick={scan}><ScanLine />Quét</Button>}</div></label>
    {manual && <><label className="text-xs font-medium">Công nghệ<select value={technology} onChange={event => setTechnology(event.target.value as Project['technology'])} className="mt-2 block h-9 w-full rounded-md border bg-background px-2">{['react', 'spring', 'go', 'docker', 'java', 'typescript'].map(item => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-medium">Lệnh chạy<Input value={run} onChange={event => setRun(event.target.value)} className="mt-2 font-mono text-xs" /></label></>}
    {candidates && <div className="rounded-lg border"><div className="flex items-center gap-2 border-b bg-secondary/40 px-4 py-2.5 text-xs text-muted-foreground"><FolderGit2 className="size-4" />{candidates.length} project được tìm thấy · {selected.length} được chọn</div>{candidates.map(project => <label key={project.id} className="flex items-center gap-3 border-b p-4 last:border-0"><input type="checkbox" disabled={existing(project)} checked={selected.includes(project.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, project.id] : previous.filter(id => id !== project.id))} /><TechnologyIcon technology={project.technology} className="size-7" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{project.name}</span><span className="mt-1 block break-all text-xs text-muted-foreground">{project.directory}</span></span>{existing(project) && <span className="flex shrink-0 items-center gap-1 text-[11px] text-success"><Check className="size-3" />Đã import</span>}</label>)}</div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" onClick={onClose}>Hủy</Button><Button disabled={!manual && !selected.length} onClick={() => manual ? submitManual() : onImport(candidates!.filter(project => selected.includes(project.id)))}>{manual ? 'Thêm project' : `Import ${selected.length} project`}</Button></DialogFooter>
  </DialogContent></Dialog>
}
