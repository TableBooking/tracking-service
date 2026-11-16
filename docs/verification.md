# Verification

Local verification completed on 2026-11-16:

- `npm run check`: TypeScript, ESLint and Prettier pass.
- `npm test`: configuration, event contract/hash and unroutable publisher-confirm tests pass.
- `npm run test:gateway`: real Nest gateway and Tracking HTTP application, ephemeral RSA keys and embedded PostgreSQL pass. Includes duplicate, gaps, out-of-order, conflict rollback and ownership.
- `npm run build`: pass.
- Compose manifests: configuration validated with `--no-env-resolution`; this does not verify credentials, mounts or running containers.

Not executed: Docker image build/run (daemon unavailable), real RabbitMQ retry/outage, Supabase bootstrap/role grants/SSL, production migrations and cloud deployment. `npm run test:broker` is provided for an available development broker. Embedded PostgreSQL is not proof of multi-process concurrency or cloud networking.

Gateway source and the shared docs repository were not changed. Workspace-level Compose convenience files have versioned copies in this repository's `deploy/` directory.
