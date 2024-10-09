# Cache Action for GitHub based on Namespace Cache Volumes

Cache artifacts like dependencies and build outputs to a Namespace Cache
Volume to improve workflow execution time.

## Prerequisites

In order to use `nscloud-cache-action`, you need to ensure that a cache volume is attached to the GitHub Actions job. Check out the [Cache Volumes guide](https://namespace.so/docs/features/faster-github-actions#using-a-cache-volume) for details.

## Example

Select which frameworks you'd like to cache.
You can find a list of supported frameworks at [namespace.so/docs/actions/nscloud-cache-action#cache](https://namespace.so/docs/actions/nscloud-cache-action#cache).

```yaml
name: Tests
jobs:
  tests:
    runs-on: namespace-profile-my-profile-with-caching
 
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
 
      - name: Install Go
        uses: actions/setup-go@v5
        with:
          cache: false # Skip remote GitHub caching
 
      - name: Set up Go cache
        uses: namespacelabs/nscloud-cache-action@v1
        with:
          cache: go
 
      - name: Go tests
        run: go test ./...
```

Alternatively, or in addition, you can select a list of paths to cache:

```yaml
      - name: Set up Go cache
        uses: namespacelabs/nscloud-cache-action@v1
        with:
          path: |
            /home/runner/.cache/go-build
            /home/runner/go/pkg/mod
```

Here are a few examples:

- Go: [namespace-integration-demos/go-cache](https://github.com/namespace-integration-demos/go-cache/blob/main/.github/workflows/with-cache.yaml)
- Javascript/Yarn: [namespace-integration-demos/cache-yarn-workspaces](https://github.com/namespace-integration-demos/cache-yarn-workspaces/blob/main/.github/workflows/ci.yaml)
- Nix: [namespace-integration-demos/nix-cache-example](https://github.com/namespace-integration-demos/nix-cache-example/blob/main/.github/workflows/demo.yaml)
- Rust: [namespace-integration-demos/rust-cache](https://github.com/namespace-integration-demos/rust-cache/blob/main/.github/workflows/demo.yml)

## Didn't find what you're looking for?

Check out our full [reference documentation](https://cloud.namespace.so/docs/actions/nscloud-cache-action) or reach out to `support@namespace.so` for help.
