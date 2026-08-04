import Foundation
import WebKit
import CDFKnowIPC
import OSLog
import UserNotifications

let ipcLogger = Logger(subsystem: "com.cdf.knowclow", category: "ipc")

@MainActor
final class IPCHandler: NSObject, WKScriptMessageHandler {
    private var pendingCallbacks: [String: (Response) -> Void] = [:]

    /// 前端 React 渲染完成回调（由 main.tsx 通过 IPC 发送 reactReady 通知）
    var onReactReady: (() -> Void)?

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "cdfApp" else { return }

        guard let body = message.body as? [String: Any],
              let requestId = body["requestId"] as? String,
              let type = body["type"] as? String else {
            ipcLogger.warning("Invalid IPC message format")
            return
        }

        ipcLogger.debug("IPC request: \(type, privacy: .public), id: \(requestId, privacy: .public)")

        Task {
            let response = await handleRequest(type: type, body: body)
            await sendResponse(response, requestId: requestId, webView: message.webView)
        }
    }

    private func handleRequest(type: String, body: [String: Any]) async -> Response {
        switch type {
        case "window":
            guard let actionRaw = body["action"] as? String,
                  let action = WindowAction(rawValue: actionRaw) else {
                return Response(ok: false, message: "Invalid window action")
            }
            return await handleWindowAction(action)

        case "openExternal":
            guard let url = body["url"] as? String else {
                return Response(ok: false, message: "Missing URL")
            }
            return handleOpenExternal(url)

        case "pickFolder":
            return await handlePickFolder()

        case "openFile":
            guard let path = body["path"] as? String else {
                return Response(ok: false, message: "Missing file path")
            }
            return handleOpenFile(path)

        case "showInFinder":
            guard let path = body["path"] as? String else {
                return Response(ok: false, message: "Missing path")
            }
            return handleShowInFinder(path)

        case "notification":
            guard let title = body["title"] as? String,
                  let notifBody = body["body"] as? String else {
                return Response(ok: false, message: "Missing title or body")
            }
            return handleNotification(title: title, body: notifBody)

        case "reactReady":
            ipcLogger.info("React ready signal received")
            onReactReady?()
            return Response(ok: true)

        default:
            ipcLogger.warning("Unknown IPC request type: \(type, privacy: .public)")
            return Response(ok: false, message: "Unknown request type: \(type)")
        }
    }

    // MARK: - Window Actions

    private func handleWindowAction(_ action: WindowAction) async -> Response {
        await MainActor.run {
            switch action {
            case .close:
                NSApp.keyWindow?.close()
            case .minimize:
                NSApp.keyWindow?.miniaturize(nil)
            case .maximize:
                NSApp.keyWindow?.zoom(nil)
            }
        }
        return Response(ok: true)
    }

    // MARK: - Open External

    private func handleOpenExternal(_ urlString: String) -> Response {
        guard let url = URL(string: urlString) else {
            return Response(ok: false, message: "Invalid URL")
        }
        NSWorkspace.shared.open(url)
        return Response(ok: true)
    }

    // MARK: - Pick Folder

    private func handlePickFolder() async -> Response {
        await MainActor.run {
            let panel = NSOpenPanel()
            panel.canChooseDirectories = true
            panel.canChooseFiles = false
            panel.allowsMultipleSelection = false
            panel.prompt = NSLocalizedString("选择文件夹", comment: "")
            panel.level = .floating

            let response = panel.runModal()
            let path: String? = (response == .OK) ? panel.url?.path : nil

            do {
                let result = FolderPickerResult(path: path)
                let data = try JSONEncoder().encode(result)
                return Response(ok: true, payload: data)
            } catch {
                return Response(ok: false, message: "Encoding error: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Open File

    private func handleOpenFile(_ path: String) -> Response {
        let url = URL(fileURLWithPath: path)
        guard FileManager.default.fileExists(atPath: path) else {
            return Response(ok: false, message: "File not found: \(path)")
        }
        NSWorkspace.shared.open(url)
        return Response(ok: true)
    }

    // MARK: - Show in Finder

    private func handleShowInFinder(_ path: String) -> Response {
        guard FileManager.default.fileExists(atPath: path) else {
            return Response(ok: false, message: "Path not found: \(path)")
        }
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
        return Response(ok: true)
    }

    // MARK: - Notification

    private func handleNotification(title: String, body: String) -> Response {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            if granted {
                let content = UNMutableNotificationContent()
                content.title = title
                content.body = body
                content.sound = .default

                let request = UNNotificationRequest(
                    identifier: "cdf-\(Date().timeIntervalSince1970)",
                    content: content,
                    trigger: nil
                )
                center.add(request, withCompletionHandler: nil)
            }
        }
        return Response(ok: true)
    }

    // MARK: - Response Sending

    private func sendResponse(_ response: Response, requestId: String, webView: WKWebView?) async {
        guard let webView else { return }

        do {
            let data = try JSONEncoder().encode(response)
            let jsonString = String(data: data, encoding: .utf8) ?? "{}"
            let escapedJson = jsonString
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")

            let js = """
            (function() {
                if (window.__cdfIPC && window.__cdfIPC.resolve) {
                    window.__cdfIPC.resolve('\(requestId)', '\(escapedJson)');
                }
            })();
            """
            await MainActor.run {
                webView.evaluateJavaScript(js, completionHandler: nil)
            }
        } catch {
            ipcLogger.error("Failed to encode response: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Event Push (Server → Web)

    func sendEvent(_ event: IPCEvent, webView: WKWebView) {
        do {
            let data = try JSONEncoder().encode(event)
            let jsonString = String(data: data, encoding: .utf8) ?? "{}"
            let escapedJson = jsonString
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")

            let js = """
            (function() {
                if (window.__cdfIPC && window.__cdfIPC.emit) {
                    window.__cdfIPC.emit('\(escapedJson)');
                }
            })();
            """
            webView.evaluateJavaScript(js, completionHandler: nil)
        } catch {
            ipcLogger.error("Failed to encode event: \(error.localizedDescription, privacy: .public)")
        }
    }
}
