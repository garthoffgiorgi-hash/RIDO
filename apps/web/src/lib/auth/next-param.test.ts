import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { safeNext, validNext } from "./next-param.ts";

describe("safeNext", () => {
  it("falls back when nothing was requested", () => {
    assert.equal(safeNext(null), "/account");
    assert.equal(safeNext(undefined), "/account");
    assert.equal(safeNext(""), "/account");
  });

  it("honours the caller's own fallback", () => {
    assert.equal(safeNext(null, "/auth/landing"), "/auth/landing");
  });

  it("honours a plain relative path", () => {
    assert.equal(safeNext("/drive"), "/drive");
    assert.equal(safeNext("/request?onboarding=return"), "/request?onboarding=return");
  });

  it("rejects an absolute foreign URL", () => {
    assert.equal(safeNext("https://evil.example"), "/account");
    assert.equal(safeNext("mailto:a@evil.example"), "/account");
  });

  it("rejects a protocol-relative path", () => {
    assert.equal(safeNext("//evil.example"), "/account");
  });

  it("rejects a leading backslash, which a browser normalises to protocol-relative", () => {
    assert.equal(safeNext("/\\evil.example"), "/account");
    assert.equal(safeNext("/\\\\evil.example"), "/account");
  });

  it("rejects an embedded control character", () => {
    assert.equal(safeNext("/drive\nSet-Cookie: x=1"), "/account");
    assert.equal(safeNext("/drive\r\nEvil: header"), "/account");
  });

  it("rejects a self-referential target — a sign-in form is a pointless destination", () => {
    assert.equal(safeNext("/login"), "/account");
    assert.equal(safeNext("/signup"), "/account");
  });

  it("rejects a self-referential target even carrying a query or hash", () => {
    assert.equal(safeNext("/login?next=/drive"), "/account");
    assert.equal(safeNext("/signup#foo"), "/account");
  });

  it("does not reject a path that merely starts with a self-referential prefix", () => {
    assert.equal(safeNext("/login-help"), "/login-help");
  });

  it("honours /auth/landing — the landing rule's own default, not a loop hazard", () => {
    assert.equal(safeNext("/auth/landing"), "/auth/landing");
  });
});

describe("validNext", () => {
  it("returns null rather than a fallback when nothing was requested", () => {
    assert.equal(validNext(null), null);
    assert.equal(validNext(undefined), null);
    assert.equal(validNext(""), null);
  });

  it("returns the path unchanged when it's valid", () => {
    assert.equal(validNext("/drive"), "/drive");
  });

  it("returns null for everything safeNext would fall back on", () => {
    assert.equal(validNext("https://evil.example"), null);
    assert.equal(validNext("//evil.example"), null);
    assert.equal(validNext("/\\evil.example"), null);
    assert.equal(validNext("/drive\nSet-Cookie: x=1"), null);
    assert.equal(validNext("/login"), null);
  });

  it("does NOT reject /auth/landing — see next-param.ts's header for why", () => {
    assert.equal(validNext("/auth/landing"), "/auth/landing");
  });
});

describe("safeNext is validNext with a fallback", () => {
  it("agrees with validNext on every valid input", () => {
    assert.equal(safeNext("/drive"), validNext("/drive"));
  });

  it("substitutes the fallback exactly where validNext returns null", () => {
    assert.equal(safeNext("/login", "/somewhere"), "/somewhere");
    assert.equal(safeNext(null, "/somewhere"), "/somewhere");
  });
});
