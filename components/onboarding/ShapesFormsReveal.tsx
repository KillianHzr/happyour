import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import MaskedView from "@react-native-masked-view/masked-view";
import Svg, { Path } from "react-native-svg";
import { cardBlur } from "../../lib/theme";
import {
  SHAPE_MOVIE, SHAPE_FRIENDS, SHAPE_ALCOOL, SHAPE_PARTY, SHAPE_CONCERT, SHAPE_COOKING,
} from "../../lib/onboarding-assets";

// Blur volontairement plus fort que le flou "card" (cardBlur.radius), local à cet
// élément uniquement — ne modifie le blur nulle part ailleurs dans l'app.
const SHAPES_BLUR = cardBlur.radius * 2;

const IMAGES = {
  movie: SHAPE_MOVIE,
  friends: SHAPE_FRIENDS,
  alcool: SHAPE_ALCOOL,
  party: SHAPE_PARTY,
  concert: SHAPE_CONCERT,
  cooking: SHAPE_COOKING,
};

// Centre du grand pétale (forme 1) = (148, 148) → point d'implosion.
const CX = 148;
const CY = 148;

const D_BIG =
  "M194.51 145.671C208.349 140.173 217.758 125.782 215.721 109.579C213.813 94.3462 201.397 82.0567 186.136 80.2456C170.034 78.3374 155.775 87.7487 150.343 101.558C149.502 103.66 146.495 103.66 145.654 101.558C140.222 87.7487 125.963 78.3374 109.861 80.2456C94.6 82.0567 82.2163 94.3462 80.2763 109.579C78.2393 125.782 87.616 140.141 101.487 145.671C103.556 146.48 103.556 149.52 101.487 150.329C87.6483 155.827 78.2393 170.218 80.2763 186.421C82.184 201.654 94.6 213.943 109.861 215.754C125.963 217.663 140.222 208.251 145.654 194.442C146.495 192.34 149.502 192.34 150.343 194.442C155.775 208.251 170.034 217.663 186.136 215.754C201.397 213.943 213.781 201.654 215.721 186.421C217.758 170.218 208.381 155.859 194.51 150.329C192.441 149.52 192.441 146.48 194.51 145.671Z";

// Forme 1 (grand, au centre) = movie.
const BIG = { x: 78.2, y: 78.3, w: 139.5, h: 139.3, d: D_BIG, src: IMAGES.movie };

// Formes 2→6 (petites) — bbox + chemin + image, dans l'ordre du SVG.
const SMALLS = [
  {
    x: -0.5, y: 121.5, w: 41, h: 41, src: IMAGES.friends,
    d: "M19.312 128.32C17.6953 124.25 13.4631 121.483 8.69828 122.082C4.21881 122.643 0.604799 126.295 0.0722089 130.783C-0.488913 135.519 2.27866 139.713 6.33966 141.311C6.95785 141.558 6.95785 142.442 6.33966 142.689C2.27866 144.287 -0.488913 148.481 0.0722099 153.217C0.604801 157.705 4.21881 161.348 8.69828 161.918C13.4631 162.517 17.6857 159.76 19.3121 155.68C19.5498 155.071 20.4438 155.071 20.6816 155.68C22.2984 159.75 26.5306 162.517 31.2953 161.918C35.7748 161.357 39.3888 157.705 39.9214 153.217C40.4825 148.481 37.715 144.287 33.654 142.689C33.0358 142.442 33.0358 141.558 33.654 141.311C37.715 139.713 40.4825 135.519 39.9214 130.783C39.3888 126.295 35.7748 122.652 31.2953 122.082C26.5306 121.483 22.3079 124.24 20.6816 128.32C20.4438 128.929 19.5498 128.929 19.312 128.32Z",
  },
  {
    x: 29.6, y: 39.4, w: 40.9, h: 40.6, src: IMAGES.alcool,
    d: "M69.9478 48.7929C69.4245 44.3677 65.9036 40.7418 61.4882 40.1042C56.6636 39.4095 52.3624 42.1979 50.7257 46.3186C50.4687 46.9562 49.5552 46.9562 49.3078 46.3186C47.6616 42.1979 43.3699 39.4095 38.5453 40.1042C34.1299 40.7418 30.609 44.3582 30.0856 48.7929C29.5623 53.2277 32.0935 57.4055 35.9189 59.1185C36.3662 59.3183 36.2329 59.9845 35.7476 59.9845H30C30 71.0334 38.964 79.998 50.012 79.998C61.06 79.998 70.0144 71.0429 70.0144 59.994H64.2859C63.791 59.994 63.6578 59.3279 64.1146 59.128C67.94 57.415 70.4807 53.3704 69.9478 48.8024V48.7929Z",
  },
  {
    x: 128, y: 0, w: 40.1, h: 40.1, src: IMAGES.party,
    d: "M168.056 17.3128C168.056 12.158 163.997 7.91794 158.976 7.36531C158.309 7.28908 157.738 6.85079 157.48 6.23145C155.966 2.57262 152.221 0 148.029 0C143.837 0 140.093 2.57262 138.578 6.23145C138.321 6.85079 137.759 7.29861 137.082 7.36531C132.061 7.92747 128.002 12.158 128.002 17.3128C128.002 20.0378 129.098 22.5056 130.861 24.316C131.394 24.8591 131.547 25.6404 131.27 26.3455C130.813 27.5175 130.565 28.7847 130.584 30.1187C130.661 35.5593 135.272 40.0566 140.712 39.9995C143.056 39.9709 145.2 39.1419 146.886 37.7698C147.543 37.2363 148.496 37.2363 149.144 37.7698C150.83 39.1419 152.974 39.9804 155.318 39.9995C160.758 40.0566 165.369 35.5593 165.445 30.1187C165.464 28.7847 165.217 27.508 164.759 26.3455C164.483 25.6404 164.645 24.8496 165.169 24.316C166.941 22.5152 168.027 20.0474 168.027 17.3128H168.056Z",
  },
  {
    x: 225.6, y: 39.4, w: 40.9, h: 40.6, src: IMAGES.concert,
    d: "M265.95 48.7929C265.427 44.3677 261.906 40.7418 257.491 40.1042C252.666 39.4095 248.365 42.1979 246.728 46.3186C246.471 46.9562 245.558 46.9562 245.31 46.3186C243.664 42.1979 239.372 39.4095 234.548 40.1042C230.132 40.7418 226.611 44.3582 226.088 48.7929C225.565 53.2277 228.096 57.4055 231.921 59.1185C232.369 59.3183 232.235 59.9845 231.75 59.9845H226.002C226.002 71.0334 234.966 79.998 246.014 79.998C257.062 79.998 266.017 71.0429 266.017 59.994H260.288C259.793 59.994 259.66 59.3279 260.117 59.128C263.942 57.415 266.483 53.3704 265.95 48.8024V48.7929Z",
  },
  {
    x: 255.5, y: 121.5, w: 41, h: 41, src: IMAGES.cooking,
    d: "M275.313 128.32C273.696 124.25 269.464 121.483 264.699 122.082C260.22 122.643 256.606 126.295 256.073 130.783C255.512 135.519 258.28 139.713 262.341 141.311C262.959 141.558 262.959 142.442 262.341 142.689C258.28 144.287 255.512 148.481 256.073 153.217C256.606 157.705 260.22 161.348 264.699 161.918C269.464 162.517 273.687 159.76 275.313 155.68C275.551 155.071 276.445 155.071 276.683 155.68C278.299 159.75 282.532 162.517 287.296 161.918C291.776 161.357 295.39 157.705 295.922 153.217C296.484 148.481 293.716 144.287 289.655 142.689C289.037 142.442 289.037 141.558 289.655 141.311C293.716 139.713 296.484 135.519 295.922 130.783C295.39 126.295 291.776 122.652 287.296 122.082C282.532 121.483 278.309 124.24 276.683 128.32C276.445 128.929 275.551 128.929 275.313 128.32Z",
  },
];

// Une forme = image floutée (même blur que les cards de groupe, sans voile sombre)
// masquée par le chemin SVG du pétale.
function Shape({ x, y, w, h, d, src }: { x: number; y: number; w: number; h: number; d: string; src: any }) {
  return (
    <MaskedView
      style={{ width: w, height: h }}
      maskElement={
        <Svg width={w} height={h} viewBox={`${x} ${y} ${w} ${h}`}>
          <Path d={d} fill="#fff" />
        </Svg>
      }
    >
      <Image
        source={src}
        style={{ width: w, height: h }}
        contentFit="cover"
        cachePolicy="memory-disk"
        blurRadius={SHAPES_BLUR}
      />
    </MaskedView>
  );
}

/** Même anim que GroupAvatarReveal (explosion + fondu), formes SVG « pétales ». */
export function ShapesFormsReveal({ active }: { active: boolean }) {
  const fade = useRef(new Animated.Value(0)).current;
  const explode = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: active ? 1 : 0,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(explode, {
        toValue: active ? 1 : 0,
        useNativeDriver: true,
        damping: 12,
        stiffness: 120,
        mass: 0.8,
      }),
    ]).start();
  }, [active]);

  return (
    <Animated.View style={[styles.container, { opacity: fade }]}>
      {SMALLS.map((s, i) => {
        const cx = s.x + s.w / 2;
        const cy = s.y + s.h / 2;
        const translateX = explode.interpolate({ inputRange: [0, 1], outputRange: [CX - cx, 0] });
        const translateY = explode.interpolate({ inputRange: [0, 1], outputRange: [CY - cy, 0] });
        const scale = explode.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
        return (
          <Animated.View
            key={i}
            style={[styles.cell, { left: s.x, top: s.y, transform: [{ translateX }, { translateY }, { scale }] }]}
          >
            <Shape {...s} />
          </Animated.View>
        );
      })}

      {/* Grand pétale (movie), au-dessus, fixe. */}
      <View style={[styles.cell, { left: BIG.x, top: BIG.y }]}>
        <Shape {...BIG} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 296,
    height: 216,
  },
  cell: {
    position: "absolute",
  },
});
