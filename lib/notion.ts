// lib/notion.ts
import { Client } from "@notionhq/client";

export const notion = new Client({
  auth: process.env.NOTION_TOKEN, // 记得在 .env.local 里设置
});

/**
 * Query the published blog database. Returns an empty list instead of throwing
 * when Notion is not configured (missing NOTION_TOKEN / databaseId) or the API
 * fails — this keeps build-time static generation (and page rendering) from
 * hard-failing a deployment whose env lacks the Notion keys.
 */
export async function getDatabase(databaseId: string) {
  if (!process.env.NOTION_TOKEN || !databaseId) {
    console.warn("Notion not configured (NOTION_TOKEN / databaseId missing) — returning empty list.");
    return [];
  }

  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "Published",
        checkbox: { equals: true },
      },
      sorts: [
        {
          property: "Date",
          direction: "descending",
        },
      ],
    });

    return response.results;
  } catch (error) {
    console.warn("Notion query failed:", error);
    return [];
  }
}

export async function getPage(pageId: string) {
  if (!process.env.NOTION_TOKEN || !pageId) {
    return null;
  }
  try {
    return await notion.pages.retrieve({ page_id: pageId });
  } catch (error) {
    console.warn("Notion page fetch failed:", error);
    return null;
  }
}
