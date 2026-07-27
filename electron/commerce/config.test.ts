import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_COMMERCE_API_URL,
  DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  DEFAULT_SUPABASE_URL,
} from "./config";

test("uses the production commerce API by default", () => {
  assert.equal(DEFAULT_COMMERCE_API_URL, "https://theme.codexguide.ai");
});

test("uses public Supabase configuration suitable for a desktop client", () => {
  assert.equal(DEFAULT_SUPABASE_URL, "https://zuduorhjcwlsjxakewym.supabase.co");
  assert.match(DEFAULT_SUPABASE_PUBLISHABLE_KEY, /^sb_publishable_/);
});
