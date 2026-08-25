import { describe, expect, it, vi } from "vitest";
import {
  parseCliArgs,
  resolveCliOptions,
  runGamelayoutPkgCli,
} from "../src/cli.js";

describe("gamelayoutpkg CLI", () => {
  it("parses required/default and explicit options", () => {
    expect(parseCliArgs(["--input", "layout.zip"])).toEqual({
      inputPath: "layout.zip",
      deliveryDirectory: undefined,
      check: false,
      outputPath: undefined,
      assetsJsonPath: undefined,
      quality: 80,
      cwebpExecutable: "cwebp",
      ffmpegExecutable: "ffmpeg",
      ffprobeExecutable: "ffprobe",
      bgmBitrateKbps: 128,
      effectMonoBitrateKbps: 64,
      effectStereoBitrateKbps: 96,
      maxAtlasSize: 4096,
      atlasPadding: 4,
      atlasExtrude: 2,
    });
    expect(
      parseCliArgs([
        "--",
        "--input",
        "layout.zip",
        "--output",
        "out.zip",
        "--assets-json",
        "groups.json",
        "--quality",
        "72.5",
        "--cwebp",
        "/opt/tools/cwebp",
        "--ffmpeg",
        "/opt/tools/ffmpeg",
        "--ffprobe",
        "/opt/tools/ffprobe",
        "--bgm-bitrate",
        "120",
        "--effect-mono-bitrate",
        "56",
        "--effect-stereo-bitrate",
        "88",
        "--delivery-dir",
        "cdn-layout",
        "--atlas-max-size",
        "2048",
        "--atlas-padding",
        "6",
        "--atlas-extrude",
        "3",
        "--check",
      ]),
    ).toMatchObject({
      quality: 72.5,
      cwebpExecutable: "/opt/tools/cwebp",
      ffmpegExecutable: "/opt/tools/ffmpeg",
      ffprobeExecutable: "/opt/tools/ffprobe",
      bgmBitrateKbps: 120,
      effectMonoBitrateKbps: 56,
      effectStereoBitrateKbps: 88,
      deliveryDirectory: "cdn-layout",
      check: true,
      maxAtlasSize: 2048,
      atlasPadding: 6,
      atlasExtrude: 3,
    });
  });

  it("rejects missing, duplicate, unknown and invalid values", () => {
    expect(() => parseCliArgs([])).toThrow(/--input/);
    expect(() =>
      parseCliArgs(["--input", "a.zip", "--input", "b.zip"]),
    ).toThrow(/不能重复/);
    expect(() => parseCliArgs(["--input", "a.zip", "--watch"])).toThrow(
      /未知参数/,
    );
    expect(() => parseCliArgs(["--input", "--quality", "80"])).toThrow(
      /需要一个参数值/,
    );
    expect(() =>
      parseCliArgs(["--input", "a.zip", "--quality", "101"]),
    ).toThrow(/0\.\.100/);
    expect(() =>
      parseCliArgs(["--input", "a.zip", "--bgm-bitrate", "7"]),
    ).toThrow(/8\.\.512/);
    expect(() =>
      parseCliArgs(["--input", "a.zip", "--effect-mono-bitrate", "64.5"]),
    ).toThrow(/整数/);
    expect(() =>
      parseCliArgs(["--input", "a.zip", "--atlas-max-size", "9000"]),
    ).toThrow(/256\.\.8192/);
    expect(() =>
      resolveCliOptions(parseCliArgs(["--input", "a.zip", "--check"])),
    ).toThrow(/delivery-dir/);
  });

  it("derives sibling outputs and rejects aliased paths", () => {
    const resolved = resolveCliOptions(parseCliArgs(["--input", "a.zip"]));
    expect(resolved.outputPath).toMatch(/a\.optimized\.zip$/u);
    expect(resolved.assetsJsonPath).toMatch(/a\.assets-groups\.json$/u);
    expect(
      resolveCliOptions(
        parseCliArgs(["--input", "a.zip", "--delivery-dir", "delivery"]),
      ).deliveryDirectory,
    ).toMatch(/delivery$/u);
    expect(() =>
      resolveCliOptions({
        inputPath: "same.zip",
        outputPath: "same.zip",
        quality: 80,
        cwebpExecutable: "cwebp",
      }),
    ).toThrow(/互不相同/);
  });

  it("reports CLI parse failures without throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const original = process.exitCode;
    await runGamelayoutPkgCli(["--bad"]);
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/未知参数/));
    process.exitCode = original;
    error.mockRestore();
  });
});
