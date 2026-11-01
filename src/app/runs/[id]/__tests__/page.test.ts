import { describe, expect, it, vi } from "vitest";
import { metadata } from "../page";

vi.mock("@/components/results", () => ({ Results: () => null }));
vi.mock("@/lib/store", () => ({ getRun: vi.fn() }));

describe("shared estimate page", () => {
  it("keeps visitors' questions out of search engines", () => {
    expect(metadata.robots).toEqual({ index: false });
  });
});
