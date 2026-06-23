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

2. Create the MR using glab, follow commit message conventions of the repo:
   ```bash
   glab mr create -t "<FIRST_COMMIT_MESSAGE>" -d "<SUMMARY_OF_WHAT_HAS_BEEN_DONE>" -b main --fill -y
   ```

## Attaching a screenshot/image (optional)

A local image can't be embedded in an MR description directly — it must first be
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
   file and pass `-d "$(cat /tmp/mr_body.md)"` to `glab mr create`.

## Notes

- Ensure the branch has been pushed before running this command
- The MR title will be the first commit message of the branch
- **Reviewer/assignee:** add `--reviewer <username>` and `--assignee @me`
  (e.g. `--reviewer pierre.goutheraud`). Requesting a review pings the reviewer.
- **Token for the upload curl:** `glab` authenticates via the `$GITLAB_TOKEN`
  env var — use it directly. Its `config.yml` token is often `!!null`, and
  `glab auth status --show-token` prints it on a `Token found:` line (not
  `Token:`), so don't try to scrape it.
- **fish shell gotcha:** if the shell is fish, `VAR=$(...)` command substitution
  fails to parse — write the commands to a `.sh` file and run `bash script.sh`.
  Also prefer `curl -o file.json` over piping curl into `python json.load`
  (piped reads can truncate).
