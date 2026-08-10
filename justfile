set dotenv-filename := ".envrc"

# `just --list --unsorted`
default:
    @just --list --unsorted

# Install the toolchain via mise
[group('setup')]
mise:
    mise install --quiet
    mise current

# Install npm dependencies for the root project and the web app.
# `npm ci` rather than `npm install`: it installs exactly the committed
# lockfiles instead of quietly rewriting them, which is what CI runs too.
[group('setup')]
install: mise
    npm ci
    npm ci --prefix web

# Run the web dev server
[group('dev')]
dev *args: install
    npm run dev:web -- {{ args }}

# Run the bridge
[group('dev')]
bridge *args: install
    scripts/run-bridge.sh {{ args }}

# Lint the web app and check Rust formatting
[group('check')]
lint: install
    npm run lint

# Run the web and bridge test suites
[group('check')]
test: install
    npm run test

# Build the web app and the bridge
[group('check')]
build: install
    npm run build

# Verify vendored sources, lint, test, and build
[group('check')]
check: install
    npm run check

# Audit Rust dependencies for advisories, licenses, bans, and sources
[group('check')]
deny: mise
    cargo deny --manifest-path bridge/Cargo.toml check

# `just check` then run all pre-commit hooks
[group('check')]
verify: check
    pre-commit run --all-files
    @echo "All pre-commit checks passed!"
