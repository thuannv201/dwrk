package runner

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

func (m *Manager) healthLoop(ctx context.Context, e *execution) {
	h := e.command.HealthCheck
	client := &http.Client{Timeout: time.Duration(h.TimeoutMS) * time.Millisecond, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	for {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, h.URL, nil)
		state := "unhealthy"
		detail := ""
		if err == nil {
			response, err := client.Do(request)
			if err != nil {
				detail = err.Error()
			}
			if err == nil {
				if response.StatusCode == h.ExpectedStatus {
					state = "ready"
				} else {
					detail = fmt.Sprintf("HTTP %d, expected %d", response.StatusCode, h.ExpectedStatus)
				}
				_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
				_ = response.Body.Close()
			}
		}
		m.mu.Lock()
		if active(e.run.Status) && ctx.Err() == nil {
			e.run.Health = state
			e.run.HealthError = detail
		}
		m.mu.Unlock()
		timer := time.NewTimer(time.Duration(h.IntervalMS) * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}
