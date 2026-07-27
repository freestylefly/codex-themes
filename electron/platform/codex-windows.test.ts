/**
 * [INPUT]: 依赖 node:test 与 codex-windows 导出的纯解析器/可注入 Adapter
 * [OUTPUT]: 验证 Store 身份、netstat loopback、包族、缓存、启动与授权停止行为
 * [POS]: electron/platform 的 Windows 回归门禁，不触碰真实 Codex 进程
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AppPaths } from "../paths";
import type { CodexInstall } from "./types";
import {
  buildPowerShellCommand,
  createWindowsCodexPlatformAdapter,
  isLoopbackAddress,
  parseWindowsCodexPackages,
  parseWindowsProcessTable,
  parseWindowsTcpListeners,
  WINDOWS_CODEX_DISCOVERY_SCRIPT,
  WINDOWS_PROCESS_SCRIPT,
  type WindowsPlatformDependencies,
} from "./codex-windows";

function packageCandidate(overrides: Record<string, unknown> = {}) {
  return {
    Name: "OpenAI.Codex",
    Publisher: "CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B",
    PackageFamilyName: "OpenAI.Codex_2p2nqsd0c76g0",
    Architecture: "X64",
    Version: "26.721.4979.0",
    InstallLocation: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0",
    ApplicationId: "App",
    Executable: "app/ChatGPT.exe",
    EntryPoint: "Windows.FullTrustApplication",
    ...overrides,
  };
}

const verifiedInstall = parseWindowsCodexPackages(JSON.stringify(packageCandidate()))[0];
const paths = { windowsHelperPath: "codex-activator.exe" } as AppPaths;

interface FakeState {
  packages: unknown;
  processes: unknown;
  listeners: Record<number, { localAddress?: string; owningProcess: number }[]>;
  packageFamilies: Record<number, string | null>;
  helperCalls: string[][];
  killedPids: number[];
  httpChecks: number[];
  now: number;
}

function fakeDependencies(overrides: Partial<FakeState> = {}): {
  dependencies: WindowsPlatformDependencies;
  state: FakeState;
} {
  const state: FakeState = {
    packages: packageCandidate(),
    processes: [],
    listeners: {},
    packageFamilies: {},
    helperCalls: [],
    killedPids: [],
    httpChecks: [],
    now: 0,
    ...overrides,
  };
  const dependencies: WindowsPlatformDependencies = {
    async runPowerShell(script, args = []) {
      if (script === WINDOWS_CODEX_DISCOVERY_SCRIPT) return JSON.stringify(state.packages);
      if (script === WINDOWS_PROCESS_SCRIPT) return JSON.stringify(state.processes);
      throw new Error("Unexpected PowerShell script.");
    },
    async runNetstat() {
      return Object.entries(state.listeners).flatMap(([port, listeners]) =>
        listeners.map((listener) => {
          const address = listener.localAddress ?? "127.0.0.1";
          const endpoint = address.includes(":") ? `[${address}]:${port}` : `${address}:${port}`;
          return `TCP    ${endpoint}    0.0.0.0:0    LISTENING    ${listener.owningProcess}`;
        })
      ).join("\r\n");
    },
    async runHelper(args) {
      state.helperCalls.push(args);
      if (args[0] === "activate") return { ok: true, pid: 700 };
      if (args[0] === "open-uri") return { ok: true };
      if (args[0] === "close") return { ok: true, windowsClosed: 1 };
      if (args[0] === "package-family") {
        const pid = Number(args[1]);
        return {
          ok: true,
          packageFamilyName: Object.hasOwn(state.packageFamilies, pid)
            ? state.packageFamilies[pid]
            : "OpenAI.Codex_2p2nqsd0c76g0",
        };
      }
      throw new Error(`Unexpected helper command ${args[0]}.`);
    },
    async killProcessTree(pid) {
      state.killedPids.push(pid);
    },
    async httpReady(port) {
      state.httpChecks.push(port);
      return true;
    },
    async sleep(ms) {
      state.now += ms;
    },
    now: () => state.now,
  };
  return { dependencies, state };
}

describe("Windows Store Codex discovery", () => {
  it("accepts only the verified identity and prefers the highest version", () => {
    const installs = parseWindowsCodexPackages(JSON.stringify([
      packageCandidate({ Version: "26.1.0.0", InstallLocation: "C:\\Older" }),
      packageCandidate({ Version: "26.721.4979.0", InstallLocation: "C:\\Current" }),
    ]));
    assert.equal(installs[0].version, "26.721.4979.0");
    assert.equal(installs[0].executablePath, "C:\\Current\\app\\ChatGPT.exe");
    assert.deepEqual(installs[0].packageLaunchIdentity, {
      packageFamilyName: "OpenAI.Codex_2p2nqsd0c76g0",
      applicationId: "App",
      aumid: "OpenAI.Codex_2p2nqsd0c76g0!App",
    });
  });

  for (const [field, value] of [
    ["Publisher", "CN=spoofed"],
    ["PackageFamilyName", "OpenAI.Codex_spoofed"],
    ["EntryPoint", "Windows.PartialTrustApplication"],
    ["Architecture", "Arm64"],
    ["ApplicationId", "Other"],
    ["Executable", "resources/codex.exe"],
  ] as const) {
    it(`rejects a mismatched ${field}`, () => {
      assert.throws(
        () => parseWindowsCodexPackages(JSON.stringify(packageCandidate({ [field]: value }))),
        new RegExp(field),
      );
    });
  }

  it("reports malformed PowerShell output", () => {
    assert.throws(
      () => parseWindowsCodexPackages("not-json"),
      /Codex package discovery returned malformed JSON/,
    );
  });
  it("ignores the Windows pseudo-process row with PID zero", () => {
    const rows = JSON.stringify([
      { ProcessId: 0, ParentProcessId: 0, ExecutablePath: null, CommandLine: null },
      { ProcessId: 42, ParentProcessId: 4, ExecutablePath: "C:\\Windows\\System32\\svchost.exe", CommandLine: null },
    ]);
    assert.deepEqual(parseWindowsProcessTable(rows), [{
      processId: 42,
      executablePath: "C:\\Windows\\System32\\svchost.exe",
    }]);
  });

  it("parses native netstat listeners and preserves the local address", () => {
    assert.deepEqual(parseWindowsTcpListeners([
      "TCP    127.0.0.1:9341    0.0.0.0:0    LISTENING    42",
      "TCP    [::1]:9341         [::]:0       LISTENING    43",
      "TCP    127.0.0.1:9342    127.0.0.1:50 ESTABLISHED  44",
    ].join("\r\n")), [
      { localAddress: "127.0.0.1", localPort: 9341, owningProcess: 42 },
      { localAddress: "::1", localPort: 9341, owningProcess: 43 },
    ]);
    assert.equal(isLoopbackAddress("0.0.0.0"), false);
  });

  it("binds escaped positional values inside a PowerShell scriptblock", () => {
    assert.equal(
      buildPowerShellCommand("Write-Output $args[0]", ["93'41"]),
      "& {\nWrite-Output $args[0]\n} '93''41'",
    );
  });
});

describe("Windows process and CDP ownership", () => {
  it("rejects a ChatGPT.exe name spoof without verified package identity", async () => {
    const { dependencies } = fakeDependencies({
      processes: [{
        ProcessId: 91,
        ParentProcessId: 1,
        ExecutablePath: "C:\\Temp\\ChatGPT.exe",
        CommandLine: "C:\\Temp\\ChatGPT.exe",
      }],
    });
    const adapter = createWindowsCodexPlatformAdapter(paths, dependencies);
    assert.equal(await adapter.isRunning(verifiedInstall), false);
  });

  it("rejects an exact executable path when package identity is absent", async () => {
    const { dependencies } = fakeDependencies({
      processes: [{ ProcessId: 100, ExecutablePath: verifiedInstall.executablePath }],
      packageFamilies: { 100: null },
    });
    const adapter = createWindowsCodexPlatformAdapter(paths, dependencies);
    assert.equal(await adapter.isRunning(verifiedInstall), false);
  });

  it("rejects a port when any listener is not in the verified process chain", async () => {
    const { dependencies, state } = fakeDependencies({
      processes: [
        {
          ProcessId: 100,
          ExecutablePath: verifiedInstall.executablePath,
        },
        { ProcessId: 999, ExecutablePath: "C:\\Other.exe" },
      ],
      listeners: { 9341: [{ owningProcess: 100 }, { owningProcess: 999 }] },
    });
    const adapter = createWindowsCodexPlatformAdapter(paths, dependencies);
    assert.equal(await adapter.verifyCdpEndpoint(9341, verifiedInstall), false);
    assert.deepEqual(state.httpChecks, []);
  });

  it("requires both verified ownership and loopback HTTP health", async () => {
    const fixture = fakeDependencies({
      processes: [{
        ProcessId: 100,
        ExecutablePath: verifiedInstall.executablePath,
      }],
      listeners: { 9341: [{ owningProcess: 100 }] },
    });
    fixture.dependencies.httpReady = async (port) => {
      fixture.state.httpChecks.push(port);
      return false;
    };
    const adapter = createWindowsCodexPlatformAdapter(paths, fixture.dependencies);
    assert.equal(await adapter.verifyCdpEndpoint(9341, verifiedInstall), false);
    assert.deepEqual(fixture.state.httpChecks, [9341]);
  });

  it("rejects wildcard and non-loopback listeners before the HTTP probe", async () => {
    const fixture = fakeDependencies({
      processes: [{ ProcessId: 100, ExecutablePath: verifiedInstall.executablePath }],
      listeners: { 9341: [{ localAddress: "0.0.0.0", owningProcess: 100 }] },
    });
    const adapter = createWindowsCodexPlatformAdapter(paths, fixture.dependencies);
    assert.equal(await adapter.verifyCdpEndpoint(9341, verifiedInstall), false);
    assert.deepEqual(fixture.state.httpChecks, []);
  });

  it("caches Store discovery for sixty seconds", async () => {
    const fixture = fakeDependencies();
    let discoveries = 0;
    const original = fixture.dependencies.runPowerShell;
    fixture.dependencies.runPowerShell = async (script, args) => {
      if (script === WINDOWS_CODEX_DISCOVERY_SCRIPT) discoveries += 1;
      return original(script, args);
    };
    const adapter = createWindowsCodexPlatformAdapter(paths, fixture.dependencies);
    await adapter.discover();
    await adapter.discover();
    assert.equal(discoveries, 1);
    fixture.state.now = 60_001;
    await adapter.discover();
    assert.equal(discoveries, 2);
  });
});

describe("Windows launch and stop behavior", () => {
  it("passes the exact AUMID and loopback CDP arguments to the helper", async () => {
    const { dependencies, state } = fakeDependencies();
    const adapter = createWindowsCodexPlatformAdapter(paths, dependencies);
    await adapter.launchWithCdp(verifiedInstall, 9341);
    await adapter.launchNormally(verifiedInstall);
    await adapter.openCodexMode(verifiedInstall);
    assert.deepEqual(state.helperCalls, [
      [
        "activate",
        "OpenAI.Codex_2p2nqsd0c76g0!App",
        "--remote-debugging-address=127.0.0.1 --remote-debugging-port=9341",
      ],
      ["activate", "OpenAI.Codex_2p2nqsd0c76g0!App", ""],
      ["open-uri", "codex://threads/new"],
    ]);
  });

  it("does not force-stop without explicit authorization", async () => {
    const { dependencies, state } = fakeDependencies({
      processes: [{
        ProcessId: 100,
        ExecutablePath: verifiedInstall.executablePath,
      }],
    });
    const adapter = createWindowsCodexPlatformAdapter(paths, dependencies);
    await assert.rejects(
      adapter.stop(verifiedInstall, { force: false }),
      /explicit restart authorization is required/,
    );
    assert.deepEqual(
      state.helperCalls.find(([command]) => command === "close"),
      ["close", "100"],
    );
    assert.deepEqual(state.killedPids, []);
  });

  it("reports a verified CDP timeout with the requested port", async () => {
    const { dependencies } = fakeDependencies({ listeners: { 9341: [] } });
    const adapter = createWindowsCodexPlatformAdapter(paths, dependencies);
    await assert.rejects(
      adapter.waitForCdp(9341, verifiedInstall, 700),
      /Timed out waiting for the verified Codex debug port 9341/,
    );
  });

  it("fails launch when package activation identity is absent", async () => {
    const { dependencies } = fakeDependencies();
    const adapter = createWindowsCodexPlatformAdapter(paths, dependencies);
    const incomplete: CodexInstall = {
      displayIdentity: "Codex",
      executablePath: "C:\\Codex.exe",
      version: "1.0.0",
    };
    await assert.rejects(adapter.launchNormally(incomplete), /launch identity is missing/);
  });
});
