import { View, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "../lib/theme-context";


type IconProps = {
  size?: number;
  color?: string;
};

export function ProfileIcon({ size = 22, color: colorProp }: IconProps) {
  const { colors } = useTheme();
  const color = colorProp ?? colors.text;
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

export function VaultIcon({ size = 22, color: colorProp }: IconProps) {
  const { colors } = useTheme();
  const color = colorProp ?? colors.text;
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

export function MomentIcon({ size = 22, color: colorProp }: IconProps) {
  const { colors } = useTheme();
  const color = colorProp ?? colors.text;
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

export function FlowerIcon({ size = 24, color: colorProp, filled = false }: IconProps & { filled?: boolean }) {
  const { colors } = useTheme();
  const color = colorProp ?? colors.text;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {filled ? (
        <Path
          d="M20.2079 11.5891C22.65 10.6188 24.3105 8.07913 23.951 5.2198C23.6143 2.53169 21.4233 0.362938 18.7301 0.0433331C15.8886 -0.293394 13.3723 1.36741 12.4137 3.8044C12.2653 4.17537 11.7347 4.17537 11.5863 3.8044C10.6277 1.36741 8.11144 -0.293394 5.26991 0.0433331C2.57673 0.362938 0.391374 2.53169 0.049021 5.2198C-0.31045 8.07913 1.34426 10.6131 3.79208 11.5891C4.15726 11.7318 4.15726 12.2682 3.79208 12.4109C1.34996 13.3812 -0.31045 15.9209 0.049021 18.7802C0.385668 21.4683 2.57673 23.6371 5.26991 23.9567C8.11144 24.2934 10.6277 22.6326 11.5863 20.1956C11.7347 19.8246 12.2653 19.8246 12.4137 20.1956C13.3723 22.6326 15.8886 24.2934 18.7301 23.9567C21.4233 23.6371 23.6086 21.4683 23.951 18.7802C24.3105 15.9209 22.6557 13.3869 20.2079 12.4109C19.8427 12.2682 19.8427 11.7318 20.2079 11.5891Z"
          fill={color}
        />
      ) : (
        <Path
          d="M12.4142 3.80504C13.3728 1.36805 15.8891 -0.293408 18.7307 0.0433193C21.4237 0.363059 23.609 2.5321 23.9514 5.22008C24.3108 8.07935 22.6559 10.6132 20.2082 11.5892L20.1437 11.6205C19.8443 11.7975 19.8659 12.2777 20.2082 12.4115C22.6502 13.3818 24.3108 15.9214 23.9514 18.7806C23.6147 21.4686 21.4237 23.6376 18.7307 23.9574L18.465 23.9828C15.7331 24.1893 13.3429 22.5565 12.4142 20.1957C12.2658 19.8248 11.7345 19.8248 11.5861 20.1957C10.6575 22.5565 8.26728 24.1893 5.53534 23.9828L5.26972 23.9574C2.66075 23.6476 0.528951 21.6021 0.0871011 19.0306L0.0490152 18.7806C-0.299244 16.0105 1.24322 13.5457 3.56562 12.5072L3.79218 12.4115C4.15736 12.2688 4.15736 11.7319 3.79218 11.5892C1.35014 10.6189 -0.310448 8.07935 0.0490152 5.22008C0.385669 2.5321 2.57671 0.36306 5.26972 0.0433193C8.11125 -0.293408 10.6275 1.36805 11.5861 3.80504C11.7345 4.17586 12.2658 4.17586 12.4142 3.80504ZM18.3771 3.02281C16.9468 2.85336 15.6862 3.6801 15.2053 4.90269L15.1994 4.91832C14.0454 7.80403 9.95498 7.80403 8.80097 4.91832L8.79511 4.90269C8.34419 3.75639 7.20781 2.95782 5.88886 3.0023L5.62323 3.02281C4.29326 3.18083 3.19002 4.28008 3.02558 5.59312C2.84386 7.03859 3.67451 8.31423 4.8996 8.80113C7.78806 9.94356 7.78807 14.0512 4.90253 15.1966L4.90351 15.1976C3.66998 15.6894 2.84624 16.9587 3.02558 18.4017L3.06757 18.6468C3.33262 19.8578 4.381 20.8303 5.62323 20.9779L5.88886 20.9984C7.20781 21.0429 8.34419 20.2443 8.79511 19.098L8.80097 19.0824C9.91891 16.2869 13.793 16.1989 15.0832 18.8197L15.1994 19.0824L15.2053 19.098C15.6862 20.3206 16.9468 21.1473 18.3771 20.9779L18.6232 20.9379C19.8411 20.6823 20.8206 19.6387 20.9748 18.4076C21.1565 16.9621 20.3259 15.6865 19.1008 15.1996C16.2137 14.0566 16.2122 9.94864 19.0969 8.80309L19.3234 8.70152C20.4297 8.15158 21.1429 6.95178 20.9748 5.59898C20.8167 4.35864 19.8363 3.31759 18.6223 3.06285L18.3771 3.02281ZM2.70038 14.3841L2.69257 14.3802L2.68476 14.3773L2.70038 14.3841Z"
          fill={color}
        />
      )}
    </Svg>
  );
}
