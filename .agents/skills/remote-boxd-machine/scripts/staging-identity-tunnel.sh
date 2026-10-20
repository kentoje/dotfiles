#!/usr/bin/env bash
# staging-identity-tunnel.sh - send a boxd machine's Aircall staging login and token
# refresh through this laptop.
#
# id.aircall-staging.com answers every request from a boxd machine with 403
# ForbiddenException. Every other staging host answers the machine normally. This
# script opens an SSH reverse tunnel from the laptop and points the machine's
# /etc/hosts entry for the identity host at it, so login (POST
# /auth/v2/users/session) and token refresh (GET /auth/v1/tokens/refresh) leave from
# the laptop's network. TLS stays end to end between the machine and AWS: the tunnel
# only carries the encrypted TCP stream, and no password or token is handled by the
# laptop.
#
# boxd's SSH gateway accepts `ssh -R` but never opens the port inside the machine.
# The tunnel therefore runs through a private OpenSSH server that the laptop starts
# on the machine in inetd mode (`sshd -i`) over the gateway connection. It lives
# exactly as long as the laptop's ssh process. Nothing is installed as a service.
#
# Usage: staging-identity-tunnel.sh start|status|stop <machine>

set -euo pipefail

readonly IDENTITY_HOST="id.aircall-staging.com"
# Loopback address the machine resolves IDENTITY_HOST to. Not 127.0.0.1, because
# portless already listens on 127.0.0.1:443 there.
readonly TUNNEL_LISTEN_IP="127.0.0.2"
readonly HOSTS_LINE_MARKER="# boxd-staging-identity-tunnel"
readonly REMOTE_STATE_DIR="/home/boxd/.local/state/boxd-staging-identity-tunnel"
readonly LOCAL_STATE_DIR="$HOME/.ssh/boxd-staging-identity-tunnel"

die() {
  echo "staging-identity-tunnel: $*" >&2
  exit 1
}

usage() {
  echo "usage: $(basename "$0") start|status|stop <machine>" >&2
  exit 2
}

[ $# -eq 2 ] || usage
action=$1
machine=$2
[[ $machine =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]] || die "invalid machine name: $machine"

ssh_alias="$machine.boxd"
tunnel_host_alias="boxd-staging-identity-tunnel-$machine"
control_socket="$LOCAL_STATE_DIR/$machine.sock"
known_hosts_file="$LOCAL_STATE_DIR/$machine.known_hosts"

# Runs a command on the machine through boxd's SSH gateway, using the
# <machine>.boxd alias that boxd keeps in ~/.ssh/config.
machine_ssh() {
  ssh -T -o BatchMode=yes "$ssh_alias" "$@"
}

require_machine_reachable() {
  local status
  status=$(boxd machine get "$machine" --json | jq -r .status) ||
    die "boxd machine get $machine failed"
  case $status in
    running | standby | hibernated) ;;
    *) die "machine $machine is $status, start it first" ;;
  esac
  # `boxd machine list` refreshes the <machine>.boxd alias in ~/.ssh/config.
  boxd machine list --json >/dev/null
}

# Prints the private key boxd generated for this laptop. The tunnel reuses it to log
# in to the private sshd on the machine.
boxd_identity_file() {
  local file
  file=$(ssh -G "$ssh_alias" 2>/dev/null | sed -n 's/^identityfile //p' | grep '/boxd/' | head -1)
  [ -n "$file" ] || die "no boxd IdentityFile for $ssh_alias in ~/.ssh/config"
  printf '%s\n' "$file"
}

tunnel_is_open() {
  ssh -S "$control_socket" -O check "$tunnel_host_alias" >/dev/null 2>&1
}

# Shell snippet, run on the machine, that kills a tunnel sshd still holding the
# tunnel address. It survives in a machine created from a snapshot that was saved
# while a tunnel was open, because snapshots capture running processes. The process
# renames itself to "sshd: boxd", so match it by its listening socket, not its name.
# Expects listen_ip to be set. Single-quoted on purpose: it expands on the machine.
# shellcheck disable=SC2016
readonly KILL_STALE_TUNNEL_SSHD='
for pid in $(sudo ss -Htlnp src "$listen_ip:443" | grep -o "\"sshd\",pid=[0-9]*" | grep -o "[0-9]*$" | sort -u); do
  sudo kill "$pid" || true
done
for _ in 1 2 3 4 5; do
  sudo ss -Htln src "$listen_ip:443" | grep -q . || break
  sleep 1
done
'

# Writes the private sshd config, its host key, and the laptop's public key on the
# machine. Prints the sshd host key so the laptop can pin it.
provision_tunnel_sshd_on_machine() {
  local client_pubkey=$1
  {
    printf 'state_dir=%q\nlisten_ip=%q\nclient_pubkey=%q\n' \
      "$REMOTE_STATE_DIR" "$TUNNEL_LISTEN_IP" "$client_pubkey"
    printf '%s\n' "$KILL_STALE_TUNNEL_SSHD"
    cat <<'REMOTE'
set -euo pipefail
mkdir -p "$state_dir"
chmod 700 "$state_dir"
if [ ! -f "$state_dir/ssh_host_ed25519_key" ]; then
  ssh-keygen -q -t ed25519 -N '' -C boxd-staging-identity-tunnel -f "$state_dir/ssh_host_ed25519_key"
fi
cat >"$state_dir/sshd_config" <<CONFIG
# Private sshd for the staging identity tunnel. The laptop starts it per
# connection in inetd mode (sshd -i). It never runs as a daemon.
HostKey $state_dir/ssh_host_ed25519_key
AuthorizedKeysFile $state_dir/authorized_keys
PidFile none
UsePAM no
PasswordAuthentication no
KbdInteractiveAuthentication no
AllowUsers boxd
AllowTcpForwarding remote
PermitListen $listen_ip:443
GatewayPorts clientspecified
PermitTTY no
X11Forwarding no
AllowAgentForwarding no
ForceCommand /bin/false
LogLevel ERROR
CONFIG
printf 'restrict,port-forwarding,permitlisten="%s:443" %s\n' "$listen_ip" "$client_pubkey" >"$state_dir/authorized_keys"
chmod 600 "$state_dir/sshd_config" "$state_dir/authorized_keys"
/usr/sbin/sshd -t -f "$state_dir/sshd_config"
echo "TUNNEL_HOST_KEY $(cat "$state_dir/ssh_host_ed25519_key.pub")"
REMOTE
  } | machine_ssh bash -s | sed -n 's/^TUNNEL_HOST_KEY //p'
}

open_tunnel() {
  local identity_file=$1
  rm -f "$control_socket"
  ssh -M -S "$control_socket" -f -N \
    -o BatchMode=yes \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=4 \
    -o IdentitiesOnly=yes \
    -i "$identity_file" \
    -l boxd \
    -o HostKeyAlias="$tunnel_host_alias" \
    -o UserKnownHostsFile="$known_hosts_file" \
    -o StrictHostKeyChecking=yes \
    -o ProxyCommand="ssh -T -o BatchMode=yes $ssh_alias /usr/sbin/sshd -i -f $REMOTE_STATE_DIR/sshd_config" \
    -R "$TUNNEL_LISTEN_IP:443:$IDENTITY_HOST:443" \
    "$tunnel_host_alias"
}

# Points IDENTITY_HOST at the tunnel in the machine's /etc/hosts. Idempotent.
route_identity_host_to_tunnel() {
  {
    printf 'listen_ip=%q\nidentity_host=%q\nmarker=%q\n' \
      "$TUNNEL_LISTEN_IP" "$IDENTITY_HOST" "$HOSTS_LINE_MARKER"
    cat <<'REMOTE'
set -euo pipefail
sudo sed -i "/ $marker\$/d" /etc/hosts
printf '%s %s %s\n' "$listen_ip" "$identity_host" "$marker" | sudo tee -a /etc/hosts >/dev/null
REMOTE
  } | machine_ssh bash -s
}

# Removes the /etc/hosts line, any tunnel sshd still listening, and the private sshd
# files from the machine.
unroute_and_clean_machine() {
  {
    printf 'state_dir=%q\nmarker=%q\nlisten_ip=%q\n' \
      "$REMOTE_STATE_DIR" "$HOSTS_LINE_MARKER" "$TUNNEL_LISTEN_IP"
    printf '%s\n' "$KILL_STALE_TUNNEL_SSHD"
    cat <<'REMOTE'
set -euo pipefail
sudo sed -i "/ $marker\$/d" /etc/hosts
rm -rf "$state_dir"
REMOTE
  } | machine_ssh bash -s
}

# Prints the HTTP status the machine gets for an empty login request.
# 400: the request reached Aircall's auth service, so the tunnel works.
# 403: the request did not go through the tunnel.
# 000: nothing answered on the tunnel address.
probe_identity_api_from_machine() {
  machine_ssh bash -s <<REMOTE
curl -s -o /dev/null -m 15 -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' https://$IDENTITY_HOST/auth/v2/users/session || true
REMOTE
}

start_staging_identity_tunnel() {
  mkdir -p "$LOCAL_STATE_DIR"
  chmod 700 "$LOCAL_STATE_DIR"
  require_machine_reachable

  if tunnel_is_open; then
    echo "tunnel to $machine already open"
  else
    local identity_file client_pubkey host_key
    identity_file=$(boxd_identity_file)
    client_pubkey=$(ssh-keygen -y -f "$identity_file")
    host_key=$(provision_tunnel_sshd_on_machine "$client_pubkey")
    [ -n "$host_key" ] || die "provisioning the tunnel sshd on $machine failed"
    printf '%s %s\n' "$tunnel_host_alias" "$host_key" >"$known_hosts_file"
    open_tunnel "$identity_file" || die "ssh reverse tunnel to $machine failed to open"
  fi

  route_identity_host_to_tunnel
  local code
  code=$(probe_identity_api_from_machine)
  [ "$code" = 400 ] ||
    die "identity API probe from $machine returned HTTP $code, expected 400"
  echo "staging identity tunnel open: $machine reaches $IDENTITY_HOST through this laptop (probe HTTP $code)"
}

status_staging_identity_tunnel() {
  local tunnel=closed hosts_line code
  tunnel_is_open && tunnel=open
  hosts_line=$(printf 'grep -c -- %q /etc/hosts || true\n' "$HOSTS_LINE_MARKER" | machine_ssh bash -s)
  code=$(probe_identity_api_from_machine)
  echo "tunnel: $tunnel"
  echo "hosts line on machine: ${hosts_line:-0}"
  echo "identity API probe from machine: HTTP $code (400 = through laptop, 403 = not through the tunnel, 000 = tunnel down)"
  [ "$tunnel" = open ] && [ "$code" = 400 ]
}

stop_staging_identity_tunnel() {
  unroute_and_clean_machine ||
    echo "staging-identity-tunnel: could not clean $machine (machine gone?), closing the laptop side only" >&2
  if tunnel_is_open; then
    ssh -S "$control_socket" -O exit "$tunnel_host_alias" 2>/dev/null || true
  fi
  rm -f "$control_socket" "$known_hosts_file"
  echo "staging identity tunnel closed for $machine"
}

case $action in
  start) start_staging_identity_tunnel ;;
  status) status_staging_identity_tunnel ;;
  stop) stop_staging_identity_tunnel ;;
  *) usage ;;
esac
