// Pure unit tests for the realtime hub (hub.ts) — no DB, no HTTP. Fake
// Response objects just record what would have been written to the wire.
import { describe, it, expect } from "vitest";
import { subscribe, unsubscribe, broadcast, subscriberCount } from "../src/modules/realtime/hub";

function fakeRes() {
  const writes: string[] = [];
  return { writes, write: (chunk: string) => { writes.push(chunk); return true; } } as unknown as {
    writes: string[];
    write: (chunk: string) => boolean;
  };
}

describe("realtime hub", () => {
  it("delivers a broadcast only to subscribers of that organization, never a different one", () => {
    const resA = fakeRes();
    const resB = fakeRes();
    const idA = subscribe("hub-test-org-a", resA as never);
    const idB = subscribe("hub-test-org-b", resB as never);

    broadcast("hub-test-org-a", "message", { hello: "a" });

    expect(resA.writes).toHaveLength(1);
    expect(resA.writes[0]).toContain("event: message");
    expect(resA.writes[0]).toContain('"hello":"a"');
    expect(resB.writes).toHaveLength(0); // never crosses the tenant boundary

    unsubscribe("hub-test-org-a", idA);
    unsubscribe("hub-test-org-b", idB);
  });

  it("stops delivering to a client after it unsubscribes", () => {
    const res = fakeRes();
    const id = subscribe("hub-test-org-c", res as never);
    unsubscribe("hub-test-org-c", id);
    broadcast("hub-test-org-c", "message", { x: 1 });
    expect(res.writes).toHaveLength(0);
  });

  it("delivers to every subscriber of the same organization", () => {
    const res1 = fakeRes();
    const res2 = fakeRes();
    const id1 = subscribe("hub-test-org-d", res1 as never);
    const id2 = subscribe("hub-test-org-d", res2 as never);

    broadcast("hub-test-org-d", "message", { y: 2 });

    expect(res1.writes).toHaveLength(1);
    expect(res2.writes).toHaveLength(1);

    unsubscribe("hub-test-org-d", id1);
    unsubscribe("hub-test-org-d", id2);
  });

  it("tracks subscriberCount correctly across subscribe/unsubscribe", () => {
    expect(subscriberCount("hub-test-org-e")).toBe(0);
    const res = fakeRes();
    const id = subscribe("hub-test-org-e", res as never);
    expect(subscriberCount("hub-test-org-e")).toBe(1);
    unsubscribe("hub-test-org-e", id);
    expect(subscriberCount("hub-test-org-e")).toBe(0);
  });

  it("broadcasting to an organization with no subscribers is a safe no-op", () => {
    expect(() => broadcast("hub-test-org-nobody", "message", {})).not.toThrow();
  });
});
