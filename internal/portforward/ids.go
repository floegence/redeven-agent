package portforward

import "strings"

// IsValidForwardID enforces a DNS-safe label:
// - allowed: [a-z0-9-]
// - length: 1..48
// - no leading/trailing '-'
//
// It intentionally matches the control-plane validation to avoid subtle routing bugs.
func IsValidForwardID(id string) bool {
	id = strings.TrimSpace(id)
	if id == "" || len(id) > 48 {
		return false
	}
	for i := 0; i < len(id); i++ {
		c := id[i]
		isLower := c >= 'a' && c <= 'z'
		isDigit := c >= '0' && c <= '9'
		if isLower || isDigit || c == '-' {
			continue
		}
		return false
	}
	if id[0] == '-' || id[len(id)-1] == '-' {
		return false
	}
	return true
}
