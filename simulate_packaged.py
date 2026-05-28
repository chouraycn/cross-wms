#!/usr/bin/env python3
"""
模拟打包后环境运行 pywebview_app.py，捕获启动错误
"""
import os, sys

# 模拟 PyInstaller 的 sys._MEIPASS
APP_RESOURCES = '/Applications/CrossWMS.app/Contents/Resources'
sys._MEIPASS = APP_RESOURCES

# 模拟 sys.frozen
sys.frozen = True

# 模拟 sys.executable
sys.executable = '/Applications/CrossWMS.app/Contents/MacOS/CrossWMS'

print(f"sys._MEIPASS = {sys._MEIPASS}")
print(f"sys.frozen = {getattr(sys, 'frozen', False)}")
print(f"sys.executable = {sys.executable}")
print()

# 测试路径检测函数
def get_index_path():
    candidates = []
    if getattr(sys, 'frozen', False):
        meipass = sys._MEIPASS
        candidates = [
            os.path.join(meipass, 'frontend_dist', 'index.html'),
            os.path.join(meipass, 'dist', 'index.html'),
        ]
        exe_dir = os.path.dirname(sys.executable)
        resource_dir = os.path.join(os.path.dirname(exe_dir), 'Resources')
        candidates.extend([
            os.path.join(resource_dir, 'frontend_dist', 'index.html'),
            os.path.join(resource_dir, 'dist', 'index.html'),
        ])
    
    for f in candidates:
        if os.path.isfile(f):
            return f
    return None

def get_node_path():
    candidates = []
    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(sys.executable)
        resource_dir = os.path.join(os.path.dirname(exe_dir), 'Resources')
        candidates.extend([
            os.path.join(resource_dir, 'node', 'bin', 'node'),
            os.path.join(resource_dir, 'node', 'node'),
        ])
        meipass = sys._MEIPASS
        candidates.extend([
            os.path.join(meipass, 'node', 'bin', 'node'),
            os.path.join(meipass, 'node', 'node'),
        ])
    
    for p in candidates:
        if os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return None

def get_server_script_path():
    candidates = []
    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(sys.executable)
        resource_dir = os.path.join(os.path.dirname(exe_dir), 'Resources')
        candidates.extend([
            os.path.join(resource_dir, 'server', 'index.js'),
            os.path.join(resource_dir, 'server_dist', 'index.js'),
        ])
        meipass = sys._MEIPASS
        candidates.extend([
            os.path.join(meipass, 'server', 'index.js'),
            os.path.join(meipass, 'server_dist', 'index.js'),
        ])
    
    for p in candidates:
        if os.path.isfile(p):
            return p
    return None

def read_version():
    candidates = []
    if getattr(sys, 'frozen', False):
        meipass = sys._MEIPASS
        candidates.append(os.path.join(meipass, 'version.txt'))
    
    base = os.path.dirname(os.path.abspath(__file__))
    candidates.append(os.path.join(base, 'version.txt'))
    
    for f in candidates:
        print(f"  Checking: {f} (isfile={os.path.isfile(f)}, isdir={os.path.isdir(f)})")
        if os.path.isfile(f):
            try:
                with open(f, 'r') as vf:
                    return vf.read().strip()
            except Exception as e:
                print(f"  Error reading {f}: {e}")
    return '0.0.0'

print("=== read_version() ===")
version = read_version()
print(f"Result: {version}")
print()

print("=== get_index_path() ===")
idx = get_index_path()
print(f"Result: {idx}")
print()

print("=== get_node_path() ===")
node = get_node_path()
print(f"Result: {node}")
print()

print("=== get_server_script_path() ===")
srv = get_server_script_path()
print(f"Result: {srv}")
print()

# 检查能否启动 Node.js 后端
if node and srv:
    print("=== Testing Node.js server start ===")
    import subprocess
    try:
        proc = subprocess.Popen(
            [node, srv],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env={**os.environ, 'PORT': '3001', 'CROSSWMS_DATA_DIR': os.path.expanduser('~/.crosswms')},
            start_new_session=True,
        )
        print(f"Server started, PID={proc.pid}")
        import time
        time.sleep(3)
        
        # 检查是否还在运行
        if proc.poll() is None:
            print("Server is running, testing /api/health...")
            import urllib.request
            try:
                req = urllib.request.Request('http://localhost:3001/api/health', method='GET')
                with urllib.request.urlopen(req, timeout=2) as resp:
                    print(f"Health check: {resp.status} - {resp.read().decode('utf-8')}")
            except Exception as e:
                print(f"Health check failed: {e}")
            
            # 停止服务器
            import signal
            proc.terminate()
            proc.wait(timeout=5)
            print("Server stopped")
        else:
            stdout, stderr = proc.communicate()
            print(f"Server exited with code {proc.returncode}")
            print(f"STDOUT: {stdout.decode('utf-8', errors='replace')}")
            print(f"STDERR: {stderr.decode('utf-8', errors='replace')}")
    except Exception as e:
        print(f"Failed to start server: {e}")
