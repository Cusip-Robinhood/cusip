// Verifies CusipRegistry compilation, ABI selectors, EIP-170 size limit, and calldata encoding.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { encodeFunctionData, stringToHex, pad } from "viem";

const artifact = JSON.parse(readFileSync(new URL("./build/CusipRegistry.json", import.meta.url), "utf8"));

assert.ok(artifact.bytecode.startsWith("0x60"), "Valid EVM creation bytecode");
const sizeBytes = (artifact.bytecode.length - 2) / 2;
assert.ok(sizeBytes < 24576, `Contract under EIP-170 24KB cap (${sizeBytes} bytes)`);

const expectedFns = [
  "bindCusipToken(address)",
  "registerEquityBatch(bytes9[],bytes8[],address[],uint40[],address[])",
  "attestSnapshot(bytes32,uint64,uint32,uint32,uint32,string)",
  "checkProAccess(address)",
  "requestCikIndex(uint40,bool,string)",
  "boostCikPriority(uint40,uint256)",
  "resolveSymbol(bytes8)",
];
for (const sig of expectedFns) {
  assert.ok(artifact.selectors[sig], `Missing selector for ${sig}`);
}

const cusip9 = pad(stringToHex("458140100"), { size: 9, dir: "right" });
const sym8 = pad(stringToHex("INTC"), { size: 8, dir: "right" });
const data = encodeFunctionData({
  abi: artifact.abi,
  functionName: "registerEquityBatch",
  args: [
    [cusip9],
    [sym8],
    ["0xc72b96e0E48ecd4DC75E1e45396e26300BC39681"],
    [50863],
    ["0x0000000000000000000000000000000000000000"],
  ],
});
assert.ok(data.startsWith("0x" + artifact.selectors["registerEquityBatch(bytes9[],bytes8[],address[],uint40[],address[])"]));

console.log("PASS: CusipRegistry ABI, selectors, EIP-170 size, and CUSIP batch calldata verified.");
