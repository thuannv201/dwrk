import type { MockState, Project, Workspace } from './model'

export const workspaces: Workspace[] = [
  {
    id: 'commerce', name: 'Ecommerce', rootPath: 'D:\\Projects\\shop', projects: [
      { id: 'frontend', name: 'frontend', directory: 'D:\\Projects\\shop\\frontend', technology: 'react', technologyLabel: 'React · Vite', branch: 'main', primaryCommandId: 'frontend-dev', commands: [
        { id: 'frontend-dev', name: 'Dev server', kind: 'service', run: 'npm run dev', port: 5173 },
        { id: 'frontend-build', name: 'Build', kind: 'task', run: 'npm run build' },
      ] },
      { id: 'iam', name: 'iam-service', directory: 'D:\\Projects\\shop\\iam', technology: 'spring', technologyLabel: 'Spring Boot · Java 21', branch: 'develop', primaryCommandId: 'iam-local', commands: [
        { id: 'iam-local', name: 'Run local', kind: 'service', run: '.\\mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=local', port: 8080, healthCheck: { url: 'http://localhost:8080/actuator/health', intervalMs: 10000, timeoutMs: 2000, expectedStatus: 200 } },
        { id: 'iam-test', name: 'Test', kind: 'task', run: '.\\mvnw.cmd test' },
      ] },
      { id: 'orders', name: 'order-service', directory: 'D:\\Projects\\shop\\orders', technology: 'go', technologyLabel: 'Go · REST API', branch: 'main', primaryCommandId: 'orders-dev', commands: [
        { id: 'orders-dev', name: 'Run API', kind: 'service', run: 'go run ./cmd/server', port: 8081 },
        { id: 'orders-test', name: 'Test', kind: 'task', run: 'go test ./...' },
      ] },
      { id: 'infra', name: 'infrastructure', directory: 'D:\\Projects\\shop\\infra', technology: 'docker', technologyLabel: 'Docker Compose · PostgreSQL · Redis', branch: 'main', primaryCommandId: 'infra-up', commands: [
        { id: 'infra-up', name: 'Local infrastructure', kind: 'service', run: 'docker compose -p dwrk-commerce up -d', stop: 'docker compose -p dwrk-commerce stop' },
      ] },
    ],
  },
  { id: 'tools', name: 'Personal tools', rootPath: 'D:\\Projects\\tools', projects: [
    { id: 'dwrk', name: 'dwrk', directory: 'D:\\Projects\\tools\\dwrk', technology: 'go', technologyLabel: 'Wails · React · Go', branch: 'feature/workspaces', primaryCommandId: 'dwrk-dev', commands: [
      { id: 'dwrk-dev', name: 'Dev', kind: 'service', run: 'wails3 dev' },
    ] },
  ] },
  { id: 'portal', name: 'Internal portal', rootPath: 'D:\\Projects\\portal', projects: [
    { id: 'portal-server', name: 'portal-server', directory: 'D:\\Projects\\portal\\server', technology: 'java', technologyLabel: 'Spring MVC · Tomcat', branch: 'develop', primaryCommandId: 'portal-dev', commands: [
      { id: 'portal-dev', name: 'Run local', kind: 'service', run: '.\\mvnw.cmd cargo:run', port: 8080 },
    ] },
  ] },
]

export function createMockState(now = Date.now()): MockState {
  return {
    workspaces: structuredClone(workspaces),
    runs: Object.fromEntries(['frontend-dev', 'iam-local', 'infra-up'].map(id => [id, {
      status: 'running', startedAt: now - 252000,
      logs: [
        { sequence: 1, timestamp: now - 252000, stream: 'stdout', level: 'INFO', message: id === 'iam-local' ? 'c.e.iam.IamApplication       Starting IamApplication using Java 21' : 'Starting development environment…' },
        { sequence: 2, timestamp: now - 251000, stream: 'stdout', level: 'INFO', message: id === 'iam-local' ? 'com.zaxxer.hikari.HikariDataSource  HikariPool-1 — Start completed.' : 'Configuration loaded successfully.' },
        { sequence: 3, timestamp: now - 250000, stream: 'stderr', level: 'WARN', message: 'Dữ liệu mock — chưa kết nối tiến trình, Docker hoặc health check thật.' },
        { sequence: 4, timestamp: now - 248000, stream: 'stdout', level: 'INFO', message: id === 'iam-local' ? 'o.a.coyote.http11.Http11NioProtocol  Tomcat started on port 8080' : 'Development environment is running.' },
      ],
    }])),
    history: [],
  }
}

export function importCandidates(workspace: Workspace): Project[] {
  const paymentId = crypto.randomUUID(), adminId = crypto.randomUUID()
  return [
    { id: paymentId, name: 'payment-api', directory: `${workspace.rootPath}\\payment-api`, technology: 'spring', technologyLabel: 'Spring Boot · Maven', branch: 'main', primaryCommandId: `${paymentId}-dev`, commands: [{ id: `${paymentId}-dev`, name: 'Run local', kind: 'service', run: '.\\mvnw.cmd spring-boot:run', port: 8082 }] },
    { id: adminId, name: 'admin-web', directory: `${workspace.rootPath}\\admin-web`, technology: 'react', technologyLabel: 'React · TypeScript', branch: 'develop', primaryCommandId: `${adminId}-dev`, commands: [{ id: `${adminId}-dev`, name: 'Dev', kind: 'service', run: 'npm run dev', port: 5174 }] },
  ]
}
