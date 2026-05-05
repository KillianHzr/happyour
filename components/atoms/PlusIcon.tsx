import { Svg, Path } from "react-native-svg";
import { IconProps } from "./DownloadIcon";

export const PlusIcon = ({ size = 22, color = "rgba(255,255,255,0.9)" }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);
