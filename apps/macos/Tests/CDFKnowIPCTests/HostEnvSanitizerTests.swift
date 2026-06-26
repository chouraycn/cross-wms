import Testing
@testable import CDFKnow

struct HostEnvSanitizerTests {
    @Test func `sanitize blocks shell trace variables`() {
        let env = HostEnvSanitizer.sanitize(overrides: [
            "SHELLOPTS": "xtrace",
            "PS4": "$(touch /tmp/pwned)",
            "CDFKNOW_TEST": "1",
        ])
        #expect(env["SHELLOPTS"] == nil)
        #expect(env["PS4"] == nil)
        #expect(env["CDFKNOW_TEST"] == "1")
    }

    @Test func `sanitize shell wrapper allows only explicit override keys`() {
        let env = HostEnvSanitizer.sanitize(
            overrides: [
                "LANG": "C",
                "LC_ALL": "C",
                "CDFKNOW_TOKEN": "secret",
                "PS4": "$(touch /tmp/pwned)",
            ],
            shellWrapper: true)

        #expect(env["LANG"] == "C")
        #expect(env["LC_ALL"] == "C")
        #expect(env["CDFKNOW_TOKEN"] == nil)
        #expect(env["PS4"] == nil)
    }

    @Test func `sanitize non shell wrapper keeps regular overrides`() {
        let env = HostEnvSanitizer.sanitize(overrides: ["CDFKNOW_TOKEN": "secret"])
        #expect(env["CDFKNOW_TOKEN"] == "secret")
    }

    @Test func `inspect overrides rejects blocked and invalid keys`() {
        let diagnostics = HostEnvSanitizer.inspectOverrides(overrides: [
            "CLASSPATH": "/tmp/evil-classpath",
            "BAD-KEY": "x",
            "ProgramFiles(x86)": "C:\\Program Files (x86)",
        ])

        #expect(diagnostics.blockedKeys == ["CLASSPATH"])
        #expect(diagnostics.invalidKeys == ["BAD-KEY"])
    }

    @Test func `sanitize accepts Windows-style override key names`() {
        let env = HostEnvSanitizer.sanitize(overrides: [
            "ProgramFiles(x86)": "D:\\SDKs",
            "CommonProgramFiles(x86)": "D:\\Common",
        ])
        #expect(env["ProgramFiles(x86)"] == "D:\\SDKs")
        #expect(env["CommonProgramFiles(x86)"] == "D:\\Common")
    }
}
