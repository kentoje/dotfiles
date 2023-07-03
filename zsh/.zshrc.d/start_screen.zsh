MIN=1
MAX=4

RANDOM_NUMBER=$((RANDOM % ($MAX - $MIN + 1) + $MIN))

LIST=("isometric1" "isometric2" "isometric3" "isometric4")
RANDOM_LIST_ITEM=$LIST[$RANDOM_NUMBER]

figlet -f $RANDOM_LIST_ITEM "Code" | lolcat

