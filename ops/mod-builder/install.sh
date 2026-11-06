#!/usr/bin/env bash
# Prepares the production VPS (Debian 12 / Ubuntu 22.04+) to build and test the mod: `bun mod release`.
# Idempotent: run it again after an update. Run as root from a checkout of the repository:
#
#   sudo ops/mod-builder/install.sh
#
# What it does:
#   1. installs the headless Minecraft prerequisites (Xvfb, Mesa llvmpipe software rendering, minimal X/ALSA libraries)
#      and the tools (git, curl, unzip, flock);
#   2. creates the `minemories` system user and its folders (never root, never the site/API user);
#   3. installs Bun (pinned) into /usr/local;
#   4. installs the JDKs 8, 17, 21 and 25 with the repository's own JDK tool (`bun mod jdk`);
#   5. installs the systemd units and enables the timer.
# Nothing here starts a build: use `systemctl start minemories-mod-release.service` to try one by hand.
set -euo pipefail

BUN_VERSION="${BUN_VERSION:-1.4.3}"
APP_USER="${APP_USER:-minemories}"
APP_HOME="${APP_HOME:-/var/lib/minemories}"
APP_DIR="${APP_DIR:-/opt/minemories}"
ENV_DIR=/etc/minemories
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

log() { printf '\033[1m==> %s\033[0m\n' "$*"; }

if [[ "$(id -u)" -ne 0 ]]; then
	echo "À lancer en root (sudo)." >&2
	exit 1
fi

# ---- 1. Packages -----------------------------------------------------------------------------------------------
log "Paquets système"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# libasound2 became libasound2t64 on Ubuntu 24.04 / Debian 13.
ALSA=libasound2
if apt-cache show libasound2t64 >/dev/null 2>&1; then ALSA=libasound2t64; fi
apt-get install -y --no-install-recommends \
	ca-certificates curl git unzip util-linux \
	xvfb xauth \
	libgl1-mesa-dri libglx-mesa0 libegl1 libgbm1 \
	libxrandr2 libxcursor1 libxi6 libxinerama1 libxxf86vm1 libxrender1 libxtst6 \
	"$ALSA" libopenal1 fontconfig

# ---- 2. User and folders ---------------------------------------------------------------------------------------
log "Utilisateur ${APP_USER}"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
	useradd --system --create-home --home-dir "$APP_HOME" --shell /usr/sbin/nologin "$APP_USER"
fi
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$APP_HOME" "$APP_HOME/.gradle" "$APP_HOME/.local/tools"
install -d -o "$APP_USER" -g "$APP_USER" -m 0755 "$APP_DIR"
install -d -o root -g "$APP_USER" -m 0750 "$ENV_DIR"

# A build of the whole matrix needs a few GiB of disk (Gradle caches, Minecraft assets, JDKs).
AVAILABLE_KB="$(df --output=avail -k "$APP_HOME" | tail -1)"
if [[ "$AVAILABLE_KB" -lt 15000000 ]]; then
	echo "Attention : moins de 15 Go libres dans ${APP_HOME} (caches Gradle, assets Minecraft, JDK)." >&2
fi
# Without swap a JVM peak can wake the OOM killer, which may pick the API. The cgroup limits of the units protect
# the site, but a small swap file absorbs the peaks.
if [[ "$(swapon --show --noheadings | wc -l)" -eq 0 && "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 6000000 ]]; then
	echo "Attention : aucun swap et moins de 6 Go de RAM. Prévoir un fichier de swap de 2 Go (fallocate/mkswap/swapon)." >&2
fi

# ---- 3. Bun ----------------------------------------------------------------------------------------------------
log "Bun ${BUN_VERSION}"
if [[ "$(/usr/local/bin/bun --version 2>/dev/null || true)" != "$BUN_VERSION" ]]; then
	curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s "bun-v${BUN_VERSION}"
fi

# ---- 4. Source tree and JDKs -----------------------------------------------------------------------------------
log "Dépôt dans ${APP_DIR}"
if [[ "$REPO" != "$APP_DIR" ]]; then
	if [[ ! -d "$APP_DIR/.git" ]]; then
		git clone "$(git -C "$REPO" remote get-url origin)" "$APP_DIR"
		chown -R "$APP_USER:$APP_USER" "$APP_DIR"
	fi
fi
runuser -u "$APP_USER" -- env HOME="$APP_HOME" bash -c "cd '$APP_DIR' && bun install --frozen-lockfile"

log "JDK 8, 17, 21, 25"
# The JDK tool of the repository downloads Temurin builds into ~/.local/tools of the build user.
if runuser -u "$APP_USER" -- env HOME="$APP_HOME" bash -c "cd '$APP_DIR' && bun mod --help" 2>/dev/null | grep -q '\bjdk\b'; then
	for major in 8 17 21 25; do
		runuser -u "$APP_USER" -- env HOME="$APP_HOME" bash -c "cd '$APP_DIR' && bun mod jdk install $major"
	done
else
	echo "La commande 'bun mod jdk' n'existe pas encore dans cette branche : installer les JDK 8/17/21/25" >&2
	echo "dans ${APP_HOME}/.local/tools/jdk-<version> (ou exporter MOD_JDK_<majeure> dans ${ENV_DIR}/mod-builder.env)." >&2
fi

# ---- 5. systemd ------------------------------------------------------------------------------------------------
log "Unités systemd"
for unit in minemories-mod.slice minemories-mod-release.service minemories-mod-release.timer \
	minemories-mod-notify-failure@.service; do
	install -m 0644 "$HERE/$unit" "/etc/systemd/system/$unit"
done
if [[ ! -f "$ENV_DIR/mod-builder.env" ]]; then
	install -o root -g "$APP_USER" -m 0640 "$HERE/mod-builder.env.example" "$ENV_DIR/mod-builder.env"
	echo "Renseigner les secrets dans ${ENV_DIR}/mod-builder.env (webhook Discord, S3, jetons)." >&2
fi
systemctl daemon-reload
systemctl enable --now minemories-mod-release.timer
systemctl list-timers minemories-mod-release.timer --no-pager || true

log "Terminé. Essai à la main : systemctl start minemories-mod-release.service && journalctl -fu minemories-mod-release"
