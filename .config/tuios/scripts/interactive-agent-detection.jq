# explain-agent-detect describes the foreground wrapper in .process, but the
# harness it found may be a child in .group. Inspect the matched child's argv.
def claude_print_mode:
    .[:(index("--") // length)] |
    any(.[]; . == "-p" or . == "--print" or startswith("--print="));

.matched == true and (
    if (.matched_harness // [.manifests[]? | select(.matched) | .id][0]) == "claude-code" then
        ([.group[]? | select(.matched) | .argv][0] // .process.argv // [] |
         claude_print_mode | not)
    else true end
)
