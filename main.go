package main

import (
	"changeme/internal/config"
	"changeme/internal/runner"
	"embed"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"log"
)

//go:embed all:frontend/dist
var assets embed.FS

func init() { application.RegisterEvent[[]runner.Run]("app:close-requested") }

func main() {
	store, err := config.UserStore()
	if err != nil {
		log.Fatal(err)
	}
	manager := runner.New()
	defer manager.Close()
	configuration := NewConfigService(store)
	configuration.runtime = manager
	runtimeService := NewRuntimeService(configuration, manager)
	desktop := NewDesktopService(configuration)
	var app *application.App
	canQuit := func() bool {
		runs := manager.OwnedActive()
		if len(runs) == 0 {
			return true
		}
		app.Event.Emit("app:close-requested", runs)
		return false
	}
	app = application.New(application.Options{
		Name: "dwrk", Description: "Development workspaces",
		Services:   []application.Service{application.NewService(configuration), application.NewService(runtimeService), application.NewService(desktop)},
		Assets:     application.AssetOptions{Handler: application.AssetFileServerFS(assets)},
		ShouldQuit: canQuit,
		Mac:        application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: true},
	})
	desktop.app = app
	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title: "Development Workspaces", Width: 1200, Height: 780,
		Mac:              application.MacWindow{InvisibleTitleBarHeight: 50, Backdrop: application.MacBackdropTranslucent, TitleBar: application.MacTitleBarHiddenInset},
		BackgroundColour: application.NewRGB(6, 7, 15), URL: "/",
	})
	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		if !canQuit() {
			event.Cancel()
		}
	})
	if err := app.Run(); err != nil {
		log.Print(err)
	}
}
