# 📂 tropiq‑mono‑repo – Full Folder & File Explanation (English)

*(designed for absolute beginners; explains how the repo implements a micro‑service architecture)*

---

### 1️⃣ High‑Level Diagram

```
[tropiq-mono-repo/]
├─ .codegraph/                # (CodeGraph index – generated with `codegraph init`)
├─ .git/                      # Git history
├─ .env, .env.example, .env.test
├─ .gitignore
├─ CLAUDE.md
├─ README.md
├─ db‑schemas/                # SQL schemas for each service + shared schema
│   ├─ 00‑enums‑schema.sql
│   ├─ 01‑identity‑schema.sql
│   ├─ 02‑rfq‑schema.sql
│   ├─ … (other service‑specific schemas)
│   └─ combined‑schema.sql    # Full DB schema for the whole monorepo
├─ landing‑app/               # (optional UI demo / landing site)
├─ packages/                  # Re‑usable shared modules
│   └─ modules/
│       ├─ config/            # Central configuration loader
│       ├─ datasource/        # DB & cache connection factories
│       ├─ helper/            # Small utilities (logging, error handling, …)
│       └─ service‑discovery/ # Redis‑based service‑registration client
├─ services/                  # **Each micro‑service lives in its own folder**
│   ├─ service‑analytics/
│   │   ├─ configs/
│   │   ├─ definitions/       # OpenAPI definition for this service
│   │   ├─ middlewares/
│   │   ├─ src/               # Business logic (boot, controller, …)
│   │   ├─ test/              # Unit / integration / e2e tests
│   │   ├─ main.js            # Entry point – starts the Express app
│   │   └─ package.json
│   ├─ service‑audit/          # (same structure)
│   ├─ service‑bidding/        # (same structure)
│   ├─ service‑billing/        # (same structure)
│   ├─ service‑document/       # (same structure)
│   ├─ service‑identity/
│   │   ├─ configs/
│   │   ├─ definitions/
│   │   ├─ middlewares/
│   │   ├─ src/
│   │   ├─ test/
│   │   │   ├─ unit/
│   │   │   ├─ integration/
│   │   │   └─ e2e/
│   │   ├─ main.js            # **Entry point** – see code example below
│   │   └─ package.json
│   ├─ service‑notification/   # (same structure)
│   ├─ service‑reference/      # (same structure)
│   ├─ service‑rfq/            # (same structure)
│   └─ service‑shipment/       # (same structure)
├─ package.json               # Root npm scripts & shared dependencies
└─ eslint.config.js           # Lint rules for the whole repo
```

> **Core idea:** Every folder under `services/` is an independent **Node.js/Express micro‑service**. All services share the same Node version (≥ 20) and the common modules located in `packages/modules/`. Services run separately (via pm2 or Docker) and discover each other at runtime through the **service‑discovery** module, which stores registrations in Redis.

---

### 2️⃣ What Do the Root‑Level Items Do?

| Path | Type | Description |
|------|------|------------|
| `.codegraph/` | hidden folder | CodeGraph index; used to quickly locate symbols and dependencies (`codegraph init`). |
| `.git/` | hidden folder | Version‑control history. |
| `.env*` | file | Environment‑specific variables (development, test, production). |
| `.gitignore` | file | Lists files/folders Git should ignore. |
| `CLAUDE.md` | markdown | Project‑specific notes for Claude AI. |
| `README.md` | markdown | Project overview, setup steps, CI/CD links, etc. |
| `db‑schemas/` | folder | SQL definitions of PostgreSQL tables. Contains service‑specific schemas (e.g., `01‑identity‑schema.sql`) and a merged `combined‑schema.sql`. |
| `landing‑app/` | folder | Static or lightweight front‑end; not part of the micro‑service runtime. |
| `packages/` | folder | **Shared library**; eliminates code duplication. |
| `services/` | folder | Container for all micro‑services. Each sub‑folder follows the same layout. |
| `package.json` (root) | file | Root‑level npm scripts (`test:identity`, `lint`, `format`, …) and shared dependencies. |
| `eslint.config.js` | file | Lint configuration applied repository‑wide. |

---

### 3️⃣ Inside a Service Folder (example: `service‑identity`)

```
service-identity/
├─ TEST_GUIDE.md                # Testing guide
├─ TROPIQ_Identity_UserStories_v4_impl.md
├─ commit-and-tag-temp.js       # CI‑tagging helper script
├─ configs/
│   └─ app-config.js           # Service‑specific config (port, env, …)
│   └─ datasource-config.js    # DB / cache settings
├─ definitions/
│   └─ rest-api-definition.js  # OpenAPI (Swagger) specification – HTTP contract
├─ middlewares/
│   └─ index.js                # Express middlewares (auth, logging, error handling)
├─ src/
│   ├─ boot.js                 # Service‑specific boot logic (seed data, workers)
│   └─ … (controllers, services, models)
├─ test/
│   ├─ unit/                  # Pure unit tests
│   ├─ integration/           # Tests that hit DB / external services
│   └─ e2e/                   # End‑to‑end tests
├─ main.js                     # **Entry point** – wires everything together
└─ package.json                # Service‑specific npm metadata (name, version)
```

#### 3.1 `main.js` – The Heart of the Micro‑service

```js
import express from 'express';
import datasources, { createDatasources } from '../../packages/modules/datasource/index.js';
import appConfig, { createAppConfig } from '../../packages/modules/config/index.js';
import serviceDiscovery from '../../packages/modules/service-discovery/index.js';
import helper from '../../packages/modules/helper/index.js';
import rawAppConfig from './configs/app-config.js';
import rawDatasourceConfig from './configs/datasource-config.js';
import middlewareFactory from './middlewares/index.js';
import boot from './src/boot.js';
import openApi from './definitions/rest-api-definition.js';

async function initialize() {
  const app = express();

  // 1️⃣ Load configuration (port, env, feature flags)
  createAppConfig(rawAppConfig, rawDatasourceConfig);

  // 2️⃣ Enable verbose logging when not in production
  if (appConfig?.nodeEnv !== 'production') {
    global.logMode = 'trace';
  }

  // 3️⃣ Initialise DB & cache connections (Postgres, Redis, …)
  await createDatasources(appConfig).catch(error => {
    console.error(error);
    helper.application.exitOnError();
  });

  // 4️⃣ Register the service in **service‑discovery**
  const serviceDiscoveryInstance = await serviceDiscovery(
    app,
    openApi,
    datasources.serviceDiscoveryRedis,
    datasources.coreAppRedis,
  ).catch(error => {
    console.error(error);
    helper.application.exitOnError();
  });

  // 5️⃣ Attach global middlewares (auth, validation, logging)
  app.use(middlewareFactory(appConfig, serviceDiscoveryInstance, openApi));

  // 6️⃣ Publish all known service APIs (gateway‑pattern helper)
  serviceDiscoveryInstance.setAllServiceApis(app).catch(error => {
    console.error(error);
    helper.application.exitOnError();
  });

  // 7️⃣ Start listening on the configured port
  app.listen(appConfig.port);
  helper.application.appStarted(appConfig);

  // 8️⃣ Run service‑specific boot steps (seed data, background jobs, …)
  await boot().catch(error => {
    console.error(error);
    helper.application.exitOnError();
  });
}

initialize();
```

**Plain‑language explanation**

| Step | What happens? | Why it matters for a micro‑service |
|------|---------------|------------------------------------|
| **Load configuration** | Reads `configs/app-config.js` for port, environment, feature flags. | Each service gets its own settings while using a shared loader. |
| **Create datasources** | Opens connections to PostgreSQL, Redis, Kafka, etc. | Services can share the same data stores or have their own instances. |
| **Service discovery** | Registers the service in Redis with name, host, port, and the OpenAPI spec. | Other services locate it at runtime; URLs are not hard‑coded. |
| **Middlewares** | Adds request validation, security headers, logging, etc. | Cross‑cutting concerns stay consistent across all services. |
| **Publish APIs** | `serviceDiscoveryInstance.setAllServiceApis(app)` adds other services' endpoints as proxies. | Enables a single Express instance to act as an API‑gateway. |
| **Listen** | `app.listen(appConfig.port)` – starts the HTTP server. | Each micro‑service runs on its own port (3001, 3002, …). |
| **Boot** | `boot.js` performs data seeding, background job startup, etc. | Service‑specific start‑up logic lives in a dedicated file. |

All other services (`service‑analytics`, `service‑audit`, `service‑bidding`, …) follow the same `main.js` template; only their `configs/*` differ.

---

### 4️⃣ How the Micro‑service Architecture Works Inside the Monorepo

1. **Folder isolation** – Each service has its own `package.json`. Running `npm install` or `npm run test` affects only that service.
2. **Shared modules** (`packages/modules/`) – Config loader, datasource factory, helper utilities, and service‑discovery are defined once and imported via `../../packages/modules/...`.
3. **Service discovery (Redis)** – The `service-discovery` module writes the service name, host, port, and OpenAPI definition into a Redis hash. Other services read this hash to obtain the dynamic URL.
4. **OpenAPI contracts** – Each service keeps an OpenAPI (Swagger) definition in `definitions/rest-api-definition.js`. During registration the definition is also stored in Redis, enabling type‑safe client generation.
5. **Service‑specific DB schemas** – `db‑schemas/` contains per‑service SQL files; `combined‑schema.sql` merges them for a full database setup.
6. **Testing strategy** – Every service ships a `test/` folder with `unit`, `integration`, and `e2e` sub‑folders. The root `package.json` provides scripts like `npm run test:identity` to run only the desired service’s tests.
7. **Process management** – In production you can use **PM2**, Docker‑Compose, or Kubernetes. The repo includes `ecosystem.config.js` files for PM2 (`pm2 start ecosystem.config.js`).
8. **CI/CD** – `README.md` links to GitLab CI/CD pipelines. Each service can be linted, tested, and built independently, allowing parallel execution of pipelines.

---

### 5️⃣ Quick “How‑to” Guide for Beginners

| Goal | Command (run from repo root) | What it does |
|------|------------------------------|--------------|
| Install all dependencies | `npm install` | Installs both root‑level and workspace dependencies (`node_modules/`). |
| Run a single service locally (example: identity) | `node services/service-identity/main.js` | Starts the Express server on the port defined in `services/service-identity/configs/app-config.js`. |
| Start all services with PM2 (development) | `pm2 start services/*/ecosystem.config.js` | Each service reads its `ecosystem.config.js` and runs in the background. |
| Run only identity service unit tests | `npm run test:identity` | Defined in root `package.json`; executes tests under `services/service-identity/test/unit`. |
| Inspect a service’s OpenAPI definition | Open `services/<service>/definitions/rest-api-definition.js` | The Swagger spec is a JSON/JS object; you can feed it to Swagger‑UI for visualization. |
| Add a new micro‑service | 1. `mkdir services/service-new`<br>2. Copy the folder structure from an existing service (e.g., `service-identity`).<br>3. Update `package.json` name, port, and OpenAPI spec. | Because all services share the same bootstrap code, you only need to provide configuration and business logic. |
| Seed the database once | `psql -f db-schemas/combined-schema.sql` | Creates all tables and runs any seed data scripts. |

---

### 6️⃣ TL;DR – Micro‑service Highlights of This Monorepo

| Feature | How it appears in the repo |
|--------|-----------------------------|
| **Independent deploy units** | `services/<service>` folders; each can be packaged as a Docker image or PM2 process. |
| **Loose coupling** | Services communicate only via HTTP + OpenAPI; no direct code imports. |
| **Shared libraries** | `packages/modules/` – config, datasource, helper, service‑discovery etc. |
| **Runtime discovery** | `service-discovery` module stores service names and URLs in Redis; other services query Redis to find peers. |
| **Own data store** | `db‑schemas/` contains per‑service `.sql` files; each micro‑service owns its tables. |
| **Isolated tests** | Each service has its own `test/` folder; CI runs them in parallel. |
| **Single repo, multiple pipelines** | One Git repository, but CI/CD runs separate lint, test, and build pipelines per service. |

---

## 📚 Next Steps

* Dive into **`packages/modules/`** – inspect `config/index.js`, `datasource/index.js`, and `service-discovery/index.js` to see how the shared helpers work.
* Browse **`services/<service>/definitions/`** – read the OpenAPI specs to understand each service’s public API.
* Look at **`services/<service>/test/`** – explore unit, integration, and e2e tests to see how code quality is enforced.

If you’d like a deeper look at any specific part (e.g., the Redis‑based service‑discovery logic, a Docker‑Compose file, or CI/CD configuration), just let me know and I’ll generate the appropriate documentation or code snippets.
