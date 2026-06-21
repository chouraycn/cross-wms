#!/usr/bin/env python3
"""
CDF Know Clow — 中免CLow端系统桌面应用
pywebview 启动脚本
用原生 macOS 窗口内嵌 WebView 渲染前端页面，不弹浏览器

v1.5.166: 红黄绿按钮改为前端自定义渲染（WindowDragBar 组件），
移除所有 Cocoa 偏移代码（frameless=True 时系统按钮不存在，原方案无效）。
"""

import os
import sys
import json
import subprocess
import urllib.request
import urllib.parse
import urllib.error
import time
import webbrowser
import signal
import tempfile
import shutil
import http.server
import socket
import socketserver
import threading
import traceback

import webview

# ===================== 配置持久化 =====================

CONFIG_DIR = os.path.expanduser("~/.cdf-know-clow")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")


def load_config():
    """加载配置文件，返回 dict"""
    default_config = {}
    if not os.path.isfile(CONFIG_FILE):
        return default_config
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                return {**default_config, **data}
    except Exception as e:
        print(f"[Config] 读取失败: {e}")
    return default_config


def save_config(config):
    """保存配置到文件"""
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"[Config] 保存失败: {e}")
        return False


# ===================== 日志文件 =====================

def get_log_path():
    """获取日志文件路径 ~/Library/Logs/CDFKnowClow/startup.log"""
    log_dir = os.path.expanduser("~/Library/Logs/CDFKnowClow")
    os.makedirs(log_dir, exist_ok=True)
    return os.path.join(log_dir, "startup.log")


def log(msg):
    """写入日志文件 + 控制台输出"""
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}"
    print(line)
    try:
        with open(get_log_path(), "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


# ===================== 配置 =====================

APP_NAME = "CDF Know Clow"
WIDTH = 1280
HEIGHT = 800
MIN_SIZE = (900, 600)

# 腾讯文档 API
TDOC_API_BASE = "https://docs.qq.com/openapi"
TDOC_OAUTH_BASE = "https://docs.qq.com/oauth/v2"
TDOC_TOKEN_FILE = os.path.expanduser("~/.cdf-know-clow/tdoc_token.json")

# Node.js 后端服务器配置（主后端）
SERVER_PORT = 3001
SERVER_HEALTH_URL = f"http://localhost:{SERVER_PORT}/api/health"
SERVER_START_TIMEOUT = 30  # 等待后端启动的最长时间（秒）


def read_version():
    """从 version.txt 读取版本号，读取失败则返回 '0.0.0'"""
    candidates = []

    if getattr(sys, 'frozen', False):
        meipass = sys._MEIPASS
        candidates.append(os.path.join(meipass, 'version_txt', 'version.txt'))
        candidates.append(os.path.join(meipass, 'version.txt'))
        candidates.append(os.path.join(meipass, 'version.txt', 'version.txt'))

    base = os.path.dirname(os.path.abspath(__file__))
    candidates.append(os.path.join(base, 'version.txt'))

    for f in candidates:
        if os.path.isfile(f):
            try:
                with open(f, 'r') as vf:
                    return vf.read().strip()
            except Exception:
                pass
    return '0.0.0'


APP_VERSION = read_version()


def get_index_path():
    """获取前端 dist/index.html 的绝对路径，找不到时抛 FileNotFoundError"""
    candidates = []

    resources_env = os.environ.get('CDF_KNOW_CLOW_RESOURCES')
    if resources_env:
        candidates.extend([
            os.path.join(resources_env, 'frontend_dist', 'index.html'),
            os.path.join(resources_env, 'dist', 'index.html'),
        ])

    if getattr(sys, 'frozen', False):
        meipass = sys._MEIPASS
        candidates.extend([
            os.path.join(meipass, 'frontend_dist', 'index.html'),
            os.path.join(meipass, 'dist', 'index.html'),
        ])
        exe_dir = os.path.dirname(sys.executable)
        resource_dir = os.path.join(os.path.dirname(exe_dir), 'Resources')
        candidates.extend([
            os.path.join(resource_dir, 'frontend_dist', 'index.html'),
            os.path.join(resource_dir, 'dist', 'index.html'),
        ])
        app_bundle_dir = os.path.dirname(os.path.dirname(exe_dir))
        for root, dirs, files in os.walk(app_bundle_dir):
            if 'index.html' in files:
                candidate = os.path.join(root, 'index.html')
                if candidate not in candidates:
                    candidates.append(candidate)
            if root.count(os.sep) - app_bundle_dir.count(os.sep) >= 4:
                del dirs[:]

    # 开发模式：项目根目录的 dist/（npm run build 输出位置）
    base = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(base)  # scripts/ 的上级目录
    candidates.extend([
        os.path.join(project_root, 'dist', 'index.html'),
        os.path.join(base, 'dist', 'index.html'),
        os.path.join(base, 'frontend_dist', 'index.html'),
    ])

    for f in candidates:
        if os.path.isfile(f):
            return f

    log("ERROR: index.html not found!")
    log(f"  sys.frozen = {getattr(sys, 'frozen', False)}")
    if getattr(sys, 'frozen', False):
        log(f"  sys._MEIPASS = {sys._MEIPASS}")
        log(f"  sys.executable = {sys.executable}")
    log(f"  __file__ = {__file__}")
    log(f"  Candidates tried: {candidates}")
    raise FileNotFoundError(f"index.html not found. Candidates: {candidates}")


# ===================== Node.js 后端管理 =====================

_server_process = None

# P0-3: 全局关闭标志，窗口关闭时设为 True，阻止进程重启
shutting_down = False

_restart_fail_counts = {'Server': 0}
_MAX_RESTART_FAILS = 3


def _watch_process(proc, start_fn, name):
    """监控子进程：意外退出时自动重启（P0-3 后端进程崩溃自动恢复）"""
    def watcher():
        proc.wait()
        if shutting_down:
            return
        _restart_fail_counts[name] += 1
        if _restart_fail_counts[name] > _MAX_RESTART_FAILS:
            log(f"[{name}] 连续 {_MAX_RESTART_FAILS} 次重启失败，停止重启。")
            return
        log(f"[{name}] 进程意外退出 (code={proc.returncode})，3 秒后重启...")
        time.sleep(3)
        if shutting_down:
            return
        new_proc = start_fn()
        if new_proc:
            def reset_count():
                time.sleep(10)
                if new_proc.poll() is None:
                    _restart_fail_counts[name] = 0
            threading.Thread(target=reset_count, daemon=True).start()
            log(f"[{name}] 已重启 (PID: {new_proc.pid})")
            _watch_process(new_proc, start_fn, name)
        else:
            log(f"[{name}] 重启失败 ({_restart_fail_counts[name]}/{_MAX_RESTART_FAILS})")
            if _restart_fail_counts[name] <= _MAX_RESTART_FAILS:
                time.sleep(5)
                if not shutting_down:
                    new_proc2 = start_fn()
                    if new_proc2:
                        log(f"[{name}] 延迟重启成功 (PID: {new_proc2.pid})")
                        _restart_fail_counts[name] = 0
                        _watch_process(new_proc2, start_fn, name)
                    else:
                        log(f"[{name}] 延迟重启也失败 ({_restart_fail_counts[name]}/{_MAX_RESTART_FAILS})")
    threading.Thread(target=watcher, daemon=True).start()


def get_node_path():
    """获取 Node.js 可执行文件路径"""
    candidates = []

    resources_env = os.environ.get('CDF_KNOW_CLOW_RESOURCES')
    if resources_env:
        candidates.extend([
            os.path.join(resources_env, 'node', 'node'),
            os.path.join(resources_env, 'node', 'bin', 'node'),
        ])

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

    candidates.extend([
        '/usr/local/bin/node',
        '/opt/homebrew/bin/node',
    ])

    for p in candidates:
        if os.path.isfile(p) and os.access(p, os.X_OK):
            return p

    node_in_path = shutil.which('node')
    if node_in_path:
        return node_in_path

    return None


def get_server_script_path():
    """获取主服务器入口文件路径"""
    candidates = []

    resources_env = os.environ.get('CDF_KNOW_CLOW_RESOURCES')
    if resources_env:
        candidates.extend([
            os.path.join(resources_env, 'server_dist', 'index.cjs'),
            os.path.join(resources_env, 'server', 'index.cjs'),
        ])

    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(sys.executable)
        resource_dir = os.path.join(os.path.dirname(exe_dir), 'Resources')
        candidates.extend([
            os.path.join(resource_dir, 'server_dist', 'index.cjs'),
            os.path.join(resource_dir, 'server', 'index.cjs'),
        ])
        meipass = sys._MEIPASS
        candidates.extend([
            os.path.join(meipass, 'server_dist', 'index.cjs'),
            os.path.join(meipass, 'server', 'index.cjs'),
        ])

    base = os.path.dirname(os.path.abspath(__file__))
    # scripts/ 同级目录（开发模式）
    candidates.extend([
        os.path.join(base, 'server_dist', 'index.cjs'),
        os.path.join(base, 'server', 'index.ts'),
    ])
    # 项目根目录（开发模式，server_dist 在根目录下）
    project_root = os.path.dirname(base)
    # ⚠️ 开发模式下优先使用 server/index.ts 源码运行（通过 tsx）
    # 原因：server_dist/index.cjs 是 esbuild 打包产物，better-sqlite3 等原生模块
    # 的路径在打包后会失效，导致 ERR_DLOPEN_FAILED 错误
    candidates.extend([
        os.path.join(project_root, 'server', 'index.ts'),
        os.path.join(project_root, 'server_dist', 'index.cjs'),
    ])

    for p in candidates:
        if os.path.isfile(p):
            return p

    return None


def check_dependencies():
    """启动前检查关键依赖是否存在，失败则抛 RuntimeError"""
    errors = []

    log("[Check] ===== 运行环境诊断 =====")
    log(f"[Check] sys.frozen = {getattr(sys, 'frozen', False)}")
    log(f"[Check] sys.executable = {sys.executable}")
    if getattr(sys, 'frozen', False):
        log(f"[Check] sys._MEIPASS = {sys._MEIPASS}")
        meipass = sys._MEIPASS
        for item in ['frontend_dist', 'server_dist', 'node', 'version.txt']:
            path = os.path.join(meipass, item)
            exists = os.path.exists(path)
            log(f"[Check]   {item}/ exists = {exists} ({path})")
        exe_dir = os.path.dirname(sys.executable)
        resource_dir = os.path.join(os.path.dirname(exe_dir), 'Resources')
        if os.path.isdir(resource_dir):
            log(f"[Check]   Resources/ exists = True ({resource_dir})")
            for item in ['shared_node_modules', 'frontend_dist']:
                path = os.path.join(resource_dir, item)
                exists = os.path.exists(path)
                log(f"[Check]     {item}/ exists = {exists} ({path})")
    log("[Check] =========================")

    try:
        idx = get_index_path()
        log(f"[Check] ✅ index.html: {idx}")
    except FileNotFoundError as e:
        errors.append(f"前端文件缺失: {e}")

    node_path = get_node_path()
    if node_path:
        log(f"[Check] ✅ Node.js: {node_path}")
    else:
        log("[Check] ⚠️ Node.js 未找到")

    server_script = get_server_script_path()
    if server_script:
        log(f"[Check] ✅ Server script: {server_script}")
    else:
        log("[Check] ⚠️ Server script 未找到")

    try:
        import webview
        pywebview_version = getattr(webview, '__version__', None) or getattr(webview, 'version', 'unknown')
        log(f"[Check] ✅ pywebview: {pywebview_version}")
    except Exception as e:
        errors.append(f"pywebview 不可用: {e}")

    if errors:
        for e in errors:
            log(f"[Check] ❌ {e}")
        raise RuntimeError("依赖检查失败:\n" + "\n".join(errors))
    log("[Check] ✅ 所有依赖检查通过")


def start_server():
    """启动 Node.js 主后端服务器，返回进程对象"""
    global _server_process

    node_path = get_node_path()
    if not node_path:
        print("[Server] ⚠️  Node.js 未找到，AI 助手将不可用")
        return None

    server_script = get_server_script_path()
    if not server_script:
        print("[Server] ⚠️  服务器脚本未找到，AI 助手将不可用")
        return None

    print(f"[Server] Node.js: {node_path}")
    print(f"[Server] 脚本: {server_script}")

    env = os.environ.copy()
    env['PORT'] = str(SERVER_PORT)
    env['CDF_KNOW_CLOW_DATA_DIR'] = os.path.expanduser('~/.cdf-know-clow')
    env['CDF_KNOW_CLOW_NODE_PATH'] = node_path
    # v2.8.7: 用户环境存在自签名证书链，Node.js fetch 会失败
    # 设置此环境变量禁用 TLS 证书验证，确保 DeepSeek/Kimi 等云模型 API 可正常访问
    env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'

    node_dir = os.path.dirname(node_path)
    if node_dir not in env.get('PATH', '').split(os.pathsep):
        env['PATH'] = node_dir + os.pathsep + env.get('PATH', '')
        print(f"[Server] PATH += {node_dir}")

    # 设置 NODE_PATH，确保外部依赖模块可被加载
    # 打包模式：使用 shared_node_modules
    # 开发模式：使用项目根目录的 node_modules
    shared_nm = None
    if getattr(sys, 'frozen', False):
        meipass = sys._MEIPASS
        shared_nm_candidates = [
            os.path.join(meipass, 'shared_node_modules'),
        ]
        exe_dir = os.path.dirname(sys.executable)
        resource_dir = os.path.join(os.path.dirname(exe_dir), 'Resources')
        shared_nm_candidates.append(os.path.join(resource_dir, 'shared_node_modules'))
        server_dist_parent = os.path.dirname(server_script)
        shared_nm_candidates.append(os.path.join(server_dist_parent, 'shared_node_modules'))
        shared_nm_candidates.append(os.path.join(server_dist_parent, 'node_modules'))

        for candidate in shared_nm_candidates:
            if os.path.isdir(candidate):
                shared_nm = candidate
                break

        if shared_nm:
            env['NODE_PATH'] = shared_nm
            print(f"[Server] NODE_PATH={shared_nm} (shared)")
        else:
            print(f"[Server] ⚠️ 未找到 shared_node_modules，搜索路径: {shared_nm_candidates}")

        fe_candidates = [
            os.path.join(meipass, 'frontend_dist'),
            os.path.join(resource_dir, 'frontend_dist'),
        ]
        for fe_cand in fe_candidates:
            if os.path.isdir(fe_cand):
                env['FRONTEND_DIST_PATH'] = fe_cand
                print(f"[Server] FRONTEND_DIST_PATH={fe_cand}")
                break
    else:
        # 开发模式：从项目根目录查找 node_modules
        base = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(base)
        root_node_modules = os.path.join(project_root, 'node_modules')
        if os.path.isdir(root_node_modules):
            env['NODE_PATH'] = root_node_modules
            print(f"[Server] NODE_PATH={root_node_modules} (dev)")

    if server_script.endswith('.ts'):
        base = os.path.dirname(os.path.abspath(__file__))
        tsconfig_path = os.path.join(base, 'server', 'tsconfig.json')
        tsx_path = shutil.which('tsx')
        if tsx_path:
            cmd = [tsx_path, '--tsconfig', tsconfig_path, server_script]
        else:
            # 开发模式：优先查找项目根目录的 node_modules/.bin/tsx
            project_root = os.path.dirname(base)
            local_tsx = os.path.join(project_root, 'node_modules', '.bin', 'tsx')
            if os.path.isfile(local_tsx):
                cmd = [local_tsx, '--tsconfig', tsconfig_path, server_script]
            else:
                # 兼容旧路径（scripts/ 子目录）
                local_tsx = os.path.join(base, 'node_modules', '.bin', 'tsx')
                if os.path.isfile(local_tsx):
                    cmd = [local_tsx, '--tsconfig', tsconfig_path, server_script]
                else:
                    print("[Server] ⚠️ tsx 未找到，无法运行 TypeScript 服务器")
                    return None
    else:
        cmd = [node_path, server_script]

    log_dir = os.path.dirname(get_log_path())
    server_stdout_log = open(os.path.join(log_dir, 'server-stdout.log'), 'a')
    server_stderr_log = open(os.path.join(log_dir, 'server-stderr.log'), 'a')

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=server_stdout_log,
            stderr=server_stderr_log,
            env=env,
            start_new_session=True,
        )
        _server_process = proc
        print(f"[Server] 进程已启动 (PID: {proc.pid})")
        _watch_process(proc, start_server, 'Server')
        return proc
    except Exception as e:
        print(f"[Server] ❌ 启动失败: {e}")
        return None


def wait_for_server():
    """等待主后端服务器就绪"""
    print(f"[Server] 等待后端就绪 (最长 {SERVER_START_TIMEOUT}s)...")
    start_time = time.time()

    while time.time() - start_time < SERVER_START_TIMEOUT:
        try:
            req = urllib.request.Request(SERVER_HEALTH_URL, method='GET')
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.status == 200:
                    elapsed = time.time() - start_time
                    print(f"[Server] ✅ 后端就绪 (耗时 {elapsed:.1f}s)")
                    return True
        except (urllib.error.URLError, ConnectionRefusedError, OSError):
            pass

        time.sleep(0.5)

    print(f"[Server] ⚠️  后端未在 {SERVER_START_TIMEOUT}s 内就绪，继续启动前端")
    return False


def stop_server():
    """停止 Node.js 主后端服务器"""
    global _server_process, shutting_down
    shutting_down = True
    if _server_process and _server_process.poll() is None:
        print("[Server] 停止后端服务器...")
        try:
            os.killpg(os.getpgid(_server_process.pid), signal.SIGTERM)
            _server_process.wait(timeout=5)
        except Exception:
            try:
                _server_process.kill()
            except Exception:
                pass
        _server_process = None
        print("[Server] 后端已停止")


# ===================== 腾讯文档 Token 管理 =====================

def load_token():
    """从本地文件加载 token"""
    try:
        if os.path.isfile(TDOC_TOKEN_FILE):
            with open(TDOC_TOKEN_FILE, 'r') as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def save_token(token_data):
    """保存 token 到本地文件"""
    os.makedirs(os.path.dirname(TDOC_TOKEN_FILE), exist_ok=True)
    token_data['saved_at'] = time.time()
    with open(TDOC_TOKEN_FILE, 'w') as f:
        json.dump(token_data, f, indent=2)


def tdoc_request(path, method='GET', data=None):
    """发起腾讯文档 API 请求"""
    token = load_token()
    req_headers = {
        'Content-Type': 'application/json',
    }
    if token.get('access_token'):
        req_headers['Access-Token'] = token['access_token']
    if token.get('client_id'):
        req_headers['Client-Id'] = token['client_id']
    if token.get('open_id'):
        req_headers['Open-Id'] = token['open_id']

    url = f"{TDOC_API_BASE}{path}"
    req = urllib.request.Request(url, method=method, headers=req_headers)

    if data:
        body = json.dumps(data).encode('utf-8')
        req.data = body

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp_data = json.loads(resp.read().decode('utf-8'))
            return {'ok': True, 'data': resp_data, 'status': resp.status}
    except urllib.error.HTTPError as e:
        body_text = e.read().decode('utf-8', errors='replace')
        try:
            body_json = json.loads(body_text)
        except Exception:
            body_json = {'raw': body_text}
        return {'ok': False, 'error': body_json, 'status': e.code}
    except Exception as e:
        return {'ok': False, 'error': str(e), 'status': 0}


# ===================== JS API 桥接 =====================

class Api:
    """pywebview JS-Python 桥接 API
    前端通过 window.pywebview.api.xxx() 直接调用这些方法。

    v1.5.166: 红黄绿按钮改为前端自定义渲染（WindowDragBar 组件），
    后端只保留窗口控制方法，不再尝试偏移系统按钮。
    """

    def __init__(self):
        self._window = None

    def set_window(self, window):
        """设置主窗口引用（main() 中创建窗口后调用）"""
        self._window = window

    def get_version(self):
        """返回应用版本号（从 version.txt 读取）"""
        return APP_VERSION

    # ---- 窗口控制（frameless 模式下前端调用） ----

    def window_close(self):
        """关闭窗口（异步销毁，避免前端通信崩溃）"""
        try:
            stop_server()
        except Exception as e:
            log(f"[Shutdown] stop_server 异常: {e}")
        try:
            stop_host_url = f"http://127.0.0.1:{SERVER_PORT}/api/browser/stop-host"
            req = urllib.request.Request(stop_host_url, method='POST',
                                         data=b'{}',
                                         headers={'Content-Type': 'application/json'})
            urllib.request.urlopen(req, timeout=2)
        except Exception:
            pass
        # v1.5.176: 先返回成功，再异步销毁窗口（避免前端通信崩溃）
        if self._window:
            def _destroy_later():
                import time
                time.sleep(0.3)
                try:
                    self._window.destroy()
                except Exception as e:
                    log(f"[Window] destroy 异常: {e}")
            import threading
            t = threading.Thread(target=_destroy_later, daemon=True)
            t.start()
        return json.dumps({'ok': True})

    def window_minimize(self):
        """最小化窗口 — v1.5.201: 使用 minimize() 而非 hide()，Dock 栏保留图标"""
        try:
            if self._window:
                self._window.minimize()
        except Exception as e:
            log(f"[window_minimize] 异常: {e}")
        return json.dumps({'ok': True})

    def window_show(self):
        """恢复窗口（从最小化状态）"""
        if self._window:
            try:
                self._window.restore()
            except Exception:
                pass
        return json.dumps({'ok': True})

    def window_maximize(self):
        """切换全屏（pywebview 没有 zoom 方法，用 toggle_fullscreen 代替）"""
        if self._window:
            self._window.toggle_fullscreen()
        return json.dumps({'ok': True})

    def window_toggle_fullscreen(self):
        """切换全屏（window_maximize 的别名，供前端调用）"""
        return self.window_maximize()

    # ---- 腾讯文档 OAuth ----

    def tdoc_status(self):
        """获取认证状态"""
        token = load_token()
        has_token = bool(token.get('access_token'))
        expires_at = token.get('expires_at', 0)
        is_expired = time.time() > expires_at if expires_at else True
        return json.dumps({
            'authenticated': has_token and not is_expired,
            'hasToken': has_token,
            'isExpired': is_expired,
            'clientId': token.get('client_id', ''),
        })

    def tdoc_auth_url(self, client_id, client_secret):
        """生成 OAuth 授权 URL 并保存 client 信息"""
        if not client_id:
            return json.dumps({'error': 'client_id is required'})

        token = load_token()
        token['client_id'] = client_id
        token['client_secret'] = client_secret
        save_token(token)

        redirect_uri = 'http://127.0.0.1'
        auth_url = (
            f"{TDOC_OAUTH_BASE}/authorize"
            f"?client_id={urllib.parse.quote(client_id)}"
            f"&redirect_uri={urllib.parse.quote(redirect_uri)}"
            f"&response_type=code"
            f"&scope=all"
        )
        return json.dumps({'auth_url': auth_url})

    def tdoc_exchange_token(self, code):
        """用授权码换取 access_token"""
        token = load_token()
        client_id = token.get('client_id', '')
        client_secret = token.get('client_secret', '')

        if not code or not client_id or not client_secret:
            return json.dumps({'ok': False, 'error': 'code, client_id, client_secret are required'})

        url = (
            f"{TDOC_OAUTH_BASE}/token"
            f"?client_id={urllib.parse.quote(client_id)}"
            f"&client_secret={urllib.parse.quote(client_secret)}"
            f"&grant_type=authorization_code"
            f"&code={urllib.parse.quote(code)}"
            f"&redirect_uri={urllib.parse.quote('http://127.0.0.1')}"
        )
        try:
            req = urllib.request.Request(url, method='GET')
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                if result.get('access_token'):
                    result['client_id'] = client_id
                    result['client_secret'] = client_secret
                    result['open_id'] = result.get('user_id', '')
                    result['expires_at'] = time.time() + result.get('expires_in', 2592000)
                    save_token(result)
                    return json.dumps({
                        'ok': True,
                        'access_token': result['access_token'][:8] + '...',
                        'expires_in': result.get('expires_in', 0),
                    })
                else:
                    return json.dumps({'ok': False, 'error': result})
        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8', errors='replace')
            return json.dumps({'ok': False, 'error': err_body})
        except Exception as e:
            return json.dumps({'ok': False, 'error': str(e)})

    def tdoc_refresh_token(self):
        """刷新 access_token"""
        token = load_token()
        client_id = token.get('client_id', '')
        client_secret = token.get('client_secret', '')
        refresh_token_val = token.get('refresh_token', '')

        if not refresh_token_val or not client_id:
            return json.dumps({'ok': False, 'error': 'No refresh token available'})

        url = (
            f"{TDOC_OAUTH_BASE}/token"
            f"?client_id={urllib.parse.quote(client_id)}"
            f"&client_secret={urllib.parse.quote(client_secret)}"
            f"&grant_type=refresh_token"
            f"&refresh_token={urllib.parse.quote(refresh_token_val)}"
        )
        try:
            req = urllib.request.Request(url, method='GET')
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                if result.get('access_token'):
                    result['client_id'] = client_id
                    result['client_secret'] = client_secret
                    result['open_id'] = result.get('user_id', token.get('open_id', ''))
                    result['expires_at'] = time.time() + result.get('expires_in', 2592000)
                    save_token(result)
                    return json.dumps({'ok': True, 'expires_in': result.get('expires_in', 0)})
                else:
                    return json.dumps({'ok': False, 'error': result})
        except Exception as e:
            return json.dumps({'ok': False, 'error': str(e)})

    # ---- 腾讯文档内容 ----

    def tdoc_doc_content(self, file_id):
        """获取文档内容（Doc 类型）"""
        if not file_id:
            return json.dumps({'error': 'file_id is required'})
        result = tdoc_request(f"/doc/v3/{file_id}")
        if result['ok']:
            return json.dumps(result['data'])
        return json.dumps({'error': result.get('error', 'Unknown error')})

    def tdoc_sheet_content(self, file_id, sheet_id, range_str='A1:Z200'):
        """获取表格内容（Sheet 类型）"""
        if not file_id or not sheet_id:
            return json.dumps({'error': 'file_id and sheet_id are required'})
        path = f"/spreadsheet/v3/files/{file_id}/{sheet_id}/{range_str}"
        result = tdoc_request(path)
        if result['ok']:
            return json.dumps(result['data'])
        return json.dumps({'error': result.get('error', 'Unknown error')})

    def tdoc_sheet_info(self, file_id):
        """获取表格子表信息"""
        if not file_id:
            return json.dumps({'error': 'file_id is required'})
        result = tdoc_request(f"/sheet_book/v2/{file_id}/sheets-info")
        if result['ok']:
            return json.dumps(result['data'])
        return json.dumps({'error': result.get('error', 'Unknown error')})

    # ---- 企业微信文档 ----

    WECOM_CLI = 'wecom-cli'

    def _run_wecom_cli(self, *args, timeout=60):
        """执行 wecom-cli 命令并返回统一格式"""
        cmd = [self.WECOM_CLI] + list(args)
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            if result.returncode != 0:
                err_text = result.stderr.strip() or f'Exit code {result.returncode}'
                return {'ok': False, 'error': err_text}
            output = result.stdout.strip()
            if not output:
                return {'ok': False, 'error': 'Empty response from wecom-cli'}
            parsed = json.loads(output)
            if parsed.get('errcode', 0) != 0:
                return {
                    'ok': False,
                    'error': f"[{parsed.get('errcode')}] {parsed.get('errmsg', 'Unknown error')}",
                }
            return {'ok': True, 'data': parsed}
        except FileNotFoundError:
            return {'ok': False, 'error': 'wecom-cli not installed. Run: npm install -g @wecom/cli'}
        except subprocess.TimeoutExpired:
            return {'ok': False, 'error': 'wecom-cli command timed out'}
        except json.JSONDecodeError as e:
            return {'ok': False, 'error': f'Invalid JSON response: {e}'}
        except Exception as e:
            return {'ok': False, 'error': str(e)}

    def wecom_check_auth(self):
        """检查企业微信 wecom-cli 认证状态"""
        cli_path = shutil.which(self.WECOM_CLI)
        if not cli_path:
            return json.dumps({
                'cliInstalled': False,
                'authorized': False,
                'checkedAt': time.time(),
            })

        try:
            result = subprocess.run(
                [self.WECOM_CLI, 'auth', 'show', '--auth-status'],
                capture_output=True, text=True, timeout=10,
            )
            output = result.stdout.strip().lower()
            authorized = 'authorized' in output and 'unauthorized' not in output
        except Exception:
            authorized = False

        return json.dumps({
            'cliInstalled': True,
            'authorized': authorized,
            'checkedAt': time.time(),
        })

    def wecom_doc_content(self, docid, doc_category='doc'):
        """读取企业文档/智能表格内容（异步轮询 get_doc_content）"""
        if not docid:
            return json.dumps({'ok': False, 'error': 'docid is required'})

        result = self._run_wecom_cli('doc', 'get_doc_content', json.dumps({
            'docid': docid,
            'type': 2,
        }))

        if not result['ok']:
            return json.dumps(result)

        data = result['data']
        max_polls = 10
        poll_interval = 2
        for _ in range(max_polls):
            if data.get('task_done', True):
                break
            task_id = data.get('task_id', '')
            if not task_id:
                break
            time.sleep(poll_interval)
            result = self._run_wecom_cli('doc', 'get_doc_content', json.dumps({
                'docid': docid,
                'type': 2,
                'task_id': task_id,
            }))
            if not result['ok']:
                return json.dumps(result)
            data = result['data']

        if data.get('task_done'):
            return json.dumps({'ok': True, 'content': data.get('content', ''), 'format': 'markdown'})
        else:
            return json.dumps({'ok': False, 'error': 'Document content export timed out'})

    def wecom_smartsheet_structure(self, docid):
        """获取智能表格结构（子表列表 + 各子表字段）"""
        if not docid:
            return json.dumps({'ok': False, 'error': 'docid is required'})

        sheets_result = self._run_wecom_cli('doc', 'smartsheet_get_sheet', json.dumps({'docid': docid}))
        if not sheets_result['ok']:
            return json.dumps(sheets_result)

        sheets_data = sheets_result['data']
        sheets = sheets_data.get('sheet_list', sheets_data.get('data', []))
        if not sheets:
            if isinstance(sheets_data, dict) and 'sheet_id' in sheets_data:
                sheets = [sheets_data]
            else:
                sheets = []

        fields_map = {}
        for sheet in sheets:
            sheet_id = sheet.get('sheet_id', '')
            if sheet_id:
                fields_result = self._run_wecom_cli('doc', 'smartsheet_get_fields', json.dumps({
                    'docid': docid,
                    'sheet_id': sheet_id,
                }))
                if fields_result['ok']:
                    fdata = fields_result['data']
                    fields_map[sheet_id] = fdata.get('fields', fdata.get('data', []))

        return json.dumps({
            'ok': True,
            'sheets': sheets,
            'fields': fields_map,
        })

    def wecom_smartsheet_data(self, docid, sheet_id):
        """获取智能表格数据"""
        if not docid or not sheet_id:
            return json.dumps({'ok': False, 'error': 'docid and sheet_id are required'})

        result = self._run_wecom_cli('doc', 'smartsheet_get_records', json.dumps({
            'docid': docid,
            'sheet_id': sheet_id,
        }))
        if result['ok']:
            return json.dumps({'ok': True, 'data': result['data']})
        return json.dumps(result)

    def wecom_smartpage_content(self, docid):
        """读取智能文档内容（smartpage 品类，两步异步）"""
        if not docid:
            return json.dumps({'ok': False, 'error': 'docid is required'})

        export_result = self._run_wecom_cli('doc', 'smartpage_export_task', json.dumps({
            'docid': docid,
            'content_type': 1,
        }))

        if not export_result['ok']:
            return json.dumps(export_result)

        task_id = export_result['data'].get('task_id', '')
        if not task_id:
            return json.dumps({'ok': False, 'error': 'No task_id returned from export task'})

        max_polls = 15
        poll_interval = 3
        for _ in range(max_polls):
            time.sleep(poll_interval)
            poll_result = self._run_wecom_cli('doc', 'smartpage_get_export_result', json.dumps({
                'task_id': task_id,
            }))
            if not poll_result['ok']:
                return json.dumps(poll_result)

            if poll_result['data'].get('task_done', False):
                return json.dumps({
                    'ok': True,
                    'content': poll_result['data'].get('content', ''),
                    'format': 'markdown',
                })

        return json.dumps({'ok': False, 'error': 'SmartPage export timed out'})

    # ---- 通用 ----

    def open_in_browser(self, url):
        """在应用内嵌入式窗口中打开 URL"""
        try:
            parsed = urllib.parse.urlparse(url)
            title = parsed.netloc or os.path.basename(url)
            if len(title) > 30:
                title = title[:27] + '...'
            webview.create_window(
                title=title,
                url=url,
                width=1024,
                height=768,
                resizable=True,
                text_select=True,
            )
            log(f"[open_in_browser] 应用内窗口: {url}")
            return json.dumps({'ok': True, 'mode': 'webview'})
        except Exception as e:
            log(f"[open_in_browser] pywebview 窗口失败，降级到系统浏览器: {e}")
            webbrowser.open(url)
            return json.dumps({'ok': True, 'mode': 'browser', 'fallback': True})

    def get_release_info(self):
        """获取 GitHub Releases 上的 release.json（供前端检查更新，绕过 CORS）"""
        RELEASE_URLS = [
            'https://raw.githubusercontent.com/chouraycn/cross-wms/main/release/release.json',
            'https://github.com/chouraycn/cross-wms/releases/latest/download/release.json',
        ]
        last_error = None
        for url in RELEASE_URLS:
            for attempt in range(2):
                try:
                    req = urllib.request.Request(
                        url,
                        method='GET',
                        headers={'User-Agent': f'CDF-Know-Clow/{APP_VERSION}'}
                    )
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        data = resp.read().decode('utf-8')
                        json.loads(data)
                        print(f"[update] release.json 获取成功 (URL={url[:50]}..., attempt {attempt + 1})")
                        return data
                except Exception as e:
                    last_error = str(e)
                    if attempt < 1:
                        time.sleep(1)
            print(f"[update] URL {url[:50]}... 失败，尝试下一个")
        return json.dumps({'error': last_error or 'unknown error'})

    # ---- 文件下载（替代 WKWebView blob URL 下载） ----

    def download_csv(self, filename: str, bom_csv_content: str) -> str:
        """将 CSV 文件保存到用户的 ~/Downloads 目录"""
        try:
            downloads_dir = os.path.expanduser("~/Downloads")
            os.makedirs(downloads_dir, exist_ok=True)
            filepath = os.path.join(downloads_dir, filename)

            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(bom_csv_content)

            log(f"[Download] CSV 已保存: {filepath}")
            return json.dumps({'ok': True, 'path': filepath})
        except Exception as e:
            log(f"[Download] CSV 保存失败: {e}")
            return json.dumps({'ok': False, 'error': str(e)})


# ===================== 本地 HTTP 服务器（替代 file:// 协议）=====================

def start_http_server(dist_dir: str, port: int = 9988):
    """
    启动本地 HTTP 服务器，提供 dist 目录的静态文件服务。
    替代 file:// 协议，彻底解决 WKWebView 不支持 ES Module 的问题。
    """
    _MIME_OVERRIDES = {
        '.js':   'application/javascript; charset=utf-8',
        '.mjs':  'application/javascript; charset=utf-8',
        '.css':  'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
        '.svg':  'image/svg+xml',
        '.png':  'image/png',
        '.jpg':  'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif':  'image/gif',
        '.ico':  'image/x-icon',
        '.woff': 'font/woff',
        '.woff2':'font/woff2',
        '.ttf':  'font/ttf',
        '.json': 'application/json; charset=utf-8',
    }

    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=dist_dir, **kwargs)

        def log_message(self, format, *args):
            pass

        def end_headers(self):
            _, ext = os.path.splitext(self.path)
            if ext in _MIME_OVERRIDES:
                self.send_header('Content-Type', _MIME_OVERRIDES[ext])
            # v1.5.199: 禁止 WKWebView 缓存本地资源，防止升级后仍显示旧版本
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            super().end_headers()

        def _proxy_to_backend(self):
            """将 /api/* 请求反向代理到 Node.js 后端"""
            backend_url = f"http://localhost:{SERVER_PORT}{self.path}"
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else None

                req = urllib.request.Request(backend_url, data=body, method=self.command, unverifiable=True)
                for header, val in self.headers.items():
                    if header.lower() not in ('host', 'connection', 'keep-alive', 'proxy-authenticate',
                                               'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade'):
                        req.add_header(header, val)

                if self.path.startswith('/api/chat'):
                    proxy_timeout = 600
                    try:
                        self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                    except Exception:
                        pass
                else:
                    proxy_timeout = 30
                with urllib.request.urlopen(req, timeout=proxy_timeout) as resp:
                    self.send_response(resp.status)
                    for key, val in resp.getheaders():
                        if key.lower() not in ('transfer-encoding', 'connection'):
                            self.send_header(key, val)
                    self.end_headers()
                    while True:
                        chunk = resp.read(1024)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        self.wfile.flush()
            except urllib.error.HTTPError as e:
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                error_body = e.read() if e.fp else b'{"error":"Backend error"}'
                self.wfile.write(error_body)
            except Exception as e:
                self.send_response(502)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': f'Proxy error: {str(e)}'}).encode('utf-8'))

        def do_GET(self):
            if self.path == '/api/health':
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'ok'}).encode('utf-8'))
                return
            if self.path.startswith('/api/'):
                self._proxy_to_backend()
                return
            super().do_GET()

        def do_POST(self):
            if self.path == '/api/open-url':
                self._handle_open_url()
                return
            if self.path.startswith('/api/'):
                self._proxy_to_backend()
                return
            self.send_error(404)

        def _handle_open_url(self):
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                data = json.loads(body.decode('utf-8'))
                url = data.get('url', '')
                if not url:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'ok': False, 'error': 'Missing url'}).encode('utf-8'))
                    return
            except Exception:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'error': 'Invalid JSON'}).encode('utf-8'))
                return

            try:
                parsed = urllib.parse.urlparse(url)
                title = parsed.netloc or '网页'
                if len(title) > 30:
                    title = title[:27] + '...'
                webview.create_window(
                    title=title,
                    url=url,
                    width=1024,
                    height=768,
                    resizable=True,
                    text_select=True,
                )
                log(f"[open-url] 应用内窗口: {url}")
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': True, 'url': url}).encode('utf-8'))
            except Exception as e:
                log(f"[open-url] 窗口创建失败: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'error': str(e)}).encode('utf-8'))

        def do_PUT(self):
            if self.path.startswith('/api/'):
                self._proxy_to_backend()
                return
            self.send_error(404)

        def do_DELETE(self):
            if self.path.startswith('/api/'):
                self._proxy_to_backend()
                return
            self.send_error(404)

    socketserver.ThreadingTCPServer.allow_reuse_address = True

    try:
        httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), QuietHandler)
        httpd.daemon_threads = True
    except OSError as e:
        if getattr(sys, 'frozen', False):
            raise
        print(f"[HTTP Server] 端口 {port} 被占用 ({e})，尝试清理...")
        result = subprocess.run(['lsof', '-ti', f'tcp:{port}'], capture_output=True, text=True)
        if result.stdout.strip():
            pids = result.stdout.strip().split('\n')
            for pid in pids:
                try:
                    os.kill(int(pid), signal.SIGKILL)
                    print(f"[HTTP Server] 已终止旧进程 PID={pid}")
                except Exception:
                    pass
            time.sleep(0.5)
            httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), QuietHandler)
            httpd.daemon_threads = True
        else:
            raise

    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()

    print(f"[HTTP Server] 已启动 http://127.0.0.1:{port}/ (dist: {dist_dir})")
    return httpd, port


def main():
    log("=== CDF Know Clow 启动 ===")
    log(f"  sys.frozen = {getattr(sys, 'frozen', False)}")
    log(f"  sys.executable = {getattr(sys, 'executable', 'N/A')}")
    if getattr(sys, 'frozen', False):
        log(f"  sys._MEIPASS = {sys._MEIPASS}")

    httpd = None
    exit_code = 0

    try:
        check_dependencies()

        frontend_path = get_index_path()
        dist_dir = os.path.dirname(frontend_path)
        httpd, http_port = start_http_server(dist_dir, 9988)
        frontend_url = f'http://127.0.0.1:{http_port}/splash.html'
        log(f"[Frontend] 通过 HTTP 加载: {frontend_url}")

        log("[Frontend] 等待 HTTP 服务器就绪...")
        health_url = f'http://127.0.0.1:{http_port}/api/health'
        for _retry in range(50):
            try:
                req = urllib.request.Request(health_url, method='GET')
                with urllib.request.urlopen(req, timeout=0.5) as resp:
                    if resp.status == 200:
                        log(f"[Frontend] ✅ HTTP 服务器就绪 (尝试 {_retry + 1} 次)")
                        break
            except Exception:
                pass
            time.sleep(0.1)
        else:
            log("[Frontend] ⚠️  HTTP 服务器未在 5 秒内就绪，继续启动（可能白屏）")

        server_proc = start_server()
        if server_proc:
            def _wait_server():
                wait_for_server()
            threading.Thread(target=_wait_server, daemon=True).start()
            log("[Server] AI 助手后端已启动（可选，不影响前端加载）")
        else:
            log("[Server] ⚠️ Node.js 未找到，AI 助手将不可用")

        api = Api()
        window = webview.create_window(
            title=APP_NAME,
            url=frontend_url,
            width=WIDTH,
            height=HEIGHT,
            min_size=MIN_SIZE,
            resizable=True,
            text_select=True,
            js_api=api,
            frameless=True,   # v1.5.166: 无系统标题栏，红黄绿按钮由前端 WindowDragBar 自定义渲染
            easy_drag=False,
        )
        api.set_window(window)

        log("[Main] pywebview 窗口已创建，启动事件循环...")

        webview.start(debug=os.environ.get('PYWEBVIEW_DEBUG', '0') == '1', private_mode=False)

        log("[Main] CDF Know Clow 窗口已关闭，退出")
    except FileNotFoundError as e:
        log(f"[FATAL] {e}")
        exit_code = 1
    except Exception as e:
        log(f"[FATAL] 未捕获异常: {e}")
        log(traceback.format_exc())
        exit_code = 1
    finally:
        if httpd:
            try:
                httpd.shutdown()
                httpd.server_close()
                log("[HTTP Server] 已停止")
            except Exception as e:
                log(f"[HTTP Server] 停止失败: {e}")

        try:
            stop_server()
        except Exception as e:
            log(f"[Shutdown] finally:stop_server 异常: {e}")

        log(f"=== CDF Know Clow 退出 (exit_code={exit_code}) ===")

    if exit_code != 0:
        raise SystemExit(exit_code)


if __name__ == '__main__':
    main()
