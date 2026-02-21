import { describe, it, expect } from "vitest";
import { DIAMOND_RATE, GAME_PROFILE_KEY } from "../constants";

describe("constants", () => {
  it("DIAMOND_RATE is 10", () => {
    expect(DIAMOND_RATE).toBe(10);
  });

  it("GAME_PROFILE_KEY is correct", () => {
    expect(GAME_PROFILE_KEY).toBe("qy_game_profile_v1");
  });
});
