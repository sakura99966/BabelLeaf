# Disabled inherited workflows

These workflows are inherited from Readest and are intentionally parked outside
`.github/workflows`, so GitHub Actions will not publish upstream-branded
artifacts, deploy upstream services, or run inherited scheduled jobs.

Re-enable a workflow only after BabelLeaf application identifiers, artifact
names, endpoints, signing credentials, release secrets, and deployment targets
have been reviewed and replaced. Pull-request checks and security workflows
remain active in `.github/workflows`.
