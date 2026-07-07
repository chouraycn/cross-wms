import Foundation
import WebKit
import CDFKnowIPC
import OSLog

let ipcLogger = Logger(subsystem: "com.cdf.knowclow", category: "ipc")

@MainActor
final class IPCHandler: NSObject, WKScriptMessageHandler {
    private var pendingCallbacks: [String: (Response) -> Void] = [:]

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
