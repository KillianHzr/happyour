import { Svg, Path } from "react-native-svg";
import { IconProps } from "./DownloadIcon";

interface SendIconProps extends IconProps {
  disabled: boolean;
}

export const SendIcon = ({ size = 20, color, disabled }: SendIconProps) => {
  const strokeColor = color || (disabled ? "rgba(255,255,255,0.3)" : "#000");
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </Svg>
  );
};
