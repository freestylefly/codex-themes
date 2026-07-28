import assert from "node:assert/strict";
import test from "node:test";
import {
  isTrustedWindowsPublisher,
  parseWindowsInstallCandidate,
  parseWindowsProcessRows,
  portBelongsToWindowsInstall,
  windowsCdpArguments,
  windowsTaskkillArguments,
} from "./codex-windows";

const CHATGPT_EXE = "C:\\Program Files\\WindowsApps\\OpenAI.ChatGPT\\ChatGPT.exe";

test("Windows publisher validation requires a valid OpenAI signature", () => {
  assert.equal(
    isTrustedWindowsPublisher("Valid", "CN=OpenAI, O=OpenAI, L=San Francisco"),
    true,
  );
  assert.equal(
    isTrustedWindowsPublisher("Valid", "CN=Microsoft Corporation, O=Microsoft"),
    false,
  );
  assert.equal(
    isTrustedWindowsPublisher("NotSigned", "CN=OpenAI, O=OpenAI"),
    false,
  );
});

test("Windows install candidates must be absolute and signed by OpenAI", () => {
  assert.deepEqual(
    parseWindowsInstallCandidate(JSON.stringify({
      executable: CHATGPT_EXE,
      installPath: "C:\\Program Files\\WindowsApps\\OpenAI.ChatGPT",
      version: "1.2.3",
      signatureStatus: "Valid",
      signerSubject: "CN=OpenAI, O=OpenAI",
    })),
    {
      platform: "win32",
      executable: CHATGPT_EXE,
      installPath: "C:\\Program Files\\WindowsApps\\OpenAI.ChatGPT",
      version: "1.2.3",
    },
  );
  assert.equal(parseWindowsInstallCandidate("{invalid"), null);
  assert.equal(parseWindowsInstallCandidate(JSON.stringify({
    executable: "ChatGPT.exe",
    installPath: ".",
    signatureStatus: "Valid",
    signerSubject: "CN=OpenAI",
  })), null);
});

test("Windows CIM process rows are normalized and invalid entries are removed", () => {
  assert.deepEqual(parseWindowsProcessRows(JSON.stringify([
    {
      ProcessId: 120,
      ParentProcessId: 1,
      ExecutablePath: CHATGPT_EXE,
      CommandLine: `"${CHATGPT_EXE}"`,
    },
    {
      ProcessId: "bad",
      ParentProcessId: 120,
      ExecutablePath: "",
      CommandLine: "",
    },
  ])), [{
    pid: 120,
    parentPid: 1,
    executable: CHATGPT_EXE,
    commandLine: `"${CHATGPT_EXE}"`,
  }]);
  assert.deepEqual(parseWindowsProcessRows("not-json"), []);
});

test("Windows debug port ownership accepts only the trusted process tree", () => {
  const rows = [
    {
      pid: 120,
      parentPid: 1,
      executable: CHATGPT_EXE,
      commandLine: `"${CHATGPT_EXE}"`,
    },
    {
      pid: 121,
      parentPid: 120,
      executable: "C:\\Program Files\\WindowsApps\\OpenAI.ChatGPT\\resources\\renderer.exe",
      commandLine: "renderer.exe",
    },
    {
      pid: 999,
      parentPid: 1,
      executable: "C:\\Windows\\System32\\notepad.exe",
      commandLine: "notepad.exe",
    },
  ];

  assert.equal(portBelongsToWindowsInstall([120], rows, CHATGPT_EXE), true);
  assert.equal(portBelongsToWindowsInstall([121], rows, CHATGPT_EXE), true);
  assert.equal(portBelongsToWindowsInstall([121, 999], rows, CHATGPT_EXE), false);
  assert.equal(portBelongsToWindowsInstall([], rows, CHATGPT_EXE), false);
});

test("Windows launch and stop arguments keep the requested scope", () => {
  assert.deepEqual(windowsCdpArguments(9222), [
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=9222",
  ]);
  assert.deepEqual(windowsTaskkillArguments(120, false), ["/PID", "120", "/T"]);
  assert.deepEqual(windowsTaskkillArguments(120, true), ["/PID", "120", "/T", "/F"]);
});
