#!/bin/bash

set -o errtrace

LINK=""
CURRENT_APP=""
EXTENSION=""

display_spinner() {
  local pid=$!
  local delay=0.3
  local colors=(35 31 33 32 34 36) # Red, Yellow, Green, Cyan
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
  clear
}

capitalize() {
  echo "$1" | awk '{print toupper(substr($0,1,1)) substr($0,2)}'
}

handle_error() {
  # Reset text to default color.
  tput sgr0

  local app_path
  local capitalized
  capitalized=$(capitalize "$CURRENT_APP")

  printf '❌ - An error occurred.\n%s' "$1"

  if [ -e "$(pwd)/$CURRENT_APP.$EXTENSION" ]; then
    printf '🗑️ - Removing "%s.%s" file...\n' "$CURRENT_APP" "$EXTENSION"
    rm "$(pwd)/$CURRENT_APP.$EXTENSION"
  fi

  if [ $EXTENSION == "dmg" ] && [ -e "/Volumes/$capitalized" ]; then
    printf '💾 - Unmounting "/Volumes/%s"...\n' "$capitalized"
    sleep 5
    hdiutil unmount /Volumes/"$capitalized"
  fi

  if [ $EXTENSION == "zip" ]; then
    app_path=$(find "$(pwd)" -name "*.app" | head -n 1)

    if [ -e "$app_path" ]; then
      printf '🗑️ - Removing "%s" file...\n' "$app_path"
      rm -rf "$app_path"
    fi
  fi

  exit 1
}

install_app_dmg() {
  LINK=$1
  CURRENT_APP=$2
  EXTENSION="dmg"

  local capitalized
  local app_path

  clear
  printf '💾 - Downloading "%s.%s"...\n' "$CURRENT_APP" "$EXTENSION"
  wget -O "$CURRENT_APP.$EXTENSION" "$LINK" --quiet &
  display_spinner

  printf '💾 - Mounting "%s.%s"...\n' "$CURRENT_APP" "$EXTENSION"
  hdiutil mount "$CURRENT_APP.$EXTENSION" -quiet &
  display_spinner

  capitalized=$(capitalize "$CURRENT_APP")
  printf '📝 - Copying "%s.app" in /Applications/ ...\n' "$capitalized"
  app_path=$(find /Volumes/"$capitalized" -name "*.app" | head -n 1)

  cp -R "$app_path" /Applications/ &
  display_spinner

  printf '💾 - Unmounting "/Volumes/%s"...\n' "$capitalized"
  hdiutil unmount /Volumes/"$capitalized" -quiet

  printf '🧹 - Removing "%s.%s" file...\n' "$CURRENT_APP" "$EXTENSION"
  rm "$CURRENT_APP.$EXTENSION"

  printf '🎉 - Installation completed for "%s"!\n' "$CURRENT_APP"
}

install_app_zip() {
  LINK=$1
  CURRENT_APP=$2
  EXTENSION="zip"

  local capitalized
  local app_path

  clear
  printf '💾 - Downloading "%s.%s"...\n' "$CURRENT_APP" "$EXTENSION"
  wget -O "$CURRENT_APP.$EXTENSION" "$LINK" --quiet &
  display_spinner

  printf '💾 - Unzipping "%s.%s"...\n' "$CURRENT_APP" "$EXTENSION"
  unzip -q "$CURRENT_APP.$EXTENSION" &
  display_spinner

  capitalized=$(capitalize "$CURRENT_APP")
  printf '📝 - Copying "%s.app" in /Applications/ ...\n' "$capitalized"
  app_path=$(find "$(pwd)" -name "*.app" | head -n 1)

  cp -R "$app_path" /Applications/ &
  display_spinner

  printf '🧹 - Removing "%s.%s" file...\n' "$CURRENT_APP" "$EXTENSION"
  rm "$CURRENT_APP.$EXTENSION"
  rm -rf "$app_path"

  printf '🎉 - Installation completed for "%s"!\n' "$CURRENT_APP"
}

trap 'handle_error' ERR
trap 'handle_error' SIGINT

# ---

echo "📱 - Installing applications!"

install_app_zip "https://download01.logi.com/web/ftp/pub/techsupport/capture/Capture_2.08.12.zip" "logi_capture"
