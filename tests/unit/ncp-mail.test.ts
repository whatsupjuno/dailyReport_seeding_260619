import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    mail: {
      fromAddress: "from@example.com",
      fromName: "Seeding Test",
    },
    ncp: {
      accessKeyId: "access-key",
      secretKey: "secret-key",
    },
  },
}));

import { NcpTransport } from "@/lib/mail/ncp";

const message = {
  to: "user@example.com",
  toName: "User",
  subject: "subject",
  html: "<p>body</p>",
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("NcpTransport", () => {
  it("fetch 요청에 AbortController signal을 전달하고 성공 결과를 반환", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ requestId: "req-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new NcpTransport().send(message);

    expect(result).toEqual({ ok: true, id: "req-1", transport: "ncp" });
  });

  it("5초 안에 응답이 없으면 abort 후 ok:false와 timeout error 반환", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      })
    ));
    vi.stubGlobal("fetch", fetchMock);

    const pending = new NcpTransport().send(message);
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(pending).resolves.toEqual({
      ok: false,
      id: "",
      transport: "ncp",
      error: "NCP mail request timed out after 5000ms",
    });
  });

  it("fetch AbortError는 ok:false와 abort error 반환", async () => {
    const fetchMock = vi.fn(async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new NcpTransport().send(message);

    expect(result).toEqual({
      ok: false,
      id: "",
      transport: "ncp",
      error: "NCP mail request aborted",
    });
  });
});
