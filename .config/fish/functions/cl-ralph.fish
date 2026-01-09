function cl-ralph -d "Global Ralph autonomous agent for Claude Code"
    set -l RALPH_HOME "$HOME/dotfiles/.config/claude/scripts/ralph"

    switch $argv[1]
        case run
            # Run the main loop
            # Usage: cl-ralph run [max_iterations]
            set -l max_iterations 10
            if test (count $argv) -ge 2
                set max_iterations $argv[2]
            end

            # Ensure project is initialized
            set -l project_dir (__cl_ralph_project_dir)
            if not test -d "$project_dir"
                echo "Project not initialized. Run 'cl-ralph init' first."
                return 1
            end

            if not test -f "$project_dir/prd.json"
                echo "No prd.json found. Create one with 'cl-ralph prd' or manually."
                return 1
            end

            # Run the main ralph script
            env RALPH_PROJECT_DIR="$project_dir" RALPH_CWD=(pwd) \
                bash "$RALPH_HOME/ralph.sh" $max_iterations

        case init
            # Initialize ralph for current project
            set -l project_dir (__cl_ralph_project_dir)

            if test -d "$project_dir"
                echo "Project already initialized at: $project_dir"
                return 0
            end

            mkdir -p "$project_dir"
            mkdir -p "$project_dir/archive"

            # Initialize empty progress file
            echo "# Ralph Progress Log" > "$project_dir/progress.txt"
            echo "Project: "(pwd) >> "$project_dir/progress.txt"
            echo "Started: "(date) >> "$project_dir/progress.txt"
            echo "---" >> "$project_dir/progress.txt"

            echo "Initialized Ralph project at: $project_dir"
            echo ""
            echo "Next steps:"
            echo "  1. Create a PRD: cl-ralph prd"
            echo "  2. Run Ralph: cl-ralph run"

        case status
            # Show current project status
            set -l project_dir (__cl_ralph_project_dir)

            if not test -d "$project_dir"
                echo "Project not initialized. Run 'cl-ralph init' first."
                return 1
            end

            echo "Project: "(pwd)
            echo "Data dir: $project_dir"
            echo ""

            if test -f "$project_dir/prd.json"
                set -l total (jq '.userStories | length' "$project_dir/prd.json")
                set -l completed (jq '[.userStories[] | select(.passes == true)] | length' "$project_dir/prd.json")
                set -l branch (jq -r '.branchName // "none"' "$project_dir/prd.json")

                echo "Branch: $branch"
                echo "Progress: $completed / $total stories complete"
                echo ""

                if test $completed -lt $total
                    echo "Next story:"
                    jq -r '[.userStories[] | select(.passes == false)][0] | "  \(.id): \(.title)"' "$project_dir/prd.json"
                else
                    echo "All stories complete!"
                end
            else
                echo "No prd.json found. Create one with 'cl-ralph prd'."
            end

        case prd
            # Launch Claude for PRD creation
            set -l project_dir (__cl_ralph_project_dir)

            # Ensure project is initialized
            if not test -d "$project_dir"
                mkdir -p "$project_dir"
                mkdir -p "$project_dir/archive"
            end

            echo "Launching Claude Code for PRD creation..."
            echo "Project data will be saved to: $project_dir"
            echo ""
            echo "Use /prd skill to generate a PRD, then /ralph skill to convert to prd.json"
            echo "Save prd.json to: $project_dir/prd.json"
            echo ""

            # Launch Claude with context
            set -l current_dir (pwd)
            claude --append-system-prompt "
You are helping create a PRD for the Ralph autonomous agent system.

When you create prd.json, save it to: $project_dir/prd.json
When you create progress.txt, save it to: $project_dir/progress.txt

The user's project is located at: $current_dir
"

        case archive
            # Manually archive current run
            set -l project_dir (__cl_ralph_project_dir)

            if not test -f "$project_dir/prd.json"; and not test -f "$project_dir/prd.md"
                echo "No prd.json or prd.md to archive."
                return 1
            end

            # Get branch name from prd.json if it exists, otherwise use "unknown"
            set -l branch "unknown"
            if test -f "$project_dir/prd.json"
                set branch (jq -r '.branchName // "unknown"' "$project_dir/prd.json" | sed 's|^ralph/||')
            end
            set -l archive_folder "$project_dir/archive/"(date +%Y-%m-%d)"-$branch"

            mkdir -p "$archive_folder"

            if test -f "$project_dir/prd.json"
                cp "$project_dir/prd.json" "$archive_folder/"
            end
            if test -f "$project_dir/prd.md"
                cp "$project_dir/prd.md" "$archive_folder/"
            end
            if test -f "$project_dir/progress.txt"
                cp "$project_dir/progress.txt" "$archive_folder/"
            end

            echo "Archived to: $archive_folder"

            # Reset progress file
            echo "# Ralph Progress Log" > "$project_dir/progress.txt"
            echo "Project: "(pwd) >> "$project_dir/progress.txt"
            echo "Started: "(date) >> "$project_dir/progress.txt"
            echo "---" >> "$project_dir/progress.txt"

            # Remove prd files
            test -f "$project_dir/prd.json" && rm "$project_dir/prd.json"
            test -f "$project_dir/prd.md" && rm "$project_dir/prd.md"
            echo "Removed prd files. Ready for new feature."

        case list
            # List all projects
            set -l projects_dir "$RALPH_HOME/projects"

            if not test -d "$projects_dir"
                echo "No projects found."
                return 0
            end

            echo "Ralph projects:"
            echo ""

            for project in (ls -1 "$projects_dir" 2>/dev/null)
                set -l project_path "$projects_dir/$project"
                if test -d "$project_path"
                    set -l status_marker "-"
                    if test -f "$project_path/prd.json"
                        set -l total (jq '.userStories | length' "$project_path/prd.json" 2>/dev/null || echo "0")
                        set -l completed (jq '[.userStories[] | select(.passes == true)] | length' "$project_path/prd.json" 2>/dev/null || echo "0")
                        set status_marker "$completed/$total"
                    end
                    echo "  [$status_marker] $project"
                end
            end

        case clean
            # Remove project data
            set -l project_dir (__cl_ralph_project_dir)

            if test "$argv[2]" = "--all"
                echo "This will remove ALL Ralph project data."
                read -P "Are you sure? (y/N) " confirm
                if test "$confirm" = "y" -o "$confirm" = "Y"
                    rm -rf "$RALPH_HOME/projects"
                    mkdir -p "$RALPH_HOME/projects"
                    echo "All project data removed."
                else
                    echo "Cancelled."
                end
            else
                if not test -d "$project_dir"
                    echo "No project data for current directory."
                    return 0
                end

                echo "This will remove Ralph data for: "(pwd)
                echo "Data dir: $project_dir"
                read -P "Are you sure? (y/N) " confirm
                if test "$confirm" = "y" -o "$confirm" = "Y"
                    rm -rf "$project_dir"
                    echo "Project data removed."
                else
                    echo "Cancelled."
                end
            end

        case ''
            # No subcommand - show help
            __cl_ralph_help

        case '*'
            echo "Unknown command: $argv[1]"
            __cl_ralph_help
            return 1
    end
end

function __cl_ralph_project_id -d "Convert cwd to project ID"
    # /Users/kento/code/myapp -> users-kento-code-myapp
    pwd | string replace -r '^/' '' | string replace -a '/' '-' | string lower
end

function __cl_ralph_project_dir -d "Get project data directory"
    set -l RALPH_HOME "$HOME/dotfiles/.config/claude/scripts/ralph"
    set -l project_id (__cl_ralph_project_id)
    echo "$RALPH_HOME/projects/$project_id"
end

function __cl_ralph_help -d "Show help message"
    echo "cl-ralph - Global Ralph autonomous agent for Claude Code"
    echo ""
    echo "Usage: cl-ralph <command> [options]"
    echo ""
    echo "Commands:"
    echo "  run [n]      Run Ralph loop (default: 10 iterations)"
    echo "  init         Initialize Ralph for current project"
    echo "  status       Show current project status"
    echo "  prd          Launch Claude for PRD creation"
    echo "  archive      Archive current run"
    echo "  list         List all Ralph projects"
    echo "  clean        Remove project data (--all for all projects)"
    echo ""
    echo "Example workflow:"
    echo "  cd /path/to/your/project"
    echo "  cl-ralph init"
    echo "  cl-ralph prd           # Create prd.json interactively"
    echo "  cl-ralph run           # Start autonomous loop"
    echo "  cl-ralph status        # Check progress"
end
