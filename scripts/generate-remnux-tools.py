#!/usr/bin/env python3
"""
Generate libvirt-ui tools.yaml entries from REMnux's online documentation.

Scrapes the category pages under https://docs.remnux.org/discover-the-tools/
and emits YAML entries that match the schema used by config/tools.yaml.
The same tool appearing in multiple REMnux categories is collapsed into a
single entry whose tags accumulate so it's still discoverable from each
category's perspective.

Usage:
    pip install requests beautifulsoup4 PyYAML

    # Print to stdout for inspection:
    python scripts/generate-remnux-tools.py

    # Write to a fresh file:
    python scripts/generate-remnux-tools.py --output remnux-tools.yaml

    # Merge into the live tools.yaml (de-dups by id, keeps existing entries):
    python scripts/generate-remnux-tools.py \\
        --merge config/tools.yaml --output config/tools.yaml

Known limitations:
  * REMnux's mkdocs structure occasionally changes. If parsing yields too
    few results, inspect parse_category() and adjust the heading filters.
  * The script defaults every tool to a CLI launch (type: terminal,
    requiresSudo: false). Hand-tune GUI tools (ghidra, cutter, ...) after
    merging.
  * REMnux's docs list a description per tool but rarely a canonical command
    line. quickStart is best-effort -- the first code block under the
    heading, or `<command> --help` as a placeholder.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Iterable
from urllib.parse import urljoin

try:
    import requests
    import yaml
    from bs4 import BeautifulSoup
except ImportError as exc:  # pragma: no cover
    sys.exit(
        f"Missing dependency: {exc.name}. "
        "Install with: pip install requests beautifulsoup4 PyYAML"
    )


REMNUX_BASE = "https://docs.remnux.org/discover-the-tools/"

# REMnux 'Discover the Tools' pages, mapped to libvirt-ui categories already
# present in config/tools.yaml. Add a REMnux-specific tag so the original
# grouping survives the mapping and is filterable from the UI.
REMNUX_CATEGORIES: list[tuple[str, str, str]] = [
    # (REMnux URL path, libvirt-ui category, REMnux-tag)
    ("examine-static-properties/general",                     "reverse-engineering", "static-properties"),
    ("examine-static-properties/specific-formats",            "reverse-engineering", "static-properties"),
    ("statically-analyze-code/general",                       "reverse-engineering", "static-analysis"),
    ("statically-analyze-code/disassemblers-and-debuggers",   "reverse-engineering", "disassembler"),
    ("statically-analyze-code/specific-formats",              "reverse-engineering", "static-analysis"),
    ("dynamically-reverse-engineer-code/general",             "reverse-engineering", "dynamic-analysis"),
    ("dynamically-reverse-engineer-code/specific-formats",    "reverse-engineering", "dynamic-analysis"),
    ("perform-memory-forensics",                              "forensics",           "memory"),
    ("explore-network-interactions",                          "forensics",           "network"),
    ("investigate-system-interactions",                       "forensics",           "system"),
    ("analyze-documents",                                     "forensics",           "documents"),
    ("analyze-email-messages",                                "forensics",           "email"),
    ("handle-data-and-code",                                  "reverse-engineering", "data-handling"),
    ("gather-and-analyze-data",                               "recon",               "threat-intel"),
]

# Headings that look like tool names but aren't. The list is intentionally
# conservative -- false positives are easier to spot in review than missing
# entries.
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
}

COMMAND_RE = re.compile(r"^[a-z0-9][a-z0-9._+\-]*$")


@dataclass
class Tool:
    id: str
    name: str
    display_name: str
    description: str
    category: str
    tags: list[str] = field(default_factory=list)
    command: str = ""
    quick_start: str = ""
    require_sudo: bool = False

    def to_yaml_dict(self) -> dict:
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
                "quickStart": self.quick_start or f"{self.command} --help",
                "examples": [
                    {"description": "Show help", "command": f"{self.command} --help"}
                ],
            },
        }


def slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s)
    return s.strip("-")


def extract_command(name: str, first_code_line: str | None) -> str:
    # Prefer the literal command shown in a code sample if it looks sane.
    if first_code_line:
        token = first_code_line.strip().split()[0] if first_code_line.strip() else ""
        if COMMAND_RE.match(token):
            return token
    # Fall back to a slug of the first whitespace-delimited word of the name.
    first = name.strip().split()[0]
    cmd = re.sub(r"[^a-z0-9._+\-]", "", first.lower())
    return cmd or slugify(name)


def looks_like_tool_heading(text: str) -> bool:
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


def fetch(url: str) -> str:
    print(f"  fetching {url}", file=sys.stderr)
    r = requests.get(url, timeout=30, headers={"User-Agent": "libvirt-ui-tools-gen/1.0"})
    r.raise_for_status()
    return r.text


def parse_category(html: str, ui_category: str, remnux_tag: str) -> Iterable[Tool]:
    soup = BeautifulSoup(html, "html.parser")
    article = soup.find("article") or soup

    for header in article.find_all(["h2", "h3"]):
        name = header.get_text(" ", strip=True)
        if not looks_like_tool_heading(name):
            continue

        description_parts: list[str] = []
        first_code: str | None = None
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
            quick_start=first_code or f"{command} --help",
        )


def scrape_all() -> list[Tool]:
    collected: OrderedDict[str, Tool] = OrderedDict()
    for path, ui_cat, tag in REMNUX_CATEGORIES:
        url = urljoin(REMNUX_BASE, path)
        try:
            html = fetch(url)
        except requests.RequestException as e:
            print(f"  ! skipping {url}: {e}", file=sys.stderr)
            continue

        for tool in parse_category(html, ui_cat, tag):
            existing = collected.get(tool.id)
            if existing is None:
                collected[tool.id] = tool
            else:
                # Same tool seen in another category: accumulate tags so the
                # entry remains discoverable from each REMnux grouping.
                existing.tags = sorted(set(existing.tags + tool.tags))
    return list(collected.values())


def merge_into_tools_yaml(existing_path: str, new_tools: list[Tool], output_path: str) -> None:
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

    print(f"Added {added} new tools to {output_path}", file=sys.stderr)


def main() -> None:
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
    args = ap.parse_args()

    print("Scraping REMnux 'Discover the Tools' pages...", file=sys.stderr)
    tools = scrape_all()
    print(f"Collected {len(tools)} unique tools.", file=sys.stderr)

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
