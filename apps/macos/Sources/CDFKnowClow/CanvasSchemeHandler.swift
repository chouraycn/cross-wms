import Foundation
import WebKit
import OSLog

let schemeHandlerLogger = Logger(subsystem: "com.cdf.knowclow", category: "scheme-handler")

// MARK: - Cached Response

struct CachedResponse {
    let data: Data
    let mimeType: String
    let encoding: String?
    let lastModified: Date?
    let etag: String?
    let contentLength: Int

    var headers: [String: String] {
        var h = ["Content-Type": mimeType + (encoding.map { "; charset=\($0)" } ?? "")]
        if let etag = etag { h["ETag"] = etag }
        if let lm = lastModified {
            let formatter = DateFormatter()
            formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
            formatter.locale = Locale(identifier: "en_US_POSIX")
            h["Last-Modified"] = formatter.string(from: lm)
        }
        h["Content-Length"] = String(data.count)
        return h
    }
}

// MARK: - Request Interceptor

protocol CanvasRequestInterceptor: AnyObject {
    /// 拦截请求，返回修改后的数据或 nil 表示不拦截
    func intercept(request: URLRequest, data: Data, mimeType: String) -> (Data, String)?
    /// 是否允许该请求
    func shouldAllow(request: URLRequest) -> Bool
    /// 获取额外的 header
    func additionalHeaders(for request: URLRequest) -> [String: String]
}

extension CanvasRequestInterceptor {
    func intercept(request: URLRequest, data: Data, mimeType: String) -> (Data, String)? { nil }
    func shouldAllow(request: URLRequest) -> Bool { true }
    func additionalHeaders(for request: URLRequest) -> [String: String] { [:] }
}

// MARK: - CSP Injector

final class CSPInjector: CanvasRequestInterceptor {
    private let cspPolicy: String
    private let allowedHosts: Set<String>

    init(cspPolicy: String = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'") {
        self.cspPolicy = cspPolicy
        self.allowedHosts = ["localhost", "127.0.0.1"]
    }

    func intercept(request: URLRequest, data: Data, mimeType: String) -> (Data, String)? {
        guard mimeType == "text/html" || mimeType == "application/xhtml+xml" else {
            return nil
        }

        guard var htmlString = String(data: data, encoding: .utf8) else {
            return nil
        }

        // 注入 CSP meta 标签
        let cspMeta = "<meta http-equiv=\"Content-Security-Policy\" content=\"\(cspPolicy)\">"

        // 插入到 <head> 标签内
        if let headRange = htmlString.range(of: "<head>") {
            htmlString.insert(contentsOf: cspMeta, at: headRange.upperBound)
        } else if let htmlRange = htmlString.range(of: "<html>") {
            let insertIndex = htmlRange.upperBound
            htmlString.insert(contentsOf: "<head>\(cspMeta)</head>", at: insertIndex)
        }

        guard let modifiedData = htmlString.data(using: .utf8) else {
            return nil
        }

        return (modifiedData, mimeType)
    }

    func additionalHeaders(for request: URLRequest) -> [String: String] {
        var headers = ["X-Content-Type-Options": "nosniff"]
        if let host = request.url?.host, allowedHosts.contains(host) {
            headers["X-Frame-Options"] = "SAMEORIGIN"
        }
        return headers
    }
}

// MARK: - LRU Cache

final class LRUCache<Key: Hashable, Value> {
    private var cache: [Key: Value] = [:]
    private var accessOrder: [Key] = []
    private let capacity: Int
    private let lock = NSLock()

    init(capacity: Int) {
        self.capacity = max(1, capacity)
    }

    func get(_ key: Key) -> Value? {
        lock.lock()
        defer { lock.unlock() }

        guard let value = cache[key] else { return nil }

        // 移动到末尾（最近使用）
        if let index = accessOrder.firstIndex(of: key) {
            accessOrder.remove(at: index)
            accessOrder.append(key)
        }

        return value
    }

    func set(_ key: Key, value: Value) {
        lock.lock()
        defer { lock.unlock() }

        if cache[key] != nil {
            // 更新已有项
            if let index = accessOrder.firstIndex(of: key) {
                accessOrder.remove(at: index)
            }
        } else if cache.count >= capacity {
            // 淘汰最久未使用的
            if let lruKey = accessOrder.first {
                cache.removeValue(forKey: lruKey)
                accessOrder.removeFirst()
            }
        }

        cache[key] = value
        accessOrder.append(key)
    }

    func remove(_ key: Key) {
        lock.lock()
        defer { lock.unlock() }

        cache.removeValue(forKey: key)
        if let index = accessOrder.firstIndex(of: key) {
            accessOrder.remove(at: index)
        }
    }

    func clear() {
        lock.lock()
        defer { lock.unlock() }

        cache.removeAll()
        accessOrder.removeAll()
    }

    var count: Int {
        lock.lock()
        defer { lock.unlock() }
        return cache.count
    }
}

// MARK: - CanvasSchemeHandler

/// 增强版 Canvas Scheme Handler
/// 支持：
/// - LRU 缓存
/// - 请求拦截（CSP 注入、脚本注入）
/// - ETag/Last-Modified 支持
/// - 符号链接安全检查
final class CanvasSchemeHandler: NSObject, WKURLSchemeHandler {

    // MARK: - Properties

    private let rootDirectory: URL
    private let cache: LRUCache<String, CachedResponse>
    private var interceptors: [CanvasRequestInterceptor] = []
    private let cacheLock = NSLock()

    /// 最大缓存条目数
    static let defaultCacheCapacity = 100

    /// 最大缓存大小（字节），默认 50MB
    static let defaultMaxCacheSize = 50 * 1024 * 1024

    // MARK: - Initialization

    init(root: URL, cacheCapacity: Int = defaultCacheCapacity) {
        self.rootDirectory = root
        self.cache = LRUCache(capacity: cacheCapacity)
        super.init()
    }

    // MARK: - Interceptor Management

    func addInterceptor(_ interceptor: CanvasRequestInterceptor) {
        interceptors.append(interceptor)
    }

    func removeInterceptor(_ interceptor: CanvasRequestInterceptor) {
        interceptors.removeAll { $0 === interceptor }
    }

    func clearInterceptors() {
        interceptors.removeAll()
    }

    // MARK: - Cache Management

    func clearCache() {
        cacheLock.lock()
        cache.clear()
        cacheLock.unlock()
        schemeHandlerLogger.info("Cache cleared")
    }

    func invalidateCache(for path: String) {
        cacheLock.lock()
        cache.remove(path)
        cacheLock.unlock()
        schemeHandlerLogger.info("Cache invalidated for path: \(path, privacy: .public)")
    }

    var cacheCount: Int {
        cacheLock.lock()
        defer { cacheLock.unlock() }
        return cache.count
    }

    // MARK: - WKURLSchemeHandler

    nonisolated func webView(
        _ webView: WKWebView,
        start urlSchemeTask: WKURLSchemeTask
    ) {
        guard let request = urlSchemeTask.request as URLRequest? else {
            urlSchemeTask.didFailWithError(
                URLError(.badServerResponse, userInfo: [NSLocalizedDescriptionKey: "Invalid request"])
            )
            return
        }

        guard let url = request.url else {
            urlSchemeTask.didFailWithError(
                URLError(.badServerResponse, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
            )
            return
        }

        // 检查拦截器权限
        let localInterceptors = MainActor.assumeIsolated { interceptors }
        for interceptor in localInterceptors {
            if !interceptor.shouldAllow(request: request) {
                urlSchemeTask.didFailWithError(
                    URLError(.cancelled, userInfo: [NSLocalizedDescriptionKey: "Request blocked by interceptor"])
                )
                return
            }
        }

        // 同步处理请求
        handleRequest(urlSchemeTask: urlSchemeTask, request: request, url: url)
    }

    nonisolated func webView(
        _ webView: WKWebView,
        stop urlSchemeTask: WKURLSchemeTask
    ) {
        // 任务被取消时可以做清理工作
        schemeHandlerLogger.debug("URL scheme task stopped")
    }

    // MARK: - Private Methods

    nonisolated private func handleRequest(
        urlSchemeTask: WKURLSchemeTask,
        request: URLRequest,
        url: URL
    ) {
        // 解析路径
        let path = parsePath(from: url)

        // 检查缓存（带 ETag/If-None-Match 支持）
        if let cachedResponse = getCachedResponse(for: path, request: request) {
            // 检查是否需要返回 304 Not Modified
            if let etag = cachedResponse.etag,
               let ifNoneMatch = request.value(forHTTPHeaderField: "If-None-Match"),
               etag == ifNoneMatch {
                send304Response(task: urlSchemeTask)
                return
            }

            // 返回缓存内容
            sendResponse(task: urlSchemeTask, response: cachedResponse, path: path)
            return
        }

        // 读取文件
        let fileURL = rootDirectory.appendingPathComponent(path)
        let resolvedURL = resolveSymlinks(from: fileURL)

        // 安全检查：确保文件在 rootDirectory 内
        guard isPathWithinRoot(resolvedURL) else {
            sendForbiddenResponse(task: urlSchemeTask, reason: "Path escape attempt blocked")
            return
        }

        // 检查文件是否存在
        guard FileManager.default.fileExists(atPath: resolvedURL.path) else {
            send404Response(task: urlSchemeTask, path: path)
            return
        }

        // 读取文件
        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: resolvedURL.path)
            let fileData = try Data(contentsOf: resolvedURL)
            let mimeType = getMimeType(for: resolvedURL)
            let encoding = getTextEncoding(for: mimeType)
            let lastModified = attributes[.modificationDate] as? Date
            let etag = generateETag(for: resolvedURL, data: fileData)

            // 构建响应
            let response = CachedResponse(
                data: fileData,
                mimeType: mimeType,
                encoding: encoding,
                lastModified: lastModified,
                etag: etag,
                contentLength: fileData.count
            )

            // 应用拦截器
            var finalData = fileData
            var finalMimeType = mimeType
            let localInterceptors = MainActor.assumeIsolated { interceptors }

            for interceptor in localInterceptors {
                if let (modifiedData, newMimeType) = interceptor.intercept(
                    request: request,
                    data: finalData,
                    mimeType: finalMimeType
                ) {
                    finalData = modifiedData
                    finalMimeType = newMimeType
                }
            }

            let finalResponse = CachedResponse(
                data: finalData,
                mimeType: finalMimeType,
                encoding: encoding,
                lastModified: lastModified,
                etag: etag,
                contentLength: finalData.count
            )

            // 缓存原始文件（未拦截的数据）
            cacheResponse(path: path, response: response)

            // 发送响应
            sendResponse(task: urlSchemeTask, response: finalResponse, path: path)

        } catch {
            schemeHandlerLogger.error("Failed to read file: \(error.localizedDescription, privacy: .public)")
            urlSchemeTask.didFailWithError(
                URLError(.cannotLoadFromNetwork, userInfo: [NSLocalizedDescriptionKey: error.localizedDescription])
            )
        }
    }

    // MARK: - Path Operations

    nonisolated private func parsePath(from url: URL) -> String {
        // canvas://session/path -> path
        guard let host = url.host else {
            return url.path.hasPrefix("/") ? String(url.path.dropFirst()) : url.path
        }
        return url.path.hasPrefix("/") ? String(url.path.dropFirst()) : url.path
    }

    nonisolated private func resolveSymlinks(from url: URL) -> URL {
        let fm = FileManager.default

        // 安全检查：最多跟随 10 个符号链接
        var currentURL = url
        var followCount = 0
        let maxFollows = 10

        while followCount < maxFollows {
            do {
                let attrs = try fm.attributesOfItem(atPath: currentURL.path)
                if let type = attrs[.type] as? FileAttributeType,
                   type == .typeSymbolicLink {
                    let dest = try fm.destinationOfSymbolicLink(atPath: currentURL.path)
                    let resolved: URL

                    if dest.hasPrefix("/") {
                        // 绝对路径
                        resolved = URL(fileURLWithPath: dest)
                    } else {
                        // 相对路径
                        resolved = currentURL.deletingLastPathComponent().appendingPathComponent(dest)
                    }

                    currentURL = resolved.resolvingSymlinksInPath()
                    followCount += 1
                } else {
                    break
                }
            } catch {
                break
            }
        }

        return currentURL
    }

    nonisolated private func isPathWithinRoot(_ url: URL) -> Bool {
        let rootPath = rootDirectory.resolvingSymlinksInPath().path
        let targetPath = url.resolvingSymlinksInPath().path

        return targetPath.hasPrefix(rootPath + "/") || targetPath == rootPath
    }

    // MARK: - Cache Operations

    nonisolated private func getCachedResponse(for path: String, request: URLRequest) -> CachedResponse? {
        // 检查 If-None-Match / If-Modified-Since
        cacheLock.lock()
        let response = MainActor.assumeIsolated { cache.get(path) }
        cacheLock.unlock()
        return response
    }

    nonisolated private func cacheResponse(path: String, response: CachedResponse) {
        cacheLock.lock()
        MainActor.assumeIsolated { cache.set(path, value: response) }
        cacheLock.unlock()
    }

    // MARK: - Response Helpers

    nonisolated private func sendResponse(
        task: WKURLSchemeTask,
        response: CachedResponse,
        path: String
    ) {
        let url = task.request.url!

        var headers = response.headers

        // 添加拦截器 header
        let localInterceptors = MainActor.assumeIsolated { interceptors }
        for interceptor in localInterceptors {
            for (key, value) in interceptor.additionalHeaders(for: task.request) {
                headers[key] = value
            }
        }

        let httpResponse = HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: headers
        )!

        task.didReceive(httpResponse)
        task.didReceive(response.data)
        task.didFinish()
    }

    nonisolated private func send304Response(task: WKURLSchemeTask) {
        let url = task.request.url!
        let httpResponse = HTTPURLResponse(
            url: url,
            statusCode: 304,
            httpVersion: "HTTP/1.1",
            headerFields: [:]
        )!
        task.didReceive(httpResponse)
        task.didFinish()
    }

    nonisolated private func send404Response(task: WKURLSchemeTask, path: String) {
        let url = task.request.url!
        let body = "404 Not Found: \(path)".data(using: .utf8)!

        let httpResponse = HTTPURLResponse(
            url: url,
            statusCode: 404,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": "text/plain; charset=utf-8",
                "Content-Length": String(body.count)
            ]
        )!

        task.didReceive(httpResponse)
        task.didReceive(body)
        task.didFinish()
    }

    nonisolated private func sendForbiddenResponse(task: WKURLSchemeTask, reason: String) {
        schemeHandlerLogger.warning("Forbidden: \(reason, privacy: .public)")

        let url = task.request.url!
        let body = "403 Forbidden: \(reason)".data(using: .utf8)!

        let httpResponse = HTTPURLResponse(
            url: url,
            statusCode: 403,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": "text/plain; charset=utf-8",
                "Content-Length": String(body.count)
            ]
        )!

        task.didReceive(httpResponse)
        task.didReceive(body)
        task.didFinish()
    }

    // MARK: - MIME Type & Encoding

    nonisolated private func getMimeType(for url: URL) -> String {
        let ext = url.pathExtension.lowercased()

        let mimeTypes: [String: String] = [
            "html": "text/html",
            "htm": "text/html",
            "xhtml": "application/xhtml+xml",
            "xml": "application/xml",
            "css": "text/css",
            "js": "application/javascript",
            "mjs": "application/javascript",
            "json": "application/json",
            "png": "image/png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "gif": "image/gif",
            "svg": "image/svg+xml",
            "ico": "image/x-icon",
            "woff": "font/woff",
            "woff2": "font/woff2",
            "ttf": "font/ttf",
            "eot": "application/vnd.ms-fontobject",
            "pdf": "application/pdf",
            "zip": "application/zip",
            "txt": "text/plain",
            "md": "text/markdown"
        ]

        return mimeTypes[ext] ?? "application/octet-stream"
    }

    nonisolated private func getTextEncoding(for mimeType: String) -> String? {
        let textTypes = ["text/html", "text/css", "text/plain", "application/javascript", "application/json"]
        return textTypes.contains(mimeType) ? "utf-8" : nil
    }

    // MARK: - ETag

    nonisolated private func generateETag(for url: URL, data: Data) -> String? {
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let modDate = attrs[.modificationDate] as? Date else {
            return nil
        }

        let inode = (attrs[.systemFileNumber] as? NSNumber)?.uint64Value ?? 0
        let hash = data.withUnsafeBytes { bytes in
            var h: UInt64 = 0
            for i in 0..<min(64, data.count) {
                h = h &* 31 &+ UInt64(bytes[i])
            }
            return h
        }

        return "\"\(inode)-\(modDate.timeIntervalSince1970.rounded())-\(hash)\""
    }
}

// MARK: - CanvasScheme URL Builder

enum CanvasScheme {
    static let scheme = "canvas"

    static func makeURL(session: String, path: String) -> URL? {
        var components = URLComponents()
        components.scheme = scheme
        components.host = session
        components.path = "/" + path
        return components.url
    }

    static func parseURL(_ url: URL) -> (session: String, path: String)? {
        guard url.scheme == scheme,
              let host = url.host else {
            return nil
        }
        let path = url.path.hasPrefix("/") ? String(url.path.dropFirst()) : url.path
        return (host, path)
    }
}

// MARK: - Test Support

#if DEBUG
extension CanvasSchemeHandler {
    /// 测试用：获取指定 URL 的响应数据
    func _testResponse(for url: URL) -> (data: Data, mime: String) {
        let path = parsePath(from: url)
        let fileURL = rootDirectory.appendingPathComponent(path)

        do {
            let data = try Data(contentsOf: fileURL)
            let mime = getMimeType(for: fileURL)
            return (data, mime)
        } catch {
            return (Data("Error".utf8), "text/plain")
        }
    }

    /// 测试用：获取文本编码名称
    func _testTextEncodingName(for mimeType: String) -> String? {
        return getTextEncoding(for: mimeType)
    }
}
#endif
