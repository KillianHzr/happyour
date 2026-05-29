import { View } from "react-native";
import { Svg, Path } from "react-native-svg";
import { IconProps } from "./DownloadIcon";
import { radii } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";

interface CommentIconProps extends IconProps {
  hasBadge?: boolean;
}

export const CommentIcon = ({ size = 20, color, hasBadge = false }: CommentIconProps) => {
  const { colors } = useTheme();
  return (
    <View>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? colors.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </Svg>
      {hasBadge && (
        <View style={{
          position: 'absolute',
          top: -1,
          right: -1,
          width: 10,
          height: 10,
          borderRadius: radii.sm,
          backgroundColor: colors.danger,
          borderWidth: 1.5,
          borderColor: colors.bg
        }} />
      )}
    </View>
  );
};
