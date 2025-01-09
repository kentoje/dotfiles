#!/bin/sh

source "$CONFIG_DIR/colors.sh"

get_color() {
  case "$1" in
  "G")
    echo $BLUE_BRIGHT
    ;;
  "M")
    echo $GREEN_BRIGHT
    ;;
  "S")
    echo $RED_BRIGHT
    ;;
  "T")
    echo $BLUE_BRIGHT
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
  sketchybar --set $NAME \
    background.color=$(get_color $1) \
    label.color=$CONTENT_ACTIVE \
    background.border_width=2 \
    background.border_color=$(get_color $1)
else
  sketchybar --set $NAME \
    background.color=$BACKGROUND_SURFACE_INACTIVE \
    label.color=$CONTENT_INACTIVE \
    background.border_width=0
fi
