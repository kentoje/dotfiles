function get_flowchart --description "Generate mermaid flowchart from TypeScript files"
    # Find all ts/tsx files in current directory
    set -l ts_files (fd -e ts -e tsx .)
    
    if test (count $ts_files) -eq 0
        echo "No TypeScript files found in current directory"
        return 1
    end
    
    # Use fzf-tmux for selection
    set -l selected_path (printf "%s\n" $ts_files | fzf-tmux -p --prompt="Select file: ")
    
    if test -z "$selected_path"
        echo "No selection made"
        return 1
    end
    
    # Run claude with mermaid-flowchart-output slash command and save to temp file
    echo "Generating mermaid flowchart for: $selected_path"
    set -l temp_file "/tmp/mermaid_output.txt"
    
    # Start loading animation in background
    fish -c 'while true; printf "\rGenerating"; sleep 0.3; printf "\rGenerating."; sleep 0.3; printf "\rGenerating.."; sleep 0.3; printf "\rGenerating..."; sleep 0.3; end' &
    set -l loader_pid $last_pid
    
    claude -p "/mermaid-flowchart-output $selected_path" > "$temp_file" 2>&1
    
    # Stop the loader
    kill $loader_pid 2>/dev/null
    printf "\r                    \r"  # Clear the loading line
    
    if test $status -ne 0
        echo "Error running claude:"
        cat "$temp_file"
        return 1
    end
    
    # Copy to clipboard
    cat "$temp_file" | tail -n +2 | head -n -1 | pbcopy
    echo "Mermaid code copied to clipboard"
    
    # Clean up temp file
    rm -f "$temp_file"
    
    # Open mermaid.live in browser
    open "https://mermaid.live/edit"
    echo "Opened mermaid.live in browser"
end
