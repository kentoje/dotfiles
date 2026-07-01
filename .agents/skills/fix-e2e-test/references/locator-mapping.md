# Snapshot → Playwright locator translation

`agent-browser snapshot -i` reports each interactive element as a role + accessible name (and often a
`data-testid` / text). Both agent-browser and Playwright sit on the same Playwright engine, so the
captured element maps almost 1:1 to a resilient Playwright locator. Translate, don't invent.

## Priority order (most resilient first)

1. **Test id** - survives copy/visual changes. `getByTestId("submit-btn")`
2. **Role + accessible name** - matches assistive tech and the snapshot's own model. `getByRole("button", { name: "Save" })`
3. **Label / placeholder** (form fields). `getByLabel("Email")`, `getByPlaceholder("Search")`
4. **Text** - for non-interactive content/assertions. `getByText("Welcome back")`
5. **CSS/XPath** - last resort; brittle. Use only when nothing semantic exists.

## Mapping table

| agent-browser snapshot shows | Playwright locator |
| --- | --- |
| `button "Save changes" [ref=e3]` | `page.getByRole("button", { name: "Save changes" })` |
| `textbox "Email" [ref=e1]` | `page.getByLabel("Email")` (or `getByRole("textbox", { name: "Email" })`) |
| `link "Settings"` | `page.getByRole("link", { name: "Settings" })` |
| element with `data-testid="user-menu"` | `page.getByTestId("user-menu")` |
| `checkbox "Accept terms"` | `page.getByRole("checkbox", { name: "Accept terms" })` |
| `combobox "Country"` | `page.getByRole("combobox", { name: "Country" })` then `.selectOption()` |
| visible static text "Saved" | `expect(page.getByText("Saved")).toBeVisible()` |

> Accessible name in Playwright's `name` is case-insensitive substring by default; pass
> `{ name: "Save", exact: true }` when a substring would over-match.

## Uniqueness - avoid strict-mode violations

Playwright runs in strict mode: a locator that resolves to **more than one** element throws
("resolved to N elements"). Before writing a captured locator into the test, confirm it's unique:

```bash
agent-browser --session aircall-local get count "<selector>"   # expect 1
```

If a role+name matches several elements, scope it:

- Chain within a container: `page.getByTestId("dialog").getByRole("button", { name: "Confirm" })`
- Use `.first()` / `.nth(i)` **only** when the position is genuinely stable and meaningful.
- Prefer a `data-testid` the team can add over a fragile positional selector.

## Waiting - web-first assertions, not sleeps

When the gap is timing (element appears after async work), express it as an assertion that
auto-retries, never a fixed delay:

```ts
// good - retries until true or times out
await expect(page.getByRole("alert")).toContainText("Saved");
await expect.poll(() => page.getByTestId("rows").count()).toBeGreaterThan(0);

// bad - flaky, masks the real timing, slows the suite
await page.waitForTimeout(3000);
```

`getByRole`/`getByText` + `expect(...).toBeVisible()` already auto-wait for the element to attach and
become actionable - usually no explicit wait is needed once the locator is correct.
