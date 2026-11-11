package main

import (
	"errors"
	"testing"
)

func TestDialogCancellationIsNotFailure(t *testing.T) {
	if !dialogCancelled(errors.New("cancelled by user")) {
		t.Fatal("Wails cancellation was not recognized")
	}
	if dialogCancelled(nil) || dialogCancelled(errors.New("access denied")) {
		t.Fatal("real failure was hidden")
	}
}
