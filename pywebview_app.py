#!/usr/bin/env python3
"""
CrossWMS — pywebview 启动脚本
用原生 macOS 窗口内嵌 WebView 渲染前端页面，不弹浏览器

v5: 集成 Agent Web 应用
- 添加 Agent Web 后端支持（端口 3002）
- 添加 Agent Web 前端服务（端口 5174）
- 修复多处语法错误
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
import socketserver
import threading
import traceback

import webview

# ===================== Cocoa 支持（macOS 红黄绿按钮控制）=====================
try:
    from Cocoa import NSApp
    from objc import lookUpClass
    COCOA_AVAILABLE = True
except ImportError:
    COCOA_AVAILABLE = False
    print("[Warning] Cocoa/pyobjc not available, traffic light offset will be disabled")

# ===================== 配置持久化 =====================

CONFIG_DIR = os.path.expanduser("~/.crosswms")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")


def load_config():
    """加载配置文件，返回 dict"""
    default_config = {
        "traffic_light_offset_x": 5,   # 红黄绿按钮默认右移 5px
        "traffic_light_offset_y": 5,   # 红黄绿按钮默认下移 5px
    }
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


# 记录红黄绿按钮的原始位置（避免重复调用时累加偏移）
_traffic_light_original_frames = {}


def apply_traffic_light_offset(window, offset_x: int, offset_y: int):
    """
    应用红黄绿按钮偏移量（macOS only）
    通过 Cocoa API 整体平移红黄绿三个按钮的位置。
    基于按钮的原始位置计算，不会因重复调用而累加偏移。
    """
    if not COCOA_AVAILABLE:
        return False
    if not window:
        return False

    try:
        # 通过 NSApp.windows() 查找我们的窗口
        target_window = None
        for w in NSApp.windows():
            try:
                if w.isVisible() and w.title() == APP_NAME:
                    target_window = w
                    break
            except Exception:
                continue

        if target_window is None:
            print("[TrafficLight] 未找到匹配的 NSWindow")
            return False

        # 按钮类型常量
        NSWindowCloseButton = 0
        NSWindowMiniaturizeButton = 1
        NSWindowZoomButton = 2

        # 获取标准窗口按钮
        close_btn = target_window.standardWindowButton_(NSWindowCloseButton)
        min_btn = target_window.standardWindowButton_(NSWindowMiniaturizeButton)
        zoom_btn = target_window.standardWindowButton_(NSWindowZoomButton)

        buttons = [b for b in [close_btn, min_btn, zoom_btn] if b is not None]

        if not buttons:
            print("[TrafficLight] 未找到标准窗口按钮")
            return False

        # 打印每个按钮的当前位置（调试）
        for i, btn in enumerate(buttons):
            f = btn.frame()
            print(f"[TrafficLight] 按钮 {i} 当前位置: x={f.origin.x:.1f}, y={f.origin.y:.1f}, w={f.size.width:.1f}, h={f.size.height:.1f}")

        # 首次调用时记录按钮的原始位置（用于避免累加偏移）
        btn_ids = [id(b) for b in buttons]
        first_call = not _traffic_light_original_frames
        if first_call:
            for i, btn in enumerate(buttons):
                f = btn.frame()
                _traffic_light_original_frames[id(btn)] = (f.origin.x, f.origin.y)
            print(f"[TrafficLight] 已记录 {len(_traffic_light_original_frames)} 个按钮的原始位置")

        # Cocoa 坐标系 Y 轴朝上，而用户接口约定 Y 正值=向下
        # 因此 Y 方向需要取反
        cocoa_offset_x = offset_x
        cocoa_offset_y = -offset_y  # 用户正值=向下 → Cocoa 负值

        # 基于原始位置计算目标位置（避免累加偏移）
        moved_count = 0
        for btn in buttons:
            try:
                btn_id = id(btn)
                orig = _traffic_light_original_frames.get(btn_id)
                if orig:
                    # 基于原始位置 + 偏移量
                    new_x = orig[0] + cocoa_offset_x
                    new_y = orig[1] + cocoa_offset_y
                else:
                    # 没有原始位置记录（不应该发生），基于当前位置
                    frame = btn.frame()
                    new_x = frame.origin.x + cocoa_offset_x
                    new_y = frame.origin.y + cocoa_offset_y
                btn.setFrameOrigin_((new_x, new_y))
                # 验证
                verify = btn.frame()
                if abs(verify.origin.x - new_x) < 1 and abs(verify.origin.y - new_y) < 1:
                    moved_count += 1
                    print(f"[TrafficLight] 按钮 {moved_count} 移动成功: → ({verify.origin.x:.1f},{verify.origin.y:.1f})")
                else:
                    print(f"[TrafficLight] 按钮 {moved_count+1} 移动验证失败: 期望({new_x:.1f},{new_y:.1f}) 实际({verify.origin.x:.1f},{verify.origin.y:.1f})")
            except Exception as e:
                print(f"[TrafficLight] 按钮移动异常: {e}")

        # 方案2: 如果方案1部分失败，尝试通过父视图整体偏移
        if moved_count < len(buttons):
            print("[TrafficLight] 方案1部分失败，尝试方案2（父视图偏移）...")
            try:
                # 找到按钮的公共父视图
                parent = close_btn.superview() if close_btn else None
                if parent:
                    pf = parent.frame()
                    parent.setFrameOrigin_((pf.origin.x + cocoa_offset_x, pf.origin.y + cocoa_offset_y))
                    print(f"[TrafficLight] 父视图偏移成功: ({pf.origin.x:.1f},{pf.origin.y:.1f}) → ({pf.origin.x + cocoa_offset_x:.1f},{pf.origin.y + cocoa_offset_y:.1f})")
                    moved_count = len(buttons)  # 假设父视图偏移成功
            except Exception as e:
                print(f"[TrafficLight] 父视图偏移失败: {e}")

        print(f"[TrafficLight] 最终结果: 成功移动 {moved_count}/{len(buttons)} 个按钮, 偏移量({offset_x}, {offset_y})")
        return moved_count > 0
    except Exception as e:
        print(f"[TrafficLight] 应用偏移失败: {e}")
        import traceback
        traceback.print_exc()
        return False


# ===================== 日志文件 =====================

def get_log_path():
    """获取日志文件路径 ~/Library/Logs/CrossWMS/startup.log"""
    log_dir = os.path.expanduser("~/Library/Logs/CrossWMS")
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

APP_NAME = "CrossWMS"
WIDTH = 1280
HEIGHT = 800
MIN_SIZE = (900, 600)

# 腾讯文档 API
TDOC_API_BASE = "https://docs.qq.com/openapi"
TDOC_OAUTH_BASE = "https://docs.qq.com/oauth/v2"
TDOC_TOKEN_FILE = os.path.expanduser("~/.crosswms/tdoc_token.json")

# Node.js 后端服务器配置（主后端）
SERVER_PORT = 3001
SERVER_HEALTH_URL = f"http://localhost:{SERVER_PORT}/api/health"
SERVER_START_TIMEOUT = 30  # 等待后端启动的最长时间（秒）

# Agent Web 后端配置
AGENT_SERVER_PORT = 3002
AGENT_SERVER_HEALTH_URL = f"http://localhost:{AGENT_SERVER_PORT}/api/health"
AGENT_SERVER_START_TIMEOUT = 30

# Agent Web 前端配置
AGENT_FRONTEND_PORT = 5174
AGENT_FRONTEND_URL = f"http://localhost:{AGENT_FRONTEND_PORT}"


def read_version():
    """从 version.txt 读取版本号，读取失败则返回 '0.0.0'"""
    candidates = []

    if getattr(sys, 'frozen', False):
        meipass = sys._MEIPASS
        # PyInstaller --add-data version.txt:version.txt 会创建 version.txt/ 目录
        candidates.append(os.path.join(meipass, 'version.txt', 'version.txt'))
        candidates.append(os.path.join(meipass, 'version.txt'))

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

    # 优先使用环境变量（手动 .app 包场景）
    resources_env = os.environ.get('CROSSWMS_RESOURCES')
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

    base = os.path.dirname(os.path.abspath(__file__))
    candidates.extend([
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
_agent_server_process = None


def get_node_path():
    """获取 Node.js 可执行文件路径"""
    candidates = []

    # 优先使用环境变量（手动 .app 包场景）
    resources_env = os.environ.get('CROSSWMS_RESOURCES')
    if resources_env:
        candidates.extend([
            os.path.join(resources_env, 'node', 'node'),
            os.path.join(resources_env, 'node', 'bin', 'node'),
        ])

    if getattr(sys, 'frozen', False):
        # PyInstaller 打包模式：Node.js 嵌入在 Resources/node/ 目录
        exe_dir = os.path.dirname(sys.executable)
        resource_dir = os.path.join(os.path.dirname(exe_dir), 'Resources')
        candidates.extend([
            os.path.join(resource_dir, 'node', 'bin', 'node'),
            os.path.join(resource_dir, 'node', 'node'),
        ])
        # MEIPASS 模式
        meipass = sys._MEIPASS
        candidates.extend([
            os.path.join(meipass, 'node', 'bin', 'node'),
            os.path.join(meipass, 'node', 'node'),
        ])

    # 开发模式：使用系统 Node.js
    candidates.extend([
        '/usr/local/bin/node',
        '/opt/homebrew/bin/node',
    ])

    for p in candidates:
        if os.path.isfile(p) and os.access(p, os.X_OK):
            return p

    # 尝试 PATH 中的 node
    node_in_path = shutil.which('node')
    if node_in_path:
        return node_in_path

    return None


def get_server_script_path():
    """获取主服务器入口文件路径"""
    candidates = []

    # 优先使用环境变量（手动 .app 包场景）
    resources_env = os.environ.get('CROSSWMS_RESOURCES')
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
    candidates.extend([
        os.path.join(base, 'server_dist', 'index.cjs'),
        os.path.join(base, 'server', 'index.ts'),
    ])

    for p in candidates:
        if os.path.isfile(p):
            return p

    return None


def get_agent_server_script_path():
    """获取 Agent Web 服务器入口文件路径"""
    candidates = []

    # 优先使用环境变量（手动 .app 包场景）
    resources_env = os.environ.get('CROSSWMS_RESOURCES')
    if resources_env:
        candidates.extend([
            os.path.join(resources_env, 'agent_server_dist', 'agent_index.cjs'),
            os.path.join(resources_env, 'agent_server_dist', 'index.cjs'),
        ])

    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(sys.executable)
        resource_dir = os.path.join(os.path.dirname(exe_dir), 'Resources')
        candidates.extend([
            os.path.join(resource_dir, 'agent_server_dist', 'agent_index.cjs'),
            os.path.join(resource_dir, 'agent_server_dist', 'index.cjs'),
        ])
        meipass = sys._MEIPASS
        candidates.extend([
            os.path.join(meipass, 'agent_server_dist', 'agent_index.cjs'),
            os.path.join(meipass, 'agent_server_dist', 'index.cjs'),
        ])

    base = os.path.dirname(os.path.abspath(__file__))
    candidates.extend([
        os.path.join(base, 'agent_server_dist', 'agent_index.cjs'),
        os.path.join(base, '..', 'cross-wms-agent-web', 'server', 'index.ts'),
    ])

    for p in candidates:
        if os.path.isfile(p):
            return p

    return None


def check_dependencies():
    """启动前检查关键依赖是否存在，失败则抛 RuntimeError"""
    errors = []

    # 1. 检查前端 dist/index.html
    try:
        idx = get_index_path()
        log(f"[Check] ✅ index.html: {idx}")
    except FileNotFoundError as e:
        errors.append(f"前端文件缺失: {e}")

    # 2. 检查 PyWebView 是否可用
    try:
        import webview
        pywebview_version = getattr(webview, '__version__', None) or getattr(webview, 'version', 'unknown')
        log(f"[Check] ✅ pywebview: {pywebview_version}")
    except Exception as e:
        errors.append(f"pywebview 不可用: {e}")

    # 3. 端口检查已移除（不再需要 HTTP 服务器，直接 file:// 加载）

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
        print("[Server]   请安装 Node.js 或检查打包配置")
        return None

    server_script = get_server_script_path()
    if not server_script:
        print("[Server] ⚠️  服务器脚本未找到，AI 助手将不可用")
        return None

    print(f"[Server] Node.js: {node_path}")
    print(f"[Server] 脚本: {server_script}")

    # 设置环境变量
    env = os.environ.copy()
    env['PORT'] = str(SERVER_PORT)
    env['CROSSWMS_DATA_DIR'] = os.path.expanduser('~/.crosswms')

    # 设置 NODE_PATH，让 esbuild 外部化的 require() 能找到 node_modules
    if getattr(sys, 'frozen', False):
        meipass = sys._MEIPASS
        # server_dist 目录下的 node_modules
        server_dist_dir = os.path.dirname(server_script)
        nm_path = os.path.join(server_dist_dir, 'node_modules')
        if os.path.isdir(nm_path):
            env['NODE_PATH'] = nm_path
            print(f"[Server] NODE_PATH={nm_path}")

        # 设置前端静态文件路径
        fe_dist = os.path.join(meipass, 'frontend_dist')
        if os.path.isdir(fe_dist):
            env['FRONTEND_DIST_PATH'] = fe_dist
            print(f"[Server] FRONTEND_DIST_PATH={fe_dist}")

    # 如果是 .ts 文件，需要用 tsx 运行
    if server_script.endswith('.ts'):
        # 开发模式用 tsx
        tsx_path = shutil.which('tsx')
        if tsx_path:
            cmd = [tsx_path, server_script]
        else:
            # 尝试项目本地 tsx
            base = os.path.dirname(os.path.abspath(__file__))
            local_tsx = os.path.join(base, 'node_modules', '.bin', 'tsx')
            if os.path.isfile(local_tsx):
                cmd = [local_tsx, server_script]
            else:
                print("[Server] ⚠️  tsx 未找到，无法运行 TypeScript 服务器")
                return None
    else:
        cmd = [node_path, server_script]

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            # 在新进程组中启动，方便终止
            start_new_session=True,
        )
        _server_process = proc
        print(f"[Server] 进程已启动 (PID: {proc.pid})")
        return proc
    except Exception as e:
        print(f"[Server] ❌ 启动失败: {e}")
        return None


def start_agent_server():
    """启动 Agent Web 后端服务器，返回进程对象"""
    global _agent_server_process

    node_path = get_node_path()
    if not node_path:
        print("[AgentServer] ⚠️  Node.js 未找到，Agent Web 将不可用")
        return None

    agent_server_script = get_agent_server_script_path()
    if not agent_server_script:
        print("[AgentServer] ⚠️  Agent Web 服务器脚本未找到，Agent Web 将不可用")
        return None

    print(f"[AgentServer] Node.js: {node_path}")
    print(f"[AgentServer] 脚本: {agent_server_script}")

    # 设置环境变量
    env = os.environ.copy()
    env['PORT'] = str(AGENT_SERVER_PORT)
    env['CROSSWMS_DATA_DIR'] = os.path.expanduser('~/.crosswms')

    # 设置 NODE_PATH
    if getattr(sys, 'frozen', False):
        agent_server_dist_dir = os.path.dirname(agent_server_script)
        nm_path = os.path.join(agent_server_dist_dir, 'node_modules')
        if os.path.isdir(nm_path):
            env['NODE_PATH'] = nm_path
            print(f"[AgentServer] NODE_PATH={nm_path}")

        # Agent Web 前端路径
        meipass = sys._MEIPASS
        agent_dist = os.path.join(meipass, 'agent_dist')
        if os.path.isdir(agent_dist):
            env['AGENT_FRONTEND_DIST'] = agent_dist
            print(f"[AgentServer] AGENT_FRONTEND_DIST={agent_dist}")

    # 如果是 .ts 文件，需要用 tsx 运行
    if agent_server_script.endswith('.ts'):
        tsx_path = shutil.which('tsx')
        if tsx_path:
            cmd = [tsx_path, agent_server_script]
        else:
            base = os.path.dirname(os.path.abspath(__file__))
            local_tsx = os.path.join(base, 'node_modules', '.bin', 'tsx')
            if os.path.isfile(local_tsx):
                cmd = [local_tsx, agent_server_script]
            else:
                print("[AgentServer] ⚠️  tsx 未找到，无法运行 TypeScript 服务器")
                return None
    else:
        cmd = [node_path, agent_server_script]

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            start_new_session=True,
        )
        _agent_server_process = proc
        print(f"[AgentServer] 进程已启动 (PID: {proc.pid})")
        return proc
    except Exception as e:
        print(f"[AgentServer] ❌ 启动失败: {e}")
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


def wait_for_agent_server():
    """等待 Agent Web 后端服务器就绪"""
    print(f"[AgentServer] 等待后端就绪 (最长 {AGENT_SERVER_START_TIMEOUT}s)...")
    start_time = time.time()

    while time.time() - start_time < AGENT_SERVER_START_TIMEOUT:
        try:
            req = urllib.request.Request(AGENT_SERVER_HEALTH_URL, method='GET')
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.status == 200:
                    elapsed = time.time() - start_time
                    print(f"[AgentServer] ✅ Agent Web 后端就绪 (耗时 {elapsed:.1f}s)")
                    return True
        except (urllib.error.URLError, ConnectionRefusedError, OSError):
            pass

        time.sleep(0.5)

    print(f"[AgentServer] ⚠️  Agent Web 后端未在 {AGENT_SERVER_START_TIMEOUT}s 内就绪")
    return False


def stop_server():
    """停止 Node.js 主后端服务器"""
    global _server_process
    if _server_process and _server_process.poll() is None:
        print("[Server] 停止后端服务器...")
        try:
            # 发送 SIGTERM 给整个进程组
            os.killpg(os.getpgid(_server_process.pid), signal.SIGTERM)
            _server_process.wait(timeout=5)
        except Exception:
            try:
                _server_process.kill()
            except Exception:
                pass
        _server_process = None
        print("[Server] 后端已停止")


def stop_agent_server():
    """停止 Agent Web 后端服务器"""
    global _agent_server_process
    if _agent_server_process and _agent_server_process.poll() is None:
        print("[AgentServer] 停止 Agent Web 后端服务器...")
        try:
            os.killpg(os.getpgid(_agent_server_process.pid), signal.SIGTERM)
            _agent_server_process.wait(timeout=5)
        except Exception:
            try:
                _agent_server_process.kill()
            except Exception:
                pass
        _agent_server_process = None
        print("[AgentServer] Agent Web 后端已停止")


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
    前端通过 window.pywebview.api.xxx() 直接调用这些方法
    pywebview 内置 Bottle 服务器提供文件服务，不需要手动启动 HTTP 服务器
    """

    def __init__(self):
        self._window = None

    def set_window(self, window):
        """设置主窗口引用（main() 中创建窗口后调用）"""
        self._window = window

    def get_version(self):
        """返回应用版本号（从 version.txt 读取）"""
        return APP_VERSION

    # ---- Widget 窗口控制 ----

    # ---- 窗口控制（frameless 模式下前端调用） ----

    def window_close(self):
        """关闭窗口"""
        if self._window:
            self._window.destroy()
        return json.dumps({'ok': True})

    def window_minimize(self):
        """最小化窗口"""
        if self._window:
            self._window.minimize()
        return json.dumps({'ok': True})

    def window_maximize(self):
        """最大化/还原窗口"""
        if self._window:
            self._window.toggle_fullscreen()
        return json.dumps({'ok': True})

    # ---- Agent Web 控制 ----

    def open_agent_web(self):
        """在 pywebview 中打开 Agent Web 应用"""
        agent_url = AGENT_FRONTEND_URL
        if self._window:
            self._window.load_url(agent_url)
        return json.dumps({'ok': True, 'url': agent_url})

    def get_agent_status(self):
        """获取 Agent Web 后端状态"""
        try:
            req = urllib.request.Request(AGENT_SERVER_HEALTH_URL, method='GET')
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.status == 200:
                    return json.dumps({'ok': True, 'running': True})
        except Exception:
            pass
        return json.dumps({'ok': True, 'running': False})

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
        result = tdoc_request(f"/sheetbook/v2/{file_id}/sheets-info")
        if result['ok']:
            return json.dumps(result['data'])
        return json.dumps({'error': result.get('error', 'Unknown error')})

    # ---- 企业微信文档 ----

    WECOM_CLI = 'wecom-cli'

    def _run_wecom_cli(self, *args, timeout=60):
        """执行 wecom-cli 命令并返回统一格式

        参数:
            *args: wecom-cli 的 CLI 参数（如 'doc', 'get_doc_content', json_str）
            timeout: 超时时间（秒）

        返回:
            {'ok': True/False, 'data': {...}, 'error': '...'}
        """
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
            # wecom-cli 统一返回格式包含 errcode
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
        """读取企业文档/智能表格内容（异步轮询 get_doc_content）

        适用于 doc 和 smartsheet 品类，都走 get_doc_content 接口。
        """
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
        poll_interval = 2  # 秒
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
            # 兼容不同的返回格式
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

        # 第一步：发起导出任务
        export_result = self._run_wecom_cli('doc', 'smartpage_export_task', json.dumps({
            'docid': docid,
            'content_type': 1,
        }))

        if not export_result['ok']:
            return json.dumps(export_result)

        task_id = export_result['data'].get('task_id', '')
        if not task_id:
            return json.dumps({'ok': False, 'error': 'No task_id returned from export task'})

        # 第二步：轮询导出结果
        max_polls = 15
        poll_interval = 3  # 秒
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
        """在系统浏览器中打开 URL"""
        webbrowser.open(url)
        return json.dumps({'ok': True})

    def get_release_info(self):
        """获取 GitHub Releases 上的 release.json（供前端检查更新，绕过 CORS）

        pywebview 环境下，前端通过 window.pywebview.api.get_release_info() 调用。
        Python 侧使用 urllib.request 直接请求，不受浏览器 CORS 限制。

        返回：
            release.json 的原文（JSON 字符串），或 {"error": "..."} 错误对象
        """
        RELEASE_URL = 'https://github.com/chouraycn/cross-wms/releases/latest/download/release.json'
        last_error = None
        # 重试 2 次，每次超时 5 秒（加快失败速度，避免前端长时间等待）
        for attempt in range(3):
            try:
                req = urllib.request.Request(
                    RELEASE_URL,
                    method='GET',
                    headers={'User-Agent': f'CrossWMS/{APP_VERSION}'}
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = resp.read().decode('utf-8')
                    # 验证是合法 JSON（避免返回非 JSON 内容）
                    json.loads(data)
                    print(f"[update] release.json 获取成功 (attempt {attempt + 1})")
                    return data  # 直接返回 release.json 内容
            except Exception as e:
                last_error = str(e)
                print(f"[update] 获取 release.json 失败 (attempt {attempt + 1}/3): {last_error}")
                if attempt < 2:
                    time.sleep(1)  # 重试前等待 1 秒
        return json.dumps({'error': last_error or 'unknown error'})

    # ---- 文件下载（替代 WKWebView blob URL 下载） ----

    def download_csv(self, filename: str, bom_csv_content: str) -> str:
        """
        将 CSV 文件保存到用户的 ~/Downloads 目录。
        前端通过 window.pywebview.api.download_csv(filename, csvContent) 调用。
        返回 JSON 字符串：{'ok': True, 'path': '...'} 或 {'ok': False, 'error': '...'}

        参数:
            filename: 文件名（如 'kpi_summary.csv'）
            bom_csv_content: 带 BOM 的 CSV 内容（已在 JS 端处理好）
        """
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




# ---- 红黄绿按钮控制 ----

    def set_traffic_light_offset(self, offset_x: int, offset_y: int):
        """
        设置红黄绿按钮的偏移量（macOS only）

        前端通过 window.pywebview.api.set_traffic_light_offset(x, y) 调用。
        参数:
            offset_x: 水平偏移量（正值向右，负值向左）
            offset_y: 垂直偏移量（正值向下，负值向上）
        返回:
            JSON 字符串: {'ok': True} 或 {'ok': False, 'error': '...'}
        """
        try:
            offset_x = int(offset_x)
            offset_y = int(offset_y)
        except (ValueError, TypeError):
            return json.dumps({'ok': False, 'error': 'offset_x and offset_y must be integers'})

        if not COCOA_AVAILABLE:
            return json.dumps({'ok': False, 'error': 'Cocoa/pyobjc not available'})

        # 应用偏移
        success = apply_traffic_light_offset(self._window, offset_x, offset_y)

        # 持久化配置
        if success:
            config = load_config()
            config['traffic_light_offset_x'] = offset_x
            config['traffic_light_offset_y'] = offset_y
            save_config(config)

        return json.dumps({'ok': success, 'offset_x': offset_x, 'offset_y': offset_y})

    def get_traffic_light_offset(self):
        """
        获取当前红黄绿按钮偏移量
        前端通过 window.pywebview.api.get_traffic_light_offset() 调用。
        """
        config = load_config()
        return json.dumps({
            'ok': True,
            'offset_x': config.get('traffic_light_offset_x', 5),
            'offset_y': config.get('traffic_light_offset_y', 5),
        })

    def reapply_traffic_light_offset(self):
        """
        重新应用保存的红黄绿按钮偏移量（用于窗口 resize/zoom 后恢复位置）

        当用户点击绿色 zoom 按钮时，macOS 会重置按钮位置。
        前端在 window resize 事件后调用此方法恢复偏移。
        """
        if not COCOA_AVAILABLE:
            return json.dumps({'ok': False, 'error': 'Cocoa/pyobjc not available'})

        config = load_config()
        offset_x = config.get('traffic_light_offset_x', 5)
        offset_y = config.get('traffic_light_offset_y', 5)

        # 重置原始位置缓存（因为 macOS resize 后按钮 ID 可能改变）
        _traffic_light_original_frames.clear()

        success = apply_traffic_light_offset(self._window, offset_x, offset_y)
        return json.dumps({'ok': success, 'offset_x': offset_x, 'offset_y': offset_y})

    # ---- 红黄绿按钮控制 ----



# ===================== 本地 HTTP 服务器（替代 file:// 协议）=====================

def start_http_server(dist_dir: str, port: int = 9988):
    """
    启动本地 HTTP 服务器，提供 dist 目录的静态文件服务。
    替代 file:// 协议，彻底解决 WKWebView 不支持 ES Module 的问题。

    参数：
        dist_dir: 静态文件目录
        port: 监听端口（默认 9988，固定端口确保 localStorage origin 一致）

    返回：
        (httpd, port): HTTP 服务器对象和端口号
    """

    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            # 关键：必须将 directory 传给父类，否则 SimpleHTTPRequestHandler
            # 会默认使用 os.getcwd()，而不是我们期望的 dist_dir
            super().__init__(*args, directory=dist_dir, **kwargs)

        def log_message(self, format, *args):
            # 静默日志，避免控制台刷屏
            pass

    # 允许端口复用，便于快速重启
    socketserver.TCPServer.allow_reuse_address = True

    try:
        httpd = socketserver.TCPServer(("127.0.0.1", port), QuietHandler)
    except OSError as e:
        # 端口被占用时，kill 旧进程后重试（仅开发环境）
        if getattr(sys, 'frozen', False):
            # 打包环境：端口被占说明已有实例在运行，直接抛异常让调用方处理
            raise
        print(f"[HTTP Server] 端口 {port} 被占用 ({e})，尝试清理...")
        # 查找占用端口的进程并终止
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
            httpd = socketserver.TCPServer(("127.0.0.1", port), QuietHandler)
        else:
            raise

    # 在后台守护线程中启动服务器
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()

    print(f"[HTTP Server] 已启动 http://127.0.0.1:{port}/ (dist: {dist_dir})")
    return httpd, port


def start_agent_http_server(dist_dir: str, port: int = 5174):
    """
    启动 Agent Web 前端 HTTP 服务器。

    参数：
        dist_dir: Agent Web 静态文件目录
        port: 监听端口（默认 5174）

    返回：
        (httpd, port): HTTP 服务器对象和端口号
    """
    if not os.path.isdir(dist_dir):
        print(f"[Agent HTTP Server] ⚠️  目录不存在: {dist_dir}")
        return None, None

    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=dist_dir, **kwargs)

        def log_message(self, format, *args):
            pass

    socketserver.TCPServer.allow_reuse_address = True

    try:
        httpd = socketserver.TCPServer(("127.0.0.1", port), QuietHandler)
    except OSError as e:
        print(f"[Agent HTTP Server] ⚠️  端口 {port} 被占用: {e}")
        return None, None

    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()

    print(f"[Agent HTTP Server] 已启动 http://127.0.0.1:{port}/ (dist: {dist_dir})")
    return httpd, port


def main():
    log("=== CrossWMS 启动 ===")
    log(f"  sys.frozen = {getattr(sys, 'frozen', False)}")
    log(f"  sys.executable = {getattr(sys, 'executable', 'N/A')}")
    if getattr(sys, 'frozen', False):
        log(f"  sys._MEIPASS = {sys._MEIPASS}")

    httpd = None  # HTTP 服务器对象（仅 Agent Web 使用），finally 中清理
    agent_httpd = None  # Agent Web HTTP 服务器对象
    exit_code = 0

    try:
        # 0. 启动前依赖检查
        check_dependencies()

        # 1. 获取前端 dist 目录路径，直接通过 file:// 协议加载
        frontend_path = get_index_path()
        frontend_url = f'file://{frontend_path}'
        log(f"[Frontend] 通过 file:// 加载: {frontend_url}")

        # 2. 尝试启动 Node.js 主后端（可选，仅用于 AI 助手功能）
        server_proc = start_server()
        if server_proc:
            # 非阻塞：等待后端就绪，但不阻塞前端加载
            def _wait_server():
                wait_for_server()
            threading.Thread(target=_wait_server, daemon=True).start()
            log("[Server] AI 助手后端已启动（可选，不影响前端加载）")
        else:
            log("[Server] ⚠️  Node.js 未找到，AI 助手将不可用")

        # 2.5 尝试启动 Agent Web 后端和前端服务器
        agent_server_proc = start_agent_server()
        if agent_server_proc:
            def _wait_agent_server():
                wait_for_agent_server()
            threading.Thread(target=_wait_agent_server, daemon=True).start()
            log("[AgentServer] Agent Web 后端已启动")

            # 启动 Agent Web 前端 HTTP 服务器
            agent_dist_dir = None
            if getattr(sys, 'frozen', False):
                meipass = sys._MEIPASS
                agent_dist = os.path.join(meipass, 'agent_dist')
                if os.path.isdir(agent_dist):
                    agent_dist_dir = agent_dist

            if agent_dist_dir:
                agent_httpd, agent_port = start_agent_http_server(agent_dist_dir, AGENT_FRONTEND_PORT)
                if agent_httpd:
                    log(f"[Agent Frontend] Agent Web 前端已启动: http://127.0.0.1:{agent_port}/")
            else:
                log("[Agent Frontend] ⚠️  Agent Web 前端文件未找到")
        else:
            log("[AgentServer] ⚠️  Agent Web 后端未找到，Agent Web 将不可用")

        # 3. 创建 pywebview 窗口，通过 file:// 加载前端
        api = Api()
        window = webview.create_window(
            title=APP_NAME,
            url=frontend_url,       # file:// 协议，本地化加载（无需 HTTP 服务器）
            width=WIDTH,
            height=HEIGHT,
            min_size=MIN_SIZE,
            resizable=True,
            text_select=True,
            js_api=api,
            frameless=True,  # 无系统标题栏，使用 CSS 避让红黄绿按钮
            easy_drag=False,  # frameless 模式下禁用 easy_drag，由前端 -webkit-app-region: drag 控制
        )
        # 将窗口引用传给 Api，用于窗口控制（关闭/最小化/全屏）
        api.set_window(window)

        # 红黄绿按钮偏移不在启动时设置（此时 NSWindow 未完全初始化，Cocoa API 无法获取按钮）
        # 改由前端页面加载完成后通过 JS API pywebview.api.set_traffic_light_offset() 调用

        log("[Main] pywebview 窗口已创建，启动事件循环...")

        # 4. 启动事件循环（阻塞直到窗口关闭）
        webview.start(debug=False, private_mode=False)

        log("[Main] CrossWMS 窗口已关闭，退出")
    except FileNotFoundError as e:
        log(f"[FATAL] {e}")
        exit_code = 1
    except Exception as e:
        log(f"[FATAL] 未捕获异常: {e}")
        log(traceback.format_exc())
        exit_code = 1
    finally:
        # 5. 清理 Agent Web HTTP 服务器
        if agent_httpd:
            try:
                agent_httpd.shutdown()
                agent_httpd.server_close()
                log("[Agent HTTP Server] 已停止")
            except Exception as e:
                log(f"[Agent HTTP Server] 停止失败: {e}")

        # 6. 确保后端服务器被停止
        stop_server()
        stop_agent_server()
        log(f"=== CrossWMS 退出 (exit_code={exit_code}) ===")

    # GUI 环境下不要用 sys.exit() / os._exit()，让进程自然退出
    if exit_code != 0:
        # 非零退出码用于脚本检测
        raise SystemExit(exit_code)


if __name__ == '__main__':
    main()
