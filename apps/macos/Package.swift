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
            resources: [
                .process("Resources"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "CrossWMSIPC",
            dependencies: [],
            path: "Sources/CrossWmsIPC",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "CrossWMSIPCTests",
            dependencies: ["CrossWMSIPC"],
            path: "Tests/CrossWMSIPCTests"),
        .testTarget(
            name: "CDFKnowClowTests",
            dependencies: ["CrossWMSIPC"],
            path: "Tests/CDFKnowClowTests",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
    ])
