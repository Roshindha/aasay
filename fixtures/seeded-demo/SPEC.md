# Pricing service spec

## Constants
- `PAGE_SIZE` = `20` — list endpoints return 20 items per page.
- `MAX_RETRIES` = `3` — the Python client retries a failed request at most 3 times.

## Functions
- `applyDiscount(price, percent)` returns the price reduced by `percent` percent, never below zero.
- `calculateTax(amount, rate)` returns the tax owed for `amount` at `rate`.
- `formatMoney(cents)` formats an integer number of cents as a dollar string.
