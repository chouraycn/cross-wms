#!/usr/bin/env python3
"""模拟打包后 pywebview_app.py 的路径检测逻辑"""
import os

meipass = '/Applications/CrossWMS.app/Contents/Resources'
exe_dir = '/Applications/CrossWMS.app/Contents/MacOS'
resource_dir = os.path.join(os.path.dirname(exe_dir), 'Resources')

print('=== sys._MEIPASS ===')
print(f'  {meipass}')

print('\n=== get_index_path() candidates ===')
candidates = [
    os.path.join(meipass, 'frontend_dist', 'index.html'),
    os.path.join(meipass, 'dist', 'index.html'),
]
candidates.extend([
    os.path.join(resource_dir, 'frontend_dist', 'index.html'),
    os.path.join(resource_dir, 'dist', 'index.html'),
])
for f in candidates:
    print(f'  {f}: isfile={os.path.isfile(f)}')

print('\n=== get_node_path() candidates ===')
node_candidates = [
    os.path.join(resource_dir, 'node', 'bin', 'node'),
    os.path.join(resource_dir, 'node', 'node'),
    os.path.join(meipass, 'node', 'bin', 'node'),
    os.path.join(meipass, 'node', 'node'),
]
for p in node_candidates:
    is_file = os.path.isfile(p)
    is_exec = os.access(p, os.X_OK) if is_file else False
    print(f'  {p}: isfile={is_file}, isexec={is_exec}')

print('\n=== get_server_script_path() candidates ===')
server_candidates = [
    os.path.join(resource_dir, 'server', 'index.js'),
    os.path.join(resource_dir, 'server_dist', 'index.js'),
    os.path.join(meipass, 'server', 'index.js'),
    os.path.join(meipass, 'server_dist', 'index.js'),
]
for p in server_candidates:
    print(f'  {p}: isfile={os.path.isfile(p)}')

print('\n=== version.txt check ===')
vt = os.path.join(meipass, 'version.txt')
print(f'  {vt}: isfile={os.path.isfile(vt)}, isdir={os.path.isdir(vt)}')
vt_inner = os.path.join(vt, 'version.txt') if os.path.isdir(vt) else None
if vt_inner and os.path.isfile(vt_inner):
    with open(vt_inner) as f:
        print(f'  inner content: {f.read().strip()}')

print('\n=== Files in Resources/ ===')
for entry in os.listdir(meipass):
    path = os.path.join(meipass, entry)
    entry_type = 'dir' if os.path.isdir(path) else ('symlink' if os.path.islink(path) else 'file')
    print(f'  {entry_type:7s}  {entry}')
