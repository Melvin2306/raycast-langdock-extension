import { environment } from "@raycast/api";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageQuality, ImageRegion, ImageSize } from "./langdock";

// Generated images are kept in the extension's support folder, each with a JSON file describing it.

export interface ImageMetadata {
  prompt: string;
  revisedPrompt?: string;
  model: string;
  region: ImageRegion;
  size: ImageSize;
  quality: ImageQuality;
  createdAt: string;
}

export interface SavedImage extends Partial<ImageMetadata> {
  path: string;
  createdAt: string;
}

const imagesDirectory = () => join(environment.supportPath, "images");

export async function saveImage(base64: string, metadata: ImageMetadata): Promise<string> {
  await mkdir(imagesDirectory(), { recursive: true });
  const path = join(imagesDirectory(), `${metadata.createdAt.replace(/[:.]/g, "-")}.png`);
  await writeFile(path, Buffer.from(base64, "base64"));
  await writeFile(`${path}.json`, JSON.stringify(metadata, null, 2));
  return path;
}

export async function listSavedImages(): Promise<SavedImage[]> {
  let files: string[];
  try {
    files = await readdir(imagesDirectory());
  } catch {
    return [];
  }
  const images = await Promise.all(
    files
      .filter((file) => file.endsWith(".png"))
      .map(async (file): Promise<SavedImage> => {
        const path = join(imagesDirectory(), file);
        try {
          const metadata = JSON.parse(await readFile(`${path}.json`, "utf8")) as ImageMetadata;
          return { ...metadata, path };
        } catch {
          return { path, createdAt: new Date(0).toISOString() };
        }
      }),
  );
  return images.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteImage(path: string) {
  await rm(path, { force: true });
  await rm(`${path}.json`, { force: true });
}
