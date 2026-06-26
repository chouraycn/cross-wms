import Foundation
import CoreServices
import OSLog
import CrossWMSIPC

let fileWatcherLogger = Logger(subsystem: "com.cdf.knowclow", category: "fileWatcher")

actor FileWatcherManager {
    private var streams: [String: FSEventStreamRef] = [:]
    private var contexts: [String: WatchContext] = [:]
    private let eventQueue = DispatchQueue(label: "com.cdf.knowclow.fileWatcher.events")

    func startWatch(config: FileWatchConfig, eventHandler: @escaping @Sendable (FileWatchEvent) -> Void) -> Bool {
        if streams[config.watchID] != nil {
            fileWatcherLogger.warning("Watch with ID \(config.watchID, privacy: .public) already exists")
            return false
        }

        let context = WatchContext(
            watchID: config.watchID,
            eventHandler: eventHandler
        )

        let paths = config.paths as CFArray
        var streamContext = FSEventStreamContext(
            version: 0,
            info: Unmanaged.passUnretained(context).toOpaque(),
            retain: nil,
            release: nil,
            copyDescription: nil
        )

        var flags: FSEventStreamCreateFlags = UInt32(kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagFileEvents)
        if config.recursive {
            flags |= UInt32(kFSEventStreamCreateFlagWatchRoot)
        }

        guard let stream = FSEventStreamCreate(
            kCFAllocatorDefault,
            { _, clientCallBackInfo, numEvents, eventPaths, eventFlags, eventIDs in
                guard let info = clientCallBackInfo else { return }
                let context = Unmanaged<WatchContext>.fromOpaque(info).takeUnretainedValue()
                context.handleEvents(
                    numEvents: numEvents,
                    eventPaths: eventPaths,
                    eventFlags: eventFlags,
                    eventIDs: eventIDs
                )
            },
            &streamContext,
            paths,
            FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
            config.latency,
            flags
        ) else {
            fileWatcherLogger.error("Failed to create FSEventStream for watch ID \(config.watchID, privacy: .public)")
            return false
        }

        FSEventStreamSetDispatchQueue(stream, eventQueue)

        if !FSEventStreamStart(stream) {
            fileWatcherLogger.error("Failed to start FSEventStream for watch ID \(config.watchID, privacy: .public)")
            FSEventStreamInvalidate(stream)
            return false
        }

        streams[config.watchID] = stream
        contexts[config.watchID] = context
        fileWatcherLogger.info("Started file watch for ID \(config.watchID, privacy: .public) with \(config.paths.count, privacy: .public) paths")
        return true
    }

    func stopWatch(watchID: String) -> Bool {
        guard let stream = streams[watchID] else {
            fileWatcherLogger.warning("Watch with ID \(watchID, privacy: .public) not found")
            return false
        }

        FSEventStreamStop(stream)
        FSEventStreamInvalidate(stream)
        streams.removeValue(forKey: watchID)
        contexts.removeValue(forKey: watchID)
        fileWatcherLogger.info("Stopped file watch for ID \(watchID, privacy: .public)")
        return true
    }

    func listWatches() -> [String: [String]] {
        var result: [String: [String]] = [:]
        for (watchID, stream) in streams {
            if let paths = FSEventStreamCopyPathsBeingWatched(stream) as? [String] {
                result[watchID] = paths
            } else {
                result[watchID] = []
            }
        }
        return result
    }

    func cleanup() {
        for (watchID, stream) in streams {
            FSEventStreamStop(stream)
            FSEventStreamInvalidate(stream)
            fileWatcherLogger.debug("Cleaned up watch ID \(watchID, privacy: .public)")
        }
        streams.removeAll()
        contexts.removeAll()
    }
}

private final class WatchContext: NSObject, @unchecked Sendable {
    let watchID: String
    let eventHandler: @Sendable (FileWatchEvent) -> Void

    init(watchID: String, eventHandler: @escaping @Sendable (FileWatchEvent) -> Void) {
        self.watchID = watchID
        self.eventHandler = eventHandler
        super.init()
    }

    func handleEvents(
        numEvents: Int,
        eventPaths: UnsafeMutableRawPointer,
        eventFlags: UnsafePointer<FSEventStreamEventFlags>,
        eventIDs: UnsafePointer<FSEventStreamEventId>
    ) {
        let paths = unsafeBitCast(eventPaths, to: NSArray.self) as! [String]

        for i in 0..<numEvents {
            let path = paths[i]
            let flags = eventFlags[i]
            let itemID = eventIDs[i]
            let flagStrings = Self.convertFlags(flags)

            let event = FileWatchEvent(
                path: path,
                flags: flagStrings,
                itemID: UInt64(itemID)
            )

            eventHandler(event)
        }
    }

    static func convertFlags(_ flags: FSEventStreamEventFlags) -> [String] {
        var result: [String] = []

        if (flags & UInt32(kFSEventStreamEventFlagItemCreated)) != 0 {
            result.append("created")
        }
        if (flags & UInt32(kFSEventStreamEventFlagItemRemoved)) != 0 {
            result.append("removed")
        }
        if (flags & UInt32(kFSEventStreamEventFlagItemModified)) != 0 {
            result.append("modified")
        }
        if (flags & UInt32(kFSEventStreamEventFlagItemRenamed)) != 0 {
            result.append("renamed")
        }
        if (flags & UInt32(kFSEventStreamEventFlagItemIsDir)) != 0 {
            result.append("isDir")
        }
        if (flags & UInt32(kFSEventStreamEventFlagItemIsFile)) != 0 {
            result.append("isFile")
        }
        if (flags & UInt32(kFSEventStreamEventFlagItemIsSymlink)) != 0 {
            result.append("isSymlink")
        }
        if (flags & UInt32(kFSEventStreamEventFlagItemFinderInfoMod)) != 0 {
            result.append("finderInfoMod")
        }
        if (flags & UInt32(kFSEventStreamEventFlagItemInodeMetaMod)) != 0 {
            result.append("inodeMetaMod")
        }
        if (flags & UInt32(kFSEventStreamEventFlagItemChangeOwner)) != 0 {
            result.append("changeOwner")
        }
        if (flags & UInt32(kFSEventStreamEventFlagItemXattrMod)) != 0 {
            result.append("xattrMod")
        }
        if (flags & UInt32(kFSEventStreamEventFlagItemCloned)) != 0 {
            result.append("cloned")
        }
        if (flags & UInt32(kFSEventStreamEventFlagMustScanSubDirs)) != 0 {
            result.append("mustScanSubDirs")
        }
        if (flags & UInt32(kFSEventStreamEventFlagUserDropped)) != 0 {
            result.append("userDropped")
        }
        if (flags & UInt32(kFSEventStreamEventFlagKernelDropped)) != 0 {
            result.append("kernelDropped")
        }
        if (flags & UInt32(kFSEventStreamEventFlagEventIdsWrapped)) != 0 {
            result.append("eventIdsWrapped")
        }
        if (flags & UInt32(kFSEventStreamEventFlagHistoryDone)) != 0 {
            result.append("historyDone")
        }
        if (flags & UInt32(kFSEventStreamEventFlagRootChanged)) != 0 {
            result.append("rootChanged")
        }
        if (flags & UInt32(kFSEventStreamEventFlagMount)) != 0 {
            result.append("mount")
        }
        if (flags & UInt32(kFSEventStreamEventFlagUnmount)) != 0 {
            result.append("unmount")
        }

        return result
    }
}
