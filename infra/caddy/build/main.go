// Standard Caddy entry point, following github.com/caddyserver/caddy/v2/cmd/caddy.
// Caddy is licensed under Apache-2.0: https://github.com/caddyserver/caddy/blob/v2.11.7/LICENSE
package main

import (
	_ "time/tzdata"
	caddycmd "github.com/caddyserver/caddy/v2/cmd"
	_ "github.com/caddyserver/caddy/v2/modules/standard"
)

func main() { caddycmd.Main() }
