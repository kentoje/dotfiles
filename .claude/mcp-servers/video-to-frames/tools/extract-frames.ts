import { existsSync, mkdirSync, readdirSync } from "fs";
import { basename, dirname, join, extname } from "path";

const SUPPORTED_FORMATS = new Set([
  ".mp4", ".mov", ".avi", ".mkv", ".webm",
  ".flv", ".wmv", ".m4v", ".3gp", ".ts",
]);

export async function extractFrames(args: {
  video_path: string;
  fps?: number;
  scale_width?: number;
  output_dir?: string;
}) {
  const { video_path, fps = 4, scale_width = 640 } = args;

  const ext = extname(video_path).toLowerCase();
  if (!SUPPORTED_FORMATS.has(ext)) {
    return {
      content: [{
        type: "text" as const,
        text: `Error: Unsupported format "${ext}". Supported: ${[...SUPPORTED_FORMATS].join(", ")}`,
      }],
    };
  }

  if (!existsSync(video_path)) {
    return {
      content: [{
        type: "text" as const,
        text: `Error: File not found: ${video_path}`,
      }],
    };
  }

  const outputBase = args.output_dir || "/tmp/video-frames";
  const timestamp = Date.now();
  const videoName = basename(video_path, ext);
  const outputDir = join(outputBase, `frames_${videoName}_${timestamp}`);

  mkdirSync(outputDir, { recursive: true });

  const ffmpegArgs = [
    "-i", video_path,
    "-vf", `fps=${fps},scale=${scale_width}:-1`,
    join(outputDir, "frame_%04d.png"),
  ];

  const proc = Bun.spawn(["ffmpeg", ...ffmpegArgs], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const stderr = await new Response(proc.stderr).text();

  if (exitCode !== 0) {
    return {
      content: [{
        type: "text" as const,
        text: `Error: ffmpeg exited with code ${exitCode}\n${stderr}`,
      }],
    };
  }

  const frames = readdirSync(outputDir)
    .filter((f) => f.endsWith(".png"))
    .sort()
    .map((f) => join(outputDir, f));

  return {
    content: [{
      type: "text" as const,
      text: [
        `Extracted ${frames.length} frames from ${basename(video_path)}`,
        `Output directory: ${outputDir}`,
        `Settings: fps=${fps}, scale_width=${scale_width}`,
        "",
        "Frames:",
        ...frames,
      ].join("\n"),
    }],
  };
}
