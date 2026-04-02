import { expect, test } from "bun:test";
import { hello } from "../src/index";

test("Hello World", async () => {
  const result = await hello();
  // console.log(result);
  expect(result).toBe("Hello Web3LearnLabs");
});
