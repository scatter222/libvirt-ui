#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  .NET 8 SDK + NuGet Installer — Oracle Linux
#  Installs .NET 8 (LTS) and configures NuGet to point at a local Artifactory.
#
#  Usage:  chmod +x install-dotnet.sh
#          sudo ./install-dotnet.sh
# ─────────────────────────────────────────────────────────────────────────────

# ═════════════════════════════════════════════════════════════════════════════
#  ✏️  EDIT THIS SECTION BEFORE RUNNING
# ═════════════════════════════════════════════════════════════════════════════

# Your Artifactory NuGet v3 feed URL.
# In Artifactory: Admin → Repositories → your NuGet repo → Set Me Up
# It will look like one of these:
#   https://artifactory.yourorg.com/artifactory/api/nuget/v3/<repo-name>/index.json
#   https://artifactory.yourorg.com/artifactory/<repo-name>/
ARTIFACTORY_URL="https://artifactory.yourorg.com/artifactory/api/nuget/v3/nuget-local/index.json"

# Friendly label shown in `dotnet nuget list source`
SOURCE_NAME="JCOMS-Artifactory"

# Credentials — leave blank to be prompted interactively.
# For CI/CD pipelines use env vars instead (see bottom of script).
ARTIFACTORY_USER=""
ARTIFACTORY_PASS=""

# Set to "true" on air-gapped / classified networks to block nuget.org entirely
DISABLE_NUGET_ORG="false"

# ═════════════════════════════════════════════════════════════════════════════

set -e
DOTNET_VERSION="8"   # locked to .NET 8 LTS — change only if the project moves

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${CYAN}[DOTNET]${NC} $1"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $1"; }
warn() { echo -e "${YELLOW}[ WARN ]${NC} $1"; }
err()  { echo -e "${RED}[ERROR ]${NC} $1"; exit 1; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   .NET 8 LTS + NuGet — Oracle Linux Installer        ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Package manager ───────────────────────────────────────────────────────────
if   command -v dnf &>/dev/null; then PKG="dnf"
elif command -v yum &>/dev/null; then PKG="yum"
else err "No dnf/yum found."; fi

# ── Oracle Linux version ──────────────────────────────────────────────────────
OL_VER=$(rpm -q --queryformat '%{VERSION}' oraclelinux-release 2>/dev/null \
         | cut -d. -f1 || echo "8")
log "Oracle Linux $OL_VER — installing .NET $DOTNET_VERSION LTS"

# ─────────────────────────────────────────────────────────────────────────────
#  STEP 1 — Install .NET 8 SDK
#
#  .NET 8 is available directly from Oracle Linux AppStream on OL8/OL9 —
#  no Microsoft repo needed. The SDK includes the runtime, ASP.NET Core
#  runtime, and the dotnet CLI (which includes dotnet nuget).
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}── Step 1: Install .NET $DOTNET_VERSION SDK ─────────────────────────────────${NC}"
echo ""

SDK_PKG="dotnet-sdk-${DOTNET_VERSION}.0"

if dotnet --version 2>/dev/null | grep -q "^8\."; then
  ok ".NET 8 SDK already installed: $(dotnet --version)"
else
  # Enable AppStream if needed (OL8)
  if [ "$OL_VER" = "8" ]; then
    sudo $PKG config-manager --set-enabled ol8_appstream 2>/dev/null || true
  fi

  log "Installing $SDK_PKG from AppStream..."
  if ! sudo $PKG install -y "$SDK_PKG" 2>/dev/null; then
    warn "AppStream install failed — trying Microsoft package repo..."

    # Fallback: Microsoft repo (needed if AppStream doesn't carry .NET 8 yet)
    if [ "$OL_VER" = "9" ]; then
      MSFT_REPO="https://packages.microsoft.com/config/rhel/9/packages-microsoft-prod.rpm"
    else
      MSFT_REPO="https://packages.microsoft.com/config/rhel/8/packages-microsoft-prod.rpm"
    fi

    sudo rpm --import https://packages.microsoft.com/keys/microsoft.asc 2>/dev/null || true
    sudo $PKG install -y "$MSFT_REPO" 2>/dev/null || \
      sudo rpm -Uvh "$MSFT_REPO" 2>/dev/null || true
    sudo $PKG update -y
    sudo $PKG install -y "$SDK_PKG" || \
      err "Could not install $SDK_PKG — check your network / repo access."
  fi
fi

# Verify
command -v dotnet &>/dev/null || err "dotnet not found after install."
ok ".NET SDK: $(dotnet --version)"
echo ""
log "Installed SDKs:"
dotnet --list-sdks
echo ""
log "Installed runtimes:"
dotnet --list-runtimes
echo ""

# ─────────────────────────────────────────────────────────────────────────────
#  STEP 2 — NuGet is bundled — nothing to separately install
#
#  On Linux, NuGet functionality lives in `dotnet nuget`. There is no
#  separate nuget.exe package needed for SDK-style (.NET 8) projects.
#  The old standalone nuget.exe (Mono-based) is only needed for legacy
#  packages.config-style projects from the .NET Framework era.
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}── Step 2: NuGet ────────────────────────────────────────────────────${NC}"
echo ""
ok "dotnet nuget is bundled with the SDK — no separate install needed"
log "NuGet version: $(dotnet nuget --version 2>/dev/null || echo 'see dotnet --version')"

# ─────────────────────────────────────────────────────────────────────────────
#  STEP 3 — Configure Artifactory as the NuGet source
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}── Step 3: Configure Artifactory NuGet feed ─────────────────────────${NC}"
echo ""

# Check URL is not still the placeholder
if echo "$ARTIFACTORY_URL" | grep -q "yourorg.com"; then
  warn "ARTIFACTORY_URL in CONFIG is still the placeholder."
  echo -e "  Enter your Artifactory NuGet feed URL, or press Enter to skip:"
  read -r INPUT_URL
  if [ -n "$INPUT_URL" ]; then
    ARTIFACTORY_URL="$INPUT_URL"
  else
    warn "Skipping Artifactory config — edit ARTIFACTORY_URL in the script and re-run."
    SKIP_FEED=true
  fi
fi

if [ "${SKIP_FEED:-false}" != "true" ]; then

  # Prompt for credentials if not set
  if [ -z "$ARTIFACTORY_USER" ]; then
    echo -e "  Artifactory username (Enter to skip for anonymous/token-in-URL):"
    read -r ARTIFACTORY_USER
  fi
  if [ -n "$ARTIFACTORY_USER" ] && [ -z "$ARTIFACTORY_PASS" ]; then
    echo -e "  Artifactory password or API token (hidden):"
    read -rs ARTIFACTORY_PASS; echo ""
  fi

  # Remove old source with same name to avoid "already exists" error
  dotnet nuget remove source "$SOURCE_NAME" 2>/dev/null || true

  # Add the feed
  if [ -n "$ARTIFACTORY_USER" ] && [ -n "$ARTIFACTORY_PASS" ]; then
    dotnet nuget add source "$ARTIFACTORY_URL" \
      --name "$SOURCE_NAME" \
      --username "$ARTIFACTORY_USER" \
      --password "$ARTIFACTORY_PASS" \
      --store-password-in-clear-text   # required on Linux — no credential manager
    ok "Feed added with credentials"
  else
    dotnet nuget add source "$ARTIFACTORY_URL" --name "$SOURCE_NAME"
    ok "Feed added (anonymous / API key embedded in URL)"
  fi

  # Air-gapped: disable nuget.org
  if [ "$DISABLE_NUGET_ORG" = "true" ]; then
    dotnet nuget disable source "nuget.org" 2>/dev/null || true
    ok "nuget.org disabled"
  fi

  echo ""
  log "Active NuGet sources:"
  dotnet nuget list source

fi

# ─────────────────────────────────────────────────────────────────────────────
#  STEP 4 — Write nuget.config for the project
#
#  This file belongs in the root of your repo. Committing it means every
#  developer and every CI runner picks up the right feed automatically,
#  without needing to configure anything on their machine.
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}── Step 4: Write project nuget.config ───────────────────────────────${NC}"
echo ""

NUGET_CONFIG="./nuget.config"

cat > "$NUGET_CONFIG" << NUGETEOF
<?xml version="1.0" encoding="utf-8"?>
<!--
  NuGet configuration for this project.
  Commit this file — it ensures all developers and CI pipelines use the
  same feed without any per-machine setup.

  ✏️  Replace the Artifactory URL if it ever changes.
  ✏️  For credentials in CI, use environment variables (see notes below).
-->
<configuration>

  <packageSources>
    <!--
      <clear/> removes all globally configured sources (including nuget.org).
      This is the correct setting for air-gapped / internal-only environments.
      If your project also needs public NuGet packages, remove <clear/> or
      add a nuget.org entry below it.
    -->
    <clear />
    <add key="${SOURCE_NAME}"
         value="${ARTIFACTORY_URL}" />

    <!-- Uncomment to also allow public packages from nuget.org:
    <add key="nuget.org"
         value="https://api.nuget.org/v3/index.json"
         protocolVersion="3" />
    -->
  </packageSources>

  <!--
    Credentials block.
    On developer machines these are written by `dotnet nuget add source`
    into ~/.nuget/NuGet/NuGet.Config (not here), so you don't commit passwords.

    For CI/CD pipelines (Jenkins, GitLab CI, GitHub Actions etc.) use
    environment variables instead of storing credentials in this file:

      Option A — NuGet credential provider env vars:
        NUGET_CREDENTIALPROVIDER_SESSIONTOKENCACHE_ENABLED=true
        VSS_NUGET_EXTERNAL_FEED_ENDPOINTS={"endpointCredentials":[
          {"endpoint":"${ARTIFACTORY_URL}",
           "username":"ci-user",
           "password":"<api-token>"}
        ]}

      Option B — Pass directly to restore:
        dotnet restore --source "${ARTIFACTORY_URL}" \
          /p:NuGetUserName=ci-user \
          /p:NuGetPassword=\$ARTIFACTORY_TOKEN

      Option C — Write a temp NuGet.Config at pipeline start:
        dotnet nuget add source "${ARTIFACTORY_URL}" \
          --name "${SOURCE_NAME}" \
          --username ci-user \
          --password "\$ARTIFACTORY_TOKEN" \
          --store-password-in-clear-text
  -->

  <config>
    <!-- Cache packages to avoid re-downloading. Override with NUGET_PACKAGES env var. -->
    <add key="globalPackagesFolder" value="~/.nuget/packages" />
  </config>

</configuration>
NUGETEOF

ok "Written: $NUGET_CONFIG"
echo ""
echo -e "  ${YELLOW}→ Commit this file to your repo root.${NC}"
echo -e "  ${YELLOW}→ Credentials are NOT stored in it — they live in ~/.nuget/NuGet/NuGet.Config${NC}"
echo -e "  ${YELLOW}  or are injected as env vars in your CI pipeline.${NC}"

# ─────────────────────────────────────────────────────────────────────────────
#  STEP 5 — Test the feed connection
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}── Step 5: Test feed connection ─────────────────────────────────────${NC}"
echo ""

if [ "${SKIP_FEED:-false}" != "true" ]; then
  TMP=$(mktemp -d)
  cat > "$TMP/test.csproj" << 'EOF'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
</Project>
EOF
  cp "$NUGET_CONFIG" "$TMP/nuget.config"

  log "Running test restore against $SOURCE_NAME..."
  if dotnet restore "$TMP/test.csproj" --no-cache 2>&1 | grep -v "^$"; then
    ok "Feed is reachable and responding"
  else
    warn "Restore returned a non-zero exit — feed may need credentials or URL is wrong"
    warn "Check with:  dotnet nuget list source"
  fi
  rm -rf "$TMP"
fi

# ─────────────────────────────────────────────────────────────────────────────
#  SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Done!${NC}"
echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}.NET SDK:${NC}        $(dotnet --version)"
echo -e "  ${CYAN}Feed:${NC}            $SOURCE_NAME"
echo -e "  ${CYAN}Feed URL:${NC}        $ARTIFACTORY_URL"
echo -e "  ${CYAN}nuget.org:${NC}       $([ "$DISABLE_NUGET_ORG" = "true" ] && echo "DISABLED" || echo "enabled")"
echo -e "  ${CYAN}Project config:${NC}  ./nuget.config  (commit this)"
echo ""
echo -e "${BOLD}  Quick reference:${NC}"
echo -e "  ${BOLD}dotnet nuget list source${NC}                  — show all configured feeds"
echo -e "  ${BOLD}dotnet restore${NC}                            — restore packages"
echo -e "  ${BOLD}dotnet restore --source \"<url>\"${NC}           — restore from specific feed"
echo -e "  ${BOLD}dotnet add package <PackageName>${NC}          — add a package"
echo -e "  ${BOLD}dotnet nuget push <pkg.nupkg> -s <name>${NC}  — push a package to Artifactory"
echo ""
echo -e "${BOLD}  Artifactory setup checklist:${NC}"
echo -e "  ${YELLOW}□${NC} In Artifactory, ensure you have a ${BOLD}NuGet${NC} type repository (not Generic)"
echo -e "  ${YELLOW}□${NC} The feed URL should end in ${BOLD}/index.json${NC} for NuGet v3 protocol"
echo -e "  ${YELLOW}□${NC} Your user/API token needs ${BOLD}read${NC} permission on the repo (and ${BOLD}deploy${NC} to push)"
echo -e "  ${YELLOW}□${NC} On air-gapped systems, proxy/mirror any public packages you need into"
echo -e "     Artifactory as a ${BOLD}remote repository${NC} with a local cache"
echo ""
