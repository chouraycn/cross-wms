import Foundation
import Testing
@testable import CDFKnow

@Suite(.serialized) struct NodeServiceManagerTests {
    @Test func `builds node service commands with current CLI shape`() async throws {
        try await TestIsolation.withUserDefaultsValues(["cdfknow.gatewayProjectRootPath": nil]) {
            let tmp = try makeTempDirForTests()
            CommandResolver.setProjectRoot(tmp.path)

            let cdfknowPath = tmp.appendingPathComponent("node_modules/.bin/cdfknow")
            try makeExecutableForTests(at: cdfknowPath)

            let start = NodeServiceManager._testServiceCommand(["start"])
            #expect(start == [cdfknowPath.path, "node", "start", "--json"])

            let stop = NodeServiceManager._testServiceCommand(["stop"])
            #expect(stop == [cdfknowPath.path, "node", "stop", "--json"])
        }
    }
}
