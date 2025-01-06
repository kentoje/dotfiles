#!/bin/sh

source "$CONFIG_DIR/colors.sh"

PERCENTAGE=$(pmset -g batt | grep -Eo "\d+%" | cut -d% -f1)
CHARGING=$(pmset -g batt | grep 'AC Power')

if [ $PERCENTAGE = "" ]; then
  exit 0
fi

case ${PERCENTAGE} in
[8-9][0-9] | 100)
  ICON=""
  ICON_COLOR=$GREEN_BRIGHT
  ;;
7[0-9])
  ICON=""
  ICON_COLOR=$GREEN
  ;;
[4-6][0-9])
  ICON=""
  ICON_COLOR=$YELLOW
  ;;
[1-3][0-9])
  ICON=""
  ICON_COLOR=$RED
  ;;
[0-9])
  ICON=""
  ICON_COLOR=$RED_BRIGHT
  ;;
esac

if [[ $CHARGING != "" ]]; then
  ICON=""
  ICON_COLOR=$BLUE
fi

sketchybar --set $NAME \
  icon=$ICON \
  label="${PERCENTAGE}%" \
  icon.color=${ICON_COLOR}
