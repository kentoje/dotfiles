---
name: gitlab-create-merge-request
description: >
  Create a GitLab merge request using glab CLI with the first commit message
  as the title. Use when the user asks to open an MR for the current branch
  targeting main, or after completing work that needs review.
---

# Create Merge Request

Create a GitLab merge request for the current branch targeting `main`.

## Steps

1. Get the first commit message of the current branch (compared to main):

   ```bash
   git log main..HEAD --reverse --format="%s" | head -n 1
   ```

2. Build the description in a file containing REAL line breaks. **Never** put `\n` or `\\n` inside a quoted `-d` argument: the shell passes those characters literally, so GitLab renders them as `\n` instead of Markdown line breaks.

   Use the file tool or a quoted heredoc to create the body, then pass its contents:

   ```bash
   glab mr create -t "<TITLE>" -d "$(cat /tmp/mr_body.md)" -b main -y
   ```

   The body file must contain actual Markdown, for example:

   ```text
   ## Summary
   - Describe the implementation

   ## Verification
   - State the checks that passed
   ```

   Pick **one** creation mode; do not mix them:

   ```bash
   # A. Explicit title and body. Branch must already be pushed.
   glab mr create -t "<TITLE>" -d "$(cat /tmp/mr_body.md)" -b main -y

   # B. Derive title and body from commits. Pushes the branch.
   glab mr create --fill --fill-commit-body -b main -y
   ```

## glab flag rules

Check `glab mr create --help` before reaching for a flag - `glab` is not `gh`, and
the installed version may predate a flag that exists upstream.

- **`--fill` with both `-t` and `-d` is a hard error**: `usage of --title and
  --description overrides --fill`. Mode A above drops `--fill` for that reason.
- **`--description-file` does not exist** in any `glab` version. That is `gh pr
  create --body-file`. For a long body use `-d` with the file contents, or `-d -`
  to open an editor (interactive only, so useless to an agent).
- **`--fill-commit-body` requires `--fill`**: `--fill-commit-body should be used
  with --fill`.
- **`--template` is mutually exclusive** with `-d`, `--fill`, and
  `--related-issue`, and is absent from older builds.
- Non-interactive runs need either `-t` or `--fill`, otherwise:
  `--title or --fill required for non-interactive mode`.
- `--fill` implies `--push`; mode A does not, so push first.

## Attaching a screenshot/image (optional)

A local image can't be embedded in an MR description directly - it must first be
uploaded to the project, which returns ready-to-paste markdown.

1. Upload via the project uploads endpoint. Use **raw `curl --form`**, not
   `glab api` (`glab api -F file=@path` sends the file *contents* as a string
   field → HTTP 400, not a multipart upload):

   ```bash
   # URL-encode the project path: aircall/foo/bar -> aircall%2Ffoo%2Fbar
   curl -s --request POST \
     --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
     --form "file=@/path/to/image.png" \
     "https://gitlab.com/api/v4/projects/<URL-ENCODED-PROJECT-PATH>/uploads" \
     -o /tmp/upload.json
   python3 -c "import json; print(json.load(open('/tmp/upload.json'))['markdown'])"
   ```

   The response `markdown` field looks like `![name](/uploads/<hash>/name.png)`.

2. Put that markdown in the MR description. For a multi-line body, write it to a
   file and pass its contents to `-d` - there is no `--description-file`:

   ```bash
   glab mr create -t "<TITLE>" -d "$(cat /tmp/mr_body.md)" -b main -y   # bash/zsh
   ```

   In fish the substitution is `-d (cat /tmp/mr_body.md)`; simplest is to put the
   whole invocation in a `.sh` file and run `bash script.sh`.

## Verify the created description

After creation, fetch the MR and inspect the description before reporting success:

```bash
glab mr view <MR_ID> --output json
```

The returned `description` must contain real newlines and Markdown markers such as `##` and `-` as separate lines. If it contains literal `\n`, repair it immediately using a body file with real line breaks:

```bash
glab mr update <MR_ID> -d "$(cat /tmp/mr_body.md)" -y
glab mr view <MR_ID> --output json
```

Do not report the MR as ready until this verification passes. `glab mr update` supports `-d`; `--description-file` is not available.
