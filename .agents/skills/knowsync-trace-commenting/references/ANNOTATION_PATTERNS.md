# Annotation Patterns

## Quick map

| Intent | Syntax | Example |
|---|---|---|
| Doc -> code | `@symbol` | `@runIndex` |
| Doc -> code | `[[Symbol]]` | `[[GraphDB]]` |
| Doc -> doc | `@doc:path#slug` | `@doc:../architecture/01-1-tong-quan.md#tong-quan` |
| Doc -> doc | `[[doc:path#slug]]` | `[[doc:../prd/checkout.md#checkout-flow]]` |
| Same-file doc -> doc | `@doc:#slug` | `@doc:#chi-tiet-api` |
| Code -> doc | `@doc:path#slug` in comment/docstring | `@doc:../../docs/frd/checkout.md#checkout-flow` |
| Requirement trace | `BRD-*`, `PRD-*`, `FRD-*` | `FRD-CHECKOUT-001` |

## Good examples

### Architecture -> implementation

```md
## @GraphDB
Section này chi tiết hóa [[doc:./06-6-graphdb-schema-ay-u.md#graphdb]]
và liên hệ implementation với @getDocSubgraph.
```

### PRD -> FRD -> code

```md
## Checkout Validation Rules
Chi tiết hóa @doc:../prd/checkout.md#checkout-flow.
Được thực thi bởi @validateCheckout và @runCheckoutRules.
FRD-CHECKOUT-VALIDATION-001
```

```ts
/**
 * Checkout validation entrypoint.
 * @doc:../../docs/prd/checkout.md#checkout-flow
 * @doc:../../docs/frd/checkout.md#checkout-validation-rules
 * FRD-CHECKOUT-VALIDATION-001
 */
```

## Anti-patterns

- Không viết: `xem tài liệu checkout`
- Không viết: `xem doc ở phần trên`
- Không viết symbol alias như `index pipeline runner` nếu code thật là `runIndex`
- Không dùng `[[doc:...]]` khi path không resolve được từ file hiện tại
