#!/usr/bin/env bash
# Assemble a realistic Python deployment package for the scc demo, offline.
#
#   ./build.sh            # synthesizes ./package with a vendored dependency
#   scc package --runtime python --out slim --py-prune-meta
#
# To mirror a *real* deployment instead, replace the synthesized "mylib"
# below with:  python3 -m pip install --target package <your-deps>
# then re-run compileall. The synthetic package keeps this demo network-free
# and deterministic while still exercising every prune path (bytecode caches,
# test suites, and *.dist-info metadata).
set -euo pipefail
cd "$(dirname "$0")"

PKG="package"
rm -rf "$PKG"
mkdir -p "$PKG/mylib/tests" "$PKG/mylib-1.0.0.dist-info"

cp index.py "$PKG/"

# --- a vendored "third-party" library ---------------------------------------
cat > "$PKG/mylib/__init__.py" <<'PY'
from .core import greet, fib

__all__ = ["greet", "fib"]
__version__ = "1.0.0"
PY

cat > "$PKG/mylib/core.py" <<'PY'
"""Core utilities for the demo library."""


def greet(name: str) -> str:
    return f"hello, {name}"


def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(max(0, n)):
        a, b = b, a + b
    return a


# Padding to give the module realistic mass (so the bytecode cache and the
# pruned/kept byte counts are meaningful in the demo report).
_TABLE = {i: greet(str(i)) for i in range(400)}
PY

# A second module so the package spans multiple files / cache entries.
cat > "$PKG/mylib/util.py" <<'PY'
"""Assorted helpers."""


def chunks(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def flatten(nested):
    return [x for sub in nested for x in sub]


_LOOKUP = {i: i * i for i in range(400)}
PY

# --- a test suite that ships inside the package (pure deadweight at runtime) -
cat > "$PKG/mylib/tests/__init__.py" <<'PY'
PY

cat > "$PKG/mylib/tests/test_core.py" <<'PY'
from mylib.core import greet, fib


def test_greet():
    assert greet("x") == "hello, x"


def test_fib():
    assert fib(10) == 55
    assert [fib(i) for i in range(8)] == [0, 1, 1, 2, 3, 5, 8, 13]


# Padding so the test directory is a non-trivial fraction of the package.
_CASES = [(i, fib(i)) for i in range(400)]
PY

# --- installer metadata (removed only with --py-prune-meta) ------------------
cat > "$PKG/mylib-1.0.0.dist-info/METADATA" <<'TXT'
Metadata-Version: 2.1
Name: mylib
Version: 1.0.0
Summary: Demo vendored dependency for scc.
TXT

cat > "$PKG/mylib-1.0.0.dist-info/WHEEL" <<'TXT'
Wheel-Version: 1.0
Generator: scc-demo
Root-Is-Purelib: true
Tag: py3-none-any
TXT

cat > "$PKG/mylib-1.0.0.dist-info/top_level.txt" <<'TXT'
mylib
TXT

# Byte-compile so __pycache__/*.pyc exist (as if the package was imported once).
# Write caches in-tree explicitly: macOS' system python otherwise redirects
# them to ~/Library/Caches, which would leave nothing for the slimmer to show.
python3 - "$PKG" <<'PY'
import os, sys, py_compile
pkg = sys.argv[1]
tag = sys.implementation.cache_tag
for root, dirs, files in os.walk(pkg):
    if os.path.basename(root) == "__pycache__":
        continue
    for f in files:
        if f.endswith(".py"):
            cdir = os.path.join(root, "__pycache__")
            os.makedirs(cdir, exist_ok=True)
            cfile = os.path.join(cdir, f[:-3] + "." + tag + ".pyc")
            py_compile.compile(os.path.join(root, f), cfile=cfile, doraise=False)
PY

echo "Built $PKG/. Now run:"
echo "  node ../../bin/cli.js $PKG --runtime python --out slim --py-prune-meta"
