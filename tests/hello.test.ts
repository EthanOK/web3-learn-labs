import { expect, test } from "bun:test";
// bun link @ethanok/web3-learn-labs
import { hello } from "@ethanok/web3-learn-labs";

test("Hello World", async () => {
  const result = await hello();
  // console.log(result);
  expect(result).toBe("Hello Web3LearnLabs");
});
