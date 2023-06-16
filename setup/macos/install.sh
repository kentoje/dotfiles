#!/bin/bash

set -o errtrace

LINK=""
CURRENT_APP=""

display_spinner() {
    local pid=$!
    local delay=0.3
    local colors=(35 31 33 32 34 36)  # Red, Yellow, Green, Cyan
    local spinner=("▁" "▂" "▃" "▄" "▅" "▆" "▇" "█")

    while ps -p $pid >/dev/null; do
        for i in "${!spinner[@]}"; do
            printf '\e[%sm%s' "${colors[i % ${#colors[@]}]}" "${spinner[i % ${#spinner[@]}]}"
            sleep $delay
            printf '\b'
        done
    done

    # Reset text to default color.
    tput sgr0
    printf ' \n'
}

capitalize() {
    echo "$1" | awk '{print toupper(substr($0,1,1)) substr($0,2)}'
}

handle_error() {
    # Reset text to default color.
    tput sgr0

    local capitalized
    capitalized=$(capitalize "$CURRENT_APP")

    printf '❌ - An error occurred.\n%s' "$1"

    if [ -e "$(pwd)/$CURRENT_APP.dmg" ]; then
        printf '🗑️ - Removing "%s.dmg" file...\n' "$CURRENT_APP"
        rm "$(pwd)/$CURRENT_APP.dmg"
    fi

    if [ -e "/Volumes/$capitalized" ]; then
        printf '💾 - Unmounting "/Volumes/%s"...\n' "$capitalized"
        sleep 5
        hdiutil unmount /Volumes/"$capitalized"
    fi

    exit 1
}

install_app() {
    LINK=$1
    CURRENT_APP=$2

    local capitalized
    local app_path

    printf '💾 - Downloading "%s.dmg"...\n' "$CURRENT_APP"
    wget -O "$CURRENT_APP.dmg" "$LINK" --quiet & display_spinner

    printf '💾 - Mounting "%s.dmg"...\n' "$CURRENT_APP"
    hdiutil mount "$CURRENT_APP.dmg" -quiet & display_spinner

    capitalized=$(capitalize "$CURRENT_APP")
    printf '📝 - Copying "%s.app" in /Applications/ ...\n' "$capitalized"
    app_path=$(find /Volumes/"$capitalized" -name "*.app" | head -n 1)

    cp -R "$app_path" /Applications/ & display_spinner

    printf '💾 - Unmounting "/Volumes/%s"...\n' "$capitalized"
    hdiutil unmount /Volumes/"$capitalized" -quiet

    printf '🧹 - Removing "%s.dmg" file...\n' "$CURRENT_APP"
    rm "$CURRENT_APP.dmg"

    printf '🎉 - Installation completed for "%s"!' "$capitalized"
}

trap 'handle_error' ERR
trap 'handle_error' SIGINT

# ---

install_app "https://download.mozilla.org/?product=firefox-latest-ssl&os=osx&lang=en-US" "firefox"
