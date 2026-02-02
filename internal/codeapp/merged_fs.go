package codeapp

import (
	"errors"
	"io/fs"
)

type mergedFS struct {
	primary   fs.FS
	secondary fs.FS
}

func (m mergedFS) Open(name string) (fs.File, error) {
	if m.primary != nil {
		f, err := m.primary.Open(name)
		if err == nil {
			return f, nil
		}
		if !errors.Is(err, fs.ErrNotExist) {
			return nil, err
		}
	}
	if m.secondary != nil {
		return m.secondary.Open(name)
	}
	return nil, fs.ErrNotExist
}
