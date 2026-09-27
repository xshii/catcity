# GitHub Actions CI

Workflow: `.github/workflows/ci.yml`. Target: `xshii/catcity`, private unless explicitly changed by the owner.

One standard `ubuntu-24.04` job installs the lockfile and Chromium, then runs `npm run harness`. Harness runs the full `npm run check` gate once before its acceptance/evidence scenario. This avoids running the full gate twice in CI.

Triggers: pushes to main, pull requests and workflow_dispatch. Read-only contents permission; checkout credentials are not persisted. A branch's newer run cancels its older run. Hard timeout: 15 minutes. Evidence upload runs even after a failure and retains artifacts for three days.

GitHub states that standard hosted runners are free for public repositories. Private repositories consume the owner's included quota; GitHub Free currently includes 2000 minutes/month and 500 MB artifact storage shared with Packages. Usage beyond included quota can be billed depending on account settings. This workflow does not modify billing or authorize paid upgrades. Configure an account Actions budget that stops usage at the limit if an absolute zero-spend cap is required.

References (checked 2026-09-27):

- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://github.com/actions/checkout
- https://github.com/actions/setup-node
- https://github.com/actions/upload-artifact

Deployment verification: push a reviewed, locally passing commit; inspect the Actions run and downloaded evidence. Cloud success must be observed, not inferred from local success. Runtime budget and artifact policies reduce usage but cannot establish remaining account-wide quota.
