#!/usr/bin/env python3
"""
Generate libvirt-ui tools.yaml entries from REMnux's online documentation.

Discovers REMnux 'Discover the Tools' category pages dynamically (via
sitemap.xml, falling back to crawling the index page) so the script
doesn't break when REMnux reorganises URLs. Each page is parsed for
tool headings and emitted as a YAML entry matching the schema used by
config/tools.yaml. The same tool appearing in multiple REMnux
categories is collapsed into a single entry whose tags accumulate.

Usage:
    pip install requests beautifulsoup4 PyYAML

    # Print to stdout for inspection:
    python scripts/generate-remnux-tools.py

    # Write to a fresh file:
    python scripts/generate-remnux-tools.py --output remnux-tools.yaml

    # Merge into the live tools.yaml (de-dups by id, keeps existing entries):
    python scripts/generate-remnux-tools.py \\
        --merge config/tools.yaml --output config/tools.yaml

    # Skip the sitemap and use a manual URL list (one per line, anything
    # ending in '/discover-the-tools/<slug>'):
    python scripts/generate-remnux-tools.py --urls-file my-urls.txt

Python 3.6+. Uses only typing.* generics so it doesn't depend on PEP 585
(list[...], dict[...]) which is 3.9+ only.

Known limitations:
  * REMnux's mkdocs structure occasionally changes. If parsing yields too
    few results, inspect parse_category() and adjust the heading filters.
  * Every tool defaults to a CLI launch (type: terminal, requiresSudo:
    false). Hand-tune GUI tools (ghidra, cutter, ...) after merging.
  * REMnux's docs list a description per tool but rarely a canonical command
    line. quickStart is best-effort -- the first code block under the
    heading, or `<command> --help` as a placeholder.
"""

import argparse
import re
import sys
import xml.etree.ElementTree as ET
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

try:
    import requests
    import yaml
    from bs4 import BeautifulSoup
except ImportError as exc:  # pragma: no cover
    sys.exit(
        "Missing dependency: {}. "
        "Install with: pip install requests beautifulsoup4 PyYAML".format(
            getattr(exc, "name", exc)
        )
    )


DOCS_ROOT = "https://docs.remnux.org"
SITEMAP_URL = DOCS_ROOT + "/sitemap.xml"
INDEX_URL = DOCS_ROOT + "/discover-the-tools/"

# Map the top-level slug under /discover-the-tools/<slug>/... to a libvirt-ui
# category that already exists in config/tools.yaml plus an extra tag that
# keeps the REMnux grouping visible in the UI. Slugs not listed here are
# still scraped but assigned to "reverse-engineering" with a "remnux" tag.
CATEGORY_MAP = {
    "examine-static-properties":        ("reverse-engineering", "static-properties"),
    "statically-analyze-code":          ("reverse-engineering", "static-analysis"),
    "dynamically-reverse-engineer-code": ("reverse-engineering", "dynamic-analysis"),
    "perform-memory-forensics":         ("forensics",           "memory"),
    "explore-network-interactions":     ("forensics",           "network"),
    "investigate-system-interactions":  ("forensics",           "system"),
    "analyze-documents":                ("forensics",           "documents"),
    "analyze-email-messages":           ("forensics",           "email"),
    "handle-data-and-code":             ("reverse-engineering", "data-handling"),
    "gather-and-analyze-data":          ("recon",               "threat-intel"),
}  # type: Dict[str, Tuple[str, str]]

# Headings that look like tool names but aren't. Intentionally conservative.
NON_TOOL_HEADINGS = {
    "general",
    "introduction",
    "see also",
    "overview",
    "approach",
    "guidance",
    "specific formats",
    "disassemblers and debuggers",
    "references",
    "prerequisites",
    "contents",
    "tools",
    "categories",
}

COMMAND_RE = re.compile(r"^[a-z0-9][a-z0-9._+\-]*$")


@dataclass
class Tool:
    id: str
    name: str
    display_name: str
    description: str
    category: str
    tags: List[str] = field(default_factory=list)
    command: str = ""
    quick_start: str = ""
    require_sudo: bool = False

    def to_yaml_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "displayName": self.display_name,
            "description": self.description,
            "category": self.category,
            "tags": sorted(set(self.tags)),
            "launch": {
                "type": "terminal",
                "command": self.command,
                "requiresSudo": self.require_sudo,
            },
            "documentation": {
                "quickStart": self.quick_start or "{} --help".format(self.command),
                "examples": [
                    {"description": "Show help", "command": "{} --help".format(self.command)}
                ],
            },
        }


def slugify(name):
    # type: (str) -> str
    s = name.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s)
    return s.strip("-")


def extract_command(name, first_code_line):
    # type: (str, Optional[str]) -> str
    if first_code_line:
        stripped = first_code_line.strip()
        token = stripped.split()[0] if stripped else ""
        if COMMAND_RE.match(token):
            return token
    first = name.strip().split()[0]
    cmd = re.sub(r"[^a-z0-9._+\-]", "", first.lower())
    return cmd or slugify(name)


def looks_like_tool_heading(text):
    # type: (str) -> bool
    cleaned = text.strip().lower()
    if not cleaned or len(cleaned) > 80:
        return False
    if cleaned in NON_TOOL_HEADINGS:
        return False
    if cleaned.endswith(":"):
        return False
    if not re.search(r"[a-z]", cleaned):
        return False
    return True


def fetch(url):
    # type: (str) -> str
    print("  fetching {}".format(url), file=sys.stderr)
    r = requests.get(url, timeout=30, headers={"User-Agent": "libvirt-ui-tools-gen/1.0"})
    r.raise_for_status()
    return r.text


# ---- URL discovery -----------------------------------------------------------

def category_slug_for(url):
    # type: (str) -> Optional[str]
    """Return the top-level slug under /discover-the-tools/, or None if the URL
    is the index itself or unrelated."""
    path = urlparse(url).path
    m = re.search(r"/discover-the-tools/([^/]+)", path)
    if not m:
        return None
    slug = m.group(1)
    # The bare index page has no slug; treat it as not a category page.
    if not slug or slug in {"", "index.html"}:
        return None
    return slug


def discover_urls_via_sitemap():
    # type: () -> List[str]
    """Pull every /discover-the-tools/* URL from the mkdocs sitemap."""
    try:
        xml_text = fetch(SITEMAP_URL)
    except requests.RequestException as e:
        print("  ! sitemap fetch failed: {}".format(e), file=sys.stderr)
        return []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        print("  ! sitemap parse failed: {}".format(e), file=sys.stderr)
        return []

    # sitemap.xml uses the sitemaps.org namespace; handle with a wildcard so we
    # don't have to hardcode the namespace URI.
    locs = [el.text.strip() for el in root.iter() if el.tag.endswith("}loc") or el.tag == "loc"]
    urls = []
    for u in locs:
        if not u:
            continue
        if "/discover-the-tools/" in u and category_slug_for(u) is not None:
            urls.append(u)
    return urls


def discover_urls_via_index():
    # type: () -> List[str]
    """Fallback: parse the 'Discover the Tools' index page for in-section links."""
    try:
        html = fetch(INDEX_URL)
    except requests.RequestException as e:
        print("  ! index fetch failed: {}".format(e), file=sys.stderr)
        return []
    soup = BeautifulSoup(html, "html.parser")
    urls = set()
    for a in soup.find_all("a", href=True):
        full = urljoin(INDEX_URL, a["href"]).split("#", 1)[0].rstrip("/") + "/"
        if "/discover-the-tools/" in full and category_slug_for(full) is not None:
            urls.add(full)
    return sorted(urls)


def discover_urls():
    # type: () -> List[str]
    urls = discover_urls_via_sitemap()
    if urls:
        print("  sitemap returned {} candidate URLs".format(len(urls)), file=sys.stderr)
        return urls
    print("  falling back to crawling the index page", file=sys.stderr)
    urls = discover_urls_via_index()
    print("  index crawl returned {} candidate URLs".format(len(urls)), file=sys.stderr)
    return urls


# ---- parsing -----------------------------------------------------------------

def parse_category(html, ui_category, remnux_tag):
    # type: (str, str, str) -> Iterable[Tool]
    soup = BeautifulSoup(html, "html.parser")
    article = soup.find("article") or soup

    for header in article.find_all(["h2", "h3"]):
        name = header.get_text(" ", strip=True)
        if not looks_like_tool_heading(name):
            continue

        description_parts = []  # type: List[str]
        first_code = None       # type: Optional[str]
        for sib in header.find_next_siblings():
            if sib.name in {"h1", "h2", "h3"}:
                break
            if sib.name == "p":
                description_parts.append(sib.get_text(" ", strip=True))
            elif sib.name in {"pre", "code"} and first_code is None:
                code = sib.get_text("\n", strip=True)
                if code:
                    first_code = code.splitlines()[0]

        description = " ".join(description_parts).strip()
        if not description or len(description) < 10:
            continue

        command = extract_command(name, first_code)
        if not command:
            continue

        yield Tool(
            id=slugify(name),
            name=name,
            display_name=name,
            description=description[:300],
            category=ui_category,
            tags=["malware-analysis", remnux_tag, "remnux"],
            command=command,
            quick_start=first_code or "{} --help".format(command),
        )


def scrape_all(urls):
    # type: (List[str]) -> List[Tool]
    collected = OrderedDict()  # type: Dict[str, Tool]
    unknown_slugs = set()  # type: set

    for url in urls:
        slug = category_slug_for(url)
        if slug is None:
            continue
        ui_cat, tag = CATEGORY_MAP.get(slug, ("reverse-engineering", "remnux"))
        if slug not in CATEGORY_MAP:
            unknown_slugs.add(slug)

        try:
            html = fetch(url)
        except requests.RequestException as e:
            print("  ! skipping {}: {}".format(url, e), file=sys.stderr)
            continue

        for tool in parse_category(html, ui_cat, tag):
            existing = collected.get(tool.id)
            if existing is None:
                collected[tool.id] = tool
            else:
                existing.tags = sorted(set(existing.tags + tool.tags))

    if unknown_slugs:
        print(
            "  note: tagged with default category for unknown REMnux slugs: {}"
            .format(", ".join(sorted(unknown_slugs))),
            file=sys.stderr,
        )
    return list(collected.values())


# ---- output ------------------------------------------------------------------

def merge_into_tools_yaml(existing_path, new_tools, output_path):
    # type: (str, List[Tool], str) -> None
    with open(existing_path, "r", encoding="utf-8") as f:
        doc = yaml.safe_load(f) or {}
    doc.setdefault("tools", [])

    existing_ids = {t.get("id") for t in doc["tools"] if isinstance(t, dict)}
    added = 0
    for tool in new_tools:
        if tool.id in existing_ids:
            continue
        doc["tools"].append(tool.to_yaml_dict())
        existing_ids.add(tool.id)
        added += 1

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(
            "# Auto-generated entries appended below by\n"
            "# scripts/generate-remnux-tools.py\n"
        )
        yaml.dump(doc, f, sort_keys=False, default_flow_style=False, width=120, allow_unicode=True)

    print("Added {} new tools to {}".format(added, output_path), file=sys.stderr)


def read_urls_file(path):
    # type: (str) -> List[str]
    out = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            u = line.strip()
            if u and not u.startswith("#"):
                out.append(u)
    return out


def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument(
        "--merge",
        metavar="TOOLS_YAML",
        help="Merge into an existing tools.yaml (skips ids already present).",
    )
    ap.add_argument(
        "--output",
        metavar="OUT",
        help="Output file (default: stdout, or the --merge target if both omitted).",
    )
    ap.add_argument(
        "--urls-file",
        metavar="PATH",
        help="Use the URL list from this file instead of discovering them.",
    )
    args = ap.parse_args()

    print("Discovering REMnux category URLs...", file=sys.stderr)
    if args.urls_file:
        urls = read_urls_file(args.urls_file)
        print("  loaded {} URLs from {}".format(len(urls), args.urls_file), file=sys.stderr)
    else:
        urls = discover_urls()

    if not urls:
        sys.exit("No URLs discovered. Use --urls-file with a manual list to override.")

    tools = scrape_all(urls)
    print("Collected {} unique tools.".format(len(tools)), file=sys.stderr)

    if args.merge:
        merge_into_tools_yaml(args.merge, tools, args.output or args.merge)
        return

    payload = {"tools": [t.to_yaml_dict() for t in tools]}
    rendered = yaml.dump(payload, sort_keys=False, default_flow_style=False, width=120, allow_unicode=True)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(
                "# Auto-generated by scripts/generate-remnux-tools.py\n"
                "# Re-run to refresh from https://docs.remnux.org/\n"
            )
            f.write(rendered)
    else:
        sys.stdout.write(rendered)


if __name__ == "__main__":
    main()
