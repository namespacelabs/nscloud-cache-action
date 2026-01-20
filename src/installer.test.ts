import { beforeEach, describe, expect, test, vi } from "vitest";
import * as installer from "./installer";

const getInput = vi.hoisted(() => vi.fn());
const addPath = vi.hoisted(() => vi.fn());
const info = vi.hoisted(() => vi.fn());
const which = vi.hoisted(() => vi.fn());
const find = vi.hoisted(() => vi.fn());
const downloadTool = vi.hoisted(() => vi.fn());
const extractTar = vi.hoisted(() => vi.fn());
const cacheDir = vi.hoisted(() => vi.fn());
const getExecOutput = vi.hoisted(() => vi.fn());
const getOctokit = vi.hoisted(() => vi.fn());
const existsSync = vi.hoisted(() => vi.fn());

beforeEach(() => {
  vi.clearAllMocks();

  vi.mock("@actions/core", () => ({
    getInput,
    addPath,
    info,
  }));

  vi.mock("@actions/io", () => ({
    which,
  }));

  vi.mock("@actions/tool-cache", () => ({
    find,
    downloadTool,
    extractTar,
    cacheDir,
  }));

  vi.mock("@actions/exec", () => ({
    getExecOutput,
  }));

  vi.mock("@actions/github", () => ({
    getOctokit,
  }));

  vi.mock("fs", () => ({
    existsSync,
  }));

  delete process.env.NSC_POWERTOYS_DIR;
});

describe("getSpace", () => {
  function mockInputs(inputs: Record<string, string>) {
    getInput.mockImplementation((name: string) => inputs[name] || "");
  }

  describe("no existing space binary", () => {
    beforeEach(() => {
      which.mockResolvedValue("");
    });

    test("downloads latest when no version specified", async () => {
      mockInputs({ "github-token": "token" });

      const mockOctokit = {
        rest: {
          repos: {
            getLatestRelease: vi.fn().mockResolvedValue({
              data: { tag_name: "v0.1.0" },
            }),
          },
        },
      };
      getOctokit.mockReturnValue(mockOctokit);
      find.mockReturnValue("");
      downloadTool.mockResolvedValue("/tmp/download.tar.gz");
      extractTar.mockResolvedValue("/tmp/extracted");
      cacheDir.mockResolvedValue("/cache/space/0.1.0");

      const result = await installer.getSpace();

      expect(result).toBe("/cache/space/0.1.0");
      expect(downloadTool).toHaveBeenCalled();
      expect(cacheDir).toHaveBeenCalled();
      expect(addPath).toHaveBeenCalledWith("/cache/space/0.1.0");
    });

    test("uses cache when version is cached", async () => {
      mockInputs({ "space-version": "0.1.0", "github-token": "token" });
      find.mockReturnValue("/cache/space/0.1.0");

      const result = await installer.getSpace();

      expect(result).toBe("/cache/space/0.1.0");
      expect(downloadTool).not.toHaveBeenCalled();
      expect(addPath).toHaveBeenCalledWith("/cache/space/0.1.0");
    });

    test("downloads specified version when not cached", async () => {
      mockInputs({ "space-version": "0.2.0", "github-token": "token" });
      find.mockReturnValue("");
      downloadTool.mockResolvedValue("/tmp/download.tar.gz");
      extractTar.mockResolvedValue("/tmp/extracted");
      cacheDir.mockResolvedValue("/cache/space/0.2.0");

      const result = await installer.getSpace();

      expect(result).toBe("/cache/space/0.2.0");
      expect(downloadTool).toHaveBeenCalledWith(
        expect.stringContaining("v0.2.0"),
        undefined,
        "token"
      );
    });

    test("handles version with v prefix", async () => {
      mockInputs({ "space-version": "v0.3.0", "github-token": "token" });
      find.mockReturnValue("");
      downloadTool.mockResolvedValue("/tmp/download.tar.gz");
      extractTar.mockResolvedValue("/tmp/extracted");
      cacheDir.mockResolvedValue("/cache/space/0.3.0");

      await installer.getSpace();

      expect(downloadTool).toHaveBeenCalledWith(
        expect.stringContaining("space_0.3.0"),
        undefined,
        "token"
      );
    });
  });

  describe("NSC_POWERTOYS_DIR", () => {
    test("uses space from powertoys dir when set and exists", async () => {
      process.env.NSC_POWERTOYS_DIR = "/opt/powertoys";
      existsSync.mockReturnValue(true);
      mockInputs({ "github-token": "token" });
      getExecOutput.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ version: "0.1.0", commit: "abc", date: "2026-01-01" }),
        stderr: "",
      });

      const result = await installer.getSpace();

      expect(result).toBe("/opt/powertoys");
      expect(existsSync).toHaveBeenCalledWith("/opt/powertoys/space");
      expect(which).not.toHaveBeenCalled();
    });

    test("downloads when powertoys dir set but space does not exist", async () => {
      process.env.NSC_POWERTOYS_DIR = "/opt/powertoys";
      existsSync.mockReturnValue(false);
      mockInputs({ "space-version": "0.1.0", "github-token": "token" });
      find.mockReturnValue("/cache/space/0.1.0");

      const result = await installer.getSpace();

      expect(result).toBe("/cache/space/0.1.0");
      expect(which).not.toHaveBeenCalled();
    });
  });

  describe("existing space binary", () => {
    test("uses existing when no version specified", async () => {
      mockInputs({ "github-token": "token" });
      which.mockResolvedValue("/usr/local/bin/space");
      getExecOutput.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ version: "0.1.0", commit: "abc", date: "2026-01-01" }),
        stderr: "",
      });

      const result = await installer.getSpace();

      expect(result).toBe("/usr/local/bin");
      expect(downloadTool).not.toHaveBeenCalled();
      expect(addPath).toHaveBeenCalledWith("/usr/local/bin");
    });

    test("uses existing when version matches", async () => {
      mockInputs({ "space-version": "0.1.0", "github-token": "token" });
      which.mockResolvedValue("/usr/local/bin/space");
      getExecOutput.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ version: "0.1.0", commit: "abc", date: "2026-01-01" }),
        stderr: "",
      });

      const result = await installer.getSpace();

      expect(result).toBe("/usr/local/bin");
      expect(downloadTool).not.toHaveBeenCalled();
      expect(addPath).toHaveBeenCalledWith("/usr/local/bin");
    });

    test("downloads when version mismatches", async () => {
      mockInputs({ "space-version": "0.2.0", "github-token": "token" });
      which.mockResolvedValue("/usr/local/bin/space");
      getExecOutput.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ version: "0.1.0", commit: "abc", date: "2026-01-01" }),
        stderr: "",
      });
      find.mockReturnValue("");
      downloadTool.mockResolvedValue("/tmp/download.tar.gz");
      extractTar.mockResolvedValue("/tmp/extracted");
      cacheDir.mockResolvedValue("/cache/space/0.2.0");

      const result = await installer.getSpace();

      expect(result).toBe("/cache/space/0.2.0");
      expect(downloadTool).toHaveBeenCalled();
      expect(addPath).toHaveBeenCalledWith("/cache/space/0.2.0");
    });

    test("uses cache when version mismatches but cached", async () => {
      mockInputs({ "space-version": "0.2.0", "github-token": "token" });
      which.mockResolvedValue("/usr/local/bin/space");
      getExecOutput.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ version: "0.1.0", commit: "abc", date: "2026-01-01" }),
        stderr: "",
      });
      find.mockReturnValue("/cache/space/0.2.0");

      const result = await installer.getSpace();

      expect(result).toBe("/cache/space/0.2.0");
      expect(downloadTool).not.toHaveBeenCalled();
      expect(addPath).toHaveBeenCalledWith("/cache/space/0.2.0");
    });

    test("handles v prefix in requested version", async () => {
      mockInputs({ "space-version": "v0.1.0", "github-token": "token" });
      which.mockResolvedValue("/usr/local/bin/space");
      getExecOutput.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ version: "0.1.0", commit: "abc", date: "2026-01-01" }),
        stderr: "",
      });

      const result = await installer.getSpace();

      expect(result).toBe("/usr/local/bin");
      expect(downloadTool).not.toHaveBeenCalled();
    });
  });

  describe("explicit latest version", () => {
    test("uses existing when already latest", async () => {
      mockInputs({ "space-version": "latest", "github-token": "token" });
      which.mockResolvedValue("/usr/local/bin/space");
      getExecOutput.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ version: "0.1.0", commit: "abc", date: "2026-01-01" }),
        stderr: "",
      });
      const mockOctokit = {
        rest: {
          repos: {
            getLatestRelease: vi.fn().mockResolvedValue({
              data: { tag_name: "v0.1.0" },
            }),
          },
        },
      };
      getOctokit.mockReturnValue(mockOctokit);

      const result = await installer.getSpace();

      expect(result).toBe("/usr/local/bin");
      expect(downloadTool).not.toHaveBeenCalled();
      expect(addPath).toHaveBeenCalledWith("/usr/local/bin");
    });

    test("downloads when existing is not latest", async () => {
      mockInputs({ "space-version": "latest", "github-token": "token" });
      which.mockResolvedValue("/usr/local/bin/space");
      getExecOutput.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ version: "0.0.9", commit: "abc", date: "2026-01-01" }),
        stderr: "",
      });
      const mockOctokit = {
        rest: {
          repos: {
            getLatestRelease: vi.fn().mockResolvedValue({
              data: { tag_name: "v0.1.0" },
            }),
          },
        },
      };
      getOctokit.mockReturnValue(mockOctokit);
      find.mockReturnValue("");
      downloadTool.mockResolvedValue("/tmp/download.tar.gz");
      extractTar.mockResolvedValue("/tmp/extracted");
      cacheDir.mockResolvedValue("/cache/space/0.1.0");

      const result = await installer.getSpace();

      expect(result).toBe("/cache/space/0.1.0");
      expect(downloadTool).toHaveBeenCalled();
      expect(addPath).toHaveBeenCalledWith("/cache/space/0.1.0");
    });
  });
});


