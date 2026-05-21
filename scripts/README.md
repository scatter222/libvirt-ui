# REMnux tools generator

`generate-remnux-tools.py` scrapes the REMnux v7 documentation at
<https://docs.remnux.org/discover-the-tools/> and emits entries for
`config/tools.yaml` so the launcher's Tools dashboard can surface
malware-analysis tools alongside the existing offensive set.

## Usage

```bash
pip install requests beautifulsoup4 PyYAML

# 1. Dry-run: inspect what would be added.
python scripts/generate-remnux-tools.py | less

# 2. Merge new entries into config/tools.yaml (de-dups by id).
python scripts/generate-remnux-tools.py \
    --merge config/tools.yaml --output config/tools.yaml

# 3. Write to a separate file for review before merging.
python scripts/generate-remnux-tools.py --output remnux-tools.yaml
```

## Mapping

Each REMnux category page is mapped to a libvirt-ui category that already
exists in `tools.yaml`, and a REMnux-specific tag is added so the original
grouping remains filterable from the UI search bar.

| REMnux page                             | libvirt-ui category   | extra tag           |
|-----------------------------------------|-----------------------|---------------------|
| examine-static-properties/*             | `reverse-engineering` | `static-properties` |
| statically-analyze-code/*               | `reverse-engineering` | `static-analysis`   |
| dynamically-reverse-engineer-code/*     | `reverse-engineering` | `dynamic-analysis`  |
| perform-memory-forensics                | `forensics`           | `memory`            |
| explore-network-interactions            | `forensics`           | `network`           |
| investigate-system-interactions         | `forensics`           | `system`            |
| analyze-documents                       | `forensics`           | `documents`         |
| analyze-email-messages                  | `forensics`           | `email`             |
| handle-data-and-code                    | `reverse-engineering` | `data-handling`     |
| gather-and-analyze-data                 | `recon`               | `threat-intel`      |

Every generated tool also gets the `malware-analysis` and `remnux` tags so
they can be filtered as a group.

## What you'll need to hand-edit after merging

- **GUI tools** (`ghidra`, `cutter`, `wireshark` etc.) -- the script defaults
  every tool to `launch.type: terminal`. Flip to `gui` for those.
- **Sudo requirements** -- defaults to `false`. Set `requiresSudo: true` for
  anything that needs root (`volatility` on /dev/mem, packet sniffers, etc.).
- **quickStart commands** -- best-effort; many REMnux doc pages don't have a
  canonical usage line so the placeholder is `<command> --help`. Replace with
  a real example for tools your team uses regularly.

## When REMnux's docs change

If the script starts returning very few tools, the mkdocs theme has probably
changed. Tweak the heading filter in `parse_category()` and the URL list at
the top of the script.
