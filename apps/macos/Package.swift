// swift-tools-version: 6.3
// Package manifest for CDF Know Clow macOS app.

import PackageDescription

let package = Package(
    name: "CDFKnowClow",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .executable(name: "CDFKnowClow", targets: ["CDFKnowClow"]),
        .library(name: "CDFKnowIPC", targets: ["CDFKnowIPC"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-log.git", from: "1.10.1"),
        .package(url: "https://github.com/sparkle-project/Sparkle.git", from: "2.7.1"),
    ],
    targets: [
        .executableTarget(
            name: "CDFKnowClow",
            dependencies: [
                "CDFKnowIPC",
                .product(name: "Logging", package: "swift-log"),
                .product(name: "Sparkle", package: "Sparkle"),
            ],
            path: "Sources/CDFKnowClow",
            linkerSettings: [
                .unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"]),
            ]),
        .target(
            name: "CDFKnowIPC",
            dependencies: [],
            path: "Sources/CrossWmsIPC"),
    ])
