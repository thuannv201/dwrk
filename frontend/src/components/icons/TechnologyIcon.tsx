import react from '@/assets/technologies/react.svg'
import spring from '@/assets/technologies/spring.svg'
import go from '@/assets/technologies/go.svg'
import docker from '@/assets/technologies/docker.svg'
import java from '@/assets/technologies/java.svg'
import typescript from '@/assets/technologies/typescript.svg'
import type { Project } from '@/mock/model'
import { cn } from '@/lib/utils'

const icons = { react, spring, go, docker, java, typescript }

export function TechnologyIcon({ technology, className }: { technology: Project['technology']; className?: string }) {
  return <img src={icons[technology]} alt="" className={cn('size-8 shrink-0 object-contain', className)} draggable={false} />
}
