import {
  err,
  FileError,
  ok,
  type FileInfo,
  type JsonlSessionRepoFileSystem,
  type Result,
} from "@earendil-works/pi-agent-core";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

/**
 * Pi session storage on Supabase Postgres.
 *
 * Pi's `JsonlSessionRepo` implements the full session engine (DAG entries,
 * lanes, compaction, search) and is file-system-agnostic through the
 * `JsonlSessionRepoFileSystem` seam. This adapter backs that seam with
 * Prisma/Postgres: each virtual file maps to one `PiSessionFile` row, so
 * session data lives in Supabase Postgres and survives serverless restarts.
 *
 * Directories are materialized as rows with `content = null` so `listDir`
 * can enumerate sessions. Paths are normalized absolute paths (`/a/b/c`).
 */

const notFound = (path: string) => new FileError("not_found", `File not found: ${path}`, path);

function normalize(path: string | null | undefined): string {
  const cleaned = "/" + (path ?? "").replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
  return cleaned === "/" ? "/" : cleaned;
}

function toFileInfo(row: { path: string; content: string | null; size: number; mtimeMs: bigint }): FileInfo {
  return {
    name: row.path.split("/").pop() ?? row.path,
    path: row.path,
    kind: row.content === null ? "directory" : "file",
    size: row.size,
    mtimeMs: Number(row.mtimeMs),
  };
}

export function createPrismaFileSystem(prisma?: PrismaClient): JsonlSessionRepoFileSystem {
  const db = prisma ?? defaultPrisma;

  const absolutePath = async (path: string): Promise<Result<string, FileError>> => ok(normalize(path));

  const joinPath = async (parts: string[]): Promise<Result<string, FileError>> =>
    ok(normalize(parts.filter((part) => part != null && part !== "").join("/")));

  const readTextFile = async (path: string): Promise<Result<string, FileError>> => {
    const normalized = normalize(path);
    const row = await db.piSessionFile.findUnique({ where: { path: normalized } });
    if (!row || row.content === null) return err(notFound(normalized));
    return ok(row.content);
  };

  const writeFile = async (path: string, content: string | Uint8Array): Promise<Result<void, FileError>> => {
    const normalized = normalize(path);
    const text = typeof content === "string" ? content : new TextDecoder().decode(content);
    const mtimeMs = Date.now();
    await db.piSessionFile.upsert({
      where: { path: normalized },
      create: { path: normalized, content: text, size: Buffer.byteLength(text, "utf8"), mtimeMs },
      update: { content: text, size: Buffer.byteLength(text, "utf8"), mtimeMs },
    });
    return ok(undefined);
  };

  const appendFile = async (path: string, content: string | Uint8Array): Promise<Result<void, FileError>> => {
    const normalized = normalize(path);
    const text = typeof content === "string" ? content : new TextDecoder().decode(content);
    const mtimeMs = Date.now();
    await db.$transaction(async (tx) => {
      // Serialize appends to the same file (single-writer sessions assumed;
      // the lock guards against concurrent turns from two function instances).
      await tx.$queryRaw`SELECT content FROM "PiSessionFile" WHERE path = ${normalized} FOR UPDATE`;
      const existing = await tx.piSessionFile.findUnique({ where: { path: normalized } });
      const next = (existing?.content ?? "") + text;
      await tx.piSessionFile.upsert({
        where: { path: normalized },
        create: { path: normalized, content: next, size: Buffer.byteLength(next, "utf8"), mtimeMs },
        update: { content: next, size: Buffer.byteLength(next, "utf8"), mtimeMs },
      });
    });
    return ok(undefined);
  };

  const renameFile = async (sourcePath: string, destinationPath: string): Promise<Result<void, FileError>> => {
    const source = normalize(sourcePath);
    const destination = normalize(destinationPath);
    await db.$transaction(async (tx) => {
      const rows = await tx.piSessionFile.findMany({
        where: { OR: [{ path: source }, { path: { startsWith: `${source}/` } }] },
      });
      for (const row of rows) {
        const suffix = row.path === source ? "" : row.path.slice(source.length);
        const nextPath = normalize(destination + suffix);
        await tx.piSessionFile.update({ where: { path: row.path }, data: { path: nextPath } });
      }
    });
    return ok(undefined);
  };

  const fileInfo = async (path: string): Promise<Result<FileInfo, FileError>> => {
    const normalized = normalize(path);
    const row = await db.piSessionFile.findUnique({ where: { path: normalized } });
    if (!row) {
      // Synthesize an implicit directory when descendants exist.
      const child = await db.piSessionFile.findFirst({
        where: { path: { startsWith: `${normalized}/` } },
        select: { path: true },
      });
      if (child) {
        return ok({
          name: normalized.split("/").pop() ?? normalized,
          path: normalized,
          kind: "directory",
          size: 0,
          mtimeMs: 0,
        });
      }
      return err(notFound(normalized));
    }
    return ok(toFileInfo(row));
  };

  const listDir = async (path: string): Promise<Result<FileInfo[], FileError>> => {
    const normalized = normalize(path);
    const prefix = normalized === "/" ? "/" : `${normalized}/`;
    const rows = await db.piSessionFile.findMany({ where: { path: { startsWith: prefix } } });
    const children = rows.filter((row) => {
      const rest = row.path.slice(prefix.length);
      return rest.length > 0 && !rest.includes("/");
    });
    return ok(children.map(toFileInfo));
  };

  const exists = async (path: string): Promise<Result<boolean, FileError>> => {
    const normalized = normalize(path);
    const row = await db.piSessionFile.findUnique({ where: { path: normalized } });
    if (row) return ok(true);
    // An implicit directory exists when any descendant is present.
    const child = await db.piSessionFile.findFirst({
      where: { path: { startsWith: `${normalized}/` } },
      select: { path: true },
    });
    return ok(child !== null);
  };

  const createDir = async (path: string): Promise<Result<void, FileError>> => {
    const normalized = normalize(path);
    if (normalized === "/") return ok(undefined);
    // Materialize parent directories recursively so listDir can enumerate them.
    const segments = normalized.split("/").filter(Boolean);
    let current = "";
    for (const segment of segments) {
      current = normalize(`${current}/${segment}`);
      const existing = await db.piSessionFile.findUnique({ where: { path: current } });
      if (!existing) {
        await db.piSessionFile.create({ data: { path: current, content: null, size: 0, mtimeMs: Date.now() } });
      }
    }
    return ok(undefined);
  };

  const remove = async (
    path: string,
    options: { recursive?: boolean; force?: boolean } = {}
  ): Promise<Result<void, FileError>> => {
    const normalized = normalize(path);
    const result = await db.$transaction(async (tx) => {
      const deleted = await tx.piSessionFile.deleteMany({
        where: options.recursive
          ? { OR: [{ path: normalized }, { path: { startsWith: `${normalized}/` } }] }
          : { path: normalized },
      });
      return deleted.count;
    });
    if (result === 0 && !options.force) return err(notFound(normalized));
    return ok(undefined);
  };

  return {
    absolutePath,
    joinPath,
    readTextFile,
    writeFile,
    appendFile,
    renameFile,
    fileInfo,
    listDir,
    exists,
    createDir,
    remove,
  };
}
