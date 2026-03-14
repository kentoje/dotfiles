import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { extractFrames } from "./tools/extract-frames.js";

const server = new McpServer({
  name: "video-to-frames",
  version: "1.0.0",
});

server.tool(
  "extract_video_frames",
  "Extract frames from a video file as PNG images. Supports mp4, mov, avi, mkv, webm, flv, wmv, m4v, 3gp, ts.",
  {
    video_path: z.string().describe("Absolute path to the video file"),
    fps: z.number().optional().default(4).describe("Frames per second to extract (default: 4)"),
    scale_width: z.number().optional().default(640).describe("Output image width in pixels (default: 640, height auto-scaled)"),
    output_dir: z.string().optional().describe("Output directory (default: same directory as the video)"),
  },
  extractFrames
);

const transport = new StdioServerTransport();
await server.connect(transport);
