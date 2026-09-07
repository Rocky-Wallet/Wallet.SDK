# SDK / Extension / Backend 1.0.2 Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize the public Rocky Wallet SDK contract with the current wallet Extension and wallet Backend, and make all three release versions `1.0.2`.

**Architecture:** The wallet Backend remains the source of truth for catalog, balance, offer, and transfer response shapes; the Extension remains the security boundary and only exposes its allow-listed dApp provider methods. The SDK mirrors those public methods and response metadata without exposing Extension-only receive-preapproval signing controls. Version sources are aligned across package metadata, Extension runtime metadata, generated artifacts, declarations, and documentation.

**Tech Stack:** Node.js 20+, browser Extension Manifest V3, JavaScript ESM, TypeScript declarations, Node test runner, npm package metadata, ZIP release packaging.

---

### Task 1: Lock the SDK 1.0.2 contract with failing tests

**Files:**
- Modify: `test/sdk.test.js`
- Modify: `package.json`
- Modify: `src/index.js`
- Modify: `src/index.d.ts`
- Modify: `README.md`
- Rebuild: `dist/index.js`
- Rebuild: `dist/index.d.ts`

- [ ] **Step 1: Add failing SDK version assertions**

Import `MINIMAL_CAPABLE_VERSION`, read `package.json`, and change the provider fixture default to `1.0.2`:

```js
import {
  MINIMAL_CAPABLE_VERSION,
  ROCKY_ASSET_SYMBOLS,
  RockyWalletError,
  createRockyWalletClient,
  createRockyWalletSdk,
  resolveRockyAssetSymbol,
  rockyWallet,
  utils,
} from "../src/index.js";

test("publishes the synchronized 1.0.2 SDK and extension contract", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.version, "1.0.2");
  assert.equal(MINIMAL_CAPABLE_VERSION, "1.0.2");
});

```

At `test/sdk.test.js:556`, change only the `makeProvider` default-version signature:

```diff
-function makeProvider({ calls = [], version = "1.0.0" } = {}) {
+function makeProvider({ calls = [], version = "1.0.2" } = {}) {
```

Update the primary availability expectation to:

```js
{
  status: "installed",
  currentVersion: "1.0.2",
  minimalCapableVersion: "1.0.2",
  isExtensionCapableByVersion: true,
}
```

Keep explicit `1.0.0` fixtures in legacy compatibility tests unchanged.

- [ ] **Step 2: Add failing Backend-aligned declaration assertions**

Extend the declaration test to require the metadata returned by `normalizeAssetDescriptor()` and `publicDynamicBalanceFields()`:

```js
assert.match(declaration, /display_alias: string \| null;/);
assert.match(declaration, /registry_name: string \| null;/);
assert.match(declaration, /decimals: number \| null;/);
assert.match(declaration, /logo_mode\?: string;/);
assert.match(declaration, /usd_price\?: string \| null;/);
assert.match(declaration, /usd_value\?: string \| null;/);
```

Use this catalog fixture and assert `getAssetCatalog()` returns it unchanged:

```js
const catalog = [{
  asset_id: "cusd-mainnet",
  asset_type: "token_standard",
  symbol: "instrument-id-cusd",
  name: "CUSD",
  display_alias: "CUSD",
  registry_name: "Canton USD",
  decimals: 10,
  logo_mode: "upload",
  logo_url: "https://api-extension.rocky.exchange/v1/assets/cusd-mainnet/logo",
  enabled: true,
  configured: true,
  can_receive: true,
  can_send: true,
  can_auto_accept: true,
  auto_accept_default: false,
  price_mode: "none",
  fixed_price_usd: null,
  ticker_pair: null,
  registry_verified_at: "2026-07-17T00:00:00.000Z",
  sort_order: 40,
}];
```

- [ ] **Step 3: Run SDK tests and verify RED**

Run:

```bash
node --test test/sdk.test.js
```

Expected: FAIL because the package/minimum version is still `1.0.1` / `1.0.0`, and the declaration does not yet explicitly model the new fields.

- [ ] **Step 4: Implement the minimal SDK contract**

Set both runtime and declaration minimums:

```js
export const MINIMAL_CAPABLE_VERSION = "1.0.2";
```

```ts
export declare const MINIMAL_CAPABLE_VERSION = "1.0.2";
```

Align `RockyAssetDescriptor` with the Backend descriptor:

```ts
export interface RockyAssetDescriptor extends RockyAssetIdentity {
  asset_type: "canton_coin" | "token_standard";
  symbol: string;
  name: string;
  display_alias: string | null;
  registry_name: string | null;
  decimals: number | null;
  logo_mode?: string;
  logo_url?: string | null;
  enabled: boolean;
  configured?: boolean;
  can_receive?: boolean;
  can_send: boolean;
  can_auto_accept?: boolean;
  auto_accept_default?: boolean;
  sort_order?: number;
  price_mode?: "fixed" | "ticker" | "none";
  fixed_price_usd?: string | null;
  ticker_pair?: string | null;
  registry_verified_at?: string | null;
  [key: string]: unknown;
}
```

Replace `RockyTokenBalance` with the explicit Backend balance fields while preserving its open index signature:

```ts
export type RockyTokenBalance = {
  asset_id?: string | null;
  asset_type?: "canton_coin" | "token_standard";
  symbol: RockyAssetSymbol | string;
  amount?: string;
  display_alias?: string | null;
  registry_name?: string | null;
  configured?: boolean;
  enabled?: boolean;
  can_receive?: boolean;
  can_send?: boolean;
  can_auto_accept?: boolean;
  auto_accept_default?: boolean;
  instrument_admin?: string | null;
  instrument_id?: string | null;
  decimals?: number | null;
  logo_url?: string | null;
  price_mode?: "fixed" | "ticker" | "none";
  fixed_price_usd?: string | null;
  ticker_pair?: string | null;
  registry_verified_at?: string | null;
  sort_order?: number;
  priceUsd?: string | null;
  price_usd?: string | null;
  usd_price?: string | null;
  usd_value?: string | null;
  [key: string]: unknown;
};
```

Set `package.json` to `1.0.2`. Update `README.md` so the Extension contract example and minimum-capable release are `1.0.2`, and explicitly document:

```md
Receive-preapproval enable/disable remains an Extension-owned permission flow. The dApp SDK does not expose the private `rocky_get_receive_preapproval` or `rocky_set_receive_preapproval` runtime methods.
```

- [ ] **Step 5: Run SDK tests and build**

Run:

```bash
npm test
npm run check
npm run build
cmp -s src/index.js dist/index.js
cmp -s src/index.d.ts dist/index.d.ts
```

Expected: all commands exit `0`; generated SDK files are byte-identical to source.

- [ ] **Step 6: Commit the SDK sync**

```bash
git add package.json README.md src/index.js src/index.d.ts test/sdk.test.js dist/index.js dist/index.d.ts docs/superpowers/plans/2026-07-17-sdk-extension-backend-1-0-2-sync.md
git commit -m "feat: sync wallet SDK 1.0.2 contract"
```

### Task 2: Align the Extension runtime and release artifacts to 1.0.2

**Files:**
- Modify: `rocky-wallet-extension/package.json`
- Modify: `rocky-wallet-extension/package-lock.json`
- Modify: `rocky-wallet-extension/manifest.json`
- Modify: `rocky-wallet-extension/src/provider-client.js`
- Modify: `rocky-wallet-extension/src/popup.js`
- Modify: `rocky-wallet-extension/test/manifest.test.js`
- Rebuild: `rocky-wallet-extension/dist/`
- Replace: `rocky-wallet-extension/release/rocky-wallet-extension-1.0.2-webstore.zip`

- [ ] **Step 1: Add a failing single-version-source test**

Add to `test/manifest.test.js`:

```js
test("extension package, manifest, provider, and popup fallback use 1.0.2", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  const provider = await readFile(new URL("../src/provider-client.js", import.meta.url), "utf8");
  const popup = await readFile(new URL("../src/popup.js", import.meta.url), "utf8");

  assert.equal(manifest.version, "1.0.2");
  assert.equal(pkg.version, "1.0.2");
  assert.equal(lock.version, "1.0.2");
  assert.equal(lock.packages[""].version, "1.0.2");
  assert.match(provider, /version: "1\.0\.2"/);
  assert.match(popup, /const APP_VERSION = "1\.0\.2"/);
});
```

- [ ] **Step 2: Run the Extension version test and verify RED**

Run:

```bash
node --test --test-name-pattern="1.0.2" test/manifest.test.js
```

Expected: FAIL because the active runtime version is `1.0.1`.

- [ ] **Step 3: Update every active Extension version source**

Set `package.json`, both root package entries in `package-lock.json`, `manifest.json`, `src/provider-client.js`, and `src/popup.js` to `1.0.2`. Do not modify dependency package versions or historical compatibility documentation.

- [ ] **Step 4: Regenerate Extension artifacts**

Run:

```bash
npm run build:dist
cd dist
zip -qr ../release/rocky-wallet-extension-1.0.2-webstore.zip .
cd ..
```

Verify the ZIP contains the current manifest and runtime modules:

```bash
unzip -t release/rocky-wallet-extension-1.0.2-webstore.zip
unzip -p release/rocky-wallet-extension-1.0.2-webstore.zip manifest.json
unzip -p release/rocky-wallet-extension-1.0.2-webstore.zip src/provider-client.js
```

- [ ] **Step 5: Run the complete Extension verification**

Run:

```bash
npm test
npm run check
npm run build:dist
```

Expected: all tests pass, checks exit `0`, and `dist/manifest.json` reports `1.0.2`.

- [ ] **Step 6: Commit only the version/release hunks**

The Extension already contains unrelated uncommitted history/i18n/UI changes. Use selective staging for overlapping files and preserve those edits:

```bash
git add -p src/popup.js
git add package.json package-lock.json manifest.json src/provider-client.js test/manifest.test.js release/rocky-wallet-extension-1.0.2-webstore.zip
git commit -m "chore: release wallet extension 1.0.2"
```

### Task 3: Align the wallet Backend package version to 1.0.2

**Files:**
- Modify: `rocky-wallet-backend/package.json`
- Modify: `rocky-wallet-backend/package-lock.json`
- Create: `rocky-wallet-backend/test/version.test.js`

- [ ] **Step 1: Add a failing Backend package-version test**

Create `test/version.test.js`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wallet backend package metadata uses release 1.0.2", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));

  assert.equal(pkg.version, "1.0.2");
  assert.equal(lock.version, "1.0.2");
  assert.equal(lock.packages[""].version, "1.0.2");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test test/version.test.js
```

Expected: FAIL because the Backend package version is `0.1.0`.

- [ ] **Step 3: Update Backend package metadata**

Set only the root project versions in `package.json`, `package-lock.json`, and `package-lock.json.packages[""]` to `1.0.2`. Do not replace dependency versions that happen to contain `0.1.0`, `1.0.0`, or `1.0.1`.

- [ ] **Step 4: Run Backend verification**

Run:

```bash
node --test test/version.test.js
npm test
node --check src/app.js
node --check src/canton-client.js
git diff --check
```

Expected: the version test and full Backend suite pass with zero failures.

- [ ] **Step 5: Commit only package-version files**

Preserve the existing uncommitted Backend work in `src/app.js`, `src/canton-client.js`, and `test/api.test.js`:

```bash
git add package.json package-lock.json test/version.test.js
git commit -m "chore: release wallet backend 1.0.2"
```

### Task 4: Verify public contract boundaries and cross-repository release consistency

**Files:**
- Verify: `rocky-wallet-extension/src/content-script.js`
- Verify: `rocky-wallet-extension/src/provider-client.js`
- Verify: `rocky-wallet-sdk/src/index.js`
- Verify: `rocky-wallet-sdk/src/index.d.ts`
- Verify: all active version sources in the three repositories

- [ ] **Step 1: Confirm the dApp allow-list matches SDK callable methods**

Check that public SDK methods route only through the Extension allow-list: `connect`, `disconnect`, `getPrimaryAccount`, `getCoinsBalance`, `getAssetCatalog`, `signMessage`, `submitCommands`, `sendTransfer`, `buildTransfer`, and `getNodeOffers`.

Confirm receive-preapproval methods remain absent from both `PUBLIC_DAPP_METHODS` and `RockyWalletProvider` because they require Extension-owned user confirmation and local signing.

- [ ] **Step 2: Verify synchronized active versions**

Run:

```bash
node -e 'for (const p of ["rocky-wallet-extension/package.json", "rocky-wallet-backend/package.json", "rocky-wallet-sdk/package.json"]) { const v = require(`./${p}`).version; if (v !== "1.0.2") throw new Error(`${p}: ${v}`); }'
node -e 'const m=require("./rocky-wallet-extension/manifest.json"); if (m.version !== "1.0.2") throw new Error(m.version)'
rg -n 'MINIMAL_CAPABLE_VERSION = "1\.0\.2"|version: "1\.0\.2"|APP_VERSION = "1\.0\.2"' rocky-wallet-sdk/src rocky-wallet-extension/src
```

Expected: all active project/runtime versions are `1.0.2`. Historical compatibility examples and dependency versions are intentionally excluded.

- [ ] **Step 3: Run final clean verification in each repository**

Run:

```bash
cd rocky-wallet-sdk && npm test && npm run check && npm run build
cd ../rocky-wallet-extension && npm test && npm run check && npm run build:dist
cd ../rocky-wallet-backend && npm test
```

Expected: every command exits `0`; SDK `dist` and Extension `dist` are regenerated from the synchronized sources.

- [ ] **Step 4: Review repository status without disturbing unrelated edits**

Run:

```bash
git -C rocky-wallet-sdk status --short --branch
git -C rocky-wallet-extension status --short --branch
git -C rocky-wallet-backend status --short --branch
```

Expected: this task's commits are present, while pre-existing unrelated Extension and Backend changes remain untouched and visible if they were not already committed elsewhere.
