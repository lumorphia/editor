import { describe, expect, it } from "vitest";
import { sendEditorEvent } from "./usage.ts";

type Call = { url: string; init: RequestInit };

function fakeFetch(result: "ok" | "reject" = "ok") {
  const calls: Call[] = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return result === "ok"
      ? Promise.resolve(new Response(null, { status: 204 }))
      : Promise.reject(new TypeError("offline"));
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("sendEditorEvent", () => {
  it("種類だけを JSON で /api/editor/events に送る", () => {
    const { fetchImpl, calls } = fakeFetch();

    sendEditorEvent("save", fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/editor/events");
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ event: "save" });
  });

  it("ページを離れても届くように keepalive で送る", () => {
    const { fetchImpl, calls } = fakeFetch();

    sendEditorEvent("to_post", fetchImpl);

    expect(calls[0]!.init.keepalive).toBe(true);
  });

  it("送れなくても例外を投げない (画面には出さない)", async () => {
    const { fetchImpl } = fakeFetch("reject");

    expect(() => sendEditorEvent("open", fetchImpl)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
