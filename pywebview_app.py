#!/usr/bin/env python3
"""
CrossWMS — pywebview 启动脚本
用原生 macOS 窗口内嵌 WebView 渲染前端页面，不弹浏览器

v3: 纯本地化方案
- 不手动启动 HTTP 服务器
- 传入本地路径，pywebview 内置 Bottle 服务器自动提供文件服务
- 腾讯文档 API 通过 js_api 桥接（window.pywebview.api.xxx()）
- 前端不需要显式配置 localhost
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

import webview


# ===================== 配置 =====================

APP_NAME = "CrossWMS"
WIDTH = 1280
HEIGHT = 800
MIN_SIZE = (900, 600)

# 腾讯文档 API
TDOC_API_BASE = "https://docs.qq.com/openapi"
TDOC_OAUTH_BASE = "https://docs.qq.com/oauth/v2"
TDOC_TOKEN_FILE = os.path.expanduser("~/.crosswms/tdoc_token.json")

# Node.js 后端服务器配置
SERVER_PORT = 3001
SERVER_HEALTH_URL = f"http://localhost:{SERVER_PORT}/api/health"
SERVER_START_TIMEOUT = 30  # 等待后端启动的最长时间（秒）


def read_version():
    """从 version.txt 读取版本号，读取失败则返回 '0.0.0'"""
    candidates = []

    if getattr(sys, 'frozen', False):
        meipass = sys._MEIPASS
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
    """获取前端 dist/index.html 的绝对路径"""
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

    base = os.path.dirname(os.path.abspath(__file__))
    candidates.extend([
        os.path.join(base, 'dist', 'index.html'),
    ])

    for f in candidates:
        if os.path.isfile(f):
            return f

    print(f"ERROR: index.html not found!")
    print(f"  sys.frozen = {getattr(sys, 'frozen', False)}")
    if getattr(sys, 'frozen', False):
        print(f"  sys._MEIPASS = {sys._MEIPASS}")
        print(f"  sys.executable = {sys.executable}")
    print(f"  __file__ = {__file__}")
    print(f"  Candidates tried: {candidates}")
    sys.exit(1)


# ===================== Node.js 后端管理 =====================

_server_process = None


def get_node_path():
    """获取 Node.js 可执行文件路径"""
    candidates = []

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
    import shutil
    node_in_path = shutil.which('node')
    if node_in_path:
        return node_in_path

    return None


def get_server_script_path():
    """获取服务器入口文件路径"""
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

    base = os.path.dirname(os.path.abspath(__file__))
    candidates.extend([
        os.path.join(base, 'server_dist', 'index.js'),
        os.path.join(base, 'server', 'index.ts'),
    ])

    for p in candidates:
        if os.path.isfile(p):
            return p

    return None


def start_server():
    """启动 Node.js 后端服务器，返回进程对象"""
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

    # 如果是 .ts 文件，需要用 tsx 运行
    if server_script.endswith('.ts'):
        # 开发模式用 tsx
        import shutil
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


def wait_for_server():
    """等待后端服务器就绪"""
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
    """停止 Node.js 后端服务器"""
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
        """设置窗口引用（main() 中创建窗口后调用）"""
        self._window = window

    def get_version(self):
        """返回应用版本号（从 version.txt 读取）"""
        return APP_VERSION

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
        import shutil
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
        import shutil
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
            sheets = [sheets_data] if isinstance(sheets_data, dict) and 'sheet_id' in sheets_data else []

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


def main():
    pw_index_path = None  # 预定义，确保 finally 块中可安全判断
    try:
        index_path = get_index_path()

        # CSS 注入已在构建时（build-dmg-pywebview.sh）完成，
        # index.html 已包含 --pw-top: 28px，运行时不需要再写入。
        # 直接使用原文件（DMG 只读文件系统也不影响）。
        #
        # 注意：development 模式（npm run dev）下没有注入，
        # 浏览器中 --pw-top 默认为 0，不影响红绿灯（浏览器没有红绿灯）。
        pw_index_path = index_path

        # 1. 启动 Node.js 后端服务器（AI 助手）— 后台启动，不阻塞窗口显示
        server_proc = start_server()
        if server_proc:
            print("[Server] 后端正在后台启动，窗口将先显示...")

        # 2. 创建 pywebview 窗口
        # 使用注入后的临时 index_pw.html（已含 --pw-top: 28px）
        api = Api()
        window = webview.create_window(
            title=APP_NAME,
            url=pw_index_path,     # 加载注入后的 HTML，红绿灯区域已留白
            width=WIDTH,
            height=HEIGHT,
            min_size=MIN_SIZE,
            resizable=True,
            text_select=True,
            js_api=api,
            frameless=True,
            easy_drag=True,
        )
        # 将窗口引用传给 Api，用于窗口控制（关闭/最小化/全屏）
        api.set_window(window)

        # 3. 启动事件循环（阻塞直到窗口关闭）
        webview.start(debug=False)

        print("CrossWMS closed.")
    except Exception as e:
        print(f"FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        input("Press Enter to exit...")
    finally:
        # 4. 确保后端服务器被停止
        stop_server()


if __name__ == '__main__':
    main()
