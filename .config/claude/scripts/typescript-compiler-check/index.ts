try {
  const input_data = JSON.parse(await Bun.stdin.text());

  const tool_input = input_data.tool_input;
  const file_path = tool_input.file_path;

  // Only check TypeScript files
  if (
    !file_path ||
    (!file_path.endsWith(".ts") && !file_path.endsWith(".tsx"))
  ) {
    process.exit(0);
  }

  // Run TypeScript compiler check
  const proc = Bun.spawn(
    [
      "npx",
      "tsc",
      "--noEmit",
      "--skipLibCheck",
      "--jsx",
      "react-jsx",
      file_path,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const result = await proc.exited;

  if (result !== 0) {
    console.error("⚠ TypeScript errors detected - please review");

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    if (stdout) {
      console.error(stdout);
    }
    if (stderr) {
      console.error(stderr);
    }

    process.exit(2);
  }
} catch (error) {
  console.error(`Error: ${error}`);
  process.exit(1);
}
