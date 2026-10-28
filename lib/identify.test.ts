import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { identifyCover, IdentifyError } from "./identify";

const img = { base64: "AAAA", mediaType: "image/jpeg" as const };
const fake = (create: unknown) => ({ messages: { create } }) as unknown as Anthropic;
const toolUse = (input: unknown) => ({ content: [{ type: "tool_use", input }] });

describe("identifyCover", () => {
  it("returnerar en validerad gissning", async () => {
    const create = vi.fn().mockResolvedValue(
      toolUse({ isAlbumCover: true, artist: " Kent ", title: "Isola", confidence: "high" }),
    );
    const guess = await identifyCover(img, fake(create));
    expect(guess).toEqual({ isAlbumCover: true, artist: "Kent", title: "Isola", confidence: "high" });
    expect(create.mock.calls[0][0].tool_choice).toEqual({ type: "tool", name: "report_cover" });
  });
 
  it("gör tom sträng till null i stället för att hitta på något", async () => {
    const create = vi.fn().mockResolvedValue(
      toolUse({ isAlbumCover: true, artist: "", title: "  ", confidence: "low" }),
    );
    const guess = await identifyCover(img, fake(create));
    expect(guess.artist).toBeNull();
    expect(guess.title).toBeNull();
  });

  it("kastar no_output när modellen inte anropar verktyget", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "Det är nog Kent" }] });
    await expect(identifyCover(img, fake(create))).rejects.toMatchObject({ kind: "no_output" });
  });

  it("kastar invalid_output när svaret har fel form", async () => {
    const create = vi.fn().mockResolvedValue(toolUse({ artist: 42 }));
    await expect(identifyCover(img, fake(create))).rejects.toMatchObject({ kind: "invalid_output" });
  });

  it("kastar api_error när anropet misslyckas", async () => {
    const create = vi.fn().mockRejectedValue(new Error("529 overloaded"));
    const err = await identifyCover(img, fake(create)).catch((e) => e);
    expect(err).toBeInstanceOf(IdentifyError);
    expect(err.kind).toBe("api_error");
  });
});