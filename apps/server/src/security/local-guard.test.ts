import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isLoopbackHost, assessLocalRequest, registerLocalGuard } from "./local-guard";

describe("isLoopbackHost", () => {
  it("accepts loopback hosts with or without ports", () => {
    expect(isLoopbackHost("127.0.0.1:3001")).toBe(true);
    expect(isLoopbackHost("localhost:5173")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("[::1]:3001")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
  });

  it("accepts loopback origins (full URLs)", () => {
    expect(isLoopbackHost("http://127.0.0.1:5173")).toBe(true);
    expect(isLoopbackHost("http://localhost:3001")).toBe(true);
  });

  it("rejects non-loopback hosts and origins", () => {
    expect(isLoopbackHost("evil.com")).toBe(false);
    expect(isLoopbackHost("evil.com:3001")).toBe(false);
    expect(isLoopbackHost("https://evil.com")).toBe(false);
    expect(isLoopbackHost("169.254.169.254")).toBe(false);
    expect(isLoopbackHost("127.0.0.1.evil.com")).toBe(false);
  });

  it("treats an absent value as allowed (non-browser clients)", () => {
    expect(isLoopbackHost(undefined)).toBe(true);
    expect(isLoopbackHost("")).toBe(true);
  });
});

describe("assessLocalRequest", () => {
  it("allows loopback Host with no Origin", () => {
    expect(assessLocalRequest("127.0.0.1:3001", undefined).allowed).toBe(true);
  });
  it("allows loopback Host + loopback Origin (dev proxy / single-origin)", () => {
    expect(assessLocalRequest("127.0.0.1:3001", "http://localhost:5173").allowed).toBe(true);
  });
  it("blocks a non-loopback Host (DNS rebinding)", () => {
    const r = assessLocalRequest("evil.com", undefined);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/Host/);
  });
  it("blocks a cross-origin request (CSRF)", () => {
    const r = assessLocalRequest("127.0.0.1:3001", "https://evil.com");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/origin/i);
  });
});

describe("registerLocalGuard (integration)", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = Fastify({ logger: false });
    registerLocalGuard(app);
    app.get("/ping", async () => ({ ok: true }));
    app.post("/write", async () => ({ wrote: true }));
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
  });

  it("allows a normal loopback request", async () => {
    const res = await app.inject({ method: "GET", url: "/ping", headers: { host: "127.0.0.1:3001" } });
    expect(res.statusCode).toBe(200);
  });

  it("403s a request with an attacker Host (DNS rebinding)", async () => {
    const res = await app.inject({ method: "GET", url: "/ping", headers: { host: "evil.com" } });
    expect(res.statusCode).toBe(403);
  });

  it("403s a cross-origin POST (CSRF) even from a loopback Host", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/write",
      headers: { host: "127.0.0.1:3001", origin: "https://evil.com" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("allows a same-origin POST from the dev proxy origin", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/write",
      headers: { host: "127.0.0.1:3001", origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(200);
  });
});
