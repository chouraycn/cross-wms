// swift-tools-version: 6.0
// Package manifest for CDF Know Clow macOS app.

import PackageDescription

let package = Package(
    name: "CDFKnowClow",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .executable(name: "CDFKnowClow", targets: ["CDFKnowClow"]),
        .library(name: "CrossWMSIPC", targets: ["CrossWMSIPC"]),
        .library(name: "CDFKnowProtocol", targets: ["CDFKnowProtocol"]),
        .library(name: "CDFKnow", targets: ["CDFKnow"]),
    ],
    dependencies: [
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.9.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.10.1"),
    ],
    targets: [
        .executableTarget(
            name: "CDFKnowClow",
            dependencies: [
                "CrossWMSIPC",
                .product(name: "Sparkle", package: "Sparkle"),
                .product(name: "Logging", package: "swift-log"),
            ],
            path: "Sources/CDFKnowClow",
            linkerSettings: [
                .unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"]),
            ]),
        .target(
            name: "CrossWMSIPC",
            dependencies: [],
            path: "Sources/CrossWmsIPC"),
        .target(
            name: "CDFKnowProtocol",
            dependencies: [],
            path: "Sources/CDFKnowProtocol"),
        .target(
            name: "CDFKnow",
            dependencies: ["CDFKnowProtocol"],
            path: "Sources/CDFKnow"),
        .testTarget(
            name: "CrossWMSIPCTests",
            dependencies: ["CrossWMSIPC"],
            path: "Tests/CrossWMSIPCTests"),
        .testTarget(
            name: "CDFKnowClowTests",
            dependencies: ["CrossWMSIPC"],
            path: "Tests/CDFKnowClowTests"),
        .testTarget(
            name: "CDFKnowIPCTests",
            dependencies: ["CDFKnowProtocol", "CDFKnow"],
            path: "Tests/CDFKnowIPCTests"),
    ])
