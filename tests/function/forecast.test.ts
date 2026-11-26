import { describe, it, expect, beforeEach } from "vitest";
import { load, call, resetMocks, setState, calls } from "./helpers.ts";

describe("GET /api/forecast", () => {
  beforeEach(resetMocks);

  it("200 with both datasets for a known beach, no token needed", async () => {
    const h = await load("forecast.mts");
    const res = await call(h, "GET", "/api/forecast?beach=south-beach");
    expect(res.status).toBe(200);
    const b: any = await res.json();
    expect(b.beach.id).toBe("south-beach");
    expect(b.forecast?.hourly?.time?.length).toBeGreaterThan(0);
    expect(b.marine?.hourly?.wave_height).toBeTruthy();
    expect(b.partial).toBe(false);
    expect(Number.isNaN(Date.parse(b.fetchedAt))).toBe(false);
    const c = await calls();
    expect(c.some((x) => x.path === "/open-meteo/v1/forecast")).toBe(true);
    expect(c.some((x) => x.path === "/marine/v1/marine")).toBe(true);
  });
  it("400 when beach is missing", async () => {
    const h = await load("forecast.mts");
    const res = await call(h, "GET", "/api/forecast");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.any(String) });
  });
  it("404 for an unknown beach, and never calls upstream", async () => {
    const h = await load("forecast.mts");
    const res = await call(h, "GET", "/api/forecast?beach=atlantis");
    expect(res.status).toBe(404);
    expect((await calls()).length).toBe(0);
  });
  it("partial when marine fails", async () => {
    const h = await load("forecast.mts");
    await setState({ marineStatus: 500 });
    const res = await call(h, "GET", "/api/forecast?beach=south-beach");
    expect(res.status).toBe(200);
    const b: any = await res.json();
    expect(b.partial).toBe(true); expect(b.marine).toBeNull(); expect(b.forecast).toBeTruthy();
  });
  it("502 when both upstreams fail, without leaking upstream bodies", async () => {
    const h = await load("forecast.mts");
    await setState({ marineStatus: 500, forecastStatus: 500 });
    const res = await call(h, "GET", "/api/forecast?beach=south-beach");
    expect(res.status).toBe(502);
    const t = await res.text();
    expect(t).not.toContain("mock");
  });
});
