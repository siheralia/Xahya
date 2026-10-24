# Automated verification (W01)

Use npm and Node.js 24, matching `.github/workflows/tests.yml`.

```sh
npm ci --ignore-scripts
npm test
```

The test command uses the Node.js built-in test runner and executes `tests/*.test.mjs`. Pull requests run the same command in GitHub Actions. The smoke test checks that assertions execute.

To verify failure detection locally, temporarily add a test with `assert.fail('intentional failure')`, run `npm test`, confirm a nonzero exit status, then remove the temporary test. Never commit a deliberately failing test.

The CI workflow intentionally does not gate on build or lint: their reliability must be established independently before adding them as required checks. Existing `emit-contract.yml` remains unchanged.

W01 scope is test infrastructure only. No gameplay or economic logic is modified. W00 G0 working-tree evidence remains outstanding under the explicitly owner-approved dependency exception. GitHub CI execution and clean-install verification must be recorded before marking W01 VERIFIED.
