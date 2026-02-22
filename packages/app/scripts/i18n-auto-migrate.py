#!/usr/bin/env python3
"""
i18n auto-migration: replaces Chinese strings with t() calls.
Handles JSX attributes (attr={t("key")}) and JS values (t("key")).
"""

import json
import re
import os
import sys
from pathlib import Path

SRC_DIR = Path(__file__).parent.parent / "src"
I18N_DIR = SRC_DIR / "i18n" / "messages"
EN_JSON = I18N_DIR / "en.json"
ZH_JSON = I18N_DIR / "zh.json"
DRY_RUN = '--dry-run' in sys.argv

TARGET_DIRS = [
    "app/(tabs)/home", "app/(tabs)/me", "app/(tabs)/schedule",
    "app/(tabs)/showcase", "app/(tabs)/wallet", "app/(tabs)/vip",
    "app/(tabs)/news", "app/components", "app/companion",
    "app/faq", "app/pricing", "app/login", "app/me",
    "app/players", "app/updates",
]

SKIP_ATTRS = {'className', 'href', 'src', 'type', 'name', 'id', 'key', 'htmlFor', 'method', 'action'}
SKIP_LINE = [
    re.compile(r'^\s*import '), re.compile(r'^\s*//'), re.compile(r'^\s*/\*'),
    re.compile(r'console\.(log|warn|error)'), re.compile(r'throw new Error'),
    re.compile(r'^\s*type\s+\w+'), re.compile(r'^\s*interface\s+\w+'),
    re.compile(r'^\s*export\s+type\s+'), re.compile(r'^\s*\w+\??:\s'),  # type field definitions
]

CN_CHAR = re.compile(r'[\u4e00-\u9fff]')

def set_nested(d, key, value):
    """Set a flat key in the dict (no nesting)."""
    d[key] = value

def gen_key(filepath, idx):
    rel = os.path.relpath(filepath, SRC_DIR)
    parts = rel.replace('.tsx', '').replace('.ts', '').split('/')
    clean = []
    for p in parts:
        if p in ('app', 'src'): continue
        if p.startswith('(') and p.endswith(')'): p = p[1:-1]
        if p == 'page': continue
        clean.append(p.replace('-', '_').replace('[', '').replace(']', ''))
    prefix = '.'.join(clean[:3]) if clean else 'misc'
    return f"{prefix}.i{idx:03d}"

def process_file(filepath, en, zh, counter):
    with open(filepath) as f:
        lines = f.readlines()
    
    content = ''.join(lines)
    has_t = 'i18n-client' in content or ("import { t }" in content and "i18n" in content)
    
    new_lines = []
    count = 0
    
    for line in lines:
        stripped = line.strip()
        if any(p.search(stripped) for p in SKIP_LINE):
            new_lines.append(line)
            continue
        
        modified = line
        
        # Find all Chinese strings in this line
        # Strategy: find "中文" patterns and determine context
        offset = 0
        replacements = []
        
        for m in re.finditer(r'"([^"]*[\u4e00-\u9fff][^"]*)"', line):
            text = m.group(1)
            if '${' in text or len(text) < 2:
                continue
            
            start = m.start()
            full = m.group(0)
            
            # Check if already in t()
            before = line[:start]
            if before.rstrip().endswith('t(') or before.rstrip().endswith("t('"):
                continue
            
            counter[0] += 1
            key = gen_key(filepath, counter[0])
            set_nested(en, key, text)
            set_nested(zh, key, text)
            
            # Determine context: JSX attribute or JS value
            before_stripped = before.rstrip()
            # JSX attribute: word= (but not !== or === or ==)
            is_jsx_attr = (
                re.search(r'\w=$', before_stripped) and
                not before_stripped.endswith('==') and
                not before_stripped.endswith('!=') and
                not before_stripped.endswith('>=') and
                not before_stripped.endswith('<=')
            )
            if is_jsx_attr:
                # JSX attribute: attr="中文" → attr={t("key")}
                replacement = '{t("' + key + '")}'
            else:
                # JS value or JSX content: "中文" → t("key")
                replacement = 't("' + key + '")'
            
            replacements.append((m.start(), m.end(), full, replacement))
            count += 1
        
        # Apply replacements in reverse order
        if replacements:
            chars = list(line)
            for start, end, old, new in reversed(replacements):
                chars[start:end] = list(new)
            modified = ''.join(chars)
        
        new_lines.append(modified)
    
    if count == 0:
        return 0
    
    # Add t import if needed
    if not has_t:
        # Find the last import line
        last_import_idx = 0
        in_import = False
        for i, line in enumerate(new_lines):
            s = line.strip()
            if s.startswith('import ') or s.startswith('from '):
                last_import_idx = i
                in_import = '{' in s and '}' not in s  # multi-line import
            elif in_import:
                last_import_idx = i
                if '}' in s:
                    in_import = False
        new_lines.insert(last_import_idx + 1, 'import { t } from "@/lib/i18n/i18n-client";\n')
    
    if not DRY_RUN:
        with open(filepath, 'w') as f:
            f.writelines(new_lines)
    
    return count

def main():
    with open(EN_JSON) as f:
        en = json.load(f)
    zh = json.load(open(ZH_JSON)) if ZH_JSON.exists() else {}
    
    counter = [0]
    total_files = 0
    total_strings = 0
    
    for td in TARGET_DIRS:
        dp = SRC_DIR / td
        if not dp.exists(): continue
        for fp in sorted(dp.rglob('*.tsx')):
            if '__tests__' in str(fp): continue
            c = process_file(str(fp), en, zh, counter)
            if c > 0:
                total_files += 1
                total_strings += c
                tag = '[DRY]' if DRY_RUN else '✅'
                print(f"  {tag} {os.path.relpath(fp, SRC_DIR)}: {c} strings")
    
    if not DRY_RUN and total_strings > 0:
        for path, data in [(EN_JSON, en), (ZH_JSON, zh)]:
            with open(path, 'w') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write('\n')
    
    print(f"\n{'='*50}")
    print(f"Files: {total_files}, Strings: {total_strings}")
    if DRY_RUN: print("[DRY RUN]")

if __name__ == '__main__':
    main()
