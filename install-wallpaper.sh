#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  AEGIS HTML Wallpaper Installer — Oracle Linux (RHEL/CentOS compatible)
#  Sets an HTML file as an animated live desktop background.
#
#  Usage:  chmod +x install-wallpaper.sh
#          ./install-wallpaper.sh /path/to/your/dt-a-v2.html
# ─────────────────────────────────────────────────────────────────────────────

set -e

HTML_FILE="${1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Colours for output ────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${CYAN}[AEGIS]${NC} $1"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $1"; }
warn() { echo -e "${YELLOW}[ WARN ]${NC} $1"; }
err()  { echo -e "${RED}[ERROR ]${NC} $1"; exit 1; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║      AEGIS Live Wallpaper — Oracle Linux          ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── Validate input ────────────────────────────────────────────────────────────
if [ -z "$HTML_FILE" ]; then
  err "No HTML file specified.\n  Usage: ./install-wallpaper.sh /path/to/wallpaper.html"
fi

if [ ! -f "$HTML_FILE" ]; then
  err "File not found: $HTML_FILE"
fi

# Resolve absolute path
HTML_ABS="$(realpath "$HTML_FILE")"
log "HTML file: $HTML_ABS"

# ── Detect display server ─────────────────────────────────────────────────────
if [ -n "$WAYLAND_DISPLAY" ]; then
  DISPLAY_SERVER="wayland"
  warn "Wayland detected. Will use X11 fallback via XWayland."
elif [ -n "$DISPLAY" ]; then
  DISPLAY_SERVER="x11"
  ok "X11 display detected: $DISPLAY"
else
  err "No display server found. Are you running a desktop session?"
fi

# ── Detect package manager ────────────────────────────────────────────────────
if command -v dnf &>/dev/null; then
  PKG="dnf"
elif command -v yum &>/dev/null; then
  PKG="yum"
else
  err "No supported package manager found (dnf/yum)."
fi
log "Package manager: $PKG"

# ── Check for browser ─────────────────────────────────────────────────────────
BROWSER=""
for b in chromium-browser chromium google-chrome google-chrome-stable; do
  if command -v "$b" &>/dev/null; then
    BROWSER="$b"
    break
  fi
done

if [ -z "$BROWSER" ]; then
  log "No Chromium/Chrome found. Installing chromium..."
  sudo $PKG install -y chromium 2>/dev/null || {
    warn "chromium not in default repos. Trying snap..."
    if command -v snap &>/dev/null; then
      sudo snap install chromium
      BROWSER="chromium"
    else
      err "Could not install a browser. Please install chromium or google-chrome manually."
    fi
  }
  BROWSER="chromium-browser"
  command -v chromium &>/dev/null && BROWSER="chromium"
fi
ok "Browser: $BROWSER"

# ── Install xwinwrap ──────────────────────────────────────────────────────────
# xwinwrap pins a window behind all desktop icons so it acts as wallpaper
if ! command -v xwinwrap &>/dev/null; then
  log "xwinwrap not found. Attempting to install..."

  # Try EPEL / direct install first
  sudo $PKG install -y epel-release 2>/dev/null || true
  sudo $PKG install -y xwinwrap 2>/dev/null || {
    warn "xwinwrap not in repos — building from source..."

    # Install build deps
    sudo $PKG install -y gcc make libX11-devel libXext-devel libXrender-devel \
         libXcomposite-devel libXfixes-devel libXdamage-devel git 2>/dev/null

    BUILD_DIR="/tmp/xwinwrap_build"
    rm -rf "$BUILD_DIR"
    git clone --depth 1 https://github.com/ujjwal96/xwinwrap.git "$BUILD_DIR" 2>/dev/null || {
      # Fallback: minimal C source inline
      mkdir -p "$BUILD_DIR"
      cat > "$BUILD_DIR/xwinwrap.c" << 'CSRC'
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/Xatom.h>
#include <X11/extensions/Xrender.h>
#include <X11/extensions/Xcomposite.h>

int main(int argc, char **argv) {
    Display *dpy = XOpenDisplay(NULL);
    if (!dpy) { fprintf(stderr, "Cannot open display\n"); return 1; }
    int screen = DefaultScreen(dpy);
    int width = 0, height = 0, x = 0, y = 0;
    int i, prog_start = -1;
    int shaped = 0, override = 0, fgs = 0, ni = 0, looped = 0;

    for (i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "-g") && i+1 < argc) {
            sscanf(argv[++i], "%dx%d+%d+%d", &width, &height, &x, &y);
        } else if (!strcmp(argv[i], "--")) {
            prog_start = i + 1; break;
        }
    }
    if (!width)  width  = DisplayWidth(dpy, screen);
    if (!height) height = DisplayHeight(dpy, screen);

    Window root = RootWindow(dpy, screen);
    XSetWindowAttributes attr;
    attr.override_redirect = True;
    attr.background_pixel = 0;
    attr.border_pixel = 0;
    attr.colormap = DefaultColormap(dpy, screen);
    Window win = XCreateWindow(dpy, root, x, y, width, height, 0,
        DefaultDepth(dpy, screen), InputOutput,
        DefaultVisual(dpy, screen),
        CWOverrideRedirect|CWBackPixel|CWBorderPixel|CWColormap, &attr);

    Atom wins[2];
    wins[0] = XInternAtom(dpy, "_NET_WM_WINDOW_TYPE_DESKTOP", False);
    wins[1] = XInternAtom(dpy, "_NET_WM_WINDOW_TYPE_NORMAL",  False);
    XChangeProperty(dpy, win, XInternAtom(dpy,"_NET_WM_WINDOW_TYPE",False),
        XA_ATOM, 32, PropModeReplace, (unsigned char*)wins, 1);
    XLowerWindow(dpy, win);
    XMapWindow(dpy, win);
    XFlush(dpy);

    char wid[32]; sprintf(wid, "0x%lx", win);
    if (prog_start > 0) {
        char **cmd = &argv[prog_start];
        // Replace WID token
        for (int j = 0; cmd[j]; j++)
            if (!strcmp(cmd[j], "-wid")) cmd[j] = wid;
        if (!fork()) { execvp(cmd[0], cmd); exit(1); }
    }
    XEvent e;
    while(1) { XNextEvent(dpy, &e); }
    return 0;
}
CSRC
      gcc "$BUILD_DIR/xwinwrap.c" -o "$BUILD_DIR/xwinwrap" \
          -lX11 -lXext -lXrender -lXcomposite 2>/dev/null || \
        err "Failed to build xwinwrap. Please install it manually."
    }

    cd "$BUILD_DIR"
    make 2>/dev/null || true
    sudo cp xwinwrap /usr/local/bin/
    sudo chmod +x /usr/local/bin/xwinwrap
    ok "xwinwrap built and installed to /usr/local/bin/"
  }
fi
ok "xwinwrap: $(command -v xwinwrap)"

# ── Disable GNOME's own wallpaper (so it doesn't paint over ours) ─────────────
if command -v gsettings &>/dev/null; then
  log "Setting GNOME wallpaper to solid black..."
  gsettings set org.gnome.desktop.background picture-options 'none' 2>/dev/null || true
  gsettings set org.gnome.desktop.background primary-color '#000000'  2>/dev/null || true
  gsettings set org.gnome.desktop.background color-shading-type 'solid' 2>/dev/null || true
  ok "GNOME wallpaper cleared"
fi

# ── Create the wallpaper launcher script ─────────────────────────────────────
LAUNCHER="$HOME/.local/bin/aegis-wallpaper.sh"
mkdir -p "$HOME/.local/bin"

cat > "$LAUNCHER" << LAUNCHER_SCRIPT
#!/bin/bash
# AEGIS Live Wallpaper Launcher
# Auto-generated by install-wallpaper.sh
# HTML: $HTML_ABS

# Kill any existing instance
pkill -f "aegis-wallpaper" 2>/dev/null || true
pkill -f "xwinwrap.*${BROWSER}" 2>/dev/null || true
sleep 0.5

# Wait for display
export DISPLAY=\${DISPLAY:-:0}
export XAUTHORITY=\${XAUTHORITY:-\$HOME/.Xauthority}

# Get screen resolution
RESOLUTION=\$(xdpyinfo 2>/dev/null | grep dimensions | awk '{print \$2}' | head -1)
if [ -z "\$RESOLUTION" ]; then RESOLUTION="1920x1080"; fi
W=\$(echo \$RESOLUTION | cut -dx -f1)
H=\$(echo \$RESOLUTION | cut -dx -f2)

echo "Starting AEGIS wallpaper at \${W}x\${H}..."

exec xwinwrap -g \${W}x\${H}+0+0 -ni -s -nf -b -un -ov -fdt -- \\
  ${BROWSER} \\
    --app="file://${HTML_ABS}" \\
    --window-size=\${W},\${H} \\
    --window-position=0,0 \\
    --disable-infobars \\
    --noerrdialogs \\
    --no-first-run \\
    --disable-translate \\
    --disable-features=TranslateUI \\
    --disable-session-crashed-bubble \\
    --disable-pinch \\
    --overscroll-history-navigation=0 \\
    --disable-background-networking \\
    --disable-sync \\
    --no-default-browser-check \\
    --kiosk \\
    --wid -wid 2>/dev/null
LAUNCHER_SCRIPT

chmod +x "$LAUNCHER"
ok "Launcher script: $LAUNCHER"

# ── Create autostart entry ────────────────────────────────────────────────────
AUTOSTART_DIR="$HOME/.config/autostart"
AUTOSTART_FILE="$AUTOSTART_DIR/aegis-wallpaper.desktop"
mkdir -p "$AUTOSTART_DIR"

cat > "$AUTOSTART_FILE" << DESKTOP_FILE
[Desktop Entry]
Type=Application
Name=AEGIS Live Wallpaper
Comment=Animated HTML wallpaper — AEGIS cyber defence
Exec=$LAUNCHER
Icon=video-display
Terminal=false
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=4
DESKTOP_FILE

ok "Autostart entry: $AUTOSTART_FILE"

# ── Create a stop script ──────────────────────────────────────────────────────
STOP_SCRIPT="$HOME/.local/bin/aegis-wallpaper-stop.sh"
cat > "$STOP_SCRIPT" << 'STOP'
#!/bin/bash
echo "Stopping AEGIS wallpaper..."
pkill -f "aegis-wallpaper" 2>/dev/null
pkill -f "xwinwrap" 2>/dev/null
# Restore GNOME wallpaper prompt
echo "Wallpaper stopped. Use GNOME Settings > Background to restore a static wallpaper."
STOP
chmod +x "$STOP_SCRIPT"
ok "Stop script:     $STOP_SCRIPT"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Installation complete!${NC}"
echo -e "${BOLD}══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Start now:${NC}    $LAUNCHER"
echo -e "  ${CYAN}Stop:${NC}         $STOP_SCRIPT"
echo -e "  ${CYAN}Auto-starts:${NC}  on next login (via $AUTOSTART_FILE)"
echo ""
echo -e "  ${YELLOW}To start immediately, run:${NC}"
echo -e "  ${BOLD}  $LAUNCHER &${NC}"
echo ""

# ── Offer to start now ────────────────────────────────────────────────────────
read -p "$(echo -e "${CYAN}Start the wallpaper now? [Y/n]:${NC} ")" -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
  log "Starting wallpaper..."
  nohup "$LAUNCHER" > /tmp/aegis-wallpaper.log 2>&1 &
  sleep 2
  if pgrep -f "xwinwrap" > /dev/null; then
    ok "Wallpaper is running!"
  else
    warn "Process may not have started. Check /tmp/aegis-wallpaper.log"
    echo ""
    cat /tmp/aegis-wallpaper.log 2>/dev/null || true
  fi
fi

echo ""
