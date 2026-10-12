#!/usr/bin/env bash
# Renders every native app icon, splash screen and store icon from the SVG
# masters in branding/app_icons: the four-colour icon, and for Android's
# adaptive icon its quartered background and haloed mark as separate layers.
# Needs rsvg-convert and ImageMagick 7 (magick)
#
#   bash scripts/generate-app-icons.sh
set -euo pipefail

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
master="$root/branding/app_icons/app-icon.svg"
foreground="$root/branding/app_icons/app-icon-foreground.svg"
background="$root/branding/app_icons/app-icon-background.svg"
mark="$root/branding/logo/volsoc-hand-mark.svg"
linen='#FEEFE5'
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Opaque square render (App Store and iOS reject icons with alpha)
render() {
  local source=$1 size=$2 output=$3
  rsvg-convert -w "$size" -h "$size" "$source" -o "$work/render.png"
  magick "$work/render.png" -background "$linen" -alpha remove -alpha off -type TrueColor "PNG24:$output"
}

# Transparent render
render_alpha() {
  local source=$1 size=$2 output=$3
  rsvg-convert -w "$size" -h "$size" "$source" -o "$work/alpha.png"
  magick "$work/alpha.png" "PNG32:$output"
}

# Circular legacy launcher icon
render_round() {
  local source=$1 size=$2 output=$3
  rsvg-convert -w "$size" -h "$size" "$source" -o "$work/round.png"
  magick "$work/round.png" -alpha on \
    \( -size "${size}x${size}" xc:black -fill white -draw "circle $((size / 2)),$((size / 2)) $((size / 2)),0" -alpha off \) \
    -compose CopyOpacity -composite "PNG32:$output"
}

# Linen splash at an exact pixel size with the mark centred, its visible width
# about 20% of the shorter side
render_splash() {
  local output=$1 w h short markw
  w=$(magick identify -format '%w' "$output")
  h=$(magick identify -format '%h' "$output")
  short=$(( w < h ? w : h ))
  # The mark SVG has padding round the visible heart (1118 vs 956)
  markw=$(( short * 20 * 1118 / 95600 ))
  rsvg-convert -w "$markw" "$mark" -o "$work/splash-mark.png"
  magick -size "${w}x${h}" "xc:$linen" "$work/splash-mark.png" -gravity center -compose Over -composite \
    -alpha off -type TrueColor "PNG24:$output"
  echo "splash ${w}x${h} $output"
}

mkdir -p "$root/assets/store" "$root/branding/app_icons/previews" "$root/branding/app_icons/android"

# Store icons
render "$master" 1024 "$root/assets/store/apple-app-icon.png"
render_alpha "$master" 512 "$root/assets/store/google-play-icon.png"
cp "$root/assets/store/google-play-icon.png" "$root/branding/app_icons/android/playstore-icon.png"

# iOS (single 1024 universal icon, no alpha)
render "$master" 1024 "$root/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"

# Android launcher icons. Adaptive foregrounds keep the mark in the safe zone;
# the quartered background is its own layer
for spec in 'mdpi:48:108' 'hdpi:72:162' 'xhdpi:96:216' 'xxhdpi:144:324' 'xxxhdpi:192:432'
do
  density=${spec%%:*}
  sizes=${spec#*:}
  legacy=${sizes%%:*}
  adaptive=${sizes##*:}
  dir="$root/android/app/src/main/res/mipmap-$density"
  render "$master" "$legacy" "$dir/ic_launcher.png"
  render_round "$master" "$legacy" "$dir/ic_launcher_round.png"
  render_alpha "$foreground" "$adaptive" "$dir/ic_launcher_foreground.png"
  render "$background" "$adaptive" "$dir/ic_launcher_background.png"
done

# The adaptive icon's background is the quartered image, not a flat colour
for name in ic_launcher ic_launcher_round
do
  cat > "$root/android/app/src/main/res/mipmap-anydpi-v26/$name.xml" <<XML
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
XML
done

# Splash screens, each re-rendered at its existing pixel size
for f in "$root"/android/app/src/main/res/drawable*/splash.png \
         "$root"/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732*.png
do
  render_splash "$f"
done

# Previews: iOS square and the Android adaptive icon as a circle and squircle
render "$master" 1024 "$root/branding/app_icons/previews/ios_preview.png"
rsvg-convert -w 1024 -h 1024 "$foreground" -o "$work/fg.png"
rsvg-convert -w 1024 -h 1024 "$background" -o "$work/bg.png"
magick "$work/bg.png" "$work/fg.png" -compose Over -composite \
  -crop 682x682+171+171 +repage -resize 1024x1024 "$work/visible.png"
magick "$work/visible.png" -alpha on \
  \( -size 1024x1024 xc:black -fill white -draw 'circle 512,512 512,0' -alpha off \) \
  -compose CopyOpacity -composite "$root/branding/app_icons/previews/android_circle_preview.png"
magick "$work/visible.png" -alpha on \
  \( -size 1024x1024 xc:black -fill white -draw 'roundrectangle 0,0 1023,1023 225,225' -alpha off \) \
  -compose CopyOpacity -composite "$root/branding/app_icons/previews/android_squircle_preview.png"

echo "done"
