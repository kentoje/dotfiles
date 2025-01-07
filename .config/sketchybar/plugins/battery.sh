#!/bin/sh

source "$CONFIG_DIR/colors.sh"

PERCENTAGE=$(pmset -g batt | grep -Eo "\d+%" | cut -d% -f1)
CHARGING=$(pmset -g batt | grep 'AC Power')

if [ $PERCENTAGE = "" ]; then
  exit 0
fi

case ${PERCENTAGE} in
[8-9][0-9] | 100)
  ICON="󰁹"
  ICON_COLOR=$WHITE
  BACKGROUND_COLOR=$BACKGROUND_SURFACE
  ;;
7[0-9])
  ICON="󰂀"
  ICON_COLOR=$WHITE
  BACKGROUND_COLOR=$BACKGROUND_SURFACE
  ;;
[4-6][0-9])
  ICON="󰁾"
  ICON_COLOR=$YELLOW
  BACKGROUND_COLOR=$BACKGROUND_SURFACE
  ;;
[1-3][0-9])
  ICON="󰁻"
  ICON_COLOR=$RED
  BACKGROUND_COLOR=$BACKGROUND_SURFACE
  ;;
[0-9])
  ICON="󰁺"
  ICON_COLOR=$RED_BRIGHT
  BACKGROUND_COLOR=$BACKGROUND_SURFACE
  ;;
esac

if [[ $CHARGING != "" ]]; then
  case ${PERCENTAGE} in
  [8-9][0-9] | 100)
    ICON="󰂅"
    ICON_COLOR=$WHITE
    BACKGROUND_COLOR=$GREEN
    ;;
  7[0-9])
    ICON="󰂉"
    ICON_COLOR=$WHITE
    BACKGROUND_COLOR=$GREEN
    ;;
  [4-6][0-9])
    ICON="󰂈"
    ICON_COLOR=$WHITE
    BACKGROUND_COLOR=$YELLOW
    ;;
  [1-3][0-9])
    ICON="󰂇"
    ICON_COLOR=$WHITE
    BACKGROUND_COLOR=$RED
    ;;
  [0-9])
    ICON="󰂆"
    ICON_COLOR=$WHITE
    BACKGROUND_COLOR=$RED_BRIGHT
    ;;
  esac
fi

sketchybar --set $NAME \
  icon=$ICON \
  label="${PERCENTAGE}%" \
  icon.color=${ICON_COLOR} \
  background.color=${BACKGROUND_COLOR}
