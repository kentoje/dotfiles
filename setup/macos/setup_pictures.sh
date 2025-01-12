#!/bin/bash

wget -O pictures.zip "https://drive.usercontent.google.com/download?id=1jwJLUt5qMhoa-aw6h2zJcY1sRG2S6uq2&export=download&authuser=0&confirm=t"
unzip pictures.zip -d "$HOME/Pictures"
rm -rf pictures.zip
