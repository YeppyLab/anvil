# 🔨 Anvil

AI-powered API testing tool — describe scenarios in natural language, Anvil does the rest.

## Quick Start

```bash
# Install dependencies
yarn install

# Copy and configure
cp anvil.config.example.yaml anvil.config.yaml
# Edit anvil.config.yaml with your API details and LLM key

# Start Anvil
yarn start
```

## Import API Specs

```bash
# Import from Postman collection
yarn start import --postman ./collection.json

# Import from OpenAPI/Swagger spec
yarn start import --openapi ./swagger.yaml
```

## Architecture

CLI-first, no framework. Pure Node.js + TypeScript.

- **Spec Parser** — Ingests Postman/OpenAPI, outputs to MD knowledge base
- **Agent Core** — LLM-powered test orchestrator
- **Skill Engine** — Reusable test patterns (auth, CRUD, validation, error handling)
- **Tool Layer** — HTTP calls, assertions, value extraction
- **Test Executor** — Runs tests, captures request/response pairs

## Tech Stack

- Node.js + TypeScript
- Markdown for storage (knowledge base, config, reports)
- Model-agnostic LLM adapters (OpenAI, Claude, Gemini)

## License

MIT
