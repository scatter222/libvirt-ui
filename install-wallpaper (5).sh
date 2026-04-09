#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  AEGIS HTML Wallpaper Installer — Oracle Linux / RHEL / CentOS
#
#  Usage:  chmod +x install-wallpaper.sh
#          ./install-wallpaper.sh /path/to/dt-a-v3-dynamic.html
# ─────────────────────────────────────────────────────────────────────────────
set -e
HTML_FILE="${1}"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${CYAN}[AEGIS]${NC} $1"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $1"; }
warn() { echo -e "${YELLOW}[ WARN ]${NC} $1"; }
err()  { echo -e "${RED}[ERROR ]${NC} $1"; exit 1; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║    AEGIS Live Wallpaper — Oracle Linux / RHEL     ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── Validate input ────────────────────────────────────────────────────────────
[ -z "$HTML_FILE" ] && err "No HTML file.\n  Usage: $0 /path/to/wallpaper.html"
[ ! -f "$HTML_FILE" ] && err "File not found: $HTML_FILE"
HTML_ABS="$(realpath "$HTML_FILE")"
log "HTML file: $HTML_ABS"

# ── Root re-exec ──────────────────────────────────────────────────────────────
# X11 display credentials belong to the desktop session user, not root.
# Re-exec the entire installer as that user so we get their full environment
# (DISPLAY, XAUTHORITY, DBUS_SESSION_BUS_ADDRESS) automatically.
if [ "$(id -u)" -eq 0 ]; then
  DESKTOP_USER=""

  # 1. loginctl — most reliable on systemd (Oracle Linux 7+)
  if command -v loginctl &>/dev/null; then
    DESKTOP_USER=$(loginctl list-sessions --no-legend 2>/dev/null \
      | awk '{print $3}' | grep -v '^root$' | head -1)
  fi

  # 2. Owner of the Xorg / Xwayland process
  if [ -z "$DESKTOP_USER" ]; then
    XPID=$(pgrep -x Xorg 2>/dev/null || pgrep -x X 2>/dev/null || \
           pgrep -f "Xwayland" 2>/dev/null | head -1)
    [ -n "$XPID" ] && \
      DESKTOP_USER=$(ps -o user= -p "$XPID" 2>/dev/null | tr -d ' ')
  fi

  # 3. First non-root user with an active session
  if [ -z "$DESKTOP_USER" ]; then
    DESKTOP_USER=$(who 2>/dev/null | awk '{print $1}' | grep -v '^root$' | head -1)
  fi

  if [ -n "$DESKTOP_USER" ] && [ "$DESKTOP_USER" != "root" ]; then
    log "Detected desktop user: ${BOLD}$DESKTOP_USER${NC}"
    log "Re-running installer as $DESKTOP_USER ..."
    echo ""
    exec sudo -u "$DESKTOP_USER" bash "$0" "$HTML_ABS"
    err "Could not re-exec as $DESKTOP_USER.\nRun manually: sudo -u $DESKTOP_USER bash $0 $HTML_ABS"
  else
    warn "Running as root — could not find desktop user."
    warn "If this fails: sudo -u <your-username> bash $0 $HTML_ABS"
  fi
fi

# ── Display check ─────────────────────────────────────────────────────────────
if [ -n "$WAYLAND_DISPLAY" ]; then
  warn "Wayland detected — forcing Firefox onto XWayland."
  export DISPLAY="${DISPLAY:-:0}"
  export GDK_BACKEND=x11
  export MOZ_ENABLE_WAYLAND=0
elif [ -n "$DISPLAY" ]; then
  ok "Display: $DISPLAY  (user: $(whoami))"
else
  err "No display found. Run from a desktop terminal session."
fi

# ── Package manager ───────────────────────────────────────────────────────────
if   command -v dnf &>/dev/null; then PKG="dnf"
elif command -v yum &>/dev/null; then PKG="yum"
else err "No dnf/yum found."; fi
log "Package manager: $PKG"

# ── Firefox ───────────────────────────────────────────────────────────────────
FIREFOX=""
for b in firefox firefox-esr; do
  command -v "$b" &>/dev/null && { FIREFOX="$b"; break; }
done
[ -z "$FIREFOX" ] && err "Firefox not found. Install: sudo $PKG install firefox"
FF_VER=$($FIREFOX --version 2>/dev/null | awk '{print $3}')
ok "Firefox: $FIREFOX (v$FF_VER)"

# ── Window tools ──────────────────────────────────────────────────────────────
log "Checking window management tools..."
sudo $PKG install -y epel-release 2>/dev/null || true
for pkg in xdotool xorg-x11-utils wmctrl; do
  rpm -q "$pkg" &>/dev/null || \
    { sudo $PKG install -y "$pkg" 2>/dev/null && ok "Installed $pkg"; } || \
    warn "$pkg not available (non-fatal)"
done

# ── SELinux ───────────────────────────────────────────────────────────────────
SELINUX_STATE=$(getenforce 2>/dev/null || echo "Disabled")
log "SELinux: $SELINUX_STATE"
if [ "$SELINUX_STATE" != "Disabled" ]; then
  restorecon -v "$HTML_ABS" 2>/dev/null || true
  chcon -t user_home_t "$HTML_ABS" 2>/dev/null || true
  ok "SELinux context set on HTML file"
  getsebool mozilla_read_content &>/dev/null && \
    sudo setsebool -P mozilla_read_content on 2>/dev/null && \
    ok "mozilla_read_content = on" || true
  echo ""
  echo -e "  ${YELLOW}If wallpaper is blocked by SELinux after launch:${NC}"
  echo -e "  ${BOLD}  sudo ausearch -m AVC -ts recent | audit2allow -M aegis-wallpaper${NC}"
  echo -e "  ${BOLD}  sudo semodule -i aegis-wallpaper.pp${NC}"
  echo ""
fi

# ── Clear GNOME static wallpaper ──────────────────────────────────────────────
if command -v gsettings &>/dev/null; then
  gsettings set org.gnome.desktop.background picture-options  'none'    2>/dev/null || true
  gsettings set org.gnome.desktop.background primary-color    '#000000' 2>/dev/null || true
  gsettings set org.gnome.desktop.background color-shading-type 'solid' 2>/dev/null || true
  ok "GNOME wallpaper cleared"
fi

# ── Firefox kiosk profile ─────────────────────────────────────────────────────
FF_PROFILE="$HOME/.aegis-wallpaper-profile"
mkdir -p "$FF_PROFILE/chrome"
cat > "$FF_PROFILE/user.js" << 'USERJS'
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("datareporting.healthreport.uploadEnabled", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("browser.rights.3.shown", true);
user_pref("startup.homepage_welcome_url", "");
user_pref("security.sandbox.content.level", 0);
user_pref("dom.security.https_only_mode", false);
USERJS
cat > "$FF_PROFILE/chrome/userChrome.css" << 'CSS'
#navigator-toolbox, #TabsToolbar, #nav-bar,
#PersonalToolbar, #toolbar-menubar, #titlebar,
#browser-bottombox, .browser-toolbar { display:none !important; }
CSS
ok "Firefox profile: $FF_PROFILE"

# ── Create launcher ───────────────────────────────────────────────────────────
mkdir -p "$HOME/.local/bin"
LAUNCHER="$HOME/.local/bin/aegis-wallpaper.sh"
CURRENT_USER="$(whoami)"

cat > "$LAUNCHER" << SCRIPT
#!/bin/bash
# AEGIS Live Wallpaper Launcher — Oracle Linux
# Must be run as: ${CURRENT_USER}

HTML_FILE="${HTML_ABS}"
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
  echo "Run as your desktop user: sudo -u ${CURRENT_USER} bash \$0"
  exit 1
fi

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

# Wait for window — PID only, NEVER search by name (would match user's real Firefox)
FF_WID=""
for i in \$(seq 1 30); do
  sleep 0.8
  FF_WID=\$(xdotool search --pid \$FF_PID --onlyvisible 2>/dev/null | tail -1)
  [ -n "\$FF_WID" ] && break
done
if [ -z "\$FF_WID" ]; then
  for i in \$(seq 1 10); do
    sleep 1
    FF_WID=\$(xdotool search --pid \$FF_PID 2>/dev/null | tail -1)
    [ -n "\$FF_WID" ] && break
  done
fi

if [ -z "\$FF_WID" ]; then
  echo "\$(date '+%H:%M:%S') ERROR: window not found for PID \$FF_PID" >> "\$LOGFILE"
  echo "Could not find Firefox window — check \$LOGFILE"
  exit 1
fi
echo "\$(date '+%H:%M:%S') Window ID: \$FF_WID" >> "\$LOGFILE"

# Pin to desktop layer
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

# Keep-alive: re-lower every 4s
(
  while kill -0 \$FF_PID 2>/dev/null; do
    sleep 4
    xdotool windowlower "\$FF_WID" 2>/dev/null || break
  done
) &

wait \$FF_PID
SCRIPT

chmod +x "$LAUNCHER"

# Set SELinux context on launcher
if [ "$SELINUX_STATE" != "Disabled" ]; then
  chcon -t bin_t "$LAUNCHER" 2>/dev/null || \
  restorecon "$LAUNCHER"    2>/dev/null || true
  ok "SELinux context set on launcher"
fi
ok "Launcher: $LAUNCHER"

# ── Stop script ───────────────────────────────────────────────────────────────
STOP="$HOME/.local/bin/aegis-wallpaper-stop.sh"
cat > "$STOP" << 'STOPSCRIPT'
#!/bin/bash
echo "Stopping AEGIS wallpaper..."
pkill -f "aegis-wallpaper-profile" 2>/dev/null || true
pkill -f "aegis-wallpaper"         2>/dev/null || true
command -v gsettings &>/dev/null && {
  gsettings set org.gnome.desktop.background picture-options 'none'
  gsettings set org.gnome.desktop.background primary-color '#111111'
}
echo "Done."
STOPSCRIPT
chmod +x "$STOP"
ok "Stop script: $STOP"

# ── Autostart ─────────────────────────────────────────────────────────────────
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/aegis-wallpaper.desktop" << DESKTOP
[Desktop Entry]
Type=Application
Name=AEGIS Live Wallpaper
Exec=$LAUNCHER
Terminal=false
Hidden=false
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=5
DESKTOP
ok "Autostart entry created"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  All done!${NC}"
echo -e "${BOLD}══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}User:${NC}         $(whoami)"
echo -e "  ${CYAN}Start:${NC}        $LAUNCHER"
echo -e "  ${CYAN}Stop:${NC}         $STOP"
echo -e "  ${CYAN}Log:${NC}          /tmp/aegis-wallpaper.log"
echo -e "  ${CYAN}Auto-starts:${NC}  on next login (5s delay)"
echo -e "  ${CYAN}SELinux:${NC}      $SELINUX_STATE"
echo ""

read -p "$(echo -e "${CYAN}Start the wallpaper now? [Y/n]: ${NC}")" -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
  log "Launching..."
  nohup "$LAUNCHER" > /tmp/aegis-wallpaper.log 2>&1 &
  sleep 6
  if pgrep -f "aegis-wallpaper-profile" > /dev/null; then
    ok "Wallpaper is running!"
  else
    warn "Did not start. Log:"
    echo ""
    cat /tmp/aegis-wallpaper.log 2>/dev/null
    echo ""
    [ "$SELINUX_STATE" = "Enforcing" ] && \
      echo -e "  ${YELLOW}Try: sudo setenforce 0 && $LAUNCHER &${NC}"
  fi
fi
echo ""
