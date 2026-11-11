import { useEffect, useMemo, useState } from 'react'
import { Clock3, FolderGit2 } from 'lucide-react'

function Clock({ timeZone }: { timeZone: string }) {
  const [now, setNow] = useState(() => new Date())
  const formatter = useMemo(() => new Intl.DateTimeFormat('vi-VN', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hourCycle: 'h23' }), [timeZone])
  useEffect(() => { const timer = window.setInterval(() => { if (!document.hidden) setNow(new Date()) }, 1000); return () => window.clearInterval(timer) }, [])
  return <span className="flex items-center gap-2"><Clock3 className="size-3.5" /><time dateTime={now.toISOString()} className="tabular-nums">{formatter.format(now)}</time></span>
}
export function StatusBar({ projectCount, runningCount, timeZone = 'Asia/Ho_Chi_Minh' }: { projectCount: number; runningCount: number; timeZone?: string }) {
  return <footer className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t bg-card px-5 py-2 text-xs text-muted-foreground"><div className="flex items-center gap-4"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-success" />Local</span><span className="hidden items-center gap-2 border-l pl-4 sm:flex"><FolderGit2 className="size-3.5" />{projectCount} projects</span><span className="hidden md:inline">{runningCount} command hoạt động</span></div><Clock timeZone={timeZone} /></footer>
}
