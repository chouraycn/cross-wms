// swift-tools-version: 6.0
// Package manifest for CrossWMS macOS companion (menu bar app + IPC library).

import PackageDescription

let package = Package(
    name: "CrossWMS",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .library(name: "CrossWMSIPC", targets: ["CrossWMSIPC"]),
        .executable(name: "CrossWMS", targets: ["CrossWMS"]),
    ],
    dependencies: [
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.9.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.10.1"),
    ],
    targets: [
        .target(
            name: "CrossWMSIPC",
            dependencies: [],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "CrossWMS",
            dependencies: [
                "CrossWMSIPC",
                .product(name: "Sparkle", package: "Sparkle"),
                .product(name: "Logging", package: "swift-log"),
            ],
            path: "Sources/CrossWMS",
            resources: [
                .copy("Resources"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "CrossWmsTests",
            dependencies: [
                "CrossWMSIPC",
                "CrossWMS",
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
