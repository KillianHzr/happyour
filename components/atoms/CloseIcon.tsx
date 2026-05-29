import { Svg, Path } from "react-native-svg";
import { IconProps } from "./DownloadIcon";
import { useTheme } from "../../lib/theme-context";

export const CloseIcon = ({ size = 24, color }: IconProps) => {
  const { colors } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? colors.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 6L6 18M6 6l12 12" />
    </Svg>
  );
};
