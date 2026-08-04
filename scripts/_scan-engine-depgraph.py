#!/usr/bin/env python3
"""BFS resolve the static import graph of server/index.ts the way tsx does.

Reports two classes of breakage that make Node strict ESM crash:
  FILE_MISSING  - import specifier cannot be resolved to an existing file
  EXPORT_MISSING - target file exists but does NOT export a named symbol imported/re-exported

Excludes node_modules / bare specifiers. Uses server/tsconfig.json `paths`.
"""
import os, re, sys, json

ROOT = os.path.abspath(".")
SERVER = os.path.join(ROOT, "server")
TS_CONFIG = os.path.join(SERVER, "tsconfig.json")

# ---- parse paths ----
cfg = open(TS_CONFIG, encoding="utf-8").read()
baseUrl_m = re.search(r'"baseUrl"\s*:\s*"([^"]+)"', cfg)
BASE = os.path.normpath(os.path.join(SERVER, baseUrl_m.group(1) if baseUrl_m else "."))
paths = {}
pm = re.search(r'"paths"\s*:\s*\{(.*?)\n\s*\}', cfg, re.S)
if pm:
    for name, target in re.findall(r'"((?:@?[A-Za-z0-9_*/-]+)\*?)""\s*:\s*\[([^\]]*)\]', pm.group(1)):
        tgts = re.findall(r'"([^"]+)"', target)
        paths[name] = [t.strip() for t in tgts]

def resolve_alias(spec):
    """Return filesystem path for alias specifier or None."""
    # exact match
    if spec in paths:
        for t in paths[spec]:
            p = os.path.normpath(os.path.join(BASE, t))
            if t.endswith("*"):
                continue
            return p
    # wildcard
    best = None
    for pat, tgts in paths.items():
        if "*" not in pat:
            continue
        prefix = pat[:-1]
        if spec.startswith(prefix):
            star = spec[len(prefix):]
            for t in tgts:
                p = os.path.normpath(os.path.join(BASE, t.replace("*", star)))
                best = p
    return best

def try_resolve_file(base_dir, spec):
    """Resolve a relative/bare-ish spec to an existing file path or None."""
    if spec.startswith("."):
        raw = os.path.normpath(os.path.join(base_dir, spec))
        cands = []
        if raw.endswith(".js") or raw.endswith(".mjs") or raw.endswith(".cjs"):
            stem = raw[:-3]
            cands += [stem + ".ts", stem + ".tsx", stem + ".mts", stem + ".cts", raw]
        else:
            cands += [raw + ".ts", raw + ".tsx", raw + ".mjs", raw + ".js", os.path.join(raw, "index.ts"), os.path.join(raw, "index.tsx")]
        for c in cands:
            if os.path.isfile(c):
                return c
    return None

def resolve_spec(from_file, spec):
    if spec.startswith("."):
        return try_resolve_file(os.path.dirname(from_file), spec)
    if spec.startswith("@") or "/" in spec and not spec.startswith("/"):
        # alias
        p = resolve_alias(spec)
        if p and os.path.isfile(p):
            return p
        # maybe alias points to a directory; try index
        if p and os.path.isdir(p):
            for idx in ("index.ts", "index.tsx"):
                if os.path.isfile(os.path.join(p, idx)):
                    return os.path.join(p, idx)
    return None

# ---- export parsing ----
def parse_exports(txt):
    names = set()
    for m in re.finditer(r'export\s+(?:declare\s+)?(?:async\s+)?(?:default\s+)?(?:function|const|let|var|class|type|interface|enum|abstract\s+class)\s+([A-Za-z0-9_$]+)', txt):
        names.add(m.group(1))
    for m in re.finditer(r'export\s*(?:type\s*)?\{([^}]*)\}', txt):
        for part in m.group(1).split(","):
            part = part.strip()
            if not part:
                continue
            mm = re.match(r'(?:type\s+)?([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?', part)
            if mm:
                names.add(mm.group(2) or mm.group(1))
    for m in re.finditer(r'export\s+default', txt):
        names.add("default")
    return names

def parse_rexports(txt):
    """return list of (symbols_or_None, target_spec) for `export ... from 'X'`"""
    out = []
    # export { a, b as c } from 'X'
    for m in re.finditer(r'export\s*(?:type\s*)?\{([^}]*)\}\s*from\s*[\'"]([^\'"]+)[\'"]', txt):
        syms = []
        for part in m.group(1).split(","):
            part = part.strip()
            if not part:
                continue
            mm = re.match(r'(?:type\s+)?([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?', part)
            if mm:
                syms.append(mm.group(2) or mm.group(1))
        out.append((syms, m.group(2)))
    # export * from 'X'
    for m in re.finditer(r'export\s+\*\s*from\s*[\'"]([^\'"]+)[\'"]', txt):
        out.append((None, m.group(1)))
    return out

def parse_named_imports(txt):
    out = []
    for m in re.finditer(r'import\s+(?:type\s*)?\{([^}]*)\}\s*from\s*[\'"]([^\'"]+)[\'"]', txt):
        syms = []
        for part in m.group(1).split(","):
            part = part.strip()
            if not part:
                continue
            mm = re.match(r'(?:type\s+)?([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?', part)
            if mm:
                syms.append(mm.group(2) or mm.group(1))
        out.append((syms, m.group(2)))
    return out

# ---- BFS ----
start = os.path.join(SERVER, "index.ts")
visited = set()
queue = [start]
file_missing = []   # (from, spec)
export_missing = [] # (from, spec, symbol)
export_index = {}   # file -> set(names)

def load(f):
    try:
        return open(f, encoding="utf-8", errors="replace").read()
    except Exception:
        return ""

while queue:
    f = queue.pop()
    if f in visited:
        continue
    visited.add(f)
    txt = load(f)
    if not txt:
        continue
    export_index[f] = parse_exports(txt)
    # named imports
    for syms, spec in parse_named_imports(txt):
        tgt = resolve_spec(f, spec)
        if tgt is None:
            if not (spec.startswith(".") is False and (spec.startswith("@") is False) and "/" not in spec):
                pass
            # only record relative/alias that we expected to map
            if spec.startswith(".") or spec.startswith("@"):
                file_missing.append((f, spec))
            continue
        if tgt not in visited:
            queue.append(tgt)
        if syms and "*" not in spec:
            have = parse_exports(load(tgt))
            missing = [s for s in syms if s not in have]
            if missing:
                export_missing.append((f, spec, missing))
    # re-exports
    for syms, spec in parse_rexports(txt):
        tgt = resolve_spec(f, spec)
        if tgt is None:
            if spec.startswith(".") or spec.startswith("@"):
                file_missing.append((f, spec))
            continue
        if tgt not in visited:
            queue.append(tgt)
        if syms is not None and tgt:
            have = parse_exports(load(tgt))
            missing = [s for s in syms if s not in have]
            if missing:
                export_missing.append((f, spec, missing))

print(f"visited files: {len(visited)}")
print(f"\n===== FILE_MISSING ({len(file_missing)}) =====")
for f, spec in file_missing:
    print(f"  {os.path.relpath(f, ROOT)}  ->  {spec}")

print(f"\n===== EXPORT_MISSING ({len(export_missing)}) =====")
for f, spec, syms in export_missing:
    print(f"  {os.path.relpath(f, ROOT)}  ->  {spec}  missing={syms}")
