import { Svg, Path } from "react-native-svg";
import { useTheme } from "../../lib/theme-context";

export interface IconProps {
  size?: number;
  color?: string;
}

export const DownloadIcon = ({ size = 20, color }: IconProps) => {
  const { colors } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? colors.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </Svg>
  );
};
