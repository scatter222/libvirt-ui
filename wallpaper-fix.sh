#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  AEGIS Wallpaper Diagnostic & Fix Script
#  Checks everything that could cause a white/blank background and fixes it.
#
#  Usage:  chmod +x wallpaper-fix.sh
#          ./wallpaper-fix.sh
# ─────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "  ${GREEN}[  OK  ]${NC} $1"; }
fail() { echo -e "  ${RED}[ FAIL ]${NC} $1"; ISSUES=$((ISSUES+1)); }
warn() { echo -e "  ${YELLOW}[ WARN ]${NC} $1"; WARNINGS=$((WARNINGS+1)); }
fix()  { echo -e "  ${CYAN}[  FIX ]${NC} $1"; FIXES=$((FIXES+1)); }
info() { echo -e "         ${NC} $1"; }

ISSUES=0; WARNINGS=0; FIXES=0
LOGFILE="/tmp/aegis-wallpaper.log"
LAUNCHER="$HOME/.local/bin/aegis-wallpaper.sh"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║         AEGIS Wallpaper Diagnostic & Fix             ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
#  CHECK 1 — Display environment
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${BOLD}── 1. Display Environment ───────────────────────────────────────────${NC}"

if [ -z "$DISPLAY" ]; then
  fail "DISPLAY is not set"
  info "Run this script from a desktop terminal, not an SSH session"
  info "Attempting to find display..."
  for pid in $(pgrep -u "$(whoami)" 2>/dev/null | head -20); do
    d=$(tr '\0' '\n' < /proc/$pid/environ 2>/dev/null | grep '^DISPLAY=' | cut -d= -f2-)
    [ -n "$d" ] && export DISPLAY="$d" && fix "Found DISPLAY=$DISPLAY from process $pid" && break
  done
  [ -z "$DISPLAY" ] && export DISPLAY=":0" && warn "Falling back to DISPLAY=:0"
else
  ok "DISPLAY=$DISPLAY"
fi

if xdpyinfo -display "$DISPLAY" &>/dev/null 2>&1; then
  SCREEN_RES=$(xdpyinfo 2>/dev/null | grep dimensions | awk '{print $2}' | head -1)
  ok "Display reachable — resolution: $SCREEN_RES"
else
  fail "Cannot open display $DISPLAY — remaining checks may be unreliable"
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
#  CHECK 2 — Wallpaper Firefox process
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${BOLD}── 2. Wallpaper Firefox Process ─────────────────────────────────────${NC}"

FF_PID=$(pgrep -f "aegis-wallpaper-profile" | head -1)
if [ -z "$FF_PID" ]; then
  fail "Wallpaper Firefox process is NOT running"
  info "The process died or never started properly"

  # Check log for clues
  if [ -f "$LOGFILE" ]; then
    LAST_ERR=$(grep -i "error\|fail\|cannot\|permission" "$LOGFILE" | tail -3)
    if [ -n "$LAST_ERR" ]; then
      info "Last errors in log:"
      while IFS= read -r line; do info "  $line"; done <<< "$LAST_ERR"
    fi
    info "Last log entries:"
    tail -5 "$LOGFILE" | while IFS= read -r line; do info "  $line"; done
  fi

  warn "Will attempt to restart wallpaper at end of script"
  NEED_RESTART=true
else
  ok "Firefox wallpaper process running (PID: $FF_PID)"

  # Check it's not using too much memory (sign of crash loop)
  MEM_MB=$(ps -o rss= -p $FF_PID 2>/dev/null | awk '{printf "%.0f", $1/1024}')
  if [ -n "$MEM_MB" ] && [ "$MEM_MB" -gt 2000 ]; then
    warn "Firefox using ${MEM_MB}MB RAM — unusually high"
  else
    ok "Memory usage: ${MEM_MB}MB"
  fi
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
#  CHECK 3 — Firefox window and its properties
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${BOLD}── 3. Firefox Window Properties ─────────────────────────────────────${NC}"

if [ -n "$FF_PID" ]; then
  FF_WID=$(xdotool search --pid "$FF_PID" 2>/dev/null | tail -1)

  if [ -z "$FF_WID" ]; then
    fail "Cannot find Firefox window ID (xdotool search returned nothing)"
    info "Firefox may have opened but not created a visible window yet"
    info "Try running this script again in 10 seconds"
  else
    ok "Firefox window ID: $FF_WID"

    # Check window type — must be DESKTOP not NORMAL
    WIN_TYPE=$(xprop -id "$FF_WID" _NET_WM_WINDOW_TYPE 2>/dev/null | grep -o 'WINDOW_TYPE_[A-Z]*' | head -1)
    if echo "$WIN_TYPE" | grep -q "DESKTOP"; then
      ok "Window type: $WIN_TYPE (correct)"
    else
      fail "Window type: ${WIN_TYPE:-NOT SET} — should be WINDOW_TYPE_DESKTOP"
      info "This is why it's not behaving as a wallpaper"
      fix "Fixing window type..."
      xprop -id "$FF_WID" -f _NET_WM_WINDOW_TYPE 32a \
        -set _NET_WM_WINDOW_TYPE _NET_WM_WINDOW_TYPE_DESKTOP 2>/dev/null \
        && ok "Window type set to DESKTOP" \
        || warn "Could not set window type"
    fi

    # Check window state — should NOT be above/fullscreen/sticky
    WIN_STATE=$(xprop -id "$FF_WID" _NET_WM_STATE 2>/dev/null)
    if echo "$WIN_STATE" | grep -qiE "ABOVE|FULLSCREEN"; then
      fail "Window has state that will keep it on top: $WIN_STATE"
      fix "Clearing window state..."
      xprop -id "$FF_WID" -f _NET_WM_STATE 32a -set _NET_WM_STATE "" 2>/dev/null
    else
      ok "Window state looks clean"
    fi

    # Check window position and size
    WIN_GEOM=$(xdotool getwindowgeometry "$FF_WID" 2>/dev/null)
    WIN_POS=$(echo "$WIN_GEOM" | grep Position | awk '{print $2}')
    WIN_SIZE=$(echo "$WIN_GEOM" | grep Geometry | awk '{print $2}')
    if [ "$WIN_POS" != "0,0" ] && [ -n "$WIN_POS" ]; then
      fail "Window position is $WIN_POS — should be 0,0"
      fix "Moving window to 0,0..."
      xdotool windowmove "$FF_WID" 0 0 2>/dev/null
    else
      ok "Window position: ${WIN_POS:-0,0}"
    fi

    if [ -n "$SCREEN_RES" ] && [ -n "$WIN_SIZE" ] && [ "$WIN_SIZE" != "$SCREEN_RES" ]; then
      fail "Window size $WIN_SIZE doesn't match screen $SCREEN_RES"
      W=$(echo "$SCREEN_RES" | cut -dx -f1)
      H=$(echo "$SCREEN_RES" | cut -dx -f2)
      fix "Resizing window to ${W}x${H}..."
      xdotool windowsize "$FF_WID" "$W" "$H" 2>/dev/null
    else
      ok "Window size: ${WIN_SIZE:-matches screen}"
    fi

    # Lower window to desktop layer
    xdotool windowlower "$FF_WID" 2>/dev/null || true
    command -v wmctrl &>/dev/null && {
      wmctrl -i -r "$FF_WID" -b add,below 2>/dev/null || true
      wmctrl -i -r "$FF_WID" -t -1 2>/dev/null || true
    }
    ok "Window lowered to desktop layer"
  fi
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
#  CHECK 4 — HTML file
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${BOLD}── 4. HTML Wallpaper File ───────────────────────────────────────────${NC}"

# Extract HTML path from launcher script
HTML_PATH=""
if [ -f "$LAUNCHER" ]; then
  HTML_PATH=$(grep '^HTML_FILE=' "$LAUNCHER" | head -1 | cut -d'"' -f2)
fi

if [ -z "$HTML_PATH" ]; then
  fail "Could not determine HTML file path from launcher"
  info "Launcher expected at: $LAUNCHER"
  [ ! -f "$LAUNCHER" ] && info "Launcher file does not exist"
elif [ ! -f "$HTML_PATH" ]; then
  fail "HTML file does not exist: $HTML_PATH"
  info "The wallpaper HTML was probably moved or deleted"
  info "Re-run install-wallpaper.sh pointing to the correct file path"
else
  ok "HTML file exists: $HTML_PATH"
  FILE_SIZE=$(du -h "$HTML_PATH" | cut -f1)
  ok "File size: $FILE_SIZE"

  # Check file is readable
  if [ ! -r "$HTML_PATH" ]; then
    fail "HTML file is not readable — check permissions"
    fix "Fixing permissions..."
    chmod 644 "$HTML_PATH" && ok "Permissions fixed"
  else
    ok "File is readable"
  fi

  # Check SELinux context won't block Firefox from reading it
  if command -v getenforce &>/dev/null && [ "$(getenforce 2>/dev/null)" != "Disabled" ]; then
    FCTX=$(ls -Z "$HTML_PATH" 2>/dev/null | awk '{print $1}')
    if echo "$FCTX" | grep -qE "user_home_t|httpd_sys_content_t|staff_home_t|unconfined"; then
      ok "SELinux context looks Firefox-readable: $FCTX"
    else
      fail "SELinux context may block Firefox: $FCTX"
      fix "Fixing SELinux context..."
      chcon -t user_home_t "$HTML_PATH" 2>/dev/null \
        && ok "Context set to user_home_t" \
        || warn "Could not fix SELinux context — try: chcon -t user_home_t $HTML_PATH"
    fi
  fi

  # Check Firefox can actually load it by looking at file:// URL in the log
  if [ -f "$LOGFILE" ]; then
    if grep -q "file://" "$LOGFILE" 2>/dev/null || grep -q "$(basename "$HTML_PATH")" "$LOGFILE" 2>/dev/null; then
      ok "Log confirms Firefox was given the correct file URL"
    fi
  fi
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
#  CHECK 5 — GNOME background colour (most common cause of white screen)
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${BOLD}── 5. GNOME Background (most common white-screen cause) ─────────────${NC}"

if command -v gsettings &>/dev/null; then
  BG_OPTIONS=$(gsettings get org.gnome.desktop.background picture-options 2>/dev/null)
  BG_COLOR=$(gsettings get org.gnome.desktop.background primary-color 2>/dev/null | tr -d "'")
  BG_COLOR2=$(gsettings get org.gnome.desktop.background secondary-color 2>/dev/null | tr -d "'")
  BG_URI=$(gsettings get org.gnome.desktop.background picture-uri 2>/dev/null | tr -d "'")

  ok "picture-options: $BG_OPTIONS"
  ok "primary-color:   $BG_COLOR"

  # If picture-options is not 'none', GNOME will paint over Firefox
  if [ "$BG_OPTIONS" != "'none'" ] && [ "$BG_OPTIONS" != "none" ]; then
    fail "picture-options is '$BG_OPTIONS' — GNOME will paint a wallpaper image on top of Firefox"
    fix "Setting picture-options to none..."
    gsettings set org.gnome.desktop.background picture-options 'none'
  fi

  # If primary-color is white (or close to it), that's what you're seeing
  if echo "$BG_COLOR" | grep -qiE "^#fff|^#ffffff|^white|^rgb\(255"; then
    fail "primary-color is WHITE ($BG_COLOR) — this is painting over Firefox"
    fix "Setting background colour to black..."
    gsettings set org.gnome.desktop.background primary-color '#000000'
    gsettings set org.gnome.desktop.background secondary-color '#000000'
    gsettings set org.gnome.desktop.background color-shading-type 'solid'
    ok "Background set to solid black"
  else
    ok "primary-color is $BG_COLOR (not white — good)"
  fi

  # Double-check colour-shading-type
  SHADE_TYPE=$(gsettings get org.gnome.desktop.background color-shading-type 2>/dev/null)
  if [ "$SHADE_TYPE" != "'solid'" ] && [ "$SHADE_TYPE" != "solid" ]; then
    warn "color-shading-type is $SHADE_TYPE — setting to solid to avoid gradient overlay"
    gsettings set org.gnome.desktop.background color-shading-type 'solid'
  fi

  # Check picture-uri-dark too (GNOME 42+ dark mode)
  BG_URI_DARK=$(gsettings get org.gnome.desktop.background picture-uri-dark 2>/dev/null | tr -d "'")
  if [ -n "$BG_URI_DARK" ] && [ "$BG_URI_DARK" != "" ] && \
     [ "$BG_URI_DARK" != "''" ] && echo "$BG_URI_DARK" | grep -qv "^$"; then
    warn "picture-uri-dark is set ($BG_URI_DARK) — clearing for dark mode"
    gsettings set org.gnome.desktop.background picture-uri-dark '' 2>/dev/null || true
  fi
else
  warn "gsettings not available — skipping GNOME background checks"
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
#  CHECK 6 — Nautilus desktop layer
#  Nautilus (GNOME file manager) renders the desktop icons layer and can
#  paint over _NET_WM_WINDOW_TYPE_DESKTOP windows on some GNOME versions.
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${BOLD}── 6. Nautilus Desktop Layer ────────────────────────────────────────${NC}"

if pgrep -x nautilus &>/dev/null; then
  NAUTILUS_DESKTOP=$(gsettings get org.gnome.desktop.background show-desktop-icons 2>/dev/null)
  if [ "$NAUTILUS_DESKTOP" = "true" ]; then
    warn "Nautilus is managing the desktop layer — this can paint over the wallpaper"
    fix "Disabling Nautilus desktop layer..."
    gsettings set org.gnome.desktop.background show-desktop-icons false 2>/dev/null || true
    nautilus -q 2>/dev/null || true
    ok "Nautilus desktop layer disabled"
    info "Desktop icons will no longer appear (this is expected for a wallpaper system)"
  else
    ok "Nautilus is running but desktop icons are already disabled"
  fi

  # Check if Nautilus manages desktop via org.gnome.nautilus.desktop (older GNOME)
  if gsettings get org.gnome.nautilus.desktop show-desktop 2>/dev/null | grep -q "true"; then
    fix "Disabling Nautilus desktop (older GNOME key)..."
    gsettings set org.gnome.nautilus.desktop show-desktop false 2>/dev/null || true
  fi
else
  ok "Nautilus desktop layer not active"
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
#  CHECK 7 — Firefox kiosk profile and content
#  Temporarily raises the Firefox window so we can confirm it's showing
#  the HTML (not a white page, crash page, or blocked file:// URI).
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${BOLD}── 7. Firefox Content Check ─────────────────────────────────────────${NC}"

if [ -n "$FF_WID" ]; then
  info "Briefly raising Firefox window to check content (3 seconds)..."
  xdotool windowraise "$FF_WID" 2>/dev/null || true
  sleep 3

  # Check for Firefox crash/error indicators in the title or properties
  WIN_TITLE=$(xdotool getwindowname "$FF_WID" 2>/dev/null)
  if echo "$WIN_TITLE" | grep -qiE "problem|crash|error|not found|404"; then
    fail "Firefox window title suggests a problem: '$WIN_TITLE'"
  elif echo "$WIN_TITLE" | grep -qiE "firefox|mozilla"; then
    ok "Window title: '$WIN_TITLE'"
    info "If you saw a blank white page just now, Firefox loaded but the HTML may have an issue"
    info "If you saw the AEGIS animation, the issue is purely the layering — fixed above"
  else
    info "Window title: '${WIN_TITLE:-empty}'"
  fi

  info "Lowering Firefox back to desktop layer..."
  xdotool windowlower "$FF_WID" 2>/dev/null || true
  command -v wmctrl &>/dev/null && {
    wmctrl -i -r "$FF_WID" -b add,below 2>/dev/null || true
  }
  ok "Firefox lowered back to desktop layer"

  # Check if profile has userChrome.css (hides browser UI)
  FF_PROFILE=$(grep '^FF_PROFILE=' "$LAUNCHER" 2>/dev/null | cut -d'"' -f2)
  if [ -n "$FF_PROFILE" ]; then
    if [ -f "$FF_PROFILE/chrome/userChrome.css" ]; then
      ok "Firefox kiosk profile has userChrome.css (hides browser UI)"
    else
      warn "userChrome.css missing from profile — browser toolbar may be visible"
      info "Profile path: $FF_PROFILE"
    fi
    if [ -f "$FF_PROFILE/user.js" ]; then
      ok "Firefox profile user.js present"
    else
      warn "user.js missing from Firefox profile"
    fi
  fi
else
  warn "No Firefox window found — skipping content check"
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
#  CHECK 8 — Log file analysis
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${BOLD}── 8. Log File ──────────────────────────────────────────────────────${NC}"

if [ ! -f "$LOGFILE" ]; then
  fail "Log file not found: $LOGFILE"
  info "Wallpaper was likely never launched, or launcher path is wrong"
else
  ok "Log file exists: $LOGFILE"
  LOG_AGE=$(( $(date +%s) - $(stat -c %Y "$LOGFILE" 2>/dev/null || echo 0) ))
  if [ "$LOG_AGE" -lt 300 ]; then
    ok "Log was updated ${LOG_AGE}s ago (recent)"
  else
    warn "Log is ${LOG_AGE}s old — wallpaper may not have run recently"
  fi

  # Look for known errors
  ERRORS=$(grep -iE "error|cannot|permission denied|no such file|failed|exit" \
           "$LOGFILE" 2>/dev/null | grep -v "^$")
  if [ -n "$ERRORS" ]; then
    fail "Errors found in log:"
    while IFS= read -r line; do info "  $line"; done <<< "$ERRORS"
  else
    ok "No errors found in log"
  fi

  echo ""
  info "Last 10 log lines:"
  tail -10 "$LOGFILE" 2>/dev/null | while IFS= read -r line; do info "  $line"; done
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
#  RESTART if process was dead
# ─────────────────────────────────────────────────────────────────────────────
if [ "${NEED_RESTART:-false}" = "true" ]; then
  echo -e "${BOLD}── Restarting Wallpaper ─────────────────────────────────────────────${NC}"
  echo ""
  if [ -f "$LAUNCHER" ]; then
    fix "Launching wallpaper process..."
    nohup bash "$LAUNCHER" > "$LOGFILE" 2>&1 &
    sleep 5
    if pgrep -f "aegis-wallpaper-profile" > /dev/null; then
      ok "Wallpaper process started"
    else
      fail "Wallpaper still not starting — check log: $LOGFILE"
    fi
  else
    fail "Launcher not found at $LAUNCHER — re-run install-wallpaper.sh"
  fi
  echo ""
fi

# ─────────────────────────────────────────────────────────────────────────────
#  SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
if [ "$ISSUES" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
  echo -e "${GREEN}  Everything looks good!${NC}"
  echo ""
  echo -e "  If the background is still white, try:"
  echo -e "  ${BOLD}  1. Log out and log back in${NC}  (GNOME resets wallpaper on login)"
  echo -e "  ${BOLD}  2. killall gnome-shell && gnome-shell --replace &${NC}"
elif [ "$ISSUES" -eq 0 ]; then
  echo -e "${YELLOW}  No hard failures — $WARNINGS warning(s) — $FIXES fix(es) applied${NC}"
  echo ""
  echo -e "  If background is still white after fixes:"
  echo -e "  ${BOLD}  Log out and back in${NC}  to let GNOME pick up the changes"
else
  echo -e "${RED}  $ISSUES issue(s) found${NC}  |  $WARNINGS warning(s)  |  $FIXES fix(es) applied"
  echo ""
  if grep -q "HTML file does not exist" <<< "$(declare -f fail 2>/dev/null)"; then
    echo -e "  ${RED}→ HTML file missing — re-run install-wallpaper.sh${NC}"
  fi
  if grep -q "process is NOT running" <<< "$(declare -f fail 2>/dev/null)"; then
    echo -e "  ${RED}→ Firefox not running — check log: $LOGFILE${NC}"
  fi
fi
echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Fixes applied this run: $FIXES${NC}"
echo -e "  ${CYAN}Log file: $LOGFILE${NC}"
echo -e "  ${CYAN}Re-run this script if the background is still wrong after fixes.${NC}"
echo ""
