#!/usr/bin/env node
import { spawn, execSync } from "child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const mcpServer = new McpServer({
  name: "droid-mcp",
  version: "1.0.0",
});

mcpServer.registerTool(
  "droidExec",
  {
    description: "Execute a command via droid exec with the given prompt",
    inputSchema: {
      prompt: z.string().describe("The prompt to execute via droid exec"),
      model: z
        .string()
        .optional()
        .describe(
          "Model ID to use (default: claude-sonnet-4-5-20250929). Available: gpt-5.1-codex, gpt-5.1, gpt-5-codex, claude-sonnet-4-5-20250929, gpt-5-2025-08-07, claude-opus-4-1-20250805, claude-haiku-4-5-20251001, glm-4.6",
        ),
      cwd: z.string().optional().describe("Working directory path"),
    },
  },
  async ({ prompt, model, cwd }) => {
    return new Promise((resolve) => {
      const args = ["exec", "--skip-permissions-unsafe"];

      if (model) {
        args.push("-m", model);
      }
      if (cwd) {
        args.push("--cwd", cwd);
      }

      args.push(prompt);

      const child = spawn("droid", args, {
        timeout: 5 * 60 * 1000,
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("error", (error: Error) => {
        resolve({
          content: [
            {
              type: "text",
              text: `Error executing droid: ${error.message}`,
            },
          ],
          isError: true,
        });
      });

      child.on("close", (code: number) => {
        if (code !== 0) {
          resolve({
            content: [
              {
                type: "text",
                text: `droid exec failed with code ${code}\n\nStdout:\n${stdout}\n\nStderr:\n${stderr}`,
              },
            ],
            isError: true,
          });
        } else {
          const cleanedOutput = stdout.replace(
            /^\x1b\[\?25l\x1b\[2K\x1b\[1G\x1b\[\?25h\x1b\[32m✓[^\n]*\x1b\[0m\n/,
            "",
          );
          resolve({
            content: [
              {
                type: "text",
                text: cleanedOutput,
              },
            ],
          });
        }
      });
    });
  },
);

async function downloadBinary() {
  try {
    const binDir = join(homedir(), ".droid", "bin");
    const binaryPath = join(binDir, "droid");

    if (existsSync(binaryPath)) {
      console.error("Droid binary already installed at:", binaryPath);
      return;
    }

    console.error("Downloading Droid binary...");
    mkdirSync(binDir, { recursive: true });

    execSync("curl -fsSL https://app.factory.ai/cli | sh", {
      stdio: "inherit",
      cwd: binDir,
    });

    console.error("Droid binary downloaded successfully");
  } catch (error) {
    console.error("Failed to download Droid binary:", error);
    throw error;
  }
}

async function main() {
  await downloadBinary();
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("Droid MCP server running on stdio");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
