#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  AEGIS Launcher Repair Script
#  Overwrites the installed launcher with a corrected version that:
#    1. Resolves D-Bus before launching Firefox (fixes "channel error" crash)
#    2. Filters tooltip windows from xdotool results (fixes 200x200 window bug)
#
#  Usage:  chmod +x repair-launcher.sh
#          ./repair-launcher.sh
#
#  It reads the existing launcher to get the HTML path and profile path,
#  so you don't need to re-run the full installer.
# ─────────────────────────────────────────────────────────────────────────────
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
ok()  { echo -e "  ${GREEN}[  OK  ]${NC} $1"; }
err() { echo -e "  ${RED}[ERROR ]${NC} $1"; exit 1; }
log() { echo -e "  ${CYAN}[ INFO ]${NC} $1"; }

LAUNCHER="$HOME/.local/bin/aegis-wallpaper.sh"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║         AEGIS Launcher Repair                    ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── Read existing config from old launcher ────────────────────────────────────
[ ! -f "$LAUNCHER" ] && err "Launcher not found at $LAUNCHER — run install-wallpaper.sh first"

HTML_FILE=$(grep  '^HTML_FILE='  "$LAUNCHER" | head -1 | cut -d'"' -f2)
FF_PROFILE=$(grep '^FF_PROFILE=' "$LAUNCHER" | head -1 | cut -d'"' -f2)
FIREFOX=$(grep    '^FIREFOX='    "$LAUNCHER" | head -1 | cut -d'"' -f2)

[ -z "$HTML_FILE"  ] && err "Could not read HTML_FILE from $LAUNCHER"
[ -z "$FF_PROFILE" ] && err "Could not read FF_PROFILE from $LAUNCHER"
[ -z "$FIREFOX"    ] && err "Could not read FIREFOX from $LAUNCHER"

log "HTML file:  $HTML_FILE"
log "Profile:    $FF_PROFILE"
log "Firefox:    $FIREFOX"
echo ""

[ ! -f "$HTML_FILE" ] && err "HTML file does not exist: $HTML_FILE"
ok "HTML file exists"

# ── Back up old launcher ──────────────────────────────────────────────────────
cp "$LAUNCHER" "${LAUNCHER}.bak"
ok "Old launcher backed up to ${LAUNCHER}.bak"

# ── Write corrected launcher ──────────────────────────────────────────────────
CURRENT_USER="$(whoami)"

cat > "$LAUNCHER" << SCRIPT
#!/bin/bash
# AEGIS Live Wallpaper Launcher (repaired)
# Must be run as: ${CURRENT_USER}

HTML_FILE="${HTML_FILE}"
FF_PROFILE="${FF_PROFILE}"
FIREFOX="${FIREFOX}"
LOGFILE="/tmp/aegis-wallpaper.log"

export DISPLAY=\${DISPLAY:-:0}
export GDK_BACKEND=x11
export MOZ_ENABLE_WAYLAND=0
echo "\$(date '+%H:%M:%S') Launcher started  user=\$(whoami)  display=\$DISPLAY" > "\$LOGFILE"

# Validate display
if ! xdpyinfo -display "\$DISPLAY" &>/dev/null 2>&1; then
  echo "\$(date '+%H:%M:%S') ERROR: cannot open display \$DISPLAY" >> "\$LOGFILE"
  echo "ERROR: cannot open display \$DISPLAY"
  exit 1
fi

# ── FIX 1: Resolve D-Bus session bus ─────────────────────────────────────────
# Firefox logs "exiting due to channel error" and crashes when
# DBUS_SESSION_BUS_ADDRESS is not set. This happens when the launcher
# runs outside the normal login session (e.g. autostart, sudo, cron).
# We find the correct address from any process owned by the current user.
if [ -z "\$DBUS_SESSION_BUS_ADDRESS" ]; then
  for pid in \$(pgrep -u "\$(whoami)" 2>/dev/null | head -40); do
    addr=\$(tr '\0' '\n' < /proc/\$pid/environ 2>/dev/null \
            | grep '^DBUS_SESSION_BUS_ADDRESS=' | cut -d= -f2-)
    if [ -n "\$addr" ]; then
      export DBUS_SESSION_BUS_ADDRESS="\$addr"
      echo "\$(date '+%H:%M:%S') D-Bus resolved from PID \$pid" >> "\$LOGFILE"
      break
    fi
  done
fi
if [ -z "\$DBUS_SESSION_BUS_ADDRESS" ]; then
  echo "\$(date '+%H:%M:%S') WARN: D-Bus not found — Firefox may log channel errors" >> "\$LOGFILE"
fi
echo "\$(date '+%H:%M:%S') DBUS=\$DBUS_SESSION_BUS_ADDRESS" >> "\$LOGFILE"

# Kill any previous wallpaper instance
pkill -f "aegis-wallpaper-profile" 2>/dev/null || true
sleep 1

# Screen resolution
RES=\$(xdpyinfo 2>/dev/null | grep dimensions | awk '{print \$2}' | head -1)
[ -z "\$RES" ] && RES="1920x1080"
W=\$(echo \$RES | cut -dx -f1)
H=\$(echo \$RES | cut -dx -f2)
echo "\$(date '+%H:%M:%S') Resolution: \${W}x\${H}" >> "\$LOGFILE"

# Launch Firefox kiosk
\$FIREFOX \\
  --profile "\$FF_PROFILE" \\
  --kiosk \\
  --no-remote \\
  --new-instance \\
  --window-size=\${W},\${H} \\
  "file://\${HTML_FILE}" >> "\$LOGFILE" 2>&1 &
FF_PID=\$!
echo "\$(date '+%H:%M:%S') Firefox PID: \$FF_PID" >> "\$LOGFILE"

# ── FIX 2: Find the MAIN window, not a tooltip ───────────────────────────────
# Firefox creates many internal windows (tooltips, IPC frames) under the same
# PID. xdotool returns ALL of them — the tooltip windows are tiny (200x200).
# We filter by size, keeping only the window closest to full-screen.
MIN_W=\$(( W / 3 ))

find_main_window() {
  local best_wid="" best_area=0
  for wid in \$(xdotool search --pid \$FF_PID 2>/dev/null); do
    geom=\$(xdotool getwindowgeometry "\$wid" 2>/dev/null | grep Geometry | awk '{print \$2}')
    [ -z "\$geom" ] && continue
    ww=\$(echo "\$geom" | cut -dx -f1)
    wh=\$(echo "\$geom" | cut -dx -f2)
    [ "\${ww:-0}" -lt "\$MIN_W" ] 2>/dev/null && continue
    area=\$(( ww * wh ))
    if [ "\$area" -gt "\$best_area" ]; then
      best_area=\$area
      best_wid=\$wid
    fi
  done
  echo "\$best_wid"
}

echo "\$(date '+%H:%M:%S') Waiting for main Firefox window (min width \${MIN_W}px)..." >> "\$LOGFILE"
FF_WID=""
for i in \$(seq 1 40); do
  sleep 0.8
  FF_WID=\$(find_main_window)
  if [ -n "\$FF_WID" ]; then
    GEOM=\$(xdotool getwindowgeometry "\$FF_WID" 2>/dev/null | grep Geometry | awk '{print \$2}')
    echo "\$(date '+%H:%M:%S') Found main window: WID=\$FF_WID  size=\$GEOM" >> "\$LOGFILE"
    break
  fi
done

if [ -z "\$FF_WID" ]; then
  echo "\$(date '+%H:%M:%S') ERROR: no main window found for PID \$FF_PID" >> "\$LOGFILE"
  echo "Could not find Firefox main window — check \$LOGFILE"
  exit 1
fi

# Pin to desktop layer
echo "\$(date '+%H:%M:%S') Pinning WID \$FF_WID to desktop layer..." >> "\$LOGFILE"
xprop -id "\$FF_WID" -f _NET_WM_WINDOW_TYPE 32a \\
  -set _NET_WM_WINDOW_TYPE _NET_WM_WINDOW_TYPE_DESKTOP 2>/dev/null || true
xprop -id "\$FF_WID" -f _NET_WM_STATE 32a \\
  -set _NET_WM_STATE "" 2>/dev/null || true
xdotool windowmove "\$FF_WID" 0 0    2>/dev/null || true
xdotool windowsize "\$FF_WID" \$W \$H 2>/dev/null || true
xdotool windowlower "\$FF_WID"        2>/dev/null || true
if command -v wmctrl &>/dev/null; then
  wmctrl -i -r "\$FF_WID" -b add,below 2>/dev/null || true
  wmctrl -i -r "\$FF_WID" -t -1        2>/dev/null || true
fi

echo "\$(date '+%H:%M:%S') Wallpaper running — PID:\$FF_PID  WID:\$FF_WID" >> "\$LOGFILE"
echo "AEGIS wallpaper running  |  PID: \$FF_PID  |  WID: \$FF_WID"
echo "Log: \$LOGFILE"

# Keep-alive: re-lower main window every 4s
(
  while kill -0 \$FF_PID 2>/dev/null; do
    sleep 4
    CUR=\$(find_main_window)
    [ -n "\$CUR" ] && xdotool windowlower "\$CUR" 2>/dev/null || true
  done
) &

wait \$FF_PID
SCRIPT

chmod +x "$LAUNCHER"
ok "Launcher rewritten with fixes"

# ── Restart wallpaper ─────────────────────────────────────────────────────────
echo ""
log "Stopping old wallpaper instance..."
pkill -f "aegis-wallpaper-profile" 2>/dev/null || true
sleep 2

log "Starting repaired wallpaper..."
nohup "$LAUNCHER" > /tmp/aegis-wallpaper.log 2>&1 &
sleep 8

if pgrep -f "aegis-wallpaper-profile" > /dev/null; then
  ok "Wallpaper is running!"
  echo ""
  # Check the log for D-Bus resolution
  if grep -q "D-Bus resolved" /tmp/aegis-wallpaper.log 2>/dev/null; then
    ok "D-Bus resolved successfully"
  elif grep -q "D-Bus not found" /tmp/aegis-wallpaper.log 2>/dev/null; then
    echo -e "  ${YELLOW}[ WARN ]${NC} D-Bus not resolved — Firefox may still crash"
    echo -e "         Run from your desktop terminal (not SSH) for best results"
  fi
  if grep -q "Found main window" /tmp/aegis-wallpaper.log 2>/dev/null; then
    WIN_INFO=$(grep "Found main window" /tmp/aegis-wallpaper.log | tail -1)
    ok "Main window detected: ${WIN_INFO##*WID=}"
  fi
else
  echo -e "  ${RED}[ERROR ]${NC} Wallpaper still not starting. Log:"
  echo ""
  cat /tmp/aegis-wallpaper.log 2>/dev/null
  echo ""
  echo -e "  ${YELLOW}If log shows 'channel error' still:${NC}"
  echo -e "  ${BOLD}  Run this script from a desktop terminal, not an SSH session${NC}"
  echo -e "  ${YELLOW}If log shows 'cannot open display':${NC}"
  echo -e "  ${BOLD}  sudo -u $(whoami) bash $LAUNCHER${NC}"
fi
echo ""
