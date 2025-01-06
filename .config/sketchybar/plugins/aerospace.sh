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
  # sketchybar --set $NAME background.color=0x23FFFFFF icon.color=0xffffffff label.color=0xffffffff
  sketchybar --set $NAME background.color=$(get_color $1) icon.color=0xff000000 label.color=0xff000000
else
  sketchybar --set $NAME background.color=0x23FFFFFF icon.color=0x33FFFFFF label.color=0x44FFFFFF
fi
