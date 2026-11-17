// Compiles CusipRegistry.sol with solc 0.8.24 (optimizer 200, viaIR, cancun)
// into build/CusipRegistry.json and build/CusipRegistry.standard-input.json (exact_match Sourcify v2).
import solc from "solc";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const source = readFileSync(new URL("./CusipRegistry.sol", import.meta.url), "utf8");
const input = {
  language: "Solidity",
  sources: { "CusipRegistry.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: "cancun",
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "evm.methodIdentifiers", "metadata"],
      },
    },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));
for (const e of out.errors || []) {
  console.log(`[${e.severity}] ${e.formattedMessage.trim()}`);
}
if ((out.errors || []).some((e) => e.severity === "error")) {
  process.exit(1);
}

const c = out.contracts["CusipRegistry.sol"].CusipRegistry;
const bytecode = "0x" + c.evm.bytecode.object;
const deployedBytes = c.evm.deployedBytecode.object.length / 2;

const stdInput = {
  language: "Solidity",
  sources: { "CusipRegistry.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: "cancun",
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "metadata"],
      },
    },
  },
};

mkdirSync(new URL("./build/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("./build/CusipRegistry.json", import.meta.url),
  JSON.stringify({ contractName: "CusipRegistry", abi: c.abi, bytecode, selectors: c.evm.methodIdentifiers }, null, 2)
);
writeFileSync(
  new URL("./build/CusipRegistry.standard-input.json", import.meta.url),
  JSON.stringify(stdInput, null, 2)
);

console.log(`Compiled CusipRegistry (${deployedBytes} runtime bytes) -> build/CusipRegistry.json`);
