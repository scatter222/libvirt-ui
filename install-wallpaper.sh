#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  AEGIS HTML Wallpaper Installer — Oracle Linux (Firefox + SELinux edition)
#
#  Usage:  chmod +x install-wallpaper.sh
#          ./install-wallpaper.sh /path/to/dt-a-v2.html
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
echo -e "${BOLD}║   AEGIS Live Wallpaper — Oracle Linux / Firefox   ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── Validate ─────────────────────────────────────────────────────────────────
[ -z "$HTML_FILE" ] && err "No HTML file.\n  Usage: $0 /path/to/wallpaper.html"
[ ! -f "$HTML_FILE" ] && err "File not found: $HTML_FILE"
HTML_ABS="$(realpath "$HTML_FILE")"
log "HTML file: $HTML_ABS"

# ── Display server ────────────────────────────────────────────────────────────
if [ -n "$WAYLAND_DISPLAY" ]; then
  warn "Wayland detected — forcing Firefox onto XWayland (required)."
  export DISPLAY="${DISPLAY:-:0}"
  export GDK_BACKEND=x11
  export MOZ_ENABLE_WAYLAND=0
elif [ -n "$DISPLAY" ]; then
  ok "X11 display: $DISPLAY"
else
  err "No display found. Run this from a desktop session."
fi

# ── Package manager ───────────────────────────────────────────────────────────
if   command -v dnf &>/dev/null; then PKG="dnf"
elif command -v yum &>/dev/null; then PKG="yum"
else err "No dnf/yum found."
fi
log "Package manager: $PKG"

# ── Firefox ───────────────────────────────────────────────────────────────────
FIREFOX=""
for b in firefox firefox-esr; do
  command -v "$b" &>/dev/null && { FIREFOX="$b"; break; }
done
[ -z "$FIREFOX" ] && err "Firefox not found. Install with: sudo $PKG install firefox"
FF_VER=$($FIREFOX --version 2>/dev/null | awk '{print $3}')
ok "Firefox: $FIREFOX  (v$FF_VER)"
FF_MAJOR=$(echo "$FF_VER" | cut -d. -f1)
[ "$FF_MAJOR" -lt 71 ] 2>/dev/null && warn "Firefox $FF_VER is old. Kiosk mode needs v71+."

# ── Dependencies ──────────────────────────────────────────────────────────────
# xdotool  — move/resize/lower the Firefox window programmatically
# xprop    — set _NET_WM_WINDOW_TYPE_DESKTOP so WM treats it as wallpaper
# wmctrl   — add 'below' hint and pin to all virtual desktops
log "Checking/installing window management tools..."
sudo $PKG install -y epel-release 2>/dev/null || true
for pkg in xdotool xorg-x11-utils wmctrl; do
  if ! rpm -q "$pkg" &>/dev/null; then
    sudo $PKG install -y "$pkg" 2>/dev/null && ok "Installed $pkg" || warn "Could not install $pkg (non-fatal)"
  else
    ok "$pkg already installed"
  fi
done

# ═════════════════════════════════════════════════════════════════════════════
#  SELINUX
#  Oracle Linux ships with SELinux enforcing. Three things need fixing:
#    1. The HTML file needs a context Firefox can read
#    2. Our launcher scripts need a context that allows execution
#    3. Firefox may need a policy module allowing it to read local files
# ═════════════════════════════════════════════════════════════════════════════
SELINUX_STATE=$(getenforce 2>/dev/null || echo "Disabled")
log "SELinux state: ${BOLD}$SELINUX_STATE${NC}"

if [ "$SELINUX_STATE" != "Disabled" ]; then

  # 1. HTML file context — must be readable by the user_t / mozilla_t domain
  log "Fixing SELinux context on HTML file..."
  # restorecon will apply the default policy context first
  restorecon -v "$HTML_ABS" 2>/dev/null || true
  # Check what it got; if not a type Firefox can read, force user_home_t
  FCTX=$(ls -Z "$HTML_ABS" 2>/dev/null | awk '{print $1}')
  log "File context after restorecon: $FCTX"
  if ! echo "$FCTX" | grep -qE "user_home_t|mozilla|httpd_sys_content_t|staff_home_t"; then
    chcon -t user_home_t "$HTML_ABS" 2>/dev/null \
      && ok "Forced context: user_home_t on $HTML_ABS" \
      || warn "Could not set file context. Firefox may be blocked from reading the file."
  else
    ok "File context is Firefox-readable: $FCTX"
  fi

  # 2. mozilla_read_content boolean — allows Firefox to read local content
  if getsebool mozilla_read_content &>/dev/null; then
    BOOL=$(getsebool mozilla_read_content | awk '{print $3}')
    if [ "$BOOL" != "on" ]; then
      log "Enabling SELinux boolean: mozilla_read_content..."
      sudo setsebool -P mozilla_read_content on 2>/dev/null \
        && ok "mozilla_read_content = on" \
        || warn "Could not enable boolean (try: sudo setsebool -P mozilla_read_content on)"
    else
      ok "mozilla_read_content already on"
    fi
  fi

  # 3. Scan audit log and auto-generate a policy for any existing denials
  if command -v ausearch &>/dev/null && command -v audit2allow &>/dev/null; then
    log "Scanning audit log for relevant AVC denials..."
    DENIALS=$(ausearch -m AVC -ts recent 2>/dev/null \
      | grep -iE "firefox|xdotool|xprop|wmctrl" || true)
    if [ -n "$DENIALS" ]; then
      warn "Found AVC denials — generating SELinux policy module..."
      echo "$DENIALS" | audit2allow -M aegis-wallpaper 2>/dev/null \
        && sudo semodule -i aegis-wallpaper.pp 2>/dev/null \
        && ok "Policy module 'aegis-wallpaper' applied" \
        || warn "Could not auto-apply policy."
      rm -f aegis-wallpaper.te aegis-wallpaper.pp 2>/dev/null || true
    else
      ok "No relevant AVC denials found yet (re-run after first launch if needed)"
    fi
  else
    warn "audit2allow / ausearch not found — cannot auto-generate policy"
    warn "Install with: sudo $PKG install audit policycoreutils-python-utils"
  fi

  # 4. Informational block
  echo ""
  echo -e "  ${YELLOW}┌─ SELinux manual fixes (if wallpaper fails) ───────────────┐${NC}"
  echo -e "  ${YELLOW}│${NC}                                                           ${YELLOW}│${NC}"
  echo -e "  ${YELLOW}│${NC}  A) Temporary permissive mode (resets on reboot):        ${YELLOW}│${NC}"
  echo -e "  ${YELLOW}│${NC}     ${BOLD}sudo setenforce 0${NC}                                    ${YELLOW}│${NC}"
  echo -e "  ${YELLOW}│${NC}                                                           ${YELLOW}│${NC}"
  echo -e "  ${YELLOW}│${NC}  B) Make Firefox domain permissive permanently:           ${YELLOW}│${NC}"
  echo -e "  ${YELLOW}│${NC}     ${BOLD}sudo semanage permissive -a mozilla_t${NC}               ${YELLOW}│${NC}"
  echo -e "  ${YELLOW}│${NC}                                                           ${YELLOW}│${NC}"
  echo -e "  ${YELLOW}│${NC}  C) Generate policy from audit log after first run:       ${YELLOW}│${NC}"
  echo -e "  ${YELLOW}│${NC}     ${BOLD}sudo ausearch -m AVC -ts recent \\${NC}                   ${YELLOW}│${NC}"
  echo -e "  ${YELLOW}│${NC}     ${BOLD}  | audit2allow -M aegis-wallpaper${NC}                   ${YELLOW}│${NC}"
  echo -e "  ${YELLOW}│${NC}     ${BOLD}sudo semodule -i aegis-wallpaper.pp${NC}                  ${YELLOW}│${NC}"
  echo -e "  ${YELLOW}│${NC}                                                           ${YELLOW}│${NC}"
  echo -e "  ${YELLOW}│${NC}  D) Check what's being blocked:                           ${YELLOW}│${NC}"
  echo -e "  ${YELLOW}│${NC}     ${BOLD}sudo ausearch -m AVC -ts recent | grep firefox${NC}      ${YELLOW}│${NC}"
  echo -e "  ${YELLOW}└───────────────────────────────────────────────────────────┘${NC}"
  echo ""
fi

# ── Disable GNOME static wallpaper ────────────────────────────────────────────
if command -v gsettings &>/dev/null; then
  log "Clearing GNOME static wallpaper..."
  gsettings set org.gnome.desktop.background picture-options  'none'    2>/dev/null || true
  gsettings set org.gnome.desktop.background primary-color    '#000000' 2>/dev/null || true
  gsettings set org.gnome.desktop.background color-shading-type 'solid' 2>/dev/null || true
  ok "GNOME background set to solid black"
fi

# ── Create Firefox profile (strips all browser UI) ────────────────────────────
FF_PROFILE="$HOME/.aegis-wallpaper-profile"
log "Creating Firefox kiosk profile..."
mkdir -p "$FF_PROFILE/chrome"

cat > "$FF_PROFILE/user.js" << 'USERJS'
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("datareporting.healthreport.uploadEnabled", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.sessionstore.enabled", false);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("browser.rights.3.shown", true);
user_pref("startup.homepage_welcome_url", "");
user_pref("startup.homepage_welcome_url.additional", "");
user_pref("security.sandbox.content.level", 0);
user_pref("dom.security.https_only_mode", false);
USERJS

cat > "$FF_PROFILE/chrome/userChrome.css" << 'CSS'
/* Hide all Firefox UI elements */
#navigator-toolbox, #TabsToolbar, #nav-bar,
#PersonalToolbar, #toolbar-menubar, #titlebar,
#browser-bottombox, .browser-toolbar { display:none !important; }
CSS

ok "Firefox profile: $FF_PROFILE"

# ── Create launcher ───────────────────────────────────────────────────────────
mkdir -p "$HOME/.local/bin"
LAUNCHER="$HOME/.local/bin/aegis-wallpaper.sh"

# Bake resolved values directly into the generated script
cat > "$LAUNCHER" << SCRIPT
#!/bin/bash
# AEGIS Live Wallpaper — Firefox launcher
# Generated by install-wallpaper.sh — edit paths here if you move files

HTML_FILE="${HTML_ABS}"
FF_PROFILE="${FF_PROFILE}"
FIREFOX="${FIREFOX}"
LOGFILE="/tmp/aegis-wallpaper.log"

# Force X11 (works on both X11 and Wayland/XWayland)
export DISPLAY=\${DISPLAY:-:0}
export XAUTHORITY=\${XAUTHORITY:-\$HOME/.Xauthority}
export GDK_BACKEND=x11
export MOZ_ENABLE_WAYLAND=0

# Kill existing instance
pkill -f "aegis-wallpaper-profile" 2>/dev/null || true
sleep 1

# Screen resolution
RES=\$(xdpyinfo 2>/dev/null | grep dimensions | awk '{print \$2}' | head -1)
[ -z "\$RES" ] && RES="1920x1080"
W=\$(echo \$RES | cut -dx -f1)
H=\$(echo \$RES | cut -dx -f2)
echo "\$(date '+%H:%M:%S') Starting AEGIS wallpaper at \${W}x\${H}" > "\$LOGFILE"

# ── Launch Firefox kiosk ──────────────────────────────────────────────────────
\$FIREFOX \\
  --profile "\$FF_PROFILE" \\
  --kiosk \\
  --no-remote \\
  --new-instance \\
  --window-size=\${W},\${H} \\
  "file://\${HTML_FILE}" >> "\$LOGFILE" 2>&1 &
FF_PID=\$!
echo "\$(date '+%H:%M:%S') Firefox PID: \$FF_PID" >> "\$LOGFILE"

# ── Wait for window to appear (up to 16 seconds) ──────────────────────────────
FF_WID=""
for i in \$(seq 1 20); do
  sleep 0.8
  FF_WID=\$(xdotool search --pid \$FF_PID --onlyvisible 2>/dev/null | tail -1)
  [ -n "\$FF_WID" ] && break
done
# Fallback: search by title
[ -z "\$FF_WID" ] && FF_WID=\$(xdotool search --name "Mozilla Firefox" 2>/dev/null | tail -1)

if [ -z "\$FF_WID" ]; then
  echo "\$(date '+%H:%M:%S') ERROR: Could not find Firefox window" >> "\$LOGFILE"
  echo "Could not find Firefox window — check: \$LOGFILE"
  exit 1
fi
echo "\$(date '+%H:%M:%S') Firefox window ID: \$FF_WID" >> "\$LOGFILE"

# ── Pin to desktop layer ──────────────────────────────────────────────────────
# Set window type: DESKTOP = behind everything, no taskbar entry
xprop -id "\$FF_WID" -f _NET_WM_WINDOW_TYPE 32a \\
  -set _NET_WM_WINDOW_TYPE _NET_WM_WINDOW_TYPE_DESKTOP 2>/dev/null || true

# Clear any state flags (fullscreen, above, sticky) that fight us
xprop -id "\$FF_WID" -f _NET_WM_STATE 32a -set _NET_WM_STATE "" 2>/dev/null || true

# Exact size and position
xdotool windowmove "\$FF_WID" 0 0 2>/dev/null || true
xdotool windowsize "\$FF_WID" \$W \$H 2>/dev/null || true

# Lower to bottom of the stacking order
xdotool windowlower "\$FF_WID" 2>/dev/null || true

# wmctrl: add 'below' state + pin to all virtual desktops
if command -v wmctrl &>/dev/null; then
  wmctrl -i -r "\$FF_WID" -b add,below 2>/dev/null || true
  wmctrl -i -r "\$FF_WID" -t -1        2>/dev/null || true
fi

echo "\$(date '+%H:%M:%S') Pinned to desktop layer" >> "\$LOGFILE"
echo "AEGIS wallpaper running  |  PID: \$FF_PID  |  WID: \$FF_WID"
echo "Log: \$LOGFILE"

# ── Keep-alive: re-lower every 4s in case something pulls it up ───────────────
(
  while kill -0 \$FF_PID 2>/dev/null; do
    sleep 4
    xdotool windowlower "\$FF_WID" 2>/dev/null || break
  done
  echo "\$(date '+%H:%M:%S') Firefox exited" >> "\$LOGFILE"
) &

wait \$FF_PID
SCRIPT

chmod +x "$LAUNCHER"

# Fix SELinux context on launcher so it can execute at login
if [ "$SELINUX_STATE" != "Disabled" ]; then
  chcon -t bin_t "$LAUNCHER" 2>/dev/null || restorecon "$LAUNCHER" 2>/dev/null || true
  ok "SELinux context set on launcher"
fi
ok "Launcher: $LAUNCHER"

# ── Autostart ─────────────────────────────────────────────────────────────────
AUTOSTART="$HOME/.config/autostart"
mkdir -p "$AUTOSTART"
cat > "$AUTOSTART/aegis-wallpaper.desktop" << DESKTOP
[Desktop Entry]
Type=Application
Name=AEGIS Live Wallpaper
Comment=Animated HTML wallpaper
Exec=$LAUNCHER
Icon=video-display
Terminal=false
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=5
DESKTOP
ok "Autostart entry created"

# ── Stop script ───────────────────────────────────────────────────────────────
STOP="$HOME/.local/bin/aegis-wallpaper-stop.sh"
cat > "$STOP" << 'STOPSCRIPT'
#!/bin/bash
echo "Stopping AEGIS wallpaper..."
pkill -f "aegis-wallpaper-profile" 2>/dev/null || true
pkill -f "aegis-wallpaper"         2>/dev/null || true
command -v gsettings &>/dev/null && \
  gsettings set org.gnome.desktop.background picture-options 'none'
echo "Done. Use GNOME Settings > Background to restore a static wallpaper."
STOPSCRIPT
chmod +x "$STOP"
ok "Stop script: $STOP"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  All done!${NC}"
echo -e "${BOLD}══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Start:${NC}        $LAUNCHER"
echo -e "  ${CYAN}Stop:${NC}         $STOP"
echo -e "  ${CYAN}Log:${NC}          /tmp/aegis-wallpaper.log"
echo -e "  ${CYAN}Auto-starts:${NC}  on next login (5s delay)"
echo -e "  ${CYAN}SELinux:${NC}      $SELINUX_STATE"
echo ""

read -p "$(echo -e "${CYAN}Start the wallpaper now? [Y/n]: ${NC}")" -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
  log "Launching Firefox wallpaper..."
  nohup "$LAUNCHER" > /tmp/aegis-wallpaper.log 2>&1 &
  sleep 6
  if pgrep -f "aegis-wallpaper-profile" > /dev/null; then
    ok "Wallpaper is running!"
    echo -e "  ${CYAN}tail -f /tmp/aegis-wallpaper.log${NC}"
  else
    warn "Firefox didn't start cleanly. Log:"
    echo ""
    cat /tmp/aegis-wallpaper.log 2>/dev/null || true
    echo ""
    if [ "$SELINUX_STATE" = "Enforcing" ]; then
      echo -e "  ${YELLOW}Likely SELinux. Quick fix — run these then try again:${NC}"
      echo -e "  ${BOLD}  sudo setenforce 0${NC}   # temporary"
      echo -e "  ${BOLD}  $LAUNCHER &${NC}"
    fi
  fi
fi
echo ""
