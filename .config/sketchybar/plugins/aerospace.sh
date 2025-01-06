#!/bin/sh

source "$CONFIG_DIR/colors.sh"

get_color() {
  case "$1" in
  "G")
    echo $BLUE
    ;;
  "M")
    echo $GREEN
    ;;
  "S")
    echo $RED
    ;;
  "T")
    echo $MAUVE_BRIGHT
    ;;
  "W")
    echo $GREEN_BRIGHT
    ;;
  *)
    echo $MAUVE_BRIGHT # default color
    ;;
  esac
}

if [ "$1" = "$FOCUSED_WORKSPACE" ]; then
  sketchybar --set $NAME background.color=$(get_color $1) icon.color=$CONTENT_ACTIVE label.color=$CONTENT_ACTIVE
else
  sketchybar --set $NAME background.color=$BACKGROUD_SURFACE icon.color=$CONTENT_INACTIVE label.color=$CONTENT_INACTIVE
fi
