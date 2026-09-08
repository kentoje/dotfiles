---
name: lokalise-cli
description: Manage Lokalise projects, languages, keys, translations, and file imports or exports with the Lokalise CLI v2. Use when the user mentions Lokalise, localization projects, translation keys, or syncing translations.
---

# Lokalise CLI

Use `lokalise2` for Lokalise API v2. Run commands through Fish so its universal token is available:

```bash
fish -lc 'lokalise2 --token "$LOKALISE_API_TOKEN" <command>'
```

## Installation

Check first:

```bash
command -v lokalise2 && lokalise2 --version
```

If absent on Apple Silicon macOS, install the official release to a directory on `PATH`:

```bash
tmpdir=$(mktemp -d)
curl --fail --location --output "$tmpdir/lokalise2.tar.gz" \
  https://github.com/lokalise/lokalise-cli-2-go/releases/latest/download/lokalise2_darwin_arm64.tar.gz
tar -xzf "$tmpdir/lokalise2.tar.gz" -C "$tmpdir"
install -m 755 "$tmpdir/lokalise2" "$HOME/.local/bin/lokalise2"
rm -rf "$tmpdir"
```

## Authentication

Require `LOKALISE_API_TOKEN`; never print, persist, or pass its value outside the command invocation. If missing, ask the user to configure Fish:

```fish
set -Ux LOKALISE_API_TOKEN <token>
```


## Dashboard JSON safety

Dashboard locale files are generated from Lokalise at build time. Classify every English JSON change before editing or syncing:

- **New key** — add the new key and English value to `src/assets/locales/en-US.json`. Keep it in the MR: the master-branch webhook creates it in Lokalise after merge. Do not replace it with a pre-merge download.
- **Existing value change** — do not change its value only in the repository. Update the existing Lokalise **translation** first, then pull the generated output. Preserve the old key if deployed code still reads it; add a new key for new UX copy instead of repurposing the old one.
- **Existing value deletion** — do not remove it from source or archive it in Lokalise without explicit confirmation and proof that every deployed caller has cut over.

Lokalise uses `::` key paths where Dashboard JSON uses `.`; e.g. `a.b.c` becomes `a::b::c`.

### Existing-value update flow

1. Discover the project rather than guessing its ID: `lokalise2 project list --filter-names 'Dashboard V4'`.
2. Read the relevant key record with translations and capture its `key_id`, base-language `translation_id`, and current value.
3. Present the exact `old → new` value, key path, and translation ID before the remote mutation unless the user explicitly requested it.
4. Update the **translation**, not the key metadata:

```bash
fish -lc 'lokalise2 translation update --project-id <project_id> \
  --token "$LOKALISE_API_TOKEN" --translation-id <translation_id> \
  --translation "<new_value>"'
```

5. Re-fetch that record and verify the value. Export into a disposable `/tmp` directory and compare only the changed paths before replacing any repository locale file.

Never source Dashboard `.env.local` in Fish: it may contain shell-invalid lines and it does not provide the Lokalise token. Use Fish only for `LOKALISE_API_TOKEN` and pass a discovered project ID explicitly.

### UI proof

After an i18n change, exercise the real page in the browser. A raw dotted translation path is a failed build-time locale injection, not an acceptable fallback.

## Common commands

```bash
# List available products/projects
lokalise2 --token "$LOKALISE_API_TOKEN" project list

# List project languages
lokalise2 --token "$LOKALISE_API_TOKEN" --project-id <project_id> language list

# List translation keys
lokalise2 --token "$LOKALISE_API_TOKEN" --project-id <project_id> key list

# Download localized files
lokalise2 --token "$LOKALISE_API_TOKEN" --project-id <project_id> \
  file download --format json --unzip-to ./locales

# Upload a base-language file
lokalise2 --token "$LOKALISE_API_TOKEN" --project-id <project_id> \
  file upload --file ./locales/en.json --lang-iso en
```

Use `lokalise2 <command> <subcommand> --help` to confirm flags before mutating data. Preview and report read operations; ask before upload, delete, or any other remote mutation.
