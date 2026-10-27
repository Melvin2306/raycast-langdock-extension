import { environment, LaunchProps, LaunchType, launchCommand, showHUD } from "@raycast/api";
import { execFile } from "node:child_process";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { AskAboutFilesContext } from "./ask-about-files";

const KEEP_SCREENSHOTS_MS = 24 * 60 * 60 * 1000;

/** Screenshots are temporary: anything older than a day is removed on the next run. */
async function screenshotsDirectory(): Promise<string> {
  const directory = join(environment.supportPath, "screenshots");
  await mkdir(directory, { recursive: true });
  for (const file of await readdir(directory)) {
    const path = join(directory, file);
    if (Date.now() - (await stat(path)).mtimeMs > KEEP_SCREENSHOTS_MS) await rm(path, { force: true });
  }
  return directory;
}

export default async function Command(props: LaunchProps<{ arguments: Arguments.AskAboutScreenshot }>) {
  const path = join(await screenshotsDirectory(), `screenshot-${Date.now()}.png`);
  // Interactive region capture (Esc cancels); -x turns off the shutter sound.
  // No file afterwards means the capture was cancelled or Raycast lacks the Screen Recording permission.
  await promisify(execFile)("/usr/sbin/screencapture", ["-i", "-x", path]).catch(() => undefined);
  if (!(await stat(path).catch(() => undefined))) {
    await showHUD("No screenshot taken");
    return;
  }
  const question = props.arguments.question?.trim();
  const context: AskAboutFilesContext = {
    files: [path],
    question: question || "What's in this screenshot?",
    send: Boolean(question),
  };
  await launchCommand({ name: "ask-about-files", type: LaunchType.UserInitiated, context });
}
