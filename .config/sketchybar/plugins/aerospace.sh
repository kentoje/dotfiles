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
  sketchybar --set $NAME label.color=$(get_color $1) background.color=$BACKGROUND_SURFACE
else
  sketchybar --set $NAME background.color=$BACKGROUND_SURFACE label.color=$CONTENT_INACTIVE
fi
