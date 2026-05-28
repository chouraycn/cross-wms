#!/usr/bin/env python3
"""检查打包后 app 的路径和版本信息"""
import os, sys

APP = '/Applications/CrossWMS.app/Contents/Resources'
index = os.path.join(APP, 'frontend_dist', 'index.html')
js = os.path.join(APP, 'frontend_dist', 'assets', 'index-CWPVeMnk.js')
css = os.path.join(APP, 'frontend_dist', 'assets', 'index-DRTKx0iW.css')
server = os.path.join(APP, 'server_dist', 'index.js')
node = os.path.join(APP, 'node', 'bin', 'node')
vt = os.path.join(APP, 'version.txt')

print(f"index.html: {os.path.isfile(index)}")
print(f"JS asset:   {os.path.isfile(js)} ({os.path.getsize(js)} bytes)")
print(f"CSS asset:  {os.path.isfile(css)} ({os.path.getsize(css)} bytes)")
print(f"server:     {os.path.isfile(server)}")
print(f"node:       {os.path.isfile(node)}")
print(f"version.txt is dir: {os.path.isdir(vt)}")
vt_inner = os.path.join(vt, 'version.txt') if os.path.isdir(vt) else None
if vt_inner and os.path.isfile(vt_inner):
    with open(vt_inner) as f:
        print(f"version content: {f.read().strip()}")

# 检查 JS 和 CSS 中引用的资源路径是否匹配
with open(index) as f:
    html = f.read()
# 提取所有 ./assets/ 引用
import re
refs = re.findall(r'\./assets/[^"\']+', html)
print(f"\nIndex.html 中引用的 assets: {refs}")
