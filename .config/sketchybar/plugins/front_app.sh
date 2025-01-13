#!/bin/sh

source "$CONFIG_DIR/colors.sh"

# Some events send additional information specific to the event in the $INFO
# variable. E.g. the front_app_switched event sends the name of the newly
# focused application in the $INFO variable:
# https://felixkratz.github.io/SketchyBar/config/events#events-and-scripting

get_color() {
  case "$1" in
  "WhatsApp")
    echo $GREEN_BRIGHT
    ;;
  "zoom\.us")
    echo $BLUE_BRIGHT
    ;;
  "Figma")
    echo $BLACK
    ;;
  "Spark")
    echo $BLUE_BRIGHT
    ;;
  "Arc")
    echo $BLUE_BRIGHT
    ;;
  "Spotify")
    echo $GREEN_BRIGHT
    ;;
  "Slack")
    echo $RED_BRIGHT
    ;;
  "Ghostty")
    echo $BLUE_BRIGHT
    ;;
  *)
    echo $MAUVE_BRIGHT # default color
    ;;
  esac
}

echo $INFO >>/tmp/sketchybar.out.log

ICON=$($CONFIG_DIR/plugins/icon_map_fn.sh $INFO)

if [ "$SENDER" = "front_app_switched" ]; then
  sketchybar --set "$NAME" \
    label="$ICON" \
    label.font="sketchybar-app-font:Regular:16.0" \
    label.padding_left=8 \
    label.padding_right=8 \
    label.color=$CONTENT_ACTIVE \
    background.color=$(get_color $INFO)
fi
