import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Search, Trash2, Terminal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { Command, HistoryEntry, Run, Workspace } from '@/lib/model'



function Duration({ startedAt, endedAt }: { startedAt: number; endedAt?: number }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => { if (endedAt) return; const timer = window.setInterval(() => { if (!document.hidden) setNow(Date.now()) }, 1000); return () => window.clearInterval(timer) }, [endedAt])
  const seconds = Math.max(0, Math.floor(((endedAt ?? now) - startedAt) / 1000))
  return <span className="hidden text-xs text-muted-foreground xl:inline">Thời gian chạy: <span className="font-mono tabular-nums text-foreground">{String(Math.floor(seconds / 3600)).padStart(2, '0')}:{String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</span></span>
}

export function LogPanel({ workspace, command, run, history, onSelect, timeZone }: { timeZone: string; workspace: Workspace; command?: Command; run?: Run; history: HistoryEntry[]; onSelect: (id: string) => void }) {
  const time = useMemo(() => new Intl.DateTimeFormat('vi-VN', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }), [timeZone])
  const [copyStatus, setCopyStatus] = useState('')
  const [stream, setStream] = useState('all')
  const [query, setQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [clearedThrough, setClearedThrough] = useState(0)
  const viewport = useRef<HTMLDivElement>(null)
  const logs = (run?.logs ?? []).filter(line => line.sequence > clearedThrough && (stream === 'all' || line.stream === stream) && line.message.toLowerCase().includes(query.toLowerCase()))
  useEffect(() => { if (autoScroll && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight }, [run?.logs, autoScroll, stream, query])
  return <section className="workspace-logs min-w-0 rounded-xl border bg-card px-4 pb-4" aria-label="Log và lịch sử">
    <Tabs defaultValue="logs" className="gap-0">
      <div className="flex items-center justify-between border-b"><TabsList variant="line" className="gap-5 py-3"><TabsTrigger value="logs">Logs</TabsTrigger><TabsTrigger value="history">Lịch sử</TabsTrigger></TabsList><span className="text-[10px] uppercase tracking-widest text-muted-foreground">Phiên hiện tại</span></div>
      <TabsContent value="logs">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 py-3.5">
          <label className="flex min-w-0 items-center gap-2 rounded-md border bg-secondary/40 px-2.5 py-1.5"><Terminal className="size-4 text-primary" /><span className="sr-only">Nguồn log</span><select value={command?.id ?? ''} onChange={event => onSelect(event.target.value)} className="min-w-0 max-w-48 bg-transparent text-xs outline-none" aria-label="Nguồn log">{!command && <option value="">Chưa có service</option>}{workspace.projects.map(project => <optgroup key={project.id} label={project.name}>{project.commands.map(item => <option key={item.id} value={item.id}>{project.name} / {item.name}</option>)}</optgroup>)}</select></label>
          <div className="flex gap-1.5">{['all', 'stdout', 'stderr'].map(value => <button key={value} onClick={() => setStream(value)} aria-pressed={stream === value} className={cn('rounded-md border px-2.5 py-1 text-xs transition-colors', stream === value ? 'border-primary bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}>{value === 'all' ? 'All' : value}</button>)}</div>
          {run?.startedAt && <Duration startedAt={run.startedAt} endedAt={run.endedAt} />}
          <div className="ml-auto flex flex-wrap items-center gap-2"><Button variant="outline" size="icon-sm" aria-label="Tìm trong log" onClick={() => setShowSearch(!showSearch)}>{showSearch ? <X /> : <Search />}</Button><Button variant="outline" size="icon-sm" aria-label="Sao chép log" onClick={async () => { try { await navigator.clipboard.writeText(logs.map(line => `${time.format(line.timestamp)} [${line.stream}] ${line.message}`).join('\n')); setCopyStatus('Đã sao chép.') } catch { setCopyStatus('Không truy cập được clipboard.') } }}><Copy /></Button><Button variant="outline" size="sm" onClick={() => setClearedThrough(run?.logs[run.logs.length - 1]?.sequence ?? 0)}><Trash2 />Xóa</Button><label className="ml-2 flex items-center gap-2 text-xs"><Switch checked={autoScroll} onCheckedChange={setAutoScroll} aria-label="Tự động cuộn log" />Tự động cuộn</label></div>
        </div>
        {copyStatus && <p role="status" className="mb-2 text-xs text-muted-foreground">{copyStatus}</p>}{!!run?.dropped && <p className="mb-2 text-xs text-muted-foreground">Đã bỏ {run.dropped} dòng cũ do giới hạn log. View hiển thị tối đa 200 dòng gần nhất.</p>}{run?.error && <p role="alert" className="mb-2 text-xs text-destructive">{run.error}</p>}{run?.exitCode !== undefined && <p className="mb-2 text-xs text-muted-foreground">Exit code: {run.exitCode}</p>}{showSearch && <Input autoFocus placeholder="Tìm nội dung log…" aria-label="Nội dung tìm trong log" value={query} onChange={event => setQuery(event.target.value)} className="mb-3 max-w-sm" />}
        <div ref={viewport} className="min-h-40 max-h-64 overflow-auto rounded-lg border bg-background p-3.5 font-mono text-xs leading-7" role="log" aria-label="Đầu ra service" aria-live="off">
          {logs.length ? logs.map(line => <div key={line.sequence} className="flex min-w-0 flex-wrap gap-x-3"><span className="shrink-0 tabular-nums text-muted-foreground">{time.format(line.timestamp)}</span><span className={cn('my-1.5 inline-flex h-4 items-center rounded px-1.5 text-[10px]', line.level === 'WARN' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300' : line.level === 'ERROR' ? 'bg-destructive/15 text-destructive' : 'bg-success/15 text-success')}>{line.level}</span><span className="min-w-0 flex-1 basis-48 break-all">{line.message}</span></div>) : <p className="text-muted-foreground">{run ? 'Không có log phù hợp để hiển thị.' : 'Chạy một service hoặc task để xem log.'}</p>}
        </div>
      </TabsContent>
      <TabsContent value="history" className="min-h-52 py-4"><div className="space-y-3 font-mono text-xs">{history.length ? history.map((entry, index) => <p key={`${entry.timestamp}-${index}`} className="flex flex-wrap gap-4"><span className="text-muted-foreground">{time.format(entry.timestamp)}</span><span>{entry.message}</span></p>) : <p className="text-muted-foreground">Chưa có thao tác trong workspace này.</p>}</div></TabsContent>
    </Tabs>
  </section>
}
