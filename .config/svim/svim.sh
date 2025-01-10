#!/bin/sh

source "$HOME/dotfiles/.config/sketchybar/colors.sh"

COLOR=$GREEN

if [ "$MODE" = "" ]; then
  COLOR=$RED
fi

DRAW_CMD="off"

if [ "$CMDLINE" != "" ]; then
  DRAW_CMD="on"
fi

sketchybar --set svim.mode label="[$MODE]" \
  label.drawing=$(if [ "$MODE" = "" ]; then echo "off"; else echo "on"; fi) \
  icon.color=$(if [ "$MODE" = "" ]; then echo $COLOR; else echo $WHITE; fi) \
  background.color=$(if [ "$MODE" = "" ]; then echo $BACKGROUND_SURFACE; else echo $COLOR; fi) \
  popup.drawing=$DRAW_CMD \
  --set svim.cmdline label="$CMDLINE"
