/**
 * Desktop Vision Tools — screenshot / see / snapshot / find / click_smart
 */

import { isMac, isLinux, PLATFORM } from '../toolTypes.js';
import { linuxScreenshot, desktopSnapshotCache, setDesktopSnapshotCache, DesktopElement } from './helpers.js';
import { handleDesktopClick } from './inputTools.js';
import { logger } from '../../logger.js';

/** desktop_screenshot - Take a screenshot and return base64 */
export async function handleDesktopScreenshot(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');
  const fs = await import('fs');

  try {
    const timestamp = Date.now();
    const screenshotPath = `/tmp/desktop-screenshot-${timestamp}.png`;

    // v2.2.0: 跨平台截图
    if (isMac) {
      execSync(`screencapture -x -t png "${screenshotPath}"`, {
        encoding: 'utf8',
        timeout: 5000,
      });
    } else if (isLinux) {
      await linuxScreenshot(screenshotPath);
    } else {
      return JSON.stringify({ success: false, error: `Unsupported platform: ${PLATFORM}` });
    }

    // Read and convert to base64 (async to avoid blocking event loop)
    let imageBuffer: Buffer;
    try {
      imageBuffer = await fs.promises.readFile(screenshotPath);
    } catch {
      return JSON.stringify({ success: false, error: 'Screenshot file not created' });
    }
    const base64 = imageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    // Clean up temp file (async)
    try {
      await fs.promises.unlink(screenshotPath);
    } catch {
      // Ignore cleanup errors
    }

    return JSON.stringify({
      success: true,
      image: dataUrl,
      message: 'Screenshot captured using native screencapture. Use this image to identify UI elements and click targets visually.',
    });
  } catch (e: unknown) {
    return JSON.stringify({ success: false, error: (e as Error).message || 'Screenshot failed' });
  }
}

/** desktop_see - Take screenshot for visual analysis */
export async function handleDesktopSee(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');
  const fs = await import('fs');

  try {
    const timestamp = Date.now();
    const screenshotPath = `/tmp/desktop-see-${timestamp}.png`;

    // v2.2.0: 跨平台截图
    if (isMac) {
      execSync(`screencapture -x -t png "${screenshotPath}"`, {
        encoding: 'utf8',
        timeout: 5000,
      });
    } else if (isLinux) {
      await linuxScreenshot(screenshotPath);
    } else {
      return JSON.stringify({ success: false, error: `Unsupported platform: ${PLATFORM}` });
    }

    // Read and convert to base64 (async to avoid blocking event loop)
    let imageBuffer: Buffer;
    try {
      imageBuffer = await fs.promises.readFile(screenshotPath);
    } catch {
      return JSON.stringify({ success: false, error: 'Screenshot file not created' });
    }
    const base64 = imageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    // Clean up temp file (async)
    try {
      await fs.promises.unlink(screenshotPath);
    } catch {
      // Ignore cleanup errors
    }

    // v1.5.130: 获取屏幕分辨率，支持归一化坐标点击
    let screenWidth = 0;
    let screenHeight = 0;
    try {
      if (isMac) {
        const resolution = execSync(
          `python3 -c "import Quartz; m=Quartz.CGDisplayBounds(Quartz.CGMainDisplayID()); print(f'{m.size.width},{m.size.height}')"`,
          { encoding: 'utf8', timeout: 3000 }
        ).trim();
        const [w, h] = resolution.split(',');
        screenWidth = parseInt(w) || 0;
        screenHeight = parseInt(h) || 0;
      } else if (isLinux) {
        const resolution = execSync('xdpyinfo | grep dimensions', { encoding: 'utf8', timeout: 3000 }).trim();
        const match = resolution.match(/(\d+)x(\d+)/);
        if (match) {
          screenWidth = parseInt(match[1]) || 0;
          screenHeight = parseInt(match[2]) || 0;
        }
      }
    } catch {
      // 屏幕尺寸获取失败不影响截图返回
    }

    return JSON.stringify({
      success: true,
      image: dataUrl,
      screenWidth,
      screenHeight,
      message: 'Screenshot captured. Use this image to visually identify UI elements. You can provide normalized coordinates (nx, ny in 0.0~1.0 range) to desktop_click for resolution-independent clicking. Example: nx=0.5, ny=0.5 clicks the center of the screen.',
      instructions: `Analyze the screenshot and identify: 1) Clickable buttons, 2) Text input fields, 3) Menu items, 4) Any labels or text content. Screen resolution: ${screenWidth}x${screenHeight}. When clicking, use normalized coordinates (nx, ny in 0~1 range) for resolution independence, or call desktop_click_smart with a semantic description.`,
    });
  } catch (e: unknown) {
    return JSON.stringify({ success: false, error: (e as Error).message || 'See analysis failed' });
  }
}

/** desktop_snapshot — 使用 JXA 遍历 macOS Accessibility UI 元素树 */
export async function handleDesktopSnapshot(): Promise<string> {
  if (!isMac) {
    return JSON.stringify({
      success: false,
      error: `desktop_snapshot 仅支持 macOS，当前平台: ${PLATFORM}`,
    });
  }

  const { execSync } = await import('child_process');

  // JXA 脚本 — 遍历前台应用 UI 元素树，返回 JSON
  const jxaScript = `(function() {
    var se = Application('System Events');
    var procs = se.processes.whose({frontmost: true});
    if (procs.length === 0) return JSON.stringify({error: 'No frontmost process'});

    var proc = procs[0];
    var appName = proc.name();
    var results = [];
    var MAX_DEPTH = 5;
    var MAX_ELEMENTS = 80;

    function traverse(elem, depth) {
      if (depth > MAX_DEPTH || results.length >= MAX_ELEMENTS) return;

      var info = {};
      try { info.role = elem.role(); } catch(e) { info.role = ''; }
      try { info.name = elem.name() || ''; } catch(e) { info.name = ''; }

      try {
        var pos = elem.position();
        if (pos) { info.x = pos[0]; info.y = pos[1]; }
      } catch(e) {}
      try {
        var sz = elem.size();
        if (sz) { info.w = sz[0]; info.h = sz[1]; }
      } catch(e) {}

      try { info.enabled = elem.enabled(); } catch(e) {}
      try { info.value = elem.value() || ''; } catch(e) {}
      try { info.description = elem.description() || ''; } catch(e) {}

      if (info.role) results.push(info);

      try {
        var children = elem.uiElements();
        if (children) {
          for (var i = 0; i < children.length && results.length < MAX_ELEMENTS; i++) {
            traverse(children[i], depth + 1);
          }
        }
      } catch(e) {}
    }

    try {
      var win = proc.windows[0];
      traverse(win, 0);
    } catch(e) {
      return JSON.stringify({error: 'Cannot access front window: ' + e.message});
    }

    return JSON.stringify({app: appName, elements: results, count: results.length});
  })();`;

  try {
    // 执行 JXA 脚本
    const rawOutput = execSync(`osascript -l JavaScript -e '${jxaScript.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf8',
      timeout: 10000,
    }).toString().trim();

    const parsed = JSON.parse(rawOutput);

    if (parsed.error) {
      return JSON.stringify({ success: false, error: parsed.error });
    }

    // 分配 ref ID 并构建缓存
    const elements: DesktopElement[] = [];
    const cache = new Map<string, DesktopElement>();

    for (let i = 0; i < parsed.elements.length; i++) {
      const el = parsed.elements[i];
      const ref = `d${i + 1}`;
      const elem: DesktopElement = {
        ref,
        role: el.role || 'unknown',
        name: el.name || '',
        bounds: {
          x: el.x || 0,
          y: el.y || 0,
          w: el.w || 0,
          h: el.h || 0,
        },
      };
      if (el.value) elem.value = String(el.value);
      if (el.enabled !== undefined) elem.enabled = el.enabled;
      if (el.description) elem.description = el.description;

      elements.push(elem);
      cache.set(ref, elem);
    }

    // 更新缓存
    setDesktopSnapshotCache(cache);

    const truncated = elements.length >= 80;

    return JSON.stringify({
      success: true,
      snapshot: {
        app: parsed.app,
        elements,
        truncated,
        timestamp: Date.now(),
      },
      message: truncated
        ? `获取到 ${elements.length} 个 UI 元素（已达上限，部分元素被截断）。使用 ref (d1, d2, ...) 调用 desktop_click(ref) 或 desktop_type(ref) 操作元素。`
        : `获取到 ${elements.length} 个 UI 元素。使用 ref (d1, d2, ...) 调用 desktop_click(ref) 或 desktop_type(ref) 操作元素。`,
    });
  } catch (e: unknown) {
    return JSON.stringify({
      success: false,
      error: `快照获取失败: ${(e as Error).message || e}。请确保已在「系统设置 → 隐私与安全 → 辅助功能」中授权相关应用。`,
    });
  }
}

/** desktop_find — 从缓存快照中按 role/name 搜索元素 */
export async function handleDesktopFind(args: Record<string, unknown>): Promise<string> {
  const role = args.role ? String(args.role).toLowerCase() : null;
  const name = args.name ? String(args.name).toLowerCase() : null;

  if (!role && !name) {
    return JSON.stringify({ success: false, error: '至少提供 role 或 name 之一作为搜索条件' });
  }

  if (!desktopSnapshotCache || desktopSnapshotCache.size === 0) {
    return JSON.stringify({
      success: false,
      error: '无缓存的元素快照。请先调用 desktop_snapshot 获取当前界面元素列表。',
    });
  }

  const matches: DesktopElement[] = [];
  for (const elem of desktopSnapshotCache.values()) {
    if (role && !elem.role.toLowerCase().includes(role)) continue;
    if (name && !elem.name.toLowerCase().includes(name)) continue;
    matches.push(elem);
  }

  return JSON.stringify({
    success: true,
    matches,
    count: matches.length,
    hint: matches.length > 0
      ? `使用 ref (${matches[0].ref}, ...) 调用 desktop_click 或 desktop_type 操作匹配的元素。`
      : '未找到匹配元素，可尝试调整搜索条件或重新调用 desktop_snapshot。',
  });
}

// ===================== 语义元素匹配 (v1.5.130) =====================

/**
 * desktop_click_smart — 语义点击：用 ONNX embedding 匹配 UI 元素
 *
 * 工作流程：
 * 1. 调用 desktop_snapshot 获取前台应用 UI 元素树
 * 2. 为每个元素的 "role name description" 文本生成 embedding
 * 3. 为用户描述生成 embedding，计算余弦相似度
 * 4. 找到最佳匹配元素，点击其中心坐标
 *
 * 优势：
 * - 分辨率无关（基于元素 bounds，不是像素坐标）
 * - 语义理解（"提交按钮" 能匹配 "Submit"）
 * - 无需记住 ref ID
 */
export async function handleDesktopClickSmart(args: Record<string, unknown>): Promise<string> {
  const description = String(args.description || '').trim();
  const autoSnapshot = args.auto_snapshot !== false; // 默认 true

  if (!description) {
    return JSON.stringify({ success: false, error: 'description 参数必填，描述要点击的元素（如"提交按钮"、"搜索输入框"）' });
  }

  try {
    // 1. 自动获取最新快照（如果缓存不存在或 auto_snapshot=true）
    if (autoSnapshot || !desktopSnapshotCache || desktopSnapshotCache.size === 0) {
      const snapshotResult = await handleDesktopSnapshot();
      const snapshotParsed = JSON.parse(snapshotResult);
      if (!snapshotParsed.success) {
        return JSON.stringify({
          success: false,
          error: `无法获取 UI 元素快照: ${snapshotParsed.error}`,
          hint: '请确保已在系统设置中授予辅助功能权限',
        });
      }
    }

    if (!desktopSnapshotCache || desktopSnapshotCache.size === 0) {
      return JSON.stringify({ success: false, error: 'UI 元素快照为空' });
    }

    // 2. 收集所有候选元素的可搜索文本
    const elements = Array.from(desktopSnapshotCache.values());
    const candidates = elements
      .filter(e => e.bounds.w > 0 && e.bounds.h > 0) // 过滤无 bounds 的元素
      .map(elem => ({
        elem,
        text: [elem.role, elem.name, elem.description].filter(Boolean).join(' ').trim(),
      }))
      .filter(c => c.text.length > 0);

    if (candidates.length === 0) {
      return JSON.stringify({ success: false, error: '快照中没有可匹配的元素' });
    }

    // 3. 尝试使用 ONNX embedding 进行语义匹配
    let bestMatch: { elem: DesktopElement; similarity: number; method: string } | null = null;

    try {
      // 动态导入 ONNX embedding（避免在不需要时加载模型）
      const { embedBatch, initOnnxEmbedding, getOnnxStatus } = await import('../onnxEmbedding.js');

      const status = getOnnxStatus();
      if (status.status !== 'ready') {
        await initOnnxEmbedding();
      }

      // P1: 一次批量推理 — query + 所有候选元素
      const allTexts = [description, ...candidates.map(c => c.text)];
      const allEmbs = await embedBatch(allTexts);
      const queryEmb = allEmbs[0];

      // 计算余弦相似度（两个 L2 归一化向量的点积）
      let bestSim = -1;
      for (let i = 0; i < candidates.length; i++) {
        const elemEmb = allEmbs[i + 1];
        let dot = 0;
        for (let j = 0; j < queryEmb.length; j++) {
          dot += queryEmb[j] * elemEmb[j];
        }
        if (dot > bestSim) {
          bestSim = dot;
          bestMatch = { elem: candidates[i].elem, similarity: dot, method: 'onnx_embedding' };
        }
      }

      // 相似度阈值：低于 0.3 认为不匹配
      if (bestMatch && bestMatch.similarity < 0.3) {
        bestMatch = null;
      }
    } catch (e) {
      logger.warn('[DesktopClickSmart] ONNX embedding 匹配失败，降级为关键词匹配:', e);
    }

    // 4. 降级：关键词匹配（如果 ONNX 不可用或匹配失败）
    if (!bestMatch) {
      const descLower = description.toLowerCase();
      let bestScore = 0;

      for (const candidate of candidates) {
        const textLower = candidate.text.toLowerCase();
        let score = 0;

        // 精确包含匹配
        if (textLower.includes(descLower)) {
          score = 1.0;
        } else {
          // 分词匹配
          const descWords = descLower.split(/\s+/).filter(w => w.length > 1);
          for (const word of descWords) {
            if (textLower.includes(word)) {
              score += 0.3;
            }
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = { elem: candidate.elem, similarity: score, method: 'keyword_fallback' };
        }
      }

      // 关键词匹配阈值
      if (bestMatch && bestScore < 0.2) {
        bestMatch = null;
      }
    }

    if (!bestMatch) {
      // 返回候选元素列表供 AI 选择
      return JSON.stringify({
        success: false,
        error: `未找到与 "${description}" 匹配的 UI 元素`,
        candidates: candidates.slice(0, 10).map(c => ({
          ref: c.elem.ref,
          role: c.elem.role,
          name: c.elem.name,
          description: c.elem.description || '',
          text: c.text,
        })),
        hint: '可尝试：1) 重新描述元素 2) 使用 desktop_snapshot 查看完整元素列表 3) 使用 desktop_see 截图后用归一化坐标点击',
      });
    }

    // 5. 点击最佳匹配元素的中心
    const elem = bestMatch.elem;
    const clickX = Math.round(elem.bounds.x + elem.bounds.w / 2);
    const clickY = Math.round(elem.bounds.y + elem.bounds.h / 2);

    // 调用已有的 click 逻辑
    const clickResult = await handleDesktopClick({ x: clickX, y: clickY });

    return JSON.stringify({
      success: true,
      matchedElement: {
        ref: elem.ref,
        role: elem.role,
        name: elem.name,
        description: elem.description || '',
        bounds: elem.bounds,
      },
      similarity: Math.round(bestMatch.similarity * 100) / 100,
      matchMethod: bestMatch.method,
      clickX,
      clickY,
      clickResult: JSON.parse(clickResult),
    });
  } catch (e: unknown) {
    return JSON.stringify({ success: false, error: `语义点击失败: ${e instanceof Error ? e.message : String(e)}` });
  }
}
