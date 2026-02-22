#!/usr/bin/env python3
"""
i18n migration script for qingyi project.
Scans TSX/TS files for Chinese strings and generates:
1. New i18n keys in en.json and zh.json
2. Modified source files with t() calls

Usage: python3 i18n-migrate.py [--dry-run] [--file path]
"""

import json
import re
import os
import sys
import hashlib
from pathlib import Path
from collections import defaultdict

SRC_DIR = Path(__file__).parent.parent / "src"
I18N_DIR = SRC_DIR / "i18n" / "messages"
EN_JSON = I18N_DIR / "en.json"
ZH_JSON = I18N_DIR / "zh.json"

# Patterns to match Chinese strings
CN_PATTERN = re.compile(r'[\u4e00-\u9fff]')

# Strings to skip (error messages, server-only, types, etc.)
SKIP_PATTERNS = [
    r'console\.',
    r'throw new Error',
    r'import ',
    r'// ',
    r'/\*',
    r'type ',
    r'interface ',
    r'className',
    r'\.test\(',
    r'__tests__',
]

def has_chinese(s: str) -> bool:
    return bool(CN_PATTERN.search(s))

def generate_key(filepath: str, text: str, index: int) -> str:
    """Generate a dot-notation key from filepath and content."""
    # Extract component/page name from path
    rel = os.path.relpath(filepath, SRC_DIR)
    parts = rel.replace('.tsx', '').replace('.ts', '').split('/')
    
    # Clean up path parts
    clean_parts = []
    for p in parts:
        if p in ('app', 'src', 'components', 'lib'):
            continue
        if p.startswith('(') and p.endswith(')'):
            continue  # Skip route groups like (tabs)
        if p == 'page':
            continue
        clean_parts.append(p.replace('-', '_').replace('[', '').replace(']', ''))
    
    prefix = '.'.join(clean_parts[:3]) if clean_parts else 'misc'
    
    # Create a short hash for uniqueness
    h = hashlib.md5(text.encode()).hexdigest()[:4]
    return f"{prefix}.s{index:03d}"

def extract_chinese_strings(filepath: str) -> list[tuple[int, str, str]]:
    """Extract Chinese strings from a file. Returns [(line_no, original, text)]"""
    results = []
    with open(filepath, 'r') as f:
        lines = f.readlines()
    
    for i, line in enumerate(lines, 1):
        # Skip non-user-facing lines
        stripped = line.strip()
        if any(re.search(p, stripped) for p in SKIP_PATTERNS):
            continue
        
        # Find quoted Chinese strings
        for match in re.finditer(r'"([^"]*[\u4e00-\u9fff][^"]*)"', line):
            text = match.group(1)
            # Skip template literals with ${
            if '${' in text:
                continue
            # Skip very short strings (likely not user-facing)
            if len(text) < 2:
                continue
            results.append((i, match.group(0), text))
        
        # Also check single-quoted strings
        for match in re.finditer(r"'([^']*[\u4e00-\u9fff][^']*)'", line):
            text = match.group(1)
            if '${' in text:
                continue
            if len(text) < 2:
                continue
            results.append((i, match.group(0), text))
    
    return results

def main():
    dry_run = '--dry-run' in sys.argv
    target_file = None
    for arg in sys.argv[1:]:
        if not arg.startswith('--'):
            target_file = arg
    
    # Load existing translations
    with open(EN_JSON) as f:
        en_data = json.load(f)
    
    zh_path = ZH_JSON
    if zh_path.exists():
        with open(zh_path) as f:
            zh_data = json.load(f)
    else:
        zh_data = {}
    
    # Scan files
    if target_file:
        files = [Path(target_file)]
    else:
        files = sorted(SRC_DIR.rglob('*.tsx'))
        files = [f for f in files if '__tests__' not in str(f) and 'node_modules' not in str(f)]
    
    total_strings = 0
    new_keys = {}
    
    for filepath in files:
        strings = extract_chinese_strings(str(filepath))
        if not strings:
            continue
        
        print(f"\n📄 {os.path.relpath(filepath, SRC_DIR)} ({len(strings)} strings)")
        for line_no, original, text in strings:
            total_strings += 1
            key = generate_key(str(filepath), text, total_strings)
            new_keys[key] = text
            if not dry_run:
                print(f"  L{line_no}: {text[:50]}... → {key}")
    
    print(f"\n{'='*60}")
    print(f"Total Chinese strings found: {total_strings}")
    print(f"New i18n keys to create: {len(new_keys)}")
    
    if dry_run:
        print("\n[DRY RUN] No files modified.")
        return
    
    # Write new keys to JSON files
    def set_nested(d, key, value):
        parts = key.split('.')
        for part in parts[:-1]:
            d = d.setdefault(part, {})
        d[parts[-1]] = value
    
    for key, text in new_keys.items():
        set_nested(en_data, key, text)  # English = Chinese for now (needs translation)
        set_nested(zh_data, key, text)
    
    with open(EN_JSON, 'w') as f:
        json.dump(en_data, f, indent=2, ensure_ascii=False)
        f.write('\n')
    
    with open(ZH_JSON, 'w') as f:
        json.dump(zh_data, f, indent=2, ensure_ascii=False)
        f.write('\n')
    
    print(f"\n✅ Updated {EN_JSON} and {ZH_JSON}")
    print(f"⚠️  Source files NOT modified — manual replacement needed for safety")

if __name__ == '__main__':
    main()
