#!/usr/bin/env python3
"""
PyInstaller wrapper that redirects bincache to a writable directory.
Usage: pyinstaller_wrapper.py [pyinstaller args...]
"""
import sys
import os

# Set cache dir BEFORE importing PyInstaller
cache_dir = os.path.join(os.environ.get('BUILD_DIR', '/tmp'), 'pyinstaller-cache')
os.makedirs(cache_dir, exist_ok=True)

# Patch PyInstaller config before it's used
import PyInstaller.config as config
config.CONF['cachedir'] = cache_dir

# Now run PyInstaller normally
from PyInstaller.__main__ import run
sys.exit(run())
