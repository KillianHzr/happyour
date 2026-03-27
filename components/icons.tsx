import { View, StyleSheet } from "react-native";

type IconProps = {
  size?: number;
  color?: string;
};

export function ProfileIcon({ size = 22, color = "#fff" }: IconProps) {
  const head = size * 0.32;
  const bodyW = size * 0.7;
  const bodyH = size * 0.28;
  const bw = size * 0.08;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: head,
          height: head,
          borderRadius: head / 2,
          borderWidth: bw,
          borderColor: color,
          marginBottom: size * 0.06,
        }}
      />
      <View
        style={{
          width: bodyW,
          height: bodyH,
          borderTopLeftRadius: bodyW / 2,
          borderTopRightRadius: bodyW / 2,
          borderWidth: bw,
          borderBottomWidth: 0,
          borderColor: color,
        }}
      />
    </View>
  );
}

export function VaultIcon({ size = 22, color = "#fff" }: IconProps) {
  const bw = size * 0.08;
  const bodyW = size * 0.72;
  const bodyH = size * 0.5;
  const shackleW = size * 0.44;
  const shackleH = size * 0.32;
  const dot = size * 0.12;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "flex-end" }}>
      <View
        style={{
          width: shackleW,
          height: shackleH,
          borderTopLeftRadius: shackleW / 2,
          borderTopRightRadius: shackleW / 2,
          borderWidth: bw,
          borderBottomWidth: 0,
          borderColor: color,
          marginBottom: -bw,
        }}
      />
      <View
        style={{
          width: bodyW,
          height: bodyH,
          borderRadius: bw * 1.5,
          borderWidth: bw,
          borderColor: color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

export function MomentIcon({ size = 22, color = "#fff" }: IconProps) {
  const outerSize = size;
  const bw = size * 0.08;
  const plusSize = size * 0.5;
  const plusThickness = size * 0.08;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: outerSize,
          height: outerSize,
          borderRadius: outerSize / 2,
          borderWidth: bw,
          borderColor: color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Horizontal bar */}
        <View
          style={{
            position: "absolute",
            width: plusSize,
            height: plusThickness,
            backgroundColor: color,
            borderRadius: plusThickness / 2,
          }}
        />
        {/* Vertical bar */}
        <View
          style={{
            position: "absolute",
            width: plusThickness,
            height: plusSize,
            backgroundColor: color,
            borderRadius: plusThickness / 2,
          }}
        />
      </View>
    </View>
  );
}
