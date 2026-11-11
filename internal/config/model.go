// Package config owns the persisted workspace configuration, separate from runtime state.
package config

const SchemaVersion = 1

type Config struct {
	SchemaVersion   int         `json:"schemaVersion"`
	Revision        uint64      `json:"revision"`
	Settings        Settings    `json:"settings"`
	LastWorkspaceID string      `json:"lastWorkspaceId,omitempty"`
	Workspaces      []Workspace `json:"workspaces"`
}

type Tool struct {
	Executable string   `json:"executable"`
	Args       []string `json:"args"`
}

type LogLimits struct {
	MaxLinesPerRun   int `json:"maxLinesPerRun"`
	MaxBytesPerRun   int `json:"maxBytesPerRun"`
	MaxBytesTotal    int `json:"maxBytesTotal"`
	MaxCompletedRuns int `json:"maxCompletedRuns"`
}

type Settings struct {
	Theme    string    `json:"theme"`
	Locale   string    `json:"locale"`
	TimeZone string    `json:"timeZone"`
	Editor   Tool      `json:"editor"`
	Terminal Tool      `json:"terminal"`
	Shell    Tool      `json:"shell"`
	Logs     LogLimits `json:"logs"`
}

type Workspace struct {
	ID              string     `json:"id"`
	Name            string     `json:"name"`
	RootPath        string     `json:"rootPath"`
	Projects        []Project  `json:"projects"`
	StartCommandIDs []string   `json:"startCommandIds"`
	Resources       []Resource `json:"resources"`
}

type Project struct {
	ID               string    `json:"id"`
	Name             string    `json:"name"`
	Directory        string    `json:"directory"`
	Technologies     []string  `json:"technologies"`
	PrimaryCommandID string    `json:"primaryCommandId,omitempty"`
	Commands         []Command `json:"commands"`
}

type Command struct {
	ID               string            `json:"id"`
	Name             string            `json:"name"`
	Kind             string            `json:"kind"`
	Driver           string            `json:"driver,omitempty"`
	WorkingDirectory string            `json:"workingDirectory"`
	Environment      map[string]string `json:"environment"`
	Run              string            `json:"run,omitempty"`
	Stop             string            `json:"stop,omitempty"`
	Ports            []int             `json:"ports,omitempty"`
	URL              string            `json:"url,omitempty"`
	HealthCheck      *HealthCheck      `json:"healthCheck,omitempty"`
	Compose          *Compose          `json:"compose,omitempty"`
}

type HealthCheck struct {
	URL            string `json:"url"`
	IntervalMS     int    `json:"intervalMs"`
	TimeoutMS      int    `json:"timeoutMs"`
	ExpectedStatus int    `json:"expectedStatus"`
}

type Compose struct {
	ProjectName string   `json:"projectName"`
	Files       []string `json:"files"`
	Services    []string `json:"services"`
}

type Resource struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Kind   string `json:"kind"`
	Target string `json:"target"`
}

func Default() Config {
	return Config{
		SchemaVersion: SchemaVersion,
		Settings: Settings{
			Theme: "dark", Locale: "vi-VN", TimeZone: "Asia/Ho_Chi_Minh",
			Logs: LogLimits{MaxLinesPerRun: 2000, MaxBytesPerRun: 2 << 20, MaxBytesTotal: 32 << 20, MaxCompletedRuns: 20},
		},
		Workspaces: []Workspace{},
	}
}
