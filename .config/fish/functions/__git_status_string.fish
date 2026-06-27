function __git_status_string --description 'gitmux-style git status, styled (arg: repo root)'
    # Computes the gitmux-style status line for the repo at $argv[1] and echoes
    # it with color escapes. Designed to run in a background worker (see
    # conf.d/git_async_prompt.fish). Mirrors .config/tmux/gitmux.yml: same
    # symbols, colors, layout: [branch, divergence, flags, stats], hide_clean.
    set -l root $argv[1]
    test -n "$root"; or return

    # gitmux symbols — defined via explicit Unicode escapes using the exact PUA
    # codepoints from gitmux.yml. NEVER paste the raw nerd-font glyphs here: the
    # PUA chars get silently stripped on copy. ahead/behind use gitmux defaults.
    set -l sym_branch \uf418\u0020  # U+F418 U+0020
    set -l sym_hashprefix \u003a  # U+003A
    set -l sym_ahead \u2191\u00b7  # U+2191 U+00B7
    set -l sym_behind \u2193\u00b7  # U+2193 U+00B7
    set -l sym_staged \uf4d0\u0020  # U+F4D0 U+0020
    set -l sym_conflict \U000f055a\u0020  # U+F055A U+0020
    set -l sym_modified \uf459\u0020  # U+F459 U+0020
    set -l sym_untracked \U000f1036\u0020  # U+F1036 U+0020
    set -l sym_stashed \uea98\u0020  # U+EA98 U+0020
    set -l sym_insertions \uf457\u0020  # U+F457 U+0020
    set -l sym_deletions \uf458\u0020  # U+F458 U+0020

    # One porcelain call: branch header + per-file status
    set -l stat (command git -C $root status --porcelain=v2 --branch 2>/dev/null); or return

    # Branch / detached oid / ahead-behind from the header lines (vectorized)
    set -l branch ''
    set -l m (string match -r '^# branch\.head (.+)' -- $stat); and set branch $m[2]
    set -l oid ''
    set m (string match -r '^# branch\.oid (.+)' -- $stat); and set oid (string sub -l 7 -- $m[2])
    set -l ahead 0
    set -l behind 0
    set m (string match -r '^# branch\.ab \+(-?\d+) -(-?\d+)' -- $stat)
    and begin
        set ahead $m[2]
        set behind $m[3]
    end

    # Flag counts via regex over the array (no slow per-line loop).
    # porcelain v2: "1"/"2" = changed (XY: X=staged, Y=modified), "u"=conflict, "?"=untracked
    set -l staged (string match -r '^[12] [^.]' -- $stat | count)
    set -l modified (string match -r '^[12] .[^.]' -- $stat | count)
    set -l conflict (string match -r '^u ' -- $stat | count)
    set -l untracked (string match -r '^\?' -- $stat | count)
    set -l stashed (command git -C $root rev-list --walk-reflogs --count refs/stash 2>/dev/null); or set stashed 0

    # In-progress state. Fast path uses $root/.git; falls back to a git call only
    # for linked worktrees (where .git is a file, e.g. herdr/aircall worktrees).
    set -l gitdir $root/.git
    test -d $gitdir; or set gitdir (command git -C $root rev-parse --absolute-git-dir 2>/dev/null)
    set -l state ''
    if test -n "$gitdir"
        if test -d $gitdir/rebase-merge; or test -d $gitdir/rebase-apply
            set state REBASE
        else if test -f $gitdir/MERGE_HEAD
            set state MERGE
        else if test -f $gitdir/CHERRY_PICK_HEAD
            set state CHERRY-PICK
        else if test -f $gitdir/REVERT_HEAD
            set state REVERT
        else if test -f $gitdir/BISECT_LOG
            set state BISECT
        end
    end

    # ── Render: branch (white); detached HEAD → ":<hash>" ─────
    set_color white
    if test "$branch" = '(detached)'
        echo -n "$sym_hashprefix$oid"
    else
        echo -n "$sym_branch$branch"
    end
    if test -n "$state"
        set_color red
        echo -n " $state"
    end
    set_color normal

    # ── divergence (yellow) ───────────────────────────────────
    if test "$ahead" -gt 0; or test "$behind" -gt 0
        set_color yellow
        test "$ahead" -gt 0; and echo -n " $sym_ahead$ahead"
        test "$behind" -gt 0; and echo -n " $sym_behind$behind"
        set_color normal
    end

    # ── flags ─────────────────────────────────────────────────
    test "$staged" -gt 0; and begin
        set_color green; echo -n " $sym_staged$staged"
    end
    test "$conflict" -gt 0; and begin
        set_color red; echo -n " $sym_conflict$conflict"
    end
    test "$modified" -gt 0; and begin
        set_color blue; echo -n " $sym_modified$modified"
    end
    test "$untracked" -gt 0; and begin
        set_color brblack; echo -n " $sym_untracked$untracked"
    end
    test "$stashed" -gt 0; and begin
        set_color brblack; echo -n " $sym_stashed$stashed"
    end
    set_color normal

    # ── stats: insertions/deletions of uncommitted changes ────
    # Only when something is changed (skips the diff on clean/untracked-only).
    if test "$staged" -gt 0; or test "$modified" -gt 0; or test "$conflict" -gt 0
        set -l shortstat (command git -C $root diff HEAD --shortstat 2>/dev/null)
        if test -n "$shortstat"
            set -l ins (string match -rg '(\d+) insertion' -- "$shortstat")
            set -l del (string match -rg '(\d+) deletion' -- "$shortstat")
            test -n "$ins"; and begin
                set_color green; echo -n " $sym_insertions$ins"
            end
            test -n "$del"; and begin
                set_color red; echo -n " $sym_deletions$del"
            end
            set_color normal
        end
    end
end
