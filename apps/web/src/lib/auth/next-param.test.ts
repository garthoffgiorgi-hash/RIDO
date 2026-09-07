import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { safeNext } from "./next-param.ts";

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

  it("rejects a self-referential target to prevent a redirect loop", () => {
    assert.equal(safeNext("/login"), "/account");
    assert.equal(safeNext("/signup"), "/account");
    assert.equal(safeNext("/auth/landing"), "/account");
  });

  it("rejects a self-referential target even carrying a query or hash", () => {
    assert.equal(safeNext("/login?next=/drive"), "/account");
    assert.equal(safeNext("/auth/landing#foo"), "/account");
  });

  it("does not reject a path that merely starts with a self-referential prefix", () => {
    assert.equal(safeNext("/login-help"), "/login-help");
  });
});
