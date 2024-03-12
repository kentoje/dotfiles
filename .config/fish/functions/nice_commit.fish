#!/usr/bin/fish
set TYPE (gum choose "fix" "feat" "docs" "style" "refactor" "test" "chore" "revert")
set SCOPE (gum input --placeholder "scope")

# Since the scope is optional, wrap it in parentheses if it has a value.
if test -n "$SCOPE"
    set SCOPE "($SCOPE)"
end

# Pre-populate the input with the type(scope): so that the user may change it
set SUMMARY (gum input --value "$TYPE$SCOPE: " --placeholder "Summary of this change")
set DESCRIPTION (gum write --placeholder "Details of this change")

# Commit these changes
if gum confirm "Commit changes?"
    git commit -m "$SUMMARY" -m "$DESCRIPTION" -n
end

