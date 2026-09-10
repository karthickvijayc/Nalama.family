#!/bin/bash
LOGO=$1
PREFIX=$2

# Create icons
convert "$LOGO" -resize 192x192 /app/applet/public/${PREFIX}-192x192.png
convert "$LOGO" -resize 512x512 /app/applet/public/${PREFIX}-512x512.png
# Create maskable icon (add padding to ensure safe zone)
convert "$LOGO" -resize 410x410 -background white -gravity center -extent 512x512 /app/applet/public/${PREFIX}-maskable-512x512.png
# Create iOS touch icon
convert "$LOGO" -resize 180x180 /app/applet/public/${PREFIX}-apple-touch-icon.png
# Create favicon SVG (converting from png to a simple embedded svg)
convert "$LOGO" -resize 32x32 /app/applet/public/${PREFIX}-favicon.ico

echo "Created resized versions for $PREFIX"
